import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatBRL } from "@/lib/money";
import { toast } from "sonner";
import { Package, RefreshCw, Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/pedidos")({
  component: OrdersPage,
});

type OrderStatus = "pending" | "accepted" | "cancelled";

type OrderItem = {
  id: number;
  product_name: string;
  variation_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};

type Order = {
  id: string;
  status: OrderStatus;
  customer_name: string;
  customer_phone: string;
  address: string | null;
  neighborhood_name: string | null;
  delivery_fee: number;
  subtotal: number;
  total: number;
  payment_method: string;
  created_at: string;
  accepted_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  order_items: OrderItem[];
};

const STATUS_TABS: { value: OrderStatus; label: string }[] = [
  { value: "pending", label: "Pendentes" },
  { value: "accepted", label: "Aceitos" },
  { value: "cancelled", label: "Cancelados" },
];

type DateFilter = "all" | "today" | "7d" | "30d";
type SortKey = "recent" | "highest" | "lowest";

function OrdersPage() {
  const [tab, setTab] = useState<OrderStatus>("pending");
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [sort, setSort] = useState<SortKey>("recent");
  const qc = useQueryClient();

  const { data: allOrders = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["orders", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id,status,customer_name,customer_phone,address,neighborhood_name,delivery_fee,subtotal,total,payment_method,created_at,accepted_at,cancelled_at,cancel_reason,order_items(id,product_name,variation_name,quantity,unit_price,line_total)",
        )
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data as unknown as Order[];
    },
    refetchInterval: 30_000,
  });

  const counts = useMemo(() => {
    const c = { pending: 0, accepted: 0, cancelled: 0 } as Record<OrderStatus, number>;
    for (const o of allOrders) c[o.status]++;
    return c;
  }, [allOrders]);

  const filtered = useMemo(() => {
    const now = Date.now();
    const cutoff =
      dateFilter === "today"
        ? new Date(new Date().setHours(0, 0, 0, 0)).getTime()
        : dateFilter === "7d"
          ? now - 7 * 86400_000
          : dateFilter === "30d"
            ? now - 30 * 86400_000
            : 0;
    const q = search.trim().toLowerCase();

    let list = allOrders.filter((o) => o.status === tab);
    if (cutoff) list = list.filter((o) => new Date(o.created_at).getTime() >= cutoff);
    if (q) {
      list = list.filter(
        (o) =>
          o.customer_name.toLowerCase().includes(q) ||
          o.id.toLowerCase().includes(q) ||
          o.order_items.some((it) => it.product_name.toLowerCase().includes(q)),
      );
    }
    if (sort === "highest") list = [...list].sort((a, b) => Number(b.total) - Number(a.total));
    else if (sort === "lowest") list = [...list].sort((a, b) => Number(a.total) - Number(b.total));
    else list = [...list].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    return list;
  }, [allOrders, tab, dateFilter, search, sort]);

  const acceptMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("accept_order", { p_order_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pedido aceito. Estoque atualizado.");
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : "Erro";
      if (msg.includes("insufficient_stock")) toast.error("Estoque insuficiente para uma das variações.");
      else toast.error(msg);
    },
  });

  const cancelMut = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase.rpc("cancel_order", { p_order_id: id, p_reason: reason });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pedido cancelado.");
      setCancelling(null);
      setReason("");
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Pedidos</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie os pedidos e acompanhe suas vendas. Ao aceitar, o estoque será atualizado automaticamente e a venda será registrada.
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map((s) => (
          <button
            key={s.value}
            onClick={() => setTab(s.value)}
            className={`rounded-full px-4 py-1.5 text-sm transition ${
              tab === s.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {s.label} {counts[s.value]}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por cliente, nº do pedido ou produto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as DateFilter)}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Data" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as datas</SelectItem>
            <SelectItem value="today">Hoje</SelectItem>
            <SelectItem value="7d">7 dias</SelectItem>
            <SelectItem value="30d">30 dias</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="w-[170px]"><SelectValue placeholder="Ordenar" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Mais recentes</SelectItem>
            <SelectItem value="highest">Maior valor</SelectItem>
            <SelectItem value="lowest">Menor valor</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}

      {!isLoading && filtered.length === 0 && (
        <EmptyState tab={tab} onRefresh={() => refetch()} />
      )}

      <div className="space-y-3">
        {filtered.map((o) => (
          <OrderCard
            key={o.id}
            order={o}
            onAccept={() => acceptMut.mutate(o.id)}
            onCancel={() => setCancelling(o.id)}
            busy={acceptMut.isPending}
          />
        ))}
      </div>

      <Dialog open={!!cancelling} onOpenChange={(v) => !v && setCancelling(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar pedido</DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder="Motivo (opcional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelling(null)}>Voltar</Button>
            <Button
              variant="destructive"
              disabled={cancelMut.isPending}
              onClick={() => cancelling && cancelMut.mutate({ id: cancelling, reason })}
            >
              Confirmar cancelamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmptyState({ tab, onRefresh }: { tab: OrderStatus; onRefresh: () => void }) {
  const copy =
    tab === "pending"
      ? {
          title: "Nenhum pedido pendente",
          desc: "Quando um novo pedido chegar, ele aparecerá aqui para você revisar e aceitar.",
        }
      : tab === "accepted"
        ? {
            title: "Nenhum pedido aceito",
            desc: "Os pedidos aceitos e suas vendas registradas aparecerão nesta lista.",
          }
        : {
            title: "Nenhum pedido cancelado",
            desc: "Pedidos recusados ou cancelados ficarão visíveis aqui para consulta.",
          };

  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <Package className="h-8 w-8 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-semibold">{copy.title}</h3>
          <p className="max-w-sm text-sm text-muted-foreground">{copy.desc}</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={onRefresh}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Atualizar pedidos
          </Button>
          <Button variant="outline" asChild>
            <Link to="/admin/produtos">Ver produtos</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function OrderCard({
  order,
  onAccept,
  onCancel,
  busy,
}: {
  order: Order;
  onAccept: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const created = new Date(order.created_at).toLocaleString("pt-BR");
  const shortId = order.id.slice(0, 8).toUpperCase();
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base">
            #{shortId} · {order.customer_name}
          </CardTitle>
          <p className="text-xs text-muted-foreground">{order.customer_phone} · {created}</p>
          {order.neighborhood_name && (
            <p className="text-xs text-muted-foreground">
              {order.neighborhood_name} · {order.address}
            </p>
          )}
        </div>
        <div className="text-right">
          <Badge variant="secondary" className="uppercase">{order.payment_method}</Badge>
          <p className="mt-1 text-lg font-semibold">{formatBRL(order.total)}</p>
          <p className="text-xs text-muted-foreground">
            {formatBRL(order.subtotal)} + frete {formatBRL(order.delivery_fee)}
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-1 text-sm">
          {order.order_items.map((it) => (
            <li key={it.id} className="flex items-center justify-between gap-2">
              <span>
                {it.quantity}× {it.product_name}
                <span className="text-muted-foreground"> — {it.variation_name}</span>
              </span>
              <span className="tabular-nums">{formatBRL(it.line_total)}</span>
            </li>
          ))}
        </ul>

        {order.status === "pending" && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={onAccept} disabled={busy}>Aceitar</Button>
            <Button variant="outline" onClick={onCancel}>Recusar</Button>
          </div>
        )}
        {order.status === "cancelled" && order.cancel_reason && (
          <p className="text-xs text-muted-foreground">Motivo: {order.cancel_reason}</p>
        )}
      </CardContent>
    </Card>
  );
}
