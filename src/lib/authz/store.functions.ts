import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  STORE_MATRIX,
  type Capability,
  type MembershipRole,
} from "@/lib/authz/matrix";

export type MyStoreContext = {
  storeId: string | null;
  role: MembershipRole | null;
  capabilities: Capability[];
};

/**
 * Retorna a membership ativa do usuário na loja atual + capacidades derivadas.
 * Fail-closed: sem membership ativa -> role null e capabilities vazio.
 */
export const getMyStoreContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyStoreContext> => {
    const { data: storeRow } = await context.supabase
      .from("stores")
      .select("id")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const storeId = storeRow?.id ?? null;
    if (!storeId) return { storeId: null, role: null, capabilities: [] };

    const { data, error } = await context.supabase
      .from("store_memberships")
      .select("role, status")
      .eq("user_id", context.userId)
      .eq("store_id", storeId)
      .eq("status", "active")
      .maybeSingle();

    if (error || !data) return { storeId, role: null, capabilities: [] };

    const role = data.role as MembershipRole;
    return {
      storeId,
      role,
      capabilities: STORE_MATRIX[role] ?? [],
    };
  });
