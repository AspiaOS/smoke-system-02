import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createHash, randomBytes } from "crypto";

const INVITE_ROLES = ["manager", "seller", "stock_operator", "auditor"] as const;
type InviteRole = (typeof INVITE_ROLES)[number];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function logPlatform(
  admin: import("@supabase/supabase-js").SupabaseClient,
  actorId: string,
  action: string,
  targetType: string,
  targetId: string,
  payload: Record<string, unknown> = {},
  storeId: string | null = null,
) {
  await admin.from("platform_audit_logs").insert({
    actor_id: actorId,
    action,
    target_type: targetType,
    target_id: targetId,
    payload,
    store_id: storeId,
  });
}

export const listPlatformAuditLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { limit?: number; action?: string; targetType?: string } | undefined) => d ?? {})
  .handler(async ({ data, context }) => {
    const { assertPlatformAdmin } = await import("@/lib/authz/platform.server");
    await assertPlatformAdmin(context.supabase, context.userId, "audit.view");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("platform_audit_logs")
      .select("id, action, target_type, target_id, payload, actor_id, store_id, created_at")
      .order("created_at", { ascending: false })
      .limit(Math.min(data.limit ?? 200, 500));
    if (data.action) q = q.eq("action", data.action);
    if (data.targetType) q = q.eq("target_type", data.targetType);
    const { data: rows, error } = await q;
    if (error) throw new Response(error.message, { status: 400 });

    const actorIds = Array.from(new Set((rows ?? []).map((r) => r.actor_id).filter(Boolean))) as string[];
    const storeIds = Array.from(new Set((rows ?? []).map((r) => r.store_id).filter(Boolean))) as string[];
    const actorMap = new Map<string, string>();
    if (actorIds.length > 0) {
      const { data: users } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
      for (const u of users?.users ?? []) {
        if (actorIds.includes(u.id)) actorMap.set(u.id, u.email ?? u.id);
      }
    }
    const storeMap = new Map<string, string>();
    if (storeIds.length > 0) {
      const { data: stores } = await supabaseAdmin.from("stores").select("id, name").in("id", storeIds);
      for (const s of stores ?? []) storeMap.set(s.id, s.name);
    }
    return (rows ?? []).map((r) => ({
      ...r,
      actor_email: r.actor_id ? actorMap.get(r.actor_id) ?? null : null,
      store_name: r.store_id ? storeMap.get(r.store_id) ?? null : null,
    }));
  });

export const createStore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      storeName: string;
      ownerEmail: string;
      ownerName: string;
    }) => d,
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      storeId: string;
      invitationId: string;
      token: string;
      link: string;
      expiresAt: string;
      userAlreadyExists: boolean;
    }> => {
    const { assertPlatformAdmin } = await import("@/lib/authz/platform.server");
    await assertPlatformAdmin(context.supabase, context.userId, "stores.create");
    const name = data.storeName.trim();
    const email = data.ownerEmail.trim().toLowerCase();
    const displayName = data.ownerName.trim();
    if (!name || !displayName) throw new Response("invalid_input", { status: 400 });
    if (!EMAIL_RE.test(email)) throw new Response("invalid_email", { status: 400 });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Create the store (awaiting owner acceptance).
    const { data: store, error: serr } = await supabaseAdmin
      .from("stores")
      .insert({ name, status: "active" })
      .select("id")
      .single();
    if (serr || !store) throw new Response(serr?.message ?? "store_create_failed", { status: 400 });

    // Não duplica auth.users: apenas sinaliza no payload da auditoria.
    const { data: authList } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
    const userAlreadyExists = !!authList?.users.find((u) => u.email?.toLowerCase() === email);

    // Cancela convites pendentes anteriores para o mesmo par (email, loja).
    await supabaseAdmin
      .from("account_invitations")
      .update({ status: "cancelled" })
      .eq("store_id", store.id)
      .eq("email", email)
      .eq("status", "pending");

    const token = randomBytes(24).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

    const { data: inv, error: ierr } = await supabaseAdmin
      .from("account_invitations")
      .insert({
        store_id: store.id,
        email,
        role: "owner" as never,
        invited_by: context.userId,
        token_hash: tokenHash,
        status: "pending",
        expires_at: expiresAt,
      })
      .select("id")
      .single();
    if (ierr || !inv) throw new Response(ierr?.message ?? "invite_failed", { status: 400 });

    await logPlatform(supabaseAdmin, context.userId, "store.create", "store", store.id, {
      name,
      owner_email: email,
      owner_display_name: displayName,
      pending_invitation_id: inv.id,
    });

    await logPlatform(
      supabaseAdmin,
      context.userId,
      "account.invite",
      "invitation",
      inv.id,
      {
        email,
        store_id: store.id,
        role: "owner",
        display_name: displayName,
        user_already_exists: userAlreadyExists,
        expires_at: expiresAt,
      },
      store.id,
    );

    return {
      storeId: store.id,
      invitationId: inv.id,
      token,
      link: `/invite/${token}`,
      expiresAt,
      userAlreadyExists,
    };
  });

export const setStoreStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { storeId: string; status: "active" | "suspended"; reason?: string }) => d)
  .handler(async ({ data, context }) => {
    const { assertPlatformAdmin } = await import("@/lib/authz/platform.server");
    await assertPlatformAdmin(
      context.supabase,
      context.userId,
      data.status === "suspended" ? "stores.suspend" : "stores.reactivate",
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch =
      data.status === "suspended"
        ? { status: "suspended" as const, suspended_at: new Date().toISOString(), suspended_reason: data.reason ?? null }
        : { status: "active" as const, suspended_at: null, suspended_reason: null };
    const { error } = await supabaseAdmin.from("stores").update(patch).eq("id", data.storeId);
    if (error) throw new Response(error.message, { status: 400 });
    await logPlatform(supabaseAdmin, context.userId, `store.${data.status}`, "store", data.storeId, {
      reason: data.reason ?? null,
    });
    return { ok: true };
  });

/**
 * Convida uma conta para uma loja. Substitui a antiga `createAccount`, que
 * criava `auth.users` direto e podia gerar contas órfãs.
 *
 * - `storeId` e `role` são obrigatórios; recusa ausência/formato inválido.
 * - Só grava o hash do token; o token em claro só existe no retorno para o
 *   admin compartilhar o link de convite.
 * - Não duplica `auth.users`: se o email já tem usuário, o convite continua
 *   válido e o `payload` da auditoria registra `user_already_exists`.
 * - Cancela qualquer convite pendente anterior para o mesmo email/loja.
 * - Auditoria `account.invite` sempre com `email`, `store_id`, `role`, `display_name`.
 */
export const inviteAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { email: string; displayName: string; storeId: string; role: string }) => d,
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      invitationId: string;
      token: string;
      link: string;
      userAlreadyExists: boolean;
      expiresAt: string;
    }> => {
      const { assertPlatformAdmin } = await import("@/lib/authz/platform.server");
      await assertPlatformAdmin(context.supabase, context.userId, "accounts.invite");

      const email = (data.email ?? "").trim().toLowerCase();
      const displayName = (data.displayName ?? "").trim();
      const storeId = (data.storeId ?? "").trim();
      const role = (data.role ?? "").trim() as InviteRole;

      if (!EMAIL_RE.test(email)) throw new Response("invalid_email", { status: 400 });
      if (!displayName) throw new Response("invalid_display_name", { status: 400 });
      if (!storeId) throw new Response("store_required", { status: 400 });
      if (!INVITE_ROLES.includes(role)) throw new Response("invalid_role", { status: 400 });

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const { data: store, error: serr } = await supabaseAdmin
        .from("stores")
        .select("id, name, status")
        .eq("id", storeId)
        .maybeSingle();
      if (serr || !store) throw new Response("store_not_found", { status: 400 });

      // Não duplica auth.users: só sinaliza no payload.
      const { data: authList } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
      const userAlreadyExists = !!authList?.users.find((u) => u.email?.toLowerCase() === email);

      // Cancela pendentes anteriores para o mesmo par email/loja.
      await supabaseAdmin
        .from("account_invitations")
        .update({ status: "cancelled" })
        .eq("store_id", storeId)
        .eq("email", email)
        .eq("status", "pending");

      const token = randomBytes(24).toString("base64url");
      const tokenHash = createHash("sha256").update(token).digest("hex");
      const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

      const { data: inv, error: ierr } = await supabaseAdmin
        .from("account_invitations")
        .insert({
          store_id: storeId,
          email,
          role: role as never,
          invited_by: context.userId,
          token_hash: tokenHash,
          status: "pending",
          expires_at: expiresAt,
        })
        .select("id")
        .single();
      if (ierr || !inv) throw new Response(ierr?.message ?? "invite_failed", { status: 400 });

      await logPlatform(
        supabaseAdmin,
        context.userId,
        "account.invite",
        "invitation",
        inv.id,
        {
          email,
          store_id: storeId,
          role,
          display_name: displayName,
          user_already_exists: userAlreadyExists,
          expires_at: expiresAt,
        },
        storeId,
      );

      return {
        invitationId: inv.id,
        token,
        link: `/invite/${token}`,
        userAlreadyExists,
        expiresAt,
      };
    },
  );

export const setAccountStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; status: "active" | "suspended" | "archived" }) => d)
  .handler(async ({ data, context }) => {
    const { assertPlatformAdmin } = await import("@/lib/authz/platform.server");
    await assertPlatformAdmin(
      context.supabase,
      context.userId,
      data.status === "suspended" ? "accounts.suspend" : data.status === "archived" ? "accounts.archive" : "accounts.reactivate",
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Guard: nunca deixe a plataforma sem super_admin ativo. Ao suspender/arquivar
    // um super_admin, confirma que existe pelo menos um outro super_admin com
    // profiles.status='active' — checagem "melhor esforço": não é livre de corrida
    // em suspensão simultânea, mas cobre o caso comum.
    if (data.status !== "active") {
      const { data: adminRow } = await supabaseAdmin
        .from("platform_admins")
        .select("role, active")
        .eq("user_id", data.userId)
        .maybeSingle();
      if (adminRow?.active && adminRow.role === "super_admin") {
        const { data: others } = await supabaseAdmin
          .from("platform_admins")
          .select("user_id, active, role")
          .eq("role", "super_admin")
          .eq("active", true)
          .neq("user_id", data.userId);
        const otherIds = (others ?? []).map((r) => r.user_id);
        let remaining = 0;
        if (otherIds.length > 0) {
          const { data: profs } = await supabaseAdmin
            .from("profiles")
            .select("id, status")
            .in("id", otherIds);
          // Profile ausente conta como ativo (admin global sem loja) — espelha assertPlatformAdmin.
          const profStatus = new Map((profs ?? []).map((p) => [p.id, p.status]));
          remaining = otherIds.filter((id) => {
            const s = profStatus.get(id);
            return s === undefined || s === "active";
          }).length;
        }
        if (remaining === 0) {
          throw new Response("last_super_admin", { status: 409 });
        }
      }
    }
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ status: data.status })
      .eq("id", data.userId);
    if (error) throw new Response(error.message, { status: 400 });
    await logPlatform(supabaseAdmin, context.userId, `account.${data.status}`, "account", data.userId);
    return { ok: true };
  });

export const assignMembership = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; storeId: string; role: string }) => d)
  .handler(async ({ data, context }) => {
    const { assertPlatformAdmin } = await import("@/lib/authz/platform.server");
    await assertPlatformAdmin(context.supabase, context.userId, "memberships.change_role");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Guard: se o alvo é o último owner ativo e o novo papel não é owner, bloqueia.
    if (data.role !== "owner") {
      const { data: existing } = await supabaseAdmin
        .from("store_memberships")
        .select("role, status")
        .eq("store_id", data.storeId)
        .eq("user_id", data.userId)
        .maybeSingle();
      if (existing?.status === "active" && existing.role === "owner") {
        const { count } = await supabaseAdmin
          .from("store_memberships")
          .select("id", { count: "exact", head: true })
          .eq("store_id", data.storeId)
          .eq("role", "owner")
          .eq("status", "active");
        if ((count ?? 0) <= 1) {
          throw new Response("last_owner", { status: 409 });
        }
      }
    }
    const { error } = await supabaseAdmin.from("store_memberships").upsert(
      {
        user_id: data.userId,
        store_id: data.storeId,
        role: data.role as never,
        status: "active",
        accepted_at: new Date().toISOString(),
      },
      { onConflict: "user_id,store_id" },
    );
    if (error) throw new Response(error.message, { status: 400 });
    await logPlatform(supabaseAdmin, context.userId, "membership.assign", "membership", `${data.userId}:${data.storeId}`, {
      role: data.role,
    });
    return { ok: true };
  });

/**
 * Remove um membership (soft-delete: status='removed'). Bloqueia remoção do
 * último owner ativo da loja.
 */
export const removeMembership = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; storeId: string }) => {
    if (!d.userId || !d.storeId) throw new Response("invalid_input", { status: 400 });
    return d;
  })
  .handler(async ({ data, context }) => {
    const { assertPlatformAdmin } = await import("@/lib/authz/platform.server");
    await assertPlatformAdmin(context.supabase, context.userId, "memberships.remove");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing } = await supabaseAdmin
      .from("store_memberships")
      .select("id, role, status")
      .eq("store_id", data.storeId)
      .eq("user_id", data.userId)
      .maybeSingle();
    if (!existing) throw new Response("membership_not_found", { status: 404 });
    if (existing.status === "active" && existing.role === "owner") {
      const { count } = await supabaseAdmin
        .from("store_memberships")
        .select("id", { count: "exact", head: true })
        .eq("store_id", data.storeId)
        .eq("role", "owner")
        .eq("status", "active");
      if ((count ?? 0) <= 1) throw new Response("last_owner", { status: 409 });
    }
    const { error } = await supabaseAdmin
      .from("store_memberships")
      .update({ status: "removed", removed_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error) throw new Response(error.message, { status: 400 });
    await logPlatform(
      supabaseAdmin,
      context.userId,
      "membership.remove",
      "membership",
      `${data.userId}:${data.storeId}`,
      { previous_role: existing.role },
      data.storeId,
    );
    return { ok: true };
  });

/**
 * Revoga (cancela) um convite pendente.
 */
export const revokeInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { invitationId: string }) => {
    if (!d.invitationId) throw new Response("invalid_input", { status: 400 });
    return d;
  })
  .handler(async ({ data, context }) => {
    const { assertPlatformAdmin } = await import("@/lib/authz/platform.server");
    await assertPlatformAdmin(context.supabase, context.userId, "accounts.invite");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inv } = await supabaseAdmin
      .from("account_invitations")
      .select("id, email, store_id, status")
      .eq("id", data.invitationId)
      .maybeSingle();
    if (!inv) throw new Response("invite_not_found", { status: 404 });
    if (inv.status !== "pending") throw new Response("invite_not_pending", { status: 409 });
    const { error } = await supabaseAdmin
      .from("account_invitations")
      .update({ status: "cancelled" })
      .eq("id", inv.id);
    if (error) throw new Response(error.message, { status: 400 });
    await logPlatform(
      supabaseAdmin,
      context.userId,
      "account.invite_revoked",
      "invitation",
      inv.id,
      { email: inv.email, store_id: inv.store_id },
      inv.store_id,
    );
    return { ok: true };
  });

/**
 * Reenvia um convite pendente: gera novo token, estende expiração para 72h
 * a partir de agora, mantém status = 'pending'. Retorna o novo link.
 */
export const resendInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { invitationId: string }) => {
    if (!d.invitationId) throw new Response("invalid_input", { status: 400 });
    return d;
  })
  .handler(async ({ data, context }): Promise<{ token: string; link: string; expiresAt: string }> => {
    const { assertPlatformAdmin } = await import("@/lib/authz/platform.server");
    await assertPlatformAdmin(context.supabase, context.userId, "accounts.invite");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: inv } = await supabaseAdmin
      .from("account_invitations")
      .select("id, email, store_id, role, status, expires_at")
      .eq("id", data.invitationId)
      .maybeSingle();
    if (!inv) throw new Response("invite_not_found", { status: 404 });
    if (inv.status !== "pending") throw new Response("invite_not_pending", { status: 409 });

    const token = randomBytes(24).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
    const { error } = await supabaseAdmin
      .from("account_invitations")
      .update({ token_hash: tokenHash, expires_at: expiresAt })
      .eq("id", inv.id);
    if (error) throw new Response(error.message, { status: 400 });
    await logPlatform(
      supabaseAdmin,
      context.userId,
      "account.invite_resent",
      "invitation",
      inv.id,
      { email: inv.email, store_id: inv.store_id, previous_expires_at: inv.expires_at, expires_at: expiresAt },
      inv.store_id,
    );
    return { token, link: `/invite/${token}`, expiresAt };
  });

export type PendingInviteRow = {
  id: string;
  email: string;
  role: string;
  store_id: string;
  store_name: string;
  invited_by_email: string | null;
  status: string;
  created_at: string;
  expires_at: string;
  expired: boolean;
};

export const listPendingInvites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PendingInviteRow[]> => {
    const { assertPlatformAdmin } = await import("@/lib/authz/platform.server");
    await assertPlatformAdmin(context.supabase, context.userId, "accounts.view");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows, error } = await supabaseAdmin
      .from("account_invitations")
      .select("id, email, role, store_id, status, created_at, expires_at, invited_by")
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (error) throw new Response(error.message, { status: 400 });

    const storeIds = Array.from(new Set((rows ?? []).map((r) => r.store_id)));
    const storeMap = new Map<string, string>();
    if (storeIds.length > 0) {
      const { data: stores } = await supabaseAdmin.from("stores").select("id, name").in("id", storeIds);
      for (const s of stores ?? []) storeMap.set(s.id, s.name);
    }
    const inviterIds = Array.from(new Set((rows ?? []).map((r) => r.invited_by).filter(Boolean))) as string[];
    const inviterMap = new Map<string, string>();
    if (inviterIds.length > 0) {
      const { data: users } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
      for (const u of users?.users ?? []) if (inviterIds.includes(u.id)) inviterMap.set(u.id, u.email ?? "");
    }
    const now = Date.now();
    return (rows ?? []).map((r) => ({
      id: r.id,
      email: r.email as string,
      role: r.role as string,
      store_id: r.store_id,
      store_name: storeMap.get(r.store_id) ?? r.store_id,
      invited_by_email: r.invited_by ? inviterMap.get(r.invited_by) ?? null : null,
      status: r.status as string,
      created_at: r.created_at,
      expires_at: r.expires_at,
      expired: new Date(r.expires_at).getTime() < now,
    }));
  });

export type SecurityOverview = {
  super_admins: Array<{
    user_id: string;
    email: string;
    display_name: string;
    profile_status: string | null;
    created_at: string;
    last_seen_at: string | null;
  }>;
  support_admins_count: number;
  security_auditors_count: number;
  recent_events: Array<{
    id: string;
    action: string;
    actor_email: string | null;
    target_type: string;
    target_id: string | null;
    store_name: string | null;
    created_at: string;
  }>;
};

export const getSecurityOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SecurityOverview> => {
    const { assertPlatformAdmin } = await import("@/lib/authz/platform.server");
    await assertPlatformAdmin(context.supabase, context.userId, "audit.view");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: admins }, { data: users }] = await Promise.all([
      supabaseAdmin.from("platform_admins").select("user_id, role, active, created_at").eq("active", true),
      supabaseAdmin.auth.admin.listUsers({ perPage: 200 }),
    ]);
    const emailMap = new Map<string, string>();
    for (const u of users?.users ?? []) emailMap.set(u.id, u.email ?? "");

    const superIds = (admins ?? []).filter((a) => a.role === "super_admin").map((a) => a.user_id);
    const { data: profs } = superIds.length
      ? await supabaseAdmin.from("profiles").select("id, display_name, status, last_seen_at").in("id", superIds)
      : { data: [] as { id: string; display_name: string; status: string; last_seen_at: string | null }[] };
    const profMap = new Map((profs ?? []).map((p) => [p.id, p]));

    const superAdmins = (admins ?? [])
      .filter((a) => a.role === "super_admin")
      .map((a) => {
        const p = profMap.get(a.user_id);
        return {
          user_id: a.user_id,
          email: emailMap.get(a.user_id) ?? "",
          display_name: p?.display_name ?? "",
          profile_status: p?.status ?? null,
          created_at: a.created_at,
          last_seen_at: p?.last_seen_at ?? null,
        };
      });

    const SECURITY_ACTIONS = [
      "account.suspended", "account.archived", "account.active",
      "membership.assign", "membership.remove",
      "store.suspended", "store.active", "store.transfer_ownership",
      "platform_admin.grant", "platform_admin.revoke",
      "account.invite", "account.invite_revoked", "account.invite_resent",
    ];
    const { data: events } = await supabaseAdmin
      .from("platform_audit_logs")
      .select("id, action, actor_id, target_type, target_id, store_id, created_at")
      .in("action", SECURITY_ACTIONS)
      .order("created_at", { ascending: false })
      .limit(50);

    const storeIds = Array.from(new Set((events ?? []).map((e) => e.store_id).filter(Boolean))) as string[];
    const storeMap = new Map<string, string>();
    if (storeIds.length) {
      const { data: stores } = await supabaseAdmin.from("stores").select("id, name").in("id", storeIds);
      for (const s of stores ?? []) storeMap.set(s.id, s.name);
    }

    return {
      super_admins: superAdmins,
      support_admins_count: (admins ?? []).filter((a) => a.role === "support_admin").length,
      security_auditors_count: (admins ?? []).filter((a) => a.role === "security_auditor").length,
      recent_events: (events ?? []).map((e) => ({
        id: e.id,
        action: e.action,
        actor_email: e.actor_id ? emailMap.get(e.actor_id) ?? null : null,
        target_type: e.target_type,
        target_id: e.target_id,
        store_name: e.store_id ? storeMap.get(e.store_id) ?? null : null,
        created_at: e.created_at,
      })),
    };
  });

/**
 * Transferência transacional de propriedade da loja.
 * Chama RPC transfer_store_ownership (SECURITY DEFINER, executada em uma
 * única transação: rebaixa owner atual → promove novo owner).
 */
export const transferStoreOwnership = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { storeId: string; newOwnerUserId: string }) => {
    if (!d.storeId || !d.newOwnerUserId) throw new Response("invalid_input", { status: 400 });
    return d;
  })
  .handler(async ({ data, context }) => {
    const { assertPlatformAdmin } = await import("@/lib/authz/platform.server");
    await assertPlatformAdmin(context.supabase, context.userId, "stores.transfer_ownership");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Snapshot previous owner(s) for the audit trail
    const { data: prev } = await supabaseAdmin
      .from("store_memberships")
      .select("user_id")
      .eq("store_id", data.storeId)
      .eq("role", "owner")
      .eq("status", "active");
    const previousOwners = (prev ?? []).map((r) => r.user_id);
    const { error } = await supabaseAdmin.rpc("transfer_store_ownership", {
      _store_id: data.storeId,
      _new_owner_user_id: data.newOwnerUserId,
    });
    if (error) throw new Response(error.message, { status: 400 });
    await logPlatform(
      supabaseAdmin,
      context.userId,
      "store.transfer_ownership",
      "store",
      data.storeId,
      { new_owner_user_id: data.newOwnerUserId, previous_owners: previousOwners },
      data.storeId,
    );
    return { ok: true };
  });

// ---------- Detail readers ----------

export type AccountDetail = {
  id: string;
  email: string;
  display_name: string;
  status: "active" | "suspended" | "archived";
  created_at: string;
  last_seen_at: string | null;
  platform_role: string | null;
  memberships: Array<{
    store_id: string;
    store_name: string;
    role: string;
    status: string;
    accepted_at: string | null;
  }>;
  invitations: Array<{
    id: string;
    store_id: string;
    store_name: string;
    role: string;
    status: string;
    expires_at: string;
    created_at: string;
  }>;
  recent_events: Array<{
    id: string;
    action: string;
    created_at: string;
    payload_json: string | null;
  }>;
};

export const getAccountDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => {
    if (!d.userId) throw new Response("invalid_input", { status: 400 });
    return d;
  })
  .handler(async ({ data, context }): Promise<AccountDetail> => {
    const { assertPlatformAdmin } = await import("@/lib/authz/platform.server");
    await assertPlatformAdmin(context.supabase, context.userId, "accounts.view");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: profile }, { data: userRes }, { data: admin }, { data: mships }, { data: invs }, { data: events }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, display_name, status, created_at, last_seen_at").eq("id", data.userId).maybeSingle(),
      supabaseAdmin.auth.admin.getUserById(data.userId),
      supabaseAdmin.from("platform_admins").select("role, active").eq("user_id", data.userId).maybeSingle(),
      supabaseAdmin.from("store_memberships").select("store_id, role, status, accepted_at").eq("user_id", data.userId),
      supabaseAdmin.from("account_invitations").select("id, store_id, role, status, expires_at, created_at, email").order("created_at", { ascending: false }).limit(20),
      supabaseAdmin.from("platform_audit_logs").select("id, action, created_at, payload").eq("target_id", data.userId).order("created_at", { ascending: false }).limit(20),
    ]);
    if (!profile && !userRes?.user) throw new Response("not_found", { status: 404 });

    const email = userRes?.user?.email ?? "";
    const emailLower = email.toLowerCase();
    const invForEmail = (invs ?? []).filter((i) => (i.email as string)?.toLowerCase() === emailLower);

    const storeIds = Array.from(new Set([
      ...((mships ?? []).map((m) => m.store_id)),
      ...invForEmail.map((i) => i.store_id),
    ]));
    const storeMap = new Map<string, string>();
    if (storeIds.length > 0) {
      const { data: stores } = await supabaseAdmin.from("stores").select("id, name").in("id", storeIds);
      for (const s of stores ?? []) storeMap.set(s.id, s.name);
    }

    return {
      id: data.userId,
      email,
      display_name: profile?.display_name ?? (userRes?.user?.user_metadata as { display_name?: string } | undefined)?.display_name ?? "",
      status: (profile?.status ?? "active") as AccountDetail["status"],
      created_at: profile?.created_at ?? userRes?.user?.created_at ?? new Date().toISOString(),
      last_seen_at: profile?.last_seen_at ?? null,
      platform_role: admin?.active ? (admin.role as string) : null,
      memberships: (mships ?? []).map((m) => ({
        store_id: m.store_id,
        store_name: storeMap.get(m.store_id) ?? m.store_id,
        role: m.role as string,
        status: m.status as string,
        accepted_at: m.accepted_at,
      })),
      invitations: invForEmail.map((i) => ({
        id: i.id,
        store_id: i.store_id,
        store_name: storeMap.get(i.store_id) ?? i.store_id,
        role: i.role as string,
        status: i.status as string,
        expires_at: i.expires_at,
        created_at: i.created_at,
      })),
      recent_events: (events ?? []).map((e) => ({
        id: e.id,
        action: e.action,
        created_at: e.created_at,
        payload_json: e.payload ? JSON.stringify(e.payload) : null,
      })),
    };
  });

export type StoreDetail = {
  id: string;
  name: string;
  status: "active" | "suspended";
  suspended_at: string | null;
  suspended_reason: string | null;
  created_at: string;
  members: Array<{
    user_id: string;
    display_name: string;
    email: string;
    role: string;
    status: string;
    accepted_at: string | null;
  }>;
  pending_invitations: Array<{
    id: string;
    email: string;
    role: string;
    expires_at: string;
    created_at: string;
  }>;
};

export const getStoreDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { storeId: string }) => {
    if (!d.storeId) throw new Response("invalid_input", { status: 400 });
    return d;
  })
  .handler(async ({ data, context }): Promise<StoreDetail> => {
    const { assertPlatformAdmin } = await import("@/lib/authz/platform.server");
    await assertPlatformAdmin(context.supabase, context.userId, "stores.view");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: store } = await supabaseAdmin
      .from("stores")
      .select("id, name, status, suspended_at, suspended_reason, created_at")
      .eq("id", data.storeId)
      .maybeSingle();
    if (!store) throw new Response("not_found", { status: 404 });

    const { data: mships } = await supabaseAdmin
      .from("store_memberships")
      .select("user_id, role, status, accepted_at")
      .eq("store_id", data.storeId)
      .neq("status", "removed")
      .order("created_at", { ascending: true });
    const userIds = (mships ?? []).map((m) => m.user_id);
    const profileMap = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: profs } = await supabaseAdmin.from("profiles").select("id, display_name").in("id", userIds);
      for (const p of profs ?? []) profileMap.set(p.id, p.display_name);
    }
    const emailMap = new Map<string, string>();
    await Promise.all(
      userIds.map(async (id) => {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(id);
        if (u.user?.email) emailMap.set(id, u.user.email);
      }),
    );
    const { data: invs } = await supabaseAdmin
      .from("account_invitations")
      .select("id, email, role, expires_at, created_at, status")
      .eq("store_id", data.storeId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    return {
      id: store.id,
      name: store.name,
      status: store.status as StoreDetail["status"],
      suspended_at: store.suspended_at,
      suspended_reason: store.suspended_reason,
      created_at: store.created_at,
      members: (mships ?? []).map((m) => ({
        user_id: m.user_id,
        display_name: profileMap.get(m.user_id) ?? "",
        email: emailMap.get(m.user_id) ?? "",
        role: m.role as string,
        status: m.status as string,
        accepted_at: m.accepted_at,
      })),
      pending_invitations: (invs ?? []).map((i) => ({
        id: i.id,
        email: i.email as string,
        role: i.role as string,
        expires_at: i.expires_at,
        created_at: i.created_at,
      })),
    };
  });
