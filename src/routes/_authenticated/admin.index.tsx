import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBRL, numericToCents } from "@/lib/money";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: Dashboard,
});

function Dashboard() {
  const { data: pending = [] } = useQuery({
    queryKey: ["orders", "pending"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id,customer_name,total,created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as { id: string; customer_name: string; total: number; created_at: string }[];
    },
    refetchInterval: 15_000,
  });

  const { data: sales = [] } = useQuery({
    queryKey: ["sales", "today"],
    queryFn: async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from("sales")
        .select("total,gross_profit")
        .gte("created_at", start.toISOString());
      if (error) throw error;
      return data as { total: number; gross_profit: number }[];
    },
  });

  const todayRevenue = sales.reduce((a, s) => a + numericToCents(s.total), 0);
  const todayProfit = sales.reduce((a, s) => a + numericToCents(s.gross_profit), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Painel</h1>
        <p className="text-sm text-muted-foreground">Fila de pedidos e resumo do dia.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="Pendentes" value={String(pending.length)} highlight={pending.length > 0} />
        <MetricCard label="Receita hoje" value={formatBRL(todayRevenue / 100)} />
        <MetricCard label="Lucro hoje" value={formatBRL(todayProfit / 100)} />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Pedidos pendentes</CardTitle>
          <Link to="/admin/pedidos" className="text-xs text-primary hover:underline">Ver todos</Link>
        </CardHeader>
        <CardContent className="p-0">
          {pending.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Fila limpa.</p>
          ) : (
            <div className="divide-y">
              {pending.map((o) => (
                <Link
                  key={o.id}
                  to="/admin/pedidos"
                  className="flex items-center justify-between gap-4 px-4 py-3 text-sm hover:bg-muted/50"
                >
                  <div>
                    <p className="font-medium">{o.customer_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(o.created_at).toLocaleString("pt-BR")}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary">novo</Badge>
                    <span className="font-semibold tabular-nums">{formatBRL(o.total)}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase text-muted-foreground">{label}</p>
        <p className={`mt-1 text-xl font-semibold ${highlight ? "text-primary" : ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
