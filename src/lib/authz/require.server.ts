import { STORE_MATRIX, type Capability, type MembershipRole } from "@/lib/authz/matrix";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side helper: ensures the authenticated user has an active membership
 * on the current store AND holds the given capability. Throws 403 otherwise.
 * Call from within a createServerFn handler that uses requireSupabaseAuth.
 */
export async function requireStoreCapability(
  supabase: SupabaseClient,
  userId: string,
  capability: Capability,
): Promise<{ storeId: string; role: MembershipRole }> {
  const { data: storeRow } = await supabase
    .from("stores")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const storeId = storeRow?.id;
  if (!storeId) throw new Response("Forbidden", { status: 403 });

  const { data, error } = await supabase
    .from("store_memberships")
    .select("role, status")
    .eq("user_id", userId)
    .eq("store_id", storeId)
    .eq("status", "active")
    .maybeSingle();

  if (error || !data) throw new Response("Forbidden", { status: 403 });
  const role = data.role as MembershipRole;
  if (!(STORE_MATRIX[role] ?? []).includes(capability)) {
    throw new Response("Forbidden", { status: 403 });
  }
  return { storeId, role };
}
