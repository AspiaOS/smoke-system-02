import { getRequestHeader } from "@tanstack/react-start/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/** Extract the caller's IP from proxy headers. Returns "unknown" if none. */
export function getClientIp(): string {
  const xff = getRequestHeader("x-forwarded-for") ?? "";
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const cf = getRequestHeader("cf-connecting-ip") ?? "";
  if (cf) return cf.trim();
  const real = getRequestHeader("x-real-ip") ?? "";
  if (real) return real.trim();
  return "unknown";
}

/** Reject cross-origin browser POSTs. Same-origin requests often omit origin — allowed. */
export function assertSameOrigin(): void {
  const origin = getRequestHeader("origin") ?? "";
  const host = getRequestHeader("host") ?? "";
  if (!origin) return;
  try {
    const originHost = new URL(origin).host;
    if (originHost !== host) {
      throw new Response("forbidden_origin", { status: 403 });
    }
  } catch {
    throw new Response("forbidden_origin", { status: 403 });
  }
}

/**
 * Create a Supabase client using the publishable key, for server-side reads/RPCs
 * governed by RLS. Strips the `Authorization: Bearer sb_...` header the JS client
 * sets by default (opaque sb_ keys aren't JWTs; PostgREST rejects them).
 */
export function createPublicSupabase(): SupabaseClient<Database> {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient<Database>(url, key, {
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
}

/**
 * Fail-open rate limit check via `check_rate_limit` RPC.
 * Returns `true` when the request should proceed.
 */
export async function checkRateLimit(
  supabase: SupabaseClient<Database>,
  args: { key: string; bucket: string; max: number; windowSeconds: number },
): Promise<boolean> {
  const { data, error } = await supabase.rpc("check_rate_limit", {
    _key: args.key,
    _bucket: args.bucket,
    _max: args.max,
    _window_seconds: args.windowSeconds,
  });
  if (error) return true; // fail-open
  return data !== false;
}