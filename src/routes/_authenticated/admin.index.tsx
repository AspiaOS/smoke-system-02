import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBRL, numericToCents } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import {
  Plus,
  ShoppingCart,
  UserPlus,
  Tag,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Activity,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: Dashboard,
});

function startOfDay(offsetDays = 0) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - offsetDays);
  return d;
}

function Dashboard() {
  const { data: pending = [] } = useQuery({
    queryKey: ["orders", "pending"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id,customer_name,total,created_at,status")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as { id: string; customer_name: string; total: number; created_at: string; status: string }[];
    },
    refetchInterval: 15_000,
  });

  const { data: recentOrders = [] } = useQuery({
    queryKey: ["orders", "recent"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id,customer_name,total,status,created_at")
        .order("created_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      return data as { id: string; customer_name: string; total: number; status: string; created_at: string }[];
    },
  });

  const { data: sales30 = [] } = useQuery({
    queryKey: ["sales", "30d"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("total,gross_profit,created_at")
        .gte("created_at", startOfDay(29).toISOString());
      if (error) throw error;
      return data as { total: number; gross_profit: number; created_at: string }[];
    },
  });

  const { data: yesterday = [] } = useQuery({
    queryKey: ["sales", "yesterday"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("total,gross_profit")
        .gte("created_at", startOfDay(1).toISOString())
        .lt("created_at", startOfDay(0).toISOString());
      if (error) throw error;
      return data as { total: number; gross_profit: number }[];
    },
  });

  const { data: ordersLast7 = [] } = useQuery({
    queryKey: ["orders", "7d"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id,created_at")
        .gte("created_at", startOfDay(6).toISOString());
      if (error) throw error;
      return data as { id: string; created_at: string }[];
    },
  });

  const { data: topProducts = [] } = useQuery({
    queryKey: ["top-products", "30d"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("product_name,quantity,orders!inner(created_at)")
        .gte("orders.created_at", startOfDay(29).toISOString());
      if (error) throw error;
      const map = new Map<string, number>();
      for (const it of (data as unknown as { product_name: string; quantity: number }[])) {
        map.set(it.product_name, (map.get(it.product_name) ?? 0) + it.quantity);
      }
      return [...map.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, qty]) => ({ name, qty }));
    },
  });

  const { data: lowStock = [] } = useQuery({
    queryKey: ["variations", "low-stock"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("variations")
        .select("id,name,stock,min_stock,products(name)")
        .eq("active", true)
        .order("stock", { ascending: true })
        .limit(20);
      if (error) throw error;
      return (data as unknown as { id: string; name: string; stock: number; min_stock: number; products: { name: string } | null }[])
        .filter((v) => v.stock <= Math.max(v.min_stock, 3))
        .slice(0, 6);
    },
  });

  const { data: activity = [] } = useQuery({
    queryKey: ["audit", "recent"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("id,action,entity,created_at")
        .order("created_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      return data as { id: number; action: string; entity: string; created_at: string }[];
    },
  });

  const { data: counts } = useQuery({
    queryKey: ["dashboard-counts"],
    queryFn: async () => {
      const [c, p] = await Promise.all([
        supabase.from("customers").select("id", { count: "exact", head: true }),
        supabase.from("products").select("id", { count: "exact", head: true }).eq("active", true),
      ]);
      return { customers: c.count ?? 0, products: p.count ?? 0 };
    },
  });

  // Aggregates
  const todaySales = sales30.filter((s) => new Date(s.created_at) >= startOfDay(0));
  const todayRevenue = todaySales.reduce((a, s) => a + numericToCents(s.total), 0);
  const todayProfit = todaySales.reduce((a, s) => a + numericToCents(s.gross_profit), 0);
  const yRevenue = yesterday.reduce((a, s) => a + numericToCents(s.total), 0);
  const yProfit = yesterday.reduce((a, s) => a + numericToCents(s.gross_profit), 0);
  const revenueDelta = pctDelta(todayRevenue, yRevenue);
  const profitDelta = pctDelta(todayProfit, yProfit);

  const todayOrders = ordersLast7.filter((o) => new Date(o.created_at) >= startOfDay(0)).length;
  const avgTicket = todaySales.length ? todayRevenue / todaySales.length : 0;

  // 30-day revenue series
  const revSeries = Array.from({ length: 30 }, (_, i) => {
    const day = startOfDay(29 - i);
    const next = new Date(day); next.setDate(next.getDate() + 1);
    const total = sales30
      .filter((s) => { const d = new Date(s.created_at); return d >= day && d < next; })
      .reduce((a, s) => a + numericToCents(s.total), 0) / 100;
    return { day: day.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }), total };
  });

  // 7-day orders bars
  const dayLabels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const orderSeries = Array.from({ length: 7 }, (_, i) => {
    const day = startOfDay(6 - i);
    const next = new Date(day); next.setDate(next.getDate() + 1);
    const qty = ordersLast7.filter((o) => {
      const d = new Date(o.created_at);
      return d >= day && d < next;
    }).length;
    return { label: dayLabels[day.getDay()], qty };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Painel</h1>
        <p className="text-sm text-muted-foreground">Visão geral do dia e desempenho recente.</p>
      </div>

      {/* Metric cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Pendentes" value={String(pending.length)} highlight={pending.length > 0} />
        <MetricCard label="Pedidos hoje" value={String(todayOrders)} />
        <MetricCard label="Receita hoje" value={formatBRL(todayRevenue / 100)} delta={revenueDelta} />
        <MetricCard label="Lucro hoje" value={formatBRL(todayProfit / 100)} delta={profitDelta} />
        <MetricCard label="Ticket médio" value={formatBRL(avgTicket / 100)} />
        <MetricCard label="Clientes" value={String(counts?.customers ?? 0)} sub={`${counts?.products ?? 0} produtos`} />
      </div>

      {/* Quick actions */}
      <Card>
        <CardContent className="flex flex-wrap gap-2 p-3">
          <QuickAction to="/admin/produtos" icon={<Plus className="h-4 w-4" />} label="Novo produto" />
          <QuickAction to="/admin/pedidos" icon={<ShoppingCart className="h-4 w-4" />} label="Pedidos" />
          <QuickAction to="/admin/clientes" icon={<UserPlus className="h-4 w-4" />} label="Clientes" />
          <QuickAction to="/admin/categorias" icon={<Tag className="h-4 w-4" />} label="Categorias" />
        </CardContent>
      </Card>

      {/* Charts row */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Receita últimos 30 dias</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revSeries} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" interval={4} />
                <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <Tooltip
                  formatter={(v: number) => formatBRL(v)}
                  contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                />
                <Area type="monotone" dataKey="total" stroke="var(--primary)" fill="url(#rev)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Mais vendidos</CardTitle></CardHeader>
          <CardContent>
            {topProducts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem vendas nos últimos 30 dias.</p>
            ) : (
              <ol className="space-y-2 text-sm">
                {topProducts.map((p, i) => (
                  <li key={p.name} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 truncate">
                      <span className="grid h-5 w-5 place-items-center rounded bg-muted text-xs font-medium">{i + 1}</span>
                      <span className="truncate">{p.name}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">{p.qty}x</span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Orders bar + low stock */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Pedidos por dia</CardTitle></CardHeader>
          <CardContent className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={orderSeries} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                />
                <Bar dataKey="qty" fill="var(--primary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" /> Estoque baixo
            </CardTitle>
            <Link to="/admin/estoque" className="text-xs text-primary hover:underline">Ver estoque</Link>
          </CardHeader>
          <CardContent className="p-0">
            {lowStock.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Tudo em ordem.</p>
            ) : (
              <ul className="divide-y">
                {lowStock.map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                    <div className="truncate">
                      <p className="font-medium truncate">{v.products?.name ?? "—"}</p>
                      <p className="text-xs text-muted-foreground truncate">{v.name}</p>
                    </div>
                    <Badge variant={v.stock === 0 ? "destructive" : "secondary"}>
                      {v.stock} {v.stock === 1 ? "unidade" : "unidades"}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent orders + activity */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Últimos pedidos</CardTitle>
            <Link to="/admin/pedidos" className="text-xs text-primary hover:underline">Ver todos →</Link>
          </CardHeader>
          <CardContent className="p-0">
            {recentOrders.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Nenhum pedido ainda.</p>
            ) : (
              <div className="divide-y">
                {recentOrders.map((o) => (
                  <Link
                    key={o.id}
                    to="/admin/pedidos"
                    className="flex items-center justify-between gap-4 px-4 py-3 text-sm hover:bg-muted/50"
                  >
                    <div className="min-w-0">
                      <p className="font-medium truncate">{o.customer_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(o.created_at).toLocaleString("pt-BR")}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={o.status} />
                      <span className="font-semibold tabular-nums">{formatBRL(o.total)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4" /> Atividade
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {activity.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Sem atividade recente.</p>
            ) : (
              <ul className="divide-y">
                {activity.map((a) => (
                  <li key={a.id} className="px-4 py-2.5 text-sm">
                    <p className="truncate">{a.action}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.entity} · {new Date(a.created_at).toLocaleString("pt-BR")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function pctDelta(now: number, prev: number): number | null {
  if (prev === 0) return now === 0 ? 0 : null;
  return ((now - prev) / prev) * 100;
}

function MetricCard({
  label,
  value,
  highlight,
  delta,
  sub,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  delta?: number | null;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase text-muted-foreground">{label}</p>
        <p className={`mt-1 text-xl font-semibold ${highlight ? "text-primary" : ""}`}>{value}</p>
        {delta !== undefined && delta !== null && (
          <p className={`mt-1 flex items-center gap-1 text-xs ${delta >= 0 ? "text-emerald-500" : "text-destructive"}`}>
            {delta >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {delta >= 0 ? "+" : ""}{delta.toFixed(0)}% vs ontem
          </p>
        )}
        {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function QuickAction({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm hover:bg-accent"
    >
      {icon}
      {label}
    </Link>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    pending: { label: "Pendente", variant: "secondary" },
    accepted: { label: "Aceito", variant: "default" },
    cancelled: { label: "Cancelado", variant: "destructive" },
  };
  const cfg = map[status] ?? { label: status, variant: "outline" as const };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}
