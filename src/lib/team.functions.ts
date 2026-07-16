import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { MembershipRole } from "@/lib/authz/matrix";
import { createHash, randomBytes } from "crypto";

type Ctx = { supabase: import("@supabase/supabase-js").SupabaseClient; userId: string };

async function currentStoreId(ctx: Ctx): Promise<string> {
  const { data, error } = await ctx.supabase
    .from("store_memberships")
    .select("store_id")
    .eq("user_id", ctx.userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (error || !data) throw new Response("Forbidden", { status: 403 });
  return data.store_id;
}

export type MemberRow = {
  id: string;
  user_id: string;
  role: MembershipRole;
  status: "active" | "suspended" | "removed";
  accepted_at: string | null;
  created_at: string;
  display_name: string | null;
  email: string | null;
};

export const listMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MemberRow[]> => {
    const storeId = await currentStoreId(context);
    const { data, error } = await context.supabase
      .from("store_memberships")
      .select("id, user_id, role, status, accepted_at, created_at")
      .eq("store_id", storeId)
      .neq("status", "removed")
      .order("created_at", { ascending: true });
    if (error) throw new Response(error.message, { status: 400 });

    const rows = data ?? [];
    if (rows.length === 0) return [];

    const userIds = rows.map((r) => r.user_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name")
      .in("id", userIds);
    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p.display_name] as const));

    const emailMap = new Map<string, string>();
    await Promise.all(
      userIds.map(async (id) => {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(id);
        if (u.user?.email) emailMap.set(id, u.user.email);
      }),
    );

    return rows.map((r) => ({
      id: r.id,
      user_id: r.user_id,
      role: r.role as MembershipRole,
      status: r.status as MemberRow["status"],
      accepted_at: r.accepted_at,
      created_at: r.created_at,
      display_name: profileMap.get(r.user_id) ?? null,
      email: emailMap.get(r.user_id) ?? null,
    }));
  });

export type InviteRow = {
  id: string;
  email: string;
  role: MembershipRole;
  status: "pending" | "accepted" | "expired" | "cancelled";
  expires_at: string;
  created_at: string;
};

export const listInvites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<InviteRow[]> => {
    const storeId = await currentStoreId(context);
    const { data, error } = await context.supabase
      .from("account_invitations")
      .select("id, email, role, status, expires_at, created_at")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Response(error.message, { status: 400 });
    return (data ?? []).map((r) => ({
      id: r.id,
      email: r.email as string,
      role: r.role as MembershipRole,
      status: r.status as InviteRow["status"],
      expires_at: r.expires_at,
      created_at: r.created_at,
    }));
  });

export const createInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { email: string; role: MembershipRole; days?: number }) => d)
  .handler(async ({ data, context }): Promise<{ token: string; link: string }> => {
    const storeId = await currentStoreId(context);
    const token = randomBytes(24).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const days = Math.min(Math.max(data.days ?? 7, 1), 30);
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

    const { error } = await context.supabase.rpc("create_store_invite", {
      _store_id: storeId,
      _email: data.email.trim().toLowerCase(),
      _role: data.role,
      _token_hash: tokenHash,
      _expires_at: expiresAt,
    });
    if (error) throw new Response(error.message, { status: 400 });

    return { token, link: `/invite/${token}` };
  });

export const cancelInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("cancel_store_invite", { _invite_id: data.id });
    if (error) throw new Response(error.message, { status: 400 });
    return { ok: true };
  });

export const acceptInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { token: string }) => d)
  .handler(async ({ data, context }) => {
    const tokenHash = createHash("sha256").update(data.token).digest("hex");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: userInfo } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const email = userInfo.user?.email;
    const metaDisplayName =
      (userInfo.user?.user_metadata as { display_name?: string } | undefined)?.display_name;
    if (!email) throw new Response("Missing email", { status: 400 });
    const { data: membershipId, error } = await context.supabase.rpc("accept_store_invite", {
      _token_hash: tokenHash,
      _email: email,
    });
    if (error) throw new Response(error.message, { status: 400 });

    // Garante um profile ativo escopado à loja convidada — sem isso a conta
    // não aparece em listAccounts (que se baseia em profiles).
    const { data: mem } = await supabaseAdmin
      .from("store_memberships")
      .select("store_id")
      .eq("id", membershipId as string)
      .maybeSingle();
    if (mem?.store_id) {
      await supabaseAdmin.from("profiles").upsert(
        {
          id: context.userId,
          store_id: mem.store_id,
          display_name: metaDisplayName || email.split("@")[0],
          status: "active",
        },
        { onConflict: "id" },
      );
    }

    return { membershipId: membershipId as string };
  });

export const changeMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; role: MembershipRole }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("change_member_role", {
      _membership_id: data.id,
      _role: data.role,
    });
    if (error) throw new Response(error.message, { status: 400 });
    return { ok: true };
  });

export const suspendMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("suspend_member", { _membership_id: data.id });
    if (error) throw new Response(error.message, { status: 400 });
    return { ok: true };
  });

export const reactivateMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("reactivate_member", { _membership_id: data.id });
    if (error) throw new Response(error.message, { status: 400 });
    return { ok: true };
  });

export const removeMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("remove_member", { _membership_id: data.id });
    if (error) throw new Response(error.message, { status: 400 });
    return { ok: true };
  });
