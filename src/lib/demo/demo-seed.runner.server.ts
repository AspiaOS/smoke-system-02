// Runner do seed demo — server-only.
// Toda lógica está aqui; demo-seed.functions.ts é só o wrapper createServerFn.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  BANNER_URLS, BRANDS, CANCEL_REASONS, CATEGORY_NAMES, DEMO_SEED, DEMO_VERSION,
  EXPENSE_CATEGORIES, EXPENSE_DESCRIPTIONS, FIRST_NAMES, LAST_NAMES,
  NEIGHBORHOODS, NEIGHBORHOODS_INACTIVE_INDEXES, PAYMENT_METHODS,
  PRODUCT_DESCRIPTIONS, PRODUCT_IMG, PRODUCT_NAMES, PROFILE_SIZES,
  STOCK_ADJUST_NOTES, STOCK_ENTRY_NOTES, STREETS, VARIATION_FLAVORS,
  makeRng, makeTestPhone, type Profile,
} from "./demo-data";
import { createManifest, emptyEntries, findActiveManifest, updateManifest, type ManifestEntries } from "./demo-manifest.server";
import { assertDemoEnabled, environmentSummary } from "./demo-guard.server";

type Client = SupabaseClient<Database>;
type PaymentMethod = Database["public"]["Enums"]["payment_method"];

const DAY_MS = 86_400_000;

function iso(offsetDaysFromNow: number): string {
  return new Date(Date.now() + offsetDaysFromNow * DAY_MS).toISOString();
}

async function assertOwner(supabase: Client): Promise<void> {
  const { data, error } = await supabase.rpc("is_owner");
  if (error) throw new Error(`is_owner_failed:${error.message}`);
  if (!data) throw new Error("FORBIDDEN: caller is not owner");
}

async function loadStoreContext(supabase: Client, userId: string) {
  const { data: profile, error: pe } = await supabase
    .from("profiles").select("id, store_id").eq("id", userId).maybeSingle();
  if (pe) throw pe;
  if (!profile) throw new Error("no_profile_for_owner");
  return { storeId: profile.store_id, userId };
}

// ---------------------------------------------------------------------------
// Seed principal — orquestra tudo. Retorna resumo textual.
// ---------------------------------------------------------------------------
export type SeedSummary = {
  version: string;
  profile: Profile;
  seed: number;
  counts: Record<string, number>;
  financials: Record<string, number>;
};

export async function runSeed(
  supabase: Client,
  userId: string,
  profile: Profile,
): Promise<{ manifestId: string; summary: SeedSummary }> {
  assertDemoEnabled();
  await assertOwner(supabase);

  const existing = await findActiveManifest(supabase);
  if (existing && existing.status === "complete") {
    throw new Error(
      `LOTE_DEMO_ATIVO: já existe um lote demo (${existing.run_id}). Rode o reset antes de semear de novo.`,
    );
  }
  if (existing && existing.status === "running") {
    throw new Error(
      `LOTE_DEMO_INTERROMPIDO: existe manifest running (${existing.run_id}). Rode reset para limpar antes.`,
    );
  }

  const { storeId } = await loadStoreContext(supabase, userId);

  // ---- pre_snapshot: store_settings atuais para reverter no reset ----
  const { data: settingsBefore } = await supabase
    .from("store_settings").select("*").eq("store_id", storeId).maybeSingle();

  const manifest = await createManifest(supabase, {
    profile,
    preSnapshot: { store_settings: settingsBefore ?? null, env: environmentSummary() },
  });

  const entries: ManifestEntries = emptyEntries();
  const rng = makeRng(DEMO_SEED);
  const sizes = PROFILE_SIZES[profile];

  // Importa admin client apenas quando realmente for necessário (bypass RLS p/ backfill).
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  try {
    // ==================== 1. CATEGORIAS ====================
    const catRows = CATEGORY_NAMES.slice(0, sizes.categories);
    const catInserts = catRows.map((c, i) => ({
      name: c.name, active: c.active, store_id: storeId, sort_order: i,
    }));
    const { data: insertedCats, error: catErr } = await supabase
      .from("categories").insert(catInserts).select("id, name, active");
    if (catErr) throw new Error(`categories:${catErr.message}`);
    entries.categories = insertedCats.map((c) => c.id);
    await updateManifest(supabase, manifest.id, { entries });

    const catByName = new Map(insertedCats.map((c) => [c.name, c]));
    const noviCat = catByName.get("Novidades")!; // ativa sem produtos visíveis
    const arqCat = catByName.get("Arquivados"); // inativa
    const activeCats = insertedCats.filter(
      (c) => c.active && c.name !== "Novidades",
    );

    // ==================== 2. PRODUTOS ====================
    const productNames = rng.shuffle(PRODUCT_NAMES).slice(0, sizes.products);
    const products = productNames.map((name, i) => {
      // Distribuição de cenários
      const rr = rng.next();
      const inArq = arqCat && i === 0; // 1 produto em categoria inativa
      const inNovi = i === 1; // 1 em Novidades (sem estoque = não visível)
      const hidden = i === 2; // oculto (visible=false) com estoque
      const inactive = i === 3; // inativo (active=false)
      const featured = i < 6 && !inactive && !hidden && !inArq;
      const cat = inArq ? arqCat! : inNovi ? noviCat : rng.pick(activeCats);

      return {
        name,
        brand: rng.pick(BRANDS),
        description: rng.pick(PRODUCT_DESCRIPTIONS),
        category_id: cat.id,
        store_id: storeId,
        active: !inactive,
        visible: !hidden && !inactive,
        featured,
        images: [PRODUCT_IMG],
        __i: i,
        __inNovi: inNovi,
      };
    });
    const { data: insertedProducts, error: prodErr } = await supabase
      .from("products")
      .insert(products.map(({ __i: _i, __inNovi: _n, ...rest }) => rest))
      .select("id, name");
    if (prodErr) throw new Error(`products:${prodErr.message}`);
    entries.products = insertedProducts.map((p) => p.id);
    await updateManifest(supabase, manifest.id, { entries });

    // ==================== 3. VARIAÇÕES (stock=0) ====================
    type VarSpec = {
      product_id: string; name: string; price: number; cost: number;
      min_stock: number; active: boolean; stock: number;
      __initialStock: number; __keepZero: boolean;
    };
    const varSpecs: VarSpec[] = [];
    insertedProducts.forEach((p, pi) => {
      const varCount = rng.int(2, 4);
      const flavors = rng.shuffle(VARIATION_FLAVORS).slice(0, varCount);
      flavors.forEach((flavor, vi) => {
        const price = rng.int(15, 90);
        const cost = Math.max(5, Math.round(price * (0.4 + rng.next() * 0.3)));
        const global = pi * 10 + vi;
        const keepZero = global % 17 === 0;
        const lowStock = global % 11 === 3;
        const atMin = global % 13 === 5;
        const isInactive = global % 19 === 7;
        const min_stock = rng.int(3, 8);
        const initial = keepZero
          ? 0
          : lowStock
            ? Math.max(1, min_stock - 2)
            : atMin
              ? min_stock
              : rng.int(min_stock + 3, min_stock + 40);
        varSpecs.push({
          product_id: p.id,
          name: flavor,
          price,
          cost,
          min_stock,
          active: !isInactive,
          stock: 0,
          __initialStock: initial,
          __keepZero: keepZero,
        });
      });
    });

    const varInsertPayload = varSpecs.map(
      ({ __initialStock: _s, __keepZero: _k, ...rest }) => rest,
    );
    const { data: insertedVars, error: varErr } = await supabase
      .from("variations")
      .insert(varInsertPayload)
      .select("id");
    if (varErr) throw new Error(`variations:${varErr.message}`);
    entries.variations = insertedVars.map((v) => v.id);
    await updateManifest(supabase, manifest.id, { entries });

    const varById = insertedVars.map((v, i) => ({ id: v.id, ...varSpecs[i] }));

    // ==================== 4. BAIRROS ====================
    const nbrCount = Math.min(sizes.neighborhoods, NEIGHBORHOODS.length);
    const nbrInserts = NEIGHBORHOODS.slice(0, nbrCount).map((n, i) => ({
      name: n.name,
      delivery_fee: n.fee,
      store_id: storeId,
      active: !NEIGHBORHOODS_INACTIVE_INDEXES.includes(i),
    }));
    const { data: insertedNbrs, error: nbrErr } = await supabase
      .from("neighborhoods").insert(nbrInserts).select("id, name, active, delivery_fee");
    if (nbrErr) throw new Error(`neighborhoods:${nbrErr.message}`);
    entries.neighborhoods = insertedNbrs.map((n) => n.id);
    await updateManifest(supabase, manifest.id, { entries });
    const activeNbrs = insertedNbrs.filter((n) => n.active);

    // ==================== 5. ESTOQUE INICIAL via stock_entry ====================
    // Captura ids de stock_movements criados antes p/ diferença.
    const preMoves = await maxStockMovementId(supabase);
    for (const v of varById) {
      if (v.__keepZero) continue;
      const { error: seErr } = await supabase.rpc("stock_entry", {
        _variation_id: v.id,
        _qty: v.__initialStock,
        _note: rng.pick(STOCK_ENTRY_NOTES),
      });
      if (seErr) throw new Error(`stock_entry(${v.id}):${seErr.message}`);
    }

    // ==================== 6. AJUSTES OCASIONAIS via stock_adjust ====================
    const adjustCandidates = rng.shuffle(varById.filter((v) => !v.__keepZero)).slice(0, Math.max(3, Math.floor(varById.length / 8)));
    for (const v of adjustCandidates) {
      const currStockRes = await supabase.from("variations").select("stock").eq("id", v.id).single();
      const curr = currStockRes.data?.stock ?? v.__initialStock;
      const delta = rng.int(-2, 3);
      const next = Math.max(0, curr + delta);
      if (next === curr) continue;
      const { error: saErr } = await supabase.rpc("stock_adjust", {
        _variation_id: v.id,
        _new_qty: next,
        _note: rng.pick(STOCK_ADJUST_NOTES),
      });
      if (saErr) throw new Error(`stock_adjust(${v.id}):${saErr.message}`);
    }

    const postMoves = await stockMovementIdsSince(supabase, preMoves);
    entries.stock_movements.push(...postMoves);

    // ==================== 7. PEDIDOS via create_public_order ====================
    const orderInfos: {
      orderId: string;
      whenDaysAgo: number;
      fate: "accept" | "cancel" | "pending";
    }[] = [];
    const canSellVars = varById.filter(
      (v) => v.active && !v.__keepZero && v.__initialStock >= 2,
    );
    if (canSellVars.length === 0) throw new Error("no_sellable_variations");

    // Distribuição de idade: 30% últimos 7d, 40% últimos 30d, 30% até 120d
    // Distribuição de destino: 70% accept, 15% pending, 15% cancel
    // Alguns clientes recorrentes: reusar 10 telefones em 40% dos pedidos.
    const recurrentPhones = Array.from({ length: 10 }, (_, k) => makeTestPhone(k));

    for (let i = 0; i < sizes.orders; i++) {
      const ageBucket = rng.next();
      const daysAgo =
        ageBucket < 0.3 ? rng.int(0, 6)
        : ageBucket < 0.7 ? rng.int(7, 30)
        : rng.int(30, 120);

      const useRecurrent = rng.next() < 0.4;
      const phone = useRecurrent ? rng.pick(recurrentPhones) : makeTestPhone(1000 + i);
      const firstName = rng.pick(FIRST_NAMES);
      const lastName = rng.pick(LAST_NAMES);
      const customerName = `${firstName} ${lastName}`;
      const street = `${rng.pick(STREETS)}, ${rng.int(10, 999)}`;
      const nbr = rng.pick(activeNbrs);
      const payment = rng.pick(PAYMENT_METHODS) as PaymentMethod;

      const itemCount = rng.int(1, 3);
      const itemsPool = rng.shuffle(canSellVars).slice(0, itemCount);
      const items = itemsPool.map((v) => ({
        variation_id: v.id, quantity: rng.int(1, 2),
      }));

      const { data: orderRes, error: coErr } = await supabase.rpc(
        "create_public_order",
        {
          p_customer_name: customerName,
          p_customer_phone: phone,
          p_address: street,
          p_neighborhood_id: nbr.id,
          p_payment_method: payment,
          p_items: items,
        },
      );
      if (coErr) throw new Error(`create_public_order[${i}]:${coErr.message}`);
      const orderId = orderRes?.[0]?.order_id as string;
      if (!orderId) throw new Error(`create_public_order[${i}] returned no id`);
      entries.orders.push(orderId);

      // Decisão do destino
      const fateR = rng.next();
      // Pedidos muito recentes (<1d) tendem a ficar pending (para tela de fila)
      const forcePending = daysAgo <= 1 && i % 6 === 0;
      const fate: "accept" | "cancel" | "pending" =
        forcePending ? "pending"
        : fateR < 0.7 ? "accept"
        : fateR < 0.85 ? "cancel"
        : "pending";

      orderInfos.push({ orderId, whenDaysAgo: daysAgo, fate });

      if (fate === "cancel") {
        const reason = rng.next() < 0.9 ? rng.pick(CANCEL_REASONS) : "";
        const { error: cxErr } = await supabase.rpc("cancel_order", {
          p_order_id: orderId, p_reason: reason || "",
        });
        if (cxErr) throw new Error(`cancel_order[${orderId}]:${cxErr.message}`);
      } else if (fate === "accept") {
        const beforeSaleMove = await maxStockMovementId(supabase);
        const { error: axErr } = await supabase.rpc("accept_order", { p_order_id: orderId });
        if (axErr) {
          // Estoque insuficiente é possível se muitos pedidos consumirem — apenas cancela em vez de falhar tudo.
          if (axErr.message.includes("insufficient_stock")) {
            await supabase.rpc("cancel_order", { p_order_id: orderId, p_reason: "insufficient_stock (demo)" });
            orderInfos[orderInfos.length - 1].fate = "cancel";
          } else {
            throw new Error(`accept_order[${orderId}]:${axErr.message}`);
          }
        } else {
          const newMoves = await stockMovementIdsSince(supabase, beforeSaleMove);
          entries.stock_movements.push(...newMoves);
        }
      }
    }

    // Capturar sales criadas pelos accepts
    if (entries.orders.length > 0) {
      const { data: salesRows } = await supabase
        .from("sales").select("id").in("order_id", entries.orders);
      entries.sales = (salesRows ?? []).map((s) => s.id);
    }
    // Capturar customers criados
    const { data: customerRows } = await supabase
      .from("customers")
      .select("id")
      .eq("store_id", storeId)
      .like("phone", "5511%");
    entries.customers = (customerRows ?? []).map((c) => c.id);

    // Capturar order_items
    if (entries.orders.length > 0) {
      const { data: oiRows } = await supabase
        .from("order_items").select("id").in("order_id", entries.orders);
      entries.order_items = (oiRows ?? []).map((oi) => oi.id as number);
    }
    await updateManifest(supabase, manifest.id, { entries });

    // ==================== 8. DESPESAS ====================
    const expensesInserts = [];
    for (let i = 0; i < sizes.expenses; i++) {
      const cat = rng.pick(EXPENSE_CATEGORIES);
      const desc = rng.pick(EXPENSE_DESCRIPTIONS[cat]);
      const daysAgo = rng.int(0, 120);
      // Valores em BRL: pequenos, médios, grandes
      const bucket = rng.next();
      const amount =
        bucket < 0.5 ? rng.int(10, 80)
        : bucket < 0.9 ? rng.int(80, 400)
        : rng.int(400, 1500);
      expensesInserts.push({
        store_id: storeId,
        category: cat,
        description: desc,
        amount,
        expense_date: iso(-daysAgo).slice(0, 10),
      });
    }
    const { data: insertedExps, error: expErr } = await supabase
      .from("expenses").insert(expensesInserts).select("id");
    if (expErr) throw new Error(`expenses:${expErr.message}`);
    entries.expenses = insertedExps.map((e) => e.id);

    // ==================== 9. Mudanças de preço (audit price.update) ====================
    const priceCands = rng.shuffle(varById).slice(0, Math.min(15, Math.max(3, Math.floor(varById.length / 8))));
    type AuditInsert = Database["public"]["Tables"]["audit_logs"]["Insert"];
    const priceAuditInserts: AuditInsert[] = [];
    for (const v of priceCands) {
      const before = v.price;
      const after = Math.max(5, Math.round(before * (0.9 + rng.next() * 0.3)));
      if (after === before) continue;
      const { error: upErr } = await supabase.from("variations").update({ price: after }).eq("id", v.id);
      if (upErr) throw new Error(`price.update(${v.id}):${upErr.message}`);
      priceAuditInserts.push({
        store_id: storeId,
        actor_id: userId,
        action: "price.update",
        entity: "variation",
        entity_id: v.id,
        payload: { before, after } as unknown as AuditInsert["payload"],
      });
    }
    if (priceAuditInserts.length > 0) {
      const { data: alRows, error: alErr } = await supabase
        .from("audit_logs").insert(priceAuditInserts).select("id");
      if (alErr) throw new Error(`audit_logs(price):${alErr.message}`);
      entries.audit_logs.push(...alRows.map((r) => r.id as number));
    }

    // ==================== 10. Configurações + banner + audit settings.update ====================
    const settingsUpdate = {
      store_display_name: settingsBefore?.store_display_name ?? "Smoke Demo",
      whatsapp_number: makeTestPhone(0), // fictício reservado
      banners: BANNER_URLS.map((url, i) => ({ url, alt: `Banner ${i + 1}` })),
    };
    const { error: ssErr } = await supabase
      .from("store_settings").update(settingsUpdate).eq("store_id", storeId);
    if (ssErr) throw new Error(`store_settings:${ssErr.message}`);
    {
      const { data: alRow, error: alErr } = await supabase
        .from("audit_logs")
        .insert({
          store_id: storeId, actor_id: userId,
          action: "settings.update", entity: "store_settings", entity_id: storeId,
          payload: { banners: settingsUpdate.banners.length, source: "demo-seed" },
        })
        .select("id").single();
      if (alErr) throw new Error(`audit_logs(settings):${alErr.message}`);
      entries.audit_logs.push(alRow.id as number);
    }
    // Capturar todos os audit_logs criados pelos RPCs (order.accept, order.cancel, stock.adjust)
    const { data: allAuditRows } = await supabaseAdmin
      .from("audit_logs")
      .select("id, entity, entity_id")
      .eq("store_id", storeId)
      .in("action", ["order.accept", "order.cancel", "stock.adjust"]);
    const orderIdSet = new Set(entries.orders);
    const varIdSet = new Set(entries.variations);
    (allAuditRows ?? []).forEach((r) => {
      if (
        (r.entity === "order" && orderIdSet.has(r.entity_id)) ||
        (r.entity === "variation" && varIdSet.has(r.entity_id))
      ) {
        entries.audit_logs.push(r.id as number);
      }
    });
    // dedupe
    entries.audit_logs = Array.from(new Set(entries.audit_logs));
    await updateManifest(supabase, manifest.id, { entries });

    // ==================== 11. BACKFILL DE DATAS (via supabaseAdmin) ====================
    // Para cada pedido do lote, define created_at histórico e propaga p/ aceite, venda, movimentações e logs.
    for (const info of orderInfos) {
      const orderCreated = iso(-info.whenDaysAgo);
      const acceptedOffsetH = 0.5 + Math.random() * 4; // horas
      const accepted = new Date(
        new Date(orderCreated).getTime() + acceptedOffsetH * 3_600_000,
      ).toISOString();

      await supabaseAdmin.from("orders").update({ created_at: orderCreated }).eq("id", info.orderId);
      if (info.fate === "accept") {
        await supabaseAdmin.from("orders")
          .update({ accepted_at: accepted }).eq("id", info.orderId);
        await supabaseAdmin.from("sales")
          .update({ created_at: accepted }).eq("order_id", info.orderId);
        await supabaseAdmin.from("stock_movements")
          .update({ created_at: accepted })
          .eq("order_id", info.orderId).eq("type", "sale_accept");
        await supabaseAdmin.from("audit_logs")
          .update({ created_at: accepted })
          .eq("entity", "order").eq("entity_id", info.orderId).eq("action", "order.accept");
      } else if (info.fate === "cancel") {
        await supabaseAdmin.from("orders")
          .update({ cancelled_at: accepted }).eq("id", info.orderId);
        await supabaseAdmin.from("audit_logs")
          .update({ created_at: accepted })
          .eq("entity", "order").eq("entity_id", info.orderId).eq("action", "order.cancel");
      }
    }
    // Espalha entradas iniciais de estoque em dias -100..-90
    {
      const { data: entryMoves } = await supabaseAdmin
        .from("stock_movements")
        .select("id")
        .in("id", entries.stock_movements)
        .eq("type", "entry");
      for (const m of entryMoves ?? []) {
        await supabaseAdmin
          .from("stock_movements")
          .update({ created_at: iso(-90 - Math.floor(Math.random() * 20)) })
          .eq("id", m.id as number);
      }
    }
    // Ajustes: -60..-10
    {
      const { data: adjMoves } = await supabaseAdmin
        .from("stock_movements")
        .select("id")
        .in("id", entries.stock_movements)
        .eq("type", "adjustment");
      for (const m of adjMoves ?? []) {
        const d = -(10 + Math.floor(Math.random() * 50));
        await supabaseAdmin
          .from("stock_movements").update({ created_at: iso(d) }).eq("id", m.id as number);
        await supabaseAdmin
          .from("audit_logs")
          .update({ created_at: iso(d) })
          .eq("entity", "variation").eq("action", "stock.adjust");
      }
    }

    // ==================== 12. Sumário ====================
    const { data: acceptedRows } = await supabase
      .from("orders").select("id, status").in("id", entries.orders);
    const accepted = acceptedRows?.filter((o) => o.status === "accepted").length ?? 0;
    const pending = acceptedRows?.filter((o) => o.status === "pending").length ?? 0;
    const cancelled = acceptedRows?.filter((o) => o.status === "cancelled").length ?? 0;
    const { data: salesAgg } = await supabase
      .from("sales")
      .select("subtotal, delivery_fee, total, total_cost, gross_profit")
      .in("id", entries.sales);
    const summary = {
      version: DEMO_VERSION,
      profile,
      seed: DEMO_SEED,
      counts: {
        categories: entries.categories.length,
        products: entries.products.length,
        variations: entries.variations.length,
        neighborhoods: entries.neighborhoods.length,
        customers: entries.customers.length,
        orders: entries.orders.length,
        orders_accepted: accepted,
        orders_pending: pending,
        orders_cancelled: cancelled,
        sales: entries.sales.length,
        expenses: entries.expenses.length,
        stock_movements: entries.stock_movements.length,
        audit_logs: entries.audit_logs.length,
      },
      financials: {
        revenue: sum(salesAgg ?? [], "total"),
        cost: sum(salesAgg ?? [], "total_cost"),
        gross_profit: sum(salesAgg ?? [], "gross_profit"),
        delivery_fees: sum(salesAgg ?? [], "delivery_fee"),
      },
    };

    await updateManifest(supabase, manifest.id, {
      status: "complete",
      entries,
      summary,
    });

    return { manifestId: manifest.id, summary };
  } catch (err) {
    await updateManifest(supabase, manifest.id, {
      status: "failed",
      entries,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

// ---------------- helpers ----------------
function sum(rows: Array<Record<string, unknown>>, key: string): number {
  return rows.reduce((s, r) => s + Number((r[key] as number | string | null) ?? 0), 0);
}

async function maxStockMovementId(supabase: Client): Promise<number> {
  const { data } = await supabase
    .from("stock_movements").select("id").order("id", { ascending: false }).limit(1).maybeSingle();
  return (data?.id as number | undefined) ?? 0;
}

async function stockMovementIdsSince(supabase: Client, cutoffId: number): Promise<number[]> {
  const { data } = await supabase
    .from("stock_movements").select("id").gt("id", cutoffId);
  return (data ?? []).map((r) => r.id as number);
}
