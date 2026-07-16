import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { platformRoleHasCapability, type PlatformCapability, type PlatformRole } from "@/lib/authz/matrix";

/**
 * Retorna o registro de platform_admin do usuário autenticado, ou null.
 * Fail-closed: qualquer erro devolve null.
 */
export const getPlatformAdminSelf = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("platform_admins")
      .select("user_id, role, active")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error || !data || !data.active) return null;
    return {
      userId: data.user_id,
      role: data.role as PlatformRole,
    };
  });

async function assertPlatformAdmin(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  userId: string,
  capability?: PlatformCapability,
): Promise<PlatformRole> {
  const { data, error } = await supabase
    .from("platform_admins")
    .select("role, active")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data || !data.active) {
    throw new Response("Forbidden", { status: 403 });
  }
  const role = data.role as PlatformRole;
  if (capability && !platformRoleHasCapability(role, capability)) {
    throw new Response("Forbidden", { status: 403 });
  }
  return role;
}

export type AccountRow = {
  id: string;
  email: string;
  display_name: string;
  status: "active" | "suspended" | "archived";
  last_seen_at: string | null;
  created_at: string;
  memberships: Array<{
    store_id: string;
    role: string;
    status: string;
  }>;
};

export const listAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AccountRow[]> => {
    await assertPlatformAdmin(context.supabase, context.userId, "accounts.view");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profiles, error: perr } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name, status, last_seen_at, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (perr) throw new Error(perr.message);

    const { data: authList, error: aerr } = await supabaseAdmin.auth.admin.listUsers({
      perPage: 200,
    });
    if (aerr) throw new Error(aerr.message);
    const emailById = new Map<string, string>(
      (authList?.users ?? []).map((u) => [u.id, u.email ?? ""]),
    );

    const { data: mships } = await supabaseAdmin
      .from("store_memberships")
      .select("user_id, store_id, role, status");
    const byUser = new Map<string, AccountRow["memberships"]>();
    for (const m of mships ?? []) {
      const arr = byUser.get(m.user_id) ?? [];
      arr.push({ store_id: m.store_id, role: m.role, status: m.status });
      byUser.set(m.user_id, arr);
    }

    return (profiles ?? []).map((p) => ({
      id: p.id,
      email: emailById.get(p.id) ?? "",
      display_name: p.display_name,
      status: p.status as AccountRow["status"],
      last_seen_at: p.last_seen_at,
      created_at: p.created_at,
      memberships: byUser.get(p.id) ?? [],
    }));
  });

export type StoreRow = {
  id: string;
  name: string;
  status: "active" | "suspended";
  suspended_at: string | null;
  created_at: string;
  members: number;
  owners: number;
};

export const listStoresForControl = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StoreRow[]> => {
    await assertPlatformAdmin(context.supabase, context.userId, "stores.view");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: stores, error } = await supabaseAdmin
      .from("stores")
      .select("id, name, status, suspended_at, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const { data: mships } = await supabaseAdmin
      .from("store_memberships")
      .select("store_id, role, status");
    const counts = new Map<string, { members: number; owners: number }>();
    for (const m of mships ?? []) {
      const c = counts.get(m.store_id) ?? { members: 0, owners: 0 };
      if (m.status === "active") {
        c.members += 1;
        if (m.role === "owner") c.owners += 1;
      }
      counts.set(m.store_id, c);
    }
    return (stores ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      status: s.status as StoreRow["status"],
      suspended_at: s.suspended_at,
      created_at: s.created_at,
      members: counts.get(s.id)?.members ?? 0,
      owners: counts.get(s.id)?.owners ?? 0,
    }));
  });

export type ControlDashboardMetrics = {
  accountsActive: number;
  accountsSuspended: number;
  storesActive: number;
  storesSuspended: number;
  platformAdmins: number;
  pendingInvitations: number;
};

export const getControlDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ControlDashboardMetrics> => {
    await assertPlatformAdmin(context.supabase, context.userId, "audit.view");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [profiles, stores, admins, invites] = await Promise.all([
      supabaseAdmin.from("profiles").select("status"),
      supabaseAdmin.from("stores").select("status"),
      supabaseAdmin.from("platform_admins").select("active").eq("active", true),
      supabaseAdmin
        .from("account_invitations")
        .select("status")
        .eq("status", "pending"),
    ]);

    const p = profiles.data ?? [];
    const s = stores.data ?? [];
    return {
      accountsActive: p.filter((x) => x.status === "active").length,
      accountsSuspended: p.filter((x) => x.status === "suspended").length,
      storesActive: s.filter((x) => x.status === "active").length,
      storesSuspended: s.filter((x) => x.status === "suspended").length,
      platformAdmins: (admins.data ?? []).length,
      pendingInvitations: (invites.data ?? []).length,
    };
  });
