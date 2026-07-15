// Manifest do lote demo — server-only.
// Guarda IDs criados por tabela para permitir reset seguro.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { DEMO_SEED, DEMO_VERSION, type Profile } from "./demo-data";

export type ManifestEntries = {
  categories: string[];
  products: string[];
  variations: string[];
  neighborhoods: string[];
  customers: string[];
  orders: string[];
  order_items: number[];
  sales: string[];
  stock_movements: number[];
  expenses: string[];
  audit_logs: number[];
};

export function emptyEntries(): ManifestEntries {
  return {
    categories: [], products: [], variations: [], neighborhoods: [],
    customers: [], orders: [], order_items: [], sales: [],
    stock_movements: [], expenses: [], audit_logs: [],
  };
}

export type ManifestRow = {
  id: string;
  run_id: string;
  profile: Profile;
  seed: number;
  status: "running" | "complete" | "failed";
  entries: ManifestEntries;
  summary: Record<string, unknown> | null;
  pre_snapshot: Record<string, unknown> | null;
  validation: Record<string, unknown> | null;
  error: string | null;
  created_at: string;
};

type Client = SupabaseClient<Database>;

export async function findActiveManifest(supabase: Client): Promise<ManifestRow | null> {
  const { data, error } = await supabase
    .from("demo_manifest")
    .select("*")
    .in("status", ["running", "complete"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as ManifestRow | null) ?? null;
}

export async function createManifest(
  supabase: Client,
  opts: { profile: Profile; preSnapshot: Record<string, unknown> },
): Promise<ManifestRow> {
  const runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const { data, error } = await supabase
    .from("demo_manifest")
    .insert({
      run_id: runId,
      profile: opts.profile,
      seed: DEMO_SEED,
      status: "running",
      entries: emptyEntries() as unknown as Database["public"]["Tables"]["demo_manifest"]["Insert"]["entries"],
      pre_snapshot: opts.preSnapshot as unknown as Database["public"]["Tables"]["demo_manifest"]["Insert"]["pre_snapshot"],
      summary: { version: DEMO_VERSION } as unknown as Database["public"]["Tables"]["demo_manifest"]["Insert"]["summary"],
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as unknown as ManifestRow;
}

export async function updateManifest(
  supabase: Client,
  id: string,
  patch: Partial<Pick<ManifestRow, "status" | "entries" | "summary" | "validation" | "error">>,
): Promise<void> {
  const { error } = await supabase
    .from("demo_manifest")
    .update({
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.entries !== undefined
        ? { entries: patch.entries as unknown as Database["public"]["Tables"]["demo_manifest"]["Update"]["entries"] }
        : {}),
      ...(patch.summary !== undefined
        ? { summary: patch.summary as unknown as Database["public"]["Tables"]["demo_manifest"]["Update"]["summary"] }
        : {}),
      ...(patch.validation !== undefined
        ? { validation: patch.validation as unknown as Database["public"]["Tables"]["demo_manifest"]["Update"]["validation"] }
        : {}),
      ...(patch.error !== undefined ? { error: patch.error } : {}),
    })
    .eq("id", id);
  if (error) throw error;
}
