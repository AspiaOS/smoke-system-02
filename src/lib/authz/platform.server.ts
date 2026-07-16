import type { SupabaseClient } from "@supabase/supabase-js";
import { platformRoleHasCapability, type PlatformCapability, type PlatformRole } from "@/lib/authz/matrix";

/**
 * Guarda única para server functions da Central de Controle.
 *
 * Fail-closed: exige que o ator (a) esteja em `platform_admins` com
 * `active = true`, (b) tenha `profiles.status = 'active'` e (c) — se uma
 * `capability` for fornecida — que o papel a possua na matriz.
 *
 * Usa o cliente scoped-por-usuário (RLS aplicada como o próprio ator) para
 * ler o próprio profile; nunca eleva para service_role para autorizar.
 */
export async function assertPlatformAdmin(
  supabase: SupabaseClient,
  userId: string,
  capability?: PlatformCapability,
): Promise<PlatformRole> {
  const [adminRes, profileRes] = await Promise.all([
    supabase
      .from("platform_admins")
      .select("role, active")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("status")
      .eq("id", userId)
      .maybeSingle(),
  ]);

  if (adminRes.error || !adminRes.data || !adminRes.data.active) {
    throw new Response("Forbidden", { status: 403 });
  }
  // Ator com profile suspenso/arquivado é barrado mesmo sendo platform_admin.
  // Ausência de profile também é fail-closed.
  if (profileRes.error || !profileRes.data || profileRes.data.status !== "active") {
    throw new Response("Forbidden", { status: 403 });
  }

  const role = adminRes.data.role as PlatformRole;
  if (capability && !platformRoleHasCapability(role, capability)) {
    throw new Response("Forbidden", { status: 403 });
  }
  return role;
}