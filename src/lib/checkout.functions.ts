import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  assertSameOrigin,
  checkRateLimit,
  createPublicSupabase,
  getClientIp,
} from "./server-utils.server";

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

export const createPublicOrder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => PayloadSchema.parse(input))
  .handler(async ({ data }) => {
    assertSameOrigin();

    // Honeypot: se preenchido, aborta silenciosamente com sucesso falso.
    if (data.hp && data.hp.length > 0) {
      throw new Response("invalid_payload", { status: 400 });
    }

    const supabase = createPublicSupabase();

    // Rate-limit: 5 pedidos/minuto por IP. Fail-open se a checagem falhar.
    const allowed = await checkRateLimit(supabase, {
      key: `ip:${getClientIp()}`,
      bucket: "create_public_order",
      max: 5,
      windowSeconds: 60,
    });
    if (!allowed) {
      throw new Response("rate_limited", { status: 429 });
    }

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