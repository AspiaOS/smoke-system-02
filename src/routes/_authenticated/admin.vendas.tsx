import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { MagicBento } from "@/components/ui/magic-bento";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBRL, numericToCents } from "@/lib/money";
import { Search, Receipt } from "lucide-react";

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
  orders: {
    id: string;
    customer_name: string | null;
    customer_phone: string | null;
    address: string | null;
    neighborhood_name: string | null;
  } | null;
};

type OrderItem = {
  id: number;
  product_name: string;
  variation_name: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
};

type PeriodKey = "today" | "7d" | "30d" | "all";
type PaymentKey = "all" | "pix" | "cash" | "debit" | "credit";
type SortKey = "recent" | "total" | "profit";

const PAYMENT_LABEL: Record<string, string> = {
  pix: "Pix",
  cash: "Dinheiro",
  debit: "Débito",
  credit: "Crédito",
};

function SalesPage() {
  const [period, setPeriod] = useState<PeriodKey>("30d");
  const [payment, setPayment] = useState<PaymentKey>("all");
  const [sort, setSort] = useState<SortKey>("recent");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: sales = [], isLoading } = useQuery({
    queryKey: ["sales", "last200"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select(
          "id,created_at,subtotal,delivery_fee,total,total_cost,gross_profit,payment_method,order_id,orders(id,customer_name,customer_phone,address,neighborhood_name)",
        )
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as unknown as SaleRow[];
    },
  });

  const filtered = useMemo(() => {
    const now = Date.now();
    const cutoff =
      period === "today"
        ? new Date(new Date().setHours(0, 0, 0, 0)).getTime()
        : period === "7d"
          ? now - 7 * 86400_000
          : period === "30d"
            ? now - 30 * 86400_000
            : 0;

    let list = sales.filter((s) => new Date(s.created_at).getTime() >= cutoff);
    if (payment !== "all") list = list.filter((s) => s.payment_method === payment);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (s) =>
          s.orders?.customer_name?.toLowerCase().includes(q) ||
          s.order_id.toLowerCase().includes(q) ||
          s.id.toLowerCase().includes(q),
      );
    }
    if (sort === "total") list = [...list].sort((a, b) => Number(b.total) - Number(a.total));
    else if (sort === "profit")
      list = [...list].sort((a, b) => Number(b.gross_profit) - Number(a.gross_profit));
    else list = [...list].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    return list;
  }, [sales, period, payment, sort, query]);

  const totals = useMemo(() => {
    const t = filtered.reduce(
      (acc, s) => {
        acc.revenue += numericToCents(s.total);
        acc.cost += numericToCents(s.total_cost);
        acc.profit += numericToCents(s.gross_profit);
        return acc;
      },
      { revenue: 0, cost: 0, profit: 0 },
    );
    const count = filtered.length;
    const avg = count > 0 ? t.revenue / count : 0;
    const margin = t.revenue > 0 ? (t.profit / t.revenue) * 100 : 0;
    return { ...t, count, avg, margin };
  }, [filtered]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Vendas</h1>
        <p className="text-sm text-muted-foreground">Acompanhe as vendas já aceitas da loja.</p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar cliente ou nº pedido..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={period} onValueChange={(v) => setPeriod(v as PeriodKey)}>
          <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Hoje</SelectItem>
            <SelectItem value="7d">7 dias</SelectItem>
            <SelectItem value="30d">30 dias</SelectItem>
            <SelectItem value="all">Tudo</SelectItem>
          </SelectContent>
        </Select>
        <Select value={payment} onValueChange={(v) => setPayment(v as PaymentKey)}>
          <SelectTrigger className="w-[190px]">
            <span className="truncate">Pagamento: <SelectValue /></span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="pix">Pix</SelectItem>
            <SelectItem value="cash">Dinheiro</SelectItem>
            <SelectItem value="debit">Débito</SelectItem>
            <SelectItem value="credit">Crédito</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="w-[160px] sm:ml-auto"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Mais recentes</SelectItem>
            <SelectItem value="total">Maior valor</SelectItem>
            <SelectItem value="profit">Maior lucro</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <SummaryCard label="Receita" value={formatBRL(totals.revenue / 100)} />
        <SummaryCard label="Custo" value={formatBRL(totals.cost / 100)} />
        <SummaryCard
          label="Lucro bruto"
          value={formatBRL(totals.profit / 100)}
          highlight
        />
        <SummaryCard label="Vendas" value={String(totals.count)} />
        <SummaryCard label="Ticket médio" value={formatBRL(totals.avg / 100)} />
        <SummaryCard label="Margem média" value={`${totals.margin.toFixed(1)}%`} />
      </div>

      <Card>
        <CardHeader><CardTitle>Histórico de vendas</CardTitle></CardHeader>
        <CardContent className="p-0">
          {isLoading && <p className="p-6 text-sm text-muted-foreground">Carregando…</p>}
          {!isLoading && filtered.length === 0 && (
            <div className="flex flex-col items-center gap-3 p-6 text-center">
              <div className="rounded-full bg-muted p-2.5"><Receipt className="h-5 w-5 text-muted-foreground" /></div>
              <div className="space-y-0.5">
                <p className="font-medium">Nenhuma venda registrada</p>
                <p className="text-sm text-muted-foreground">
                  As vendas aparecerão automaticamente quando os pedidos forem aceitos.
                </p>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link to="/admin/pedidos">Ver pedidos pendentes</Link>
              </Button>
            </div>
          )}
          {!isLoading && filtered.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pedido</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Pagamento</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Custo</TableHead>
                    <TableHead className="text-right">Lucro</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((s) => (
                    <TableRow key={s.id} className="cursor-pointer" onClick={() => setOpenId(s.id)}>
                      <TableCell className="font-mono text-xs">#{s.order_id.slice(0, 8)}</TableCell>
                      <TableCell>{s.orders?.customer_name ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {PAYMENT_LABEL[s.payment_method] ?? s.payment_method}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{formatBRL(s.total)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{formatBRL(s.total_cost)}</TableCell>
                      <TableCell className="text-right tabular-nums text-primary">{formatBRL(s.gross_profit)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(s.created_at).toLocaleString("pt-BR")}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setOpenId(s.id); }}>
                          Ver
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <SaleDetailSheet
        sale={filtered.find((s) => s.id === openId) ?? null}
        onClose={() => setOpenId(null)}
      />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  hint,
  highlight,
}: {
  label: string;
  value: string;
  hint?: string;
  highlight?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase text-muted-foreground">{label}</p>
        <p className={`mt-1 text-xl font-semibold tabular-nums ${highlight ? "text-primary" : ""}`}>
          {value}
        </p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function SaleDetailSheet({ sale, onClose }: { sale: SaleRow | null; onClose: () => void }) {
  const { data: items = [] } = useQuery({
    queryKey: ["sale-items", sale?.order_id],
    enabled: !!sale?.order_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("id,product_name,variation_name,quantity,unit_price,line_total")
        .eq("order_id", sale!.order_id);
      if (error) throw error;
      return data as OrderItem[];
    },
  });

  return (
    <Sheet open={!!sale} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {sale && (
          <>
            <SheetHeader>
              <SheetTitle>Venda #{sale.order_id.slice(0, 8)}</SheetTitle>
              <SheetDescription>
                {new Date(sale.created_at).toLocaleString("pt-BR")}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-6 space-y-6 text-sm">
              <section className="space-y-1">
                <h3 className="text-xs uppercase text-muted-foreground">Cliente</h3>
                <p className="font-medium">{sale.orders?.customer_name ?? "—"}</p>
                {sale.orders?.customer_phone && <p>{sale.orders.customer_phone}</p>}
                {sale.orders?.address && (
                  <p className="text-muted-foreground">
                    {sale.orders.address}
                    {sale.orders.neighborhood_name && ` — ${sale.orders.neighborhood_name}`}
                  </p>
                )}
              </section>

              <section className="space-y-2">
                <h3 className="text-xs uppercase text-muted-foreground">Itens</h3>
                <div className="divide-y rounded-md border">
                  {items.length === 0 && (
                    <p className="p-3 text-muted-foreground">Sem itens.</p>
                  )}
                  {items.map((it) => (
                    <div key={it.id} className="flex items-center justify-between gap-2 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate">
                          {it.product_name}
                          {it.variation_name && <span className="text-muted-foreground"> · {it.variation_name}</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {it.quantity} × {formatBRL(it.unit_price)}
                        </p>
                      </div>
                      <span className="tabular-nums font-medium">{formatBRL(it.line_total)}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="space-y-1 rounded-md border p-3">
                <Line label="Subtotal" value={formatBRL(sale.subtotal)} />
                <Line label="Frete" value={formatBRL(sale.delivery_fee)} />
                <Line label="Total" value={formatBRL(sale.total)} strong />
                <Line label="Pagamento" value={PAYMENT_LABEL[sale.payment_method] ?? sale.payment_method} />
                <div className="my-2 border-t" />
                <Line label="Custo total" value={formatBRL(sale.total_cost)} muted />
                <Line label="Lucro bruto" value={formatBRL(sale.gross_profit)} highlight />
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Line({
  label,
  value,
  strong,
  muted,
  highlight,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className={muted ? "text-muted-foreground" : ""}>{label}</span>
      <span
        className={`tabular-nums ${strong ? "font-semibold" : ""} ${
          highlight ? "text-primary font-semibold" : ""
        } ${muted ? "text-muted-foreground" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}
