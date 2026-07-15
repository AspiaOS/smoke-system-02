// Runner de validação — verifica as invariantes do lote demo.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { ManifestEntries } from "./demo-manifest.server";
import { assertDemoEnabled } from "./demo-guard.server";

type Client = SupabaseClient<Database>;
type Check = { name: string; passed: boolean; detail?: string };

export async function runValidate(
  supabase: Client,
): Promise<{ ok: boolean; checks: Check[]; scenarios: { found: number; total: number } }> {
  assertDemoEnabled();
  const { data: isOwner } = await supabase.rpc("is_owner");
  if (!isOwner) throw new Error("FORBIDDEN: caller is not owner");

  const { data: mRow } = await supabase
    .from("demo_manifest").select("*")
    .in("status", ["complete", "running", "failed"])
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!mRow) throw new Error("no_manifest_found");
  const entries = mRow.entries as unknown as ManifestEntries;

  const checks: Check[] = [];
  const push = (name: string, passed: boolean, detail?: string) =>
    checks.push({ name, passed, detail });

  // 1. Nenhum estoque negativo
  {
    const { data } = await supabase.from("variations").select("id, stock").in("id", entries.variations);
    const neg = (data ?? []).filter((v) => v.stock < 0);
    push("Nenhum estoque negativo", neg.length === 0, neg.length ? `${neg.length} negativos` : undefined);
  }

  // 2. Toda venda aponta para pedido aceito
  {
    if (entries.sales.length === 0) push("Toda venda aponta para pedido aceito", true, "sem vendas");
    else {
      const { data } = await supabase
        .from("sales")
        .select("id, orders(status)")
        .in("id", entries.sales);
      const bad = (data ?? []).filter((s) => (s.orders as unknown as { status: string } | null)?.status !== "accepted");
      push("Toda venda aponta para pedido aceito", bad.length === 0, bad.length ? `${bad.length} vendas com pedido não aceito` : undefined);
    }
  }

  // 3. Nenhum pedido cancelado possui venda
  {
    if (entries.orders.length === 0) push("Nenhum pedido cancelado possui venda", true);
    else {
      const { data } = await supabase
        .from("orders").select("id, status, sales(id)")
        .in("id", entries.orders);
      const bad = (data ?? []).filter(
        (o) => o.status === "cancelled" && (o.sales as unknown as { id: string }[]).length > 0,
      );
      push("Nenhum pedido cancelado possui venda", bad.length === 0);
    }
  }

  // 4. Nenhum pedido pendente possui venda
  {
    if (entries.orders.length === 0) push("Nenhum pedido pendente possui venda", true);
    else {
      const { data } = await supabase
        .from("orders").select("id, status, sales(id)")
        .in("id", entries.orders);
      const bad = (data ?? []).filter(
        (o) => o.status === "pending" && (o.sales as unknown as { id: string }[]).length > 0,
      );
      push("Nenhum pedido pendente possui venda", bad.length === 0);
    }
  }

  // 5. Pedidos aceitos têm accepted_at; cancelados têm cancelled_at
  {
    const { data } = await supabase
      .from("orders").select("id, status, accepted_at, cancelled_at")
      .in("id", entries.orders);
    const missingAccepted = (data ?? []).filter((o) => o.status === "accepted" && !o.accepted_at);
    const missingCancelled = (data ?? []).filter((o) => o.status === "cancelled" && !o.cancelled_at);
    push("Pedido aceito tem accepted_at", missingAccepted.length === 0);
    push("Pedido cancelado tem cancelled_at", missingCancelled.length === 0);
  }

  // 6. Sem venda duplicada por pedido (unique index já garante, mas checamos)
  {
    if (entries.sales.length > 0) {
      const { data } = await supabase.from("sales").select("order_id").in("id", entries.sales);
      const seen = new Set<string>();
      let dup = 0;
      (data ?? []).forEach((r) => { if (seen.has(r.order_id)) dup++; else seen.add(r.order_id); });
      push("Sem venda duplicada por pedido", dup === 0);
    } else push("Sem venda duplicada por pedido", true, "sem vendas");
  }

  // 7. Total do pedido = subtotal + delivery_fee
  {
    const { data } = await supabase
      .from("orders").select("subtotal, delivery_fee, total").in("id", entries.orders);
    const bad = (data ?? []).filter(
      (o) => Math.abs(Number(o.total) - (Number(o.subtotal) + Number(o.delivery_fee))) > 0.01,
    );
    push("Total do pedido = subtotal + frete", bad.length === 0, bad.length ? `${bad.length} incoerentes` : undefined);
  }

  // 8. gross_profit = subtotal - total_cost
  {
    if (entries.sales.length > 0) {
      const { data } = await supabase
        .from("sales").select("subtotal, total_cost, gross_profit").in("id", entries.sales);
      const bad = (data ?? []).filter(
        (s) => Math.abs(Number(s.gross_profit) - (Number(s.subtotal) - Number(s.total_cost))) > 0.01,
      );
      push("Lucro bruto = subtotal − custo total", bad.length === 0);
    } else push("Lucro bruto = subtotal − custo total", true, "sem vendas");
  }

  // 9. Telefones dos clientes normalizados (E.164 55xxxx)
  {
    if (entries.customers.length > 0) {
      const { data } = await supabase.from("customers").select("phone").in("id", entries.customers);
      const bad = (data ?? []).filter((c) => !/^55\d{10,11}$/.test(c.phone));
      push("Telefones normalizados", bad.length === 0);
    } else push("Telefones normalizados", true);
  }

  // 10. sale_accept sempre com order_id
  {
    if (entries.stock_movements.length > 0) {
      const { data } = await supabase
        .from("stock_movements").select("id, type, order_id").in("id", entries.stock_movements);
      const bad = (data ?? []).filter((m) => m.type === "sale_accept" && !m.order_id);
      push("Saída sale_accept vinculada a pedido", bad.length === 0);
    } else push("Saída sale_accept vinculada a pedido", true);
  }

  // 11. Bairros inativos não aparecem na consulta pública (RLS)
  {
    const { data } = await supabase
      .from("neighborhoods").select("id, active").in("id", entries.neighborhoods);
    // Este check só valida a coluna; RLS "público" é validado pelo público em outra sessão.
    const anyInactive = (data ?? []).some((n) => !n.active);
    push("Existe pelo menos um bairro inativo", anyInactive);
  }

  // 12. IDs do manifest realmente existem
  {
    const { data: cats } = await supabase.from("categories").select("id").in("id", entries.categories);
    push("IDs de categorias no manifest existem", (cats?.length ?? 0) === entries.categories.length);
    const { data: prods } = await supabase.from("products").select("id").in("id", entries.products);
    push("IDs de produtos no manifest existem", (prods?.length ?? 0) === entries.products.length);
  }

  // ---------- Cenários obrigatórios ----------
  const scenarioChecks: { name: string; check: () => Promise<boolean> }[] = [
    { name: "Produto ativo, visível e com estoque", check: async () => {
      const { data } = await supabase.from("products").select("id, active, visible, variations(stock, active)")
        .in("id", entries.products);
      return (data ?? []).some((p) => p.active && p.visible && p.variations.some((v) => v.active && v.stock > 0));
    }},
    { name: "Produto ativo, visível e sem estoque", check: async () => {
      const { data } = await supabase.from("products").select("id, active, visible, variations(stock, active)")
        .in("id", entries.products);
      return (data ?? []).some((p) => p.active && p.visible && p.variations.every((v) => v.stock === 0));
    }},
    { name: "Produto oculto", check: async () => {
      const { data } = await supabase.from("products").select("visible").in("id", entries.products);
      return (data ?? []).some((p) => !p.visible);
    }},
    { name: "Produto inativo", check: async () => {
      const { data } = await supabase.from("products").select("active").in("id", entries.products);
      return (data ?? []).some((p) => !p.active);
    }},
    { name: "Variação abaixo do mínimo", check: async () => {
      const { data } = await supabase.from("variations").select("stock, min_stock").in("id", entries.variations);
      return (data ?? []).some((v) => v.stock > 0 && v.stock < v.min_stock);
    }},
    { name: "Variação inativa", check: async () => {
      const { data } = await supabase.from("variations").select("active").in("id", entries.variations);
      return (data ?? []).some((v) => !v.active);
    }},
    { name: "Pedido pendente", check: async () => {
      const { data } = await supabase.from("orders").select("status").in("id", entries.orders);
      return (data ?? []).some((o) => o.status === "pending");
    }},
    { name: "Pedido aceito", check: async () => {
      const { data } = await supabase.from("orders").select("status").in("id", entries.orders);
      return (data ?? []).some((o) => o.status === "accepted");
    }},
    { name: "Pedido cancelado", check: async () => {
      const { data } = await supabase.from("orders").select("status").in("id", entries.orders);
      return (data ?? []).some((o) => o.status === "cancelled");
    }},
    { name: "Bairro com frete grátis", check: async () => {
      const { data } = await supabase.from("neighborhoods").select("delivery_fee").in("id", entries.neighborhoods);
      return (data ?? []).some((n) => Number(n.delivery_fee) === 0);
    }},
    { name: "Cliente com mais de um pedido", check: async () => {
      const { data } = await supabase.from("orders").select("customer_id").in("id", entries.orders);
      const counts = new Map<string, number>();
      (data ?? []).forEach((o) => { if (o.customer_id) counts.set(o.customer_id, (counts.get(o.customer_id) ?? 0) + 1); });
      return Array.from(counts.values()).some((c) => c >= 2);
    }},
    { name: "Histórico com entrada, ajuste e sale_accept", check: async () => {
      const { data } = await supabase.from("stock_movements").select("type").in("id", entries.stock_movements);
      const s = new Set((data ?? []).map((m) => m.type));
      return s.has("entry") && s.has("adjustment") && s.has("sale_accept");
    }},
  ];

  const scenarios = { found: 0, total: scenarioChecks.length };
  for (const sc of scenarioChecks) {
    let ok = false;
    try { ok = await sc.check(); } catch { ok = false; }
    if (ok) scenarios.found++;
    push(`Cenário: ${sc.name}`, ok);
  }

  const ok = checks.every((c) => c.passed);
  return { ok, checks, scenarios };
}
