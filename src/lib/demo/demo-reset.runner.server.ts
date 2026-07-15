// Runner do reset demo — server-only.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { ManifestEntries } from "./demo-manifest.server";
import { assertDemoEnabled } from "./demo-guard.server";

type Client = SupabaseClient<Database>;

export async function runReset(supabase: Client): Promise<{
  manifestId: string; removed: Record<string, number>;
}> {
  assertDemoEnabled();
  const { data: isOwner } = await supabase.rpc("is_owner");
  if (!isOwner) throw new Error("FORBIDDEN: caller is not owner");

  const { data: rows, error } = await supabase
    .from("demo_manifest")
    .select("*")
    .in("status", ["running", "complete", "failed"])
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  const manifest = rows?.[0];
  if (!manifest) throw new Error("no_manifest_found: nada para resetar");
  const partial = (manifest.entries as unknown as Partial<ManifestEntries>) ?? {};
  const entries: ManifestEntries = {
    categories: partial.categories ?? [],
    products: partial.products ?? [],
    variations: partial.variations ?? [],
    neighborhoods: partial.neighborhoods ?? [],
    customers: partial.customers ?? [],
    orders: partial.orders ?? [],
    order_items: partial.order_items ?? [],
    sales: partial.sales ?? [],
    stock_movements: partial.stock_movements ?? [],
    expenses: partial.expenses ?? [],
    audit_logs: partial.audit_logs ?? [],
  };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const removed: Record<string, number> = {};

  type Tbl =
    | "audit_logs" | "stock_movements" | "sales" | "order_items" | "orders"
    | "expenses" | "customers" | "variations" | "products" | "categories" | "neighborhoods";

  async function delByCol(
    table: Tbl,
    col: string,
    ids: readonly (string | number)[],
  ): Promise<number> {
    if (!ids || ids.length === 0) return 0;
    let count = 0;
    for (let i = 0; i < ids.length; i += 300) {
      const chunk = ids.slice(i, i + 300);
      const { error, data } = await (supabaseAdmin.from(table).delete() as unknown as {
        in: (c: string, v: readonly (string | number)[]) => { select: (s: string) => Promise<{ error: { message: string } | null; data: { id: string | number }[] | null }> };
      }).in(col, chunk).select("id");
      if (error) throw new Error(`delete ${table} by ${col}: ${error.message}`);
      count += (data ?? []).length;
    }
    return count;
  }

  async function del(table: Tbl, ids: readonly (string | number)[]): Promise<void> {
    removed[table] = (removed[table] ?? 0) + await delByCol(table, "id", ids);
  }

  // Ordem FK-safe. stock_movements ANTES de variations/orders.
  // Também usa variation_id/order_id para apanhar linhas criadas por
  // stock_entry/stock_adjust/accept_order que não ficaram no manifest.
  removed["stock_movements"] =
    (await delByCol("stock_movements", "variation_id", entries.variations)) +
    (await delByCol("stock_movements", "order_id", entries.orders)) +
    (await delByCol("stock_movements", "id", entries.stock_movements));

  // sales/order_items podem existir por accept_order sem estar no manifest.
  removed["sales"] =
    (await delByCol("sales", "order_id", entries.orders)) +
    (await delByCol("sales", "id", entries.sales));
  removed["order_items"] =
    (await delByCol("order_items", "order_id", entries.orders)) +
    (await delByCol("order_items", "id", entries.order_items));

  await del("audit_logs", entries.audit_logs);
  await del("orders", entries.orders);
  await del("expenses", entries.expenses);

  // Clientes: preservar quem tem pedidos/vendas fora do lote.
  const preservedCustomers: string[] = [];
  const deletableCustomers: string[] = [];
  for (const cid of entries.customers) {
    const [{ count: extOrders }, { count: extSales }] = await Promise.all([
      supabaseAdmin.from("orders").select("id", { count: "exact", head: true }).eq("customer_id", cid),
      supabaseAdmin.from("sales").select("id", { count: "exact", head: true }).eq("customer_id", cid),
    ]);
    if ((extOrders ?? 0) > 0 || (extSales ?? 0) > 0) preservedCustomers.push(cid);
    else deletableCustomers.push(cid);
  }
  await del("customers", deletableCustomers);
  removed["customers_preserved"] = preservedCustomers.length;

  await del("variations", entries.variations);
  await del("products", entries.products);
  await del("categories", entries.categories);
  await del("neighborhoods", entries.neighborhoods);

  // Reverter store_settings a partir do snapshot pré-seed
  const snap = (manifest.pre_snapshot as { store_settings?: Database["public"]["Tables"]["store_settings"]["Row"] | null } | null)?.store_settings;
  if (snap) {
    await supabaseAdmin
      .from("store_settings")
      .update({
        store_display_name: snap.store_display_name,
        whatsapp_number: snap.whatsapp_number,
        banners: snap.banners,
      })
      .eq("store_id", snap.store_id);
  }

  // Apagar linha do manifest
  await supabaseAdmin.from("demo_manifest").delete().eq("id", manifest.id);
  removed["demo_manifest"] = 1;

  return { manifestId: manifest.id, removed };
}
