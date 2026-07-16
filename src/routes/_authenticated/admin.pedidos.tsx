import { createFileRoute } from "@tanstack/react-router";
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
  DialogDescription,
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
import { Package, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { useCapabilities } from "@/hooks/use-capabilities";

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
  const { can } = useCapabilities();
  const canCreate = can("orders.create");
  const canAccept = can("orders.accept");
  const canCancel = can("orders.cancel");
  const [tab, setTab] = useState<OrderStatus>("pending");
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [sort, setSort] = useState<SortKey>("recent");
  const [newOpen, setNewOpen] = useState(false);
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Pedidos</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie os pedidos e acompanhe suas vendas. Ao aceitar, o estoque é atualizado e a venda registrada.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canCreate && (
            <Button onClick={() => setNewOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Novo pedido
            </Button>
          )}
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map((s) => {
          const active = tab === s.value;
          return (
            <button
              key={s.value}
              onClick={() => setTab(s.value)}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm transition ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {s.label}
              <span
                className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs ${
                  active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-background text-foreground"
                }`}
              >
                {counts[s.value]}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <div className="relative flex-1 sm:min-w-[220px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por cliente, nº do pedido ou produto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as DateFilter)}>
            <SelectTrigger className="w-full sm:w-[140px] focus:ring-0 focus:ring-offset-0"><SelectValue placeholder="Data" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as datas</SelectItem>
              <SelectItem value="today">Hoje</SelectItem>
              <SelectItem value="7d">7 dias</SelectItem>
              <SelectItem value="30d">30 dias</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className="w-full sm:w-[170px] focus:ring-0 focus:ring-offset-0"><SelectValue placeholder="Ordenar" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Mais recentes</SelectItem>
              <SelectItem value="highest">Maior valor</SelectItem>
              <SelectItem value="lowest">Menor valor</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}

      {!isLoading && filtered.length === 0 && (
        <EmptyState tab={tab} onCreate={() => setNewOpen(true)} canCreate={canCreate} />
      )}

      <div className="space-y-3">
        {filtered.map((o) => (
          <OrderCard
            key={o.id}
            order={o}
            onAccept={() => acceptMut.mutate(o.id)}
            onCancel={() => setCancelling(o.id)}
            busy={acceptMut.isPending}
            canAccept={canAccept}
            canCancel={canCancel}
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

      {canCreate && <NewOrderDialog open={newOpen} onOpenChange={setNewOpen} />}
    </div>
  );
}

function EmptyState({ tab, onCreate, canCreate }: { tab: OrderStatus; onCreate: () => void; canCreate: boolean }) {
  const copy =
    tab === "pending"
      ? {
          title: "Nenhum pedido pendente",
          desc: "Quando um novo pedido chegar, ele aparecerá aqui para você revisar e aceitar.",
        }
      : tab === "accepted"
        ? {
            title: "Nenhum pedido aceito",
            desc: "Os pedidos aceitos e as vendas registradas aparecerão aqui.",
          }
        : {
            title: "Nenhum pedido cancelado",
            desc: "Pedidos recusados ou cancelados ficarão visíveis aqui para consulta.",
          };

  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-3 py-10 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Package className="h-6 w-6 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-semibold">{copy.title}</h3>
          <p className="max-w-sm text-sm text-muted-foreground">{copy.desc}</p>
        </div>
        {canCreate && (
          <Button variant="outline" onClick={onCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Criar pedido manual
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function OrderCard({
  order,
  onAccept,
  onCancel,
  busy,
  canAccept,
  canCancel,
}: {
  order: Order;
  onAccept: () => void;
  onCancel: () => void;
  busy: boolean;
  canAccept: boolean;
  canCancel: boolean;
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

        {order.status === "pending" && (canAccept || canCancel) && (
          <div className="flex flex-wrap gap-2">
            {canAccept && <Button onClick={onAccept} disabled={busy}>Aceitar</Button>}
            {canCancel && <Button variant="outline" onClick={onCancel}>Recusar</Button>}
          </div>
        )}
        {order.status === "cancelled" && order.cancel_reason && (
          <p className="text-xs text-muted-foreground">Motivo: {order.cancel_reason}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- Novo pedido manual ----------

type CartItem = {
  variation_id: string;
  product_name: string;
  variation_name: string;
  unit_price: number;
  quantity: number;
  stock: number;
};

function NewOrderDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [neighborhoodId, setNeighborhoodId] = useState<string>("");
  const [payment, setPayment] = useState<string>("cash");
  const [notes, setNotes] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);

  const { data: neighborhoods = [] } = useQuery({
    queryKey: ["neighborhoods", "active"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("neighborhoods")
        .select("id,name,delivery_fee")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: variations = [] } = useQuery({
    queryKey: ["variations", "search", productSearch],
    enabled: open && productSearch.trim().length > 0,
    queryFn: async () => {
      const q = productSearch.trim();
      const { data, error } = await supabase
        .from("variations")
        .select("id,name,price,stock,active,product:products!inner(id,name,active,visible)")
        .eq("active", true)
        .ilike("products.name", `%${q}%`)
        .limit(15);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        id: string; name: string; price: number; stock: number;
        product: { id: string; name: string; active: boolean; visible: boolean };
      }>;
    },
  });

  const neighborhood = neighborhoods.find((n) => n.id === neighborhoodId);
  const subtotal = cart.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  const deliveryFee = Number(neighborhood?.delivery_fee ?? 0);
  const total = subtotal + deliveryFee;

  const reset = () => {
    setName(""); setPhone(""); setAddress(""); setNeighborhoodId("");
    setPayment("cash"); setNotes(""); setProductSearch(""); setCart([]);
  };

  const addToCart = (v: typeof variations[number]) => {
    setCart((c) => {
      const existing = c.find((i) => i.variation_id === v.id);
      if (existing) {
        return c.map((i) => i.variation_id === v.id
          ? { ...i, quantity: Math.min(i.stock, i.quantity + 1) }
          : i);
      }
      return [...c, {
        variation_id: v.id,
        product_name: v.product.name,
        variation_name: v.name,
        unit_price: Number(v.price),
        quantity: 1,
        stock: v.stock,
      }];
    });
    setProductSearch("");
  };

  const createMut = useMutation({
    mutationFn: async () => {
      if (!name || !phone || !address || !neighborhoodId) throw new Error("Preencha os dados do cliente");
      if (cart.length === 0) throw new Error("Adicione ao menos um produto");
      const { error } = await supabase.rpc("create_public_order", {
        p_customer_name: name,
        p_customer_phone: phone,
        p_address: address,
        p_neighborhood_id: neighborhoodId,
        p_payment_method: payment as never,
        p_items: cart.map((i) => ({ variation_id: i.variation_id, quantity: i.quantity })) as never,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pedido criado como pendente.");
      qc.invalidateQueries({ queryKey: ["orders"] });
      reset();
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo pedido manual</DialogTitle>
          <DialogDescription>Ao confirmar, o pedido entra como pendente. Aceite depois para atualizar o estoque e registrar a venda.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <section className="space-y-2">
            <h4 className="text-sm font-semibold">1. Cliente</h4>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} />
              <Input placeholder="Telefone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <Input placeholder="Endereço" value={address} onChange={(e) => setAddress(e.target.value)} />
            <Select value={neighborhoodId} onValueChange={setNeighborhoodId}>
              <SelectTrigger><SelectValue placeholder="Bairro" /></SelectTrigger>
              <SelectContent>
                {neighborhoods.map((n) => (
                  <SelectItem key={n.id} value={n.id}>
                    {n.name} · frete {formatBRL(Number(n.delivery_fee))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </section>

          <section className="space-y-2">
            <h4 className="text-sm font-semibold">2. Produtos</h4>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar produto pelo nome..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
              />
            </div>
            {productSearch && variations.length > 0 && (
              <div className="rounded-md border bg-popover divide-y">
                {variations.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => addToCart(v)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    <span>
                      {v.product.name} <span className="text-muted-foreground">— {v.name}</span>
                    </span>
                    <span className="tabular-nums text-xs text-muted-foreground">
                      {formatBRL(Number(v.price))} · estoque {v.stock}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {cart.length > 0 && (
              <ul className="space-y-2 rounded-md border p-2">
                {cart.map((i, idx) => (
                  <li key={i.variation_id} className="flex items-center gap-2 text-sm">
                    <div className="flex-1">
                      <p>{i.product_name} <span className="text-muted-foreground">— {i.variation_name}</span></p>
                      <p className="text-xs text-muted-foreground">Estoque: {i.stock} · {formatBRL(i.unit_price)}</p>
                    </div>
                    <Input
                      type="number"
                      min={1}
                      max={i.stock}
                      value={i.quantity}
                      onChange={(e) => {
                        const q = Math.max(1, Math.min(i.stock, Number(e.target.value) || 1));
                        setCart((c) => c.map((x, xi) => xi === idx ? { ...x, quantity: q } : x));
                      }}
                      className="w-20"
                    />
                    <span className="w-24 text-right tabular-nums">{formatBRL(i.unit_price * i.quantity)}</span>
                    <Button variant="ghost" size="icon" onClick={() => setCart((c) => c.filter((_, xi) => xi !== idx))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-2">
            <h4 className="text-sm font-semibold">3. Pagamento</h4>
            <Select value={payment} onValueChange={setPayment}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Dinheiro</SelectItem>
                <SelectItem value="pix">PIX</SelectItem>
                <SelectItem value="card">Cartão</SelectItem>
              </SelectContent>
            </Select>
            <Textarea placeholder="Observações (opcional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </section>

          <section className="rounded-md border p-3 text-sm">
            <h4 className="mb-2 font-semibold">4. Resumo</h4>
            <div className="flex justify-between"><span>Subtotal</span><span className="tabular-nums">{formatBRL(subtotal)}</span></div>
            <div className="flex justify-between"><span>Frete</span><span className="tabular-nums">{formatBRL(deliveryFee)}</span></div>
            <div className="mt-1 flex justify-between border-t pt-1 font-semibold"><span>Total</span><span className="tabular-nums">{formatBRL(total)}</span></div>
          </section>
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          <Button variant="outline" onClick={() => { onOpenChange(false); reset(); }}>Cancelar</Button>
          <Button onClick={() => createMut.mutate()} disabled={createMut.isPending}>
            Salvar como pendente
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
