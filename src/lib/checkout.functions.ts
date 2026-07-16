import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

const ItemSchema = z.object({
  variation_id: z.string().uuid(),
  quantity: z.number().int().min(1).max(99),
});

const PayloadSchema = z.object({
  customer_name: z.string().trim().min(2).max(120),
  customer_phone: z
    .string()
    .trim()
    .min(10)
    .max(20)
    .regex(/^\d+$/, "phone_digits_only"),
  address: z.string().trim().min(5).max(500),
  neighborhood_id: z.string().uuid(),
  payment_method: z.enum(["pix", "cash", "debit", "credit"]),
  items: z.array(ItemSchema).min(1).max(50),
  // Honeypot: bots preenchem; humanos não veem.
  hp: z.string().max(0).optional().default(""),
});

export type CreatePublicOrderInput = z.input<typeof PayloadSchema>;

function assertSameOrigin(): void {
  const origin = getRequestHeader("origin") ?? "";
  const host = getRequestHeader("host") ?? "";
  if (!origin) return; // same-origin browser POSTs frequentemente omitem origin
  try {
    const originHost = new URL(origin).host;
    if (originHost !== host) {
      throw new Response("forbidden_origin", { status: 403 });
    }
  } catch {
    throw new Response("forbidden_origin", { status: 403 });
  }
}

export const createPublicOrder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => PayloadSchema.parse(input))
  .handler(async ({ data }) => {
    assertSameOrigin();

    // Honeypot: se preenchido, aborta silenciosamente com sucesso falso.
    if (data.hp && data.hp.length > 0) {
      throw new Response("invalid_payload", { status: 400 });
    }

    const url = process.env.SUPABASE_URL!;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
    const supabase = createClient<Database>(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
            h.delete("Authorization");
          }
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });

    const { data: rows, error } = await supabase.rpc("create_public_order", {
      p_customer_name: data.customer_name,
      p_customer_phone: data.customer_phone,
      p_address: data.address,
      p_neighborhood_id: data.neighborhood_id,
      p_payment_method: data.payment_method,
      p_items: data.items,
    });

    if (error) {
      throw new Response(error.message, { status: 400 });
    }
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) {
      throw new Response("order_failed", { status: 500 });
    }
    return {
      order_id: String(row.order_id),
      subtotal: String(row.subtotal),
      delivery_fee: String(row.delivery_fee),
      total: String(row.total),
      whatsapp_number: String(row.whatsapp_number ?? ""),
      customer_name: String(row.customer_name ?? ""),
      customer_phone: String(row.customer_phone ?? ""),
      address: String(row.address ?? ""),
      neighborhood_name: String(row.neighborhood_name ?? ""),
      payment_method: String(row.payment_method ?? ""),
    };
  });