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
      ownerPassword: string;
    }) => d,
  )
  .handler(async ({ data, context }): Promise<{ storeId: string; ownerId: string }> => {
    const { assertPlatformAdmin } = await import("@/lib/authz/platform.server");
    await assertPlatformAdmin(context.supabase, context.userId, "stores.create");
    const name = data.storeName.trim();
    const email = data.ownerEmail.trim().toLowerCase();
    const displayName = data.ownerName.trim();
    if (!name || !email || !displayName || data.ownerPassword.length < 8) {
      throw new Response("invalid_input", { status: 400 });
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Find or create the auth user
    let ownerId: string | null = null;
    const { data: existing } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
    const found = existing?.users.find((u) => u.email?.toLowerCase() === email);
    if (found) {
      ownerId = found.id;
    } else {
      const { data: created, error: cerr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: data.ownerPassword,
        email_confirm: true,
        user_metadata: { display_name: displayName },
      });
      if (cerr || !created.user) throw new Response(cerr?.message ?? "create_user_failed", { status: 400 });
      ownerId = created.user.id;
    }

    // Create the store
    const { data: store, error: serr } = await supabaseAdmin
      .from("stores")
      .insert({ name, status: "active" })
      .select("id")
      .single();
    if (serr || !store) throw new Response(serr?.message ?? "store_create_failed", { status: 400 });

    // Ensure profile row for owner scoped to this store
    await supabaseAdmin
      .from("profiles")
      .upsert(
        { id: ownerId, store_id: store.id, display_name: displayName, status: "active" },
        { onConflict: "id" },
      );

    // Create owner membership
    const { error: merr } = await supabaseAdmin.from("store_memberships").upsert(
      {
        user_id: ownerId,
        store_id: store.id,
        role: "owner",
        status: "active",
        accepted_at: new Date().toISOString(),
      },
      { onConflict: "user_id,store_id" },
    );
    if (merr) throw new Response(merr.message, { status: 400 });

    await logPlatform(supabaseAdmin, context.userId, "store.create", "store", store.id, {
      name,
      owner_id: ownerId,
      owner_email: email,
    });

    return { storeId: store.id, ownerId };
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
