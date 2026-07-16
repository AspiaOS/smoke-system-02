import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { platformRoleHasCapability, type PlatformCapability, type PlatformRole } from "@/lib/authz/matrix";

async function assertPlatformAdmin(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  userId: string,
  capability: PlatformCapability,
): Promise<PlatformRole> {
  const { data, error } = await supabase
    .from("platform_admins")
    .select("role, active")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data || !data.active) throw new Response("Forbidden", { status: 403 });
  const role = data.role as PlatformRole;
  if (!platformRoleHasCapability(role, capability)) {
    throw new Response("Forbidden", { status: 403 });
  }
  return role;
}

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

export const createAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { email: string; displayName: string; password: string; storeId?: string; role?: string }) => d,
  )
  .handler(async ({ data, context }): Promise<{ userId: string }> => {
    await assertPlatformAdmin(context.supabase, context.userId, "accounts.invite");
    const email = data.email.trim().toLowerCase();
    const displayName = data.displayName.trim();
    if (!email || !displayName || data.password.length < 8) {
      throw new Response("invalid_input", { status: 400 });
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error: cerr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { display_name: displayName },
    });
    if (cerr || !created.user) throw new Response(cerr?.message ?? "create_user_failed", { status: 400 });
    const userId = created.user.id;

    if (data.storeId) {
      await supabaseAdmin.from("profiles").upsert(
        { id: userId, store_id: data.storeId, display_name: displayName, status: "active" },
        { onConflict: "id" },
      );
      await supabaseAdmin.from("store_memberships").upsert(
        {
          user_id: userId,
          store_id: data.storeId,
          role: (data.role ?? "seller") as never,
          status: "active",
          accepted_at: new Date().toISOString(),
        },
        { onConflict: "user_id,store_id" },
      );
    }

    await logPlatform(supabaseAdmin, context.userId, "account.create", "account", userId, {
      email,
      store_id: data.storeId ?? null,
      role: data.role ?? null,
    });
    return { userId };
  });

export const setAccountStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; status: "active" | "suspended" | "archived" }) => d)
  .handler(async ({ data, context }) => {
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
