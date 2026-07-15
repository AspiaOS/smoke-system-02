// Runner do reset demo — server-only.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { findActiveManifest, type ManifestEntries } from "./demo-manifest.server";
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
  const entries = (manifest.entries as unknown as ManifestEntries) ?? null;
  if (!entries) throw new Error("manifest_without_entries");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const removed: Record<string, number> = {};

  type Tbl =
    | "audit_logs" | "stock_movements" | "sales" | "order_items" | "orders"
    | "expenses" | "customers" | "variations" | "products" | "categories" | "neighborhoods";

  async function del(table: Tbl, ids: readonly (string | number)[]): Promise<void> {
    if (ids.length === 0) { removed[table] = 0; return; }
    let count = 0;
    for (let i = 0; i < ids.length; i += 300) {
      const chunk = ids.slice(i, i + 300);
      // Union type across tables is too narrow at .in(); cast to any is safe.

      const { error, data } = await (supabaseAdmin.from(table).delete() as unknown as {
        in: (col: string, vals: readonly (string | number)[]) => { select: (c: string) => Promise<{ error: { message: string } | null; data: { id: string | number }[] | null }> };
      }).in("id", chunk).select("id");
      if (error) throw new Error(`delete ${table}:${error.message}`);
      count += (data ?? []).length;
    }
    removed[table] = count;
  }

  // Ordem FK-safe
  await del("audit_logs", entries.audit_logs);
  await del("stock_movements", entries.stock_movements);
  await del("sales", entries.sales);
  await del("order_items", entries.order_items);
  await del("orders", entries.orders);
  await del("expenses", entries.expenses);
  await del("customers", entries.customers);
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
