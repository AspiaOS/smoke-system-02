import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatBRL } from "@/lib/money";
import { toast } from "sonner";

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

function OrdersPage() {
  const [tab, setTab] = useState<OrderStatus>("pending");
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const qc = useQueryClient();

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["orders", tab],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id,status,customer_name,customer_phone,address,neighborhood_name,delivery_fee,subtotal,total,payment_method,created_at,accepted_at,cancelled_at,cancel_reason,order_items(id,product_name,variation_name,quantity,unit_price,line_total)",
        )
        .eq("status", tab)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as unknown as Order[];
    },
    refetchInterval: tab === "pending" ? 15_000 : false,
  });

  const acceptMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("accept_order", { p_order_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pedido aceito. Estoque baixado.");
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
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Pedidos</h1>
          <p className="text-sm text-muted-foreground">Aceite baixa o estoque atomicamente e registra a venda.</p>
        </div>
      </div>

      <div className="flex gap-2">
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
            {s.label}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {!isLoading && orders.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum pedido nessa aba.</p>
      )}

      <div className="space-y-3">
        {orders.map((o) => (
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
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base">{order.customer_name}</CardTitle>
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
          <div className="flex gap-2">
            <Button onClick={onAccept} disabled={busy}>Aceitar</Button>
            <Button variant="outline" onClick={onCancel}>Cancelar</Button>
          </div>
        )}
        {order.status === "cancelled" && order.cancel_reason && (
          <p className="text-xs text-muted-foreground">Motivo: {order.cancel_reason}</p>
        )}
      </CardContent>
    </Card>
  );
}
