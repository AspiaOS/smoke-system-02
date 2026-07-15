import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBRL, numericToCents } from "@/lib/money";

export const Route = createFileRoute("/_authenticated/admin/vendas")({
  component: SalesPage,
});

type SaleRow = {
  id: string;
  created_at: string;
  subtotal: number;
  delivery_fee: number;
  total: number;
  total_cost: number;
  gross_profit: number;
  payment_method: string;
  order_id: string;
  orders: { customer_name: string } | null;
};

function SalesPage() {
  const { data: sales = [], isLoading } = useQuery({
    queryKey: ["sales", "last100"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id,created_at,subtotal,delivery_fee,total,total_cost,gross_profit,payment_method,order_id,orders(customer_name)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as unknown as SaleRow[];
    },
  });

  const totals = sales.reduce(
    (acc, s) => {
      acc.revenue += numericToCents(s.total);
      acc.cost += numericToCents(s.total_cost);
      acc.profit += numericToCents(s.gross_profit);
      return acc;
    },
    { revenue: 0, cost: 0, profit: 0 },
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Vendas</h1>
        <p className="text-sm text-muted-foreground">Últimas 100 vendas aceitas.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Receita" value={formatBRL(totals.revenue / 100)} />
        <SummaryCard label="Custo" value={formatBRL(totals.cost / 100)} />
        <SummaryCard label="Lucro bruto" value={formatBRL(totals.profit / 100)} highlight />
      </div>

      <Card>
        <CardHeader><CardTitle>Histórico</CardTitle></CardHeader>
        <CardContent className="p-0">
          {isLoading && <p className="p-4 text-sm text-muted-foreground">Carregando…</p>}
          {!isLoading && sales.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">Nenhuma venda registrada.</p>
          )}
          <div className="divide-y">
            {sales.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium">{s.orders?.customer_name ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(s.created_at).toLocaleString("pt-BR")} · {s.payment_method}
                  </p>
                </div>
                <div className="text-right tabular-nums">
                  <p className="font-semibold">{formatBRL(s.total)}</p>
                  <p className="text-xs text-secondary">+ {formatBRL(s.gross_profit)}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase text-muted-foreground">{label}</p>
        <p className={`mt-1 text-xl font-semibold ${highlight ? "text-primary" : ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
