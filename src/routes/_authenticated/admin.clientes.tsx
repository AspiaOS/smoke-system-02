import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import {
  MessageCircle,
  Pencil,
  Plus,
  Search,
  ShoppingBag,
  Trash2,
  Users,
} from "lucide-react";
import { useCapabilities } from "@/hooks/use-capabilities";

export const Route = createFileRoute("/_authenticated/admin/clientes")({
  component: ClientsPage,
});

type Customer = {
  id: string;
  name: string;
  phone: string;
  last_address: string | null;
  last_neighborhood: string | null;
  internal_notes: string | null;
  updated_at: string;
  created_at: string;
};

type OrderRow = {
  id: string;
  status: string;
  total: number;
  created_at: string;
};

type FilterKey = "all" | "recent" | "top";
type SortKey = "recent" | "name";

function ClientsPage() {
  const { can } = useCapabilities();
  const canUpdate = can("customers.update_notes");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sort, setSort] = useState<SortKey>("recent");
  const [selected, setSelected] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);

  const { data: customers = [] } = useQuery({
    queryKey: ["customers", query],
    queryFn: async () => {
      let q = supabase.from("customers").select("*").order("updated_at", { ascending: false }).limit(200);
      if (query.trim()) {
        const like = `%${query.trim()}%`;
        q = q.or(`name.ilike.${like},phone.ilike.${like}`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data as Customer[];
    },
  });

  // For "Mais compraram" filter — aggregate order counts by customer
  const { data: orderStats = {} } = useQuery({
    queryKey: ["customers-order-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("customer_id")
        .not("customer_id", "is", null);
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const row of data as { customer_id: string }[]) {
        map[row.customer_id] = (map[row.customer_id] ?? 0) + 1;
      }
      return map;
    },
  });

  const filtered = useMemo(() => {
    const now = Date.now();
    let list = [...customers];
    if (filter === "recent") {
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      list = list.filter((c) => now - new Date(c.updated_at).getTime() < sevenDays);
    } else if (filter === "top") {
      list = list
        .filter((c) => (orderStats[c.id] ?? 0) > 0)
        .sort((a, b) => (orderStats[b.id] ?? 0) - (orderStats[a.id] ?? 0));
      return list;
    }
    if (sort === "name") list.sort((a, b) => a.name.localeCompare(b.name));
    else list.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    return list;
  }, [customers, filter, sort, orderStats]);

  const isEmpty = customers.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Clientes</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie contatos, compras e atendimentos pelo WhatsApp.
          </p>
        </div>
        {canUpdate && (
          <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" /> Novo cliente
          </Button>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.4fr)] md:items-stretch">
        <Card className="flex flex-col">
          <CardHeader className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">
                {filtered.length} {filtered.length === 1 ? "cliente" : "clientes"}
              </CardTitle>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar cliente..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2">
              <Select value={filter} onValueChange={(v) => setFilter(v as FilterKey)}>
                <SelectTrigger className="h-9 flex-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="recent">Recentes</SelectItem>
                  <SelectItem value="top">Mais compraram</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
                <SelectTrigger className="h-9 flex-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="recent">Última compra</SelectItem>
                  <SelectItem value="name">Nome</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="flex-1 space-y-2 overflow-auto">
            {isEmpty ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 py-10 text-center">
                <div className="rounded-full bg-muted p-3">
                  <Users className="h-6 w-6 text-muted-foreground" />
                </div>
                <div className="space-y-1">
                  <p className="font-medium">Nenhum cliente cadastrado</p>
                  <p className="text-xs text-muted-foreground">
                    Os clientes serão adicionados automaticamente após uma venda ou
                    podem ser cadastrados manualmente.
                  </p>
                </div>
                {canUpdate && (
                  <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}>
                    <Plus className="mr-2 h-4 w-4" /> Cadastrar cliente
                  </Button>
                )}
              </div>
            ) : filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nenhum cliente encontrado.
              </p>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelected(c.id)}
                  className={`flex w-full items-start justify-between gap-2 rounded-lg border p-3 text-left text-sm transition hover:bg-muted/50 ${
                    selected === c.id ? "border-primary bg-muted/30" : ""
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{c.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{c.phone}</p>
                    {c.last_neighborhood && (
                      <p className="truncate text-xs text-muted-foreground">{c.last_neighborhood}</p>
                    )}
                  </div>
                  {(orderStats[c.id] ?? 0) > 0 && (
                    <Badge variant="secondary" className="shrink-0">
                      {orderStats[c.id]}
                    </Badge>
                  )}
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          {selected ? (
            <CustomerDetail
              id={selected}
              onEdit={(c) => { setEditing(c); setFormOpen(true); }}
              onDeleted={() => setSelected(null)}
              canUpdate={canUpdate}
            />
          ) : (
            <CardContent className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
              <div className="rounded-full bg-muted p-3">
                <Users className="h-6 w-6 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <p className="font-medium">Selecione um cliente</p>
                <p className="text-sm text-muted-foreground">
                  Consulte dados, pedidos, compras e histórico de atendimento.
                </p>
              </div>
            </CardContent>
          )}
        </Card>
      </div>

      <CustomerFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        customer={editing}
        canUpdate={canUpdate}
      />
    </div>
  );
}

function CustomerDetail({
  id,
  onEdit,
  onDeleted,
  canUpdate,
}: {
  id: string;
  onEdit: (c: Customer) => void;
  onDeleted: () => void;
  canUpdate: boolean;
}) {
  const qc = useQueryClient();
  const { data: customer } = useQuery({
    queryKey: ["customer", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as Customer | null;
    },
  });

  const { data: orders = [] } = useQuery({
    queryKey: ["customer-orders", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id,status,total,created_at")
        .eq("customer_id", id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as OrderRow[];
    },
  });

  const { data: topProducts = [] } = useQuery({
    queryKey: ["customer-top-products", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("product_name,quantity,orders!inner(customer_id)")
        .eq("orders.customer_id", id);
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const row of (data ?? []) as { product_name: string; quantity: number }[]) {
        map[row.product_name] = (map[row.product_name] ?? 0) + row.quantity;
      }
      return Object.entries(map)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
    },
  });

  const stats = useMemo(() => {
    const paid = orders.filter((o) => o.status === "accepted");
    const total = paid.reduce((s, o) => s + Number(o.total), 0);
    const count = paid.length;
    const avg = count > 0 ? total / count : 0;
    const last = paid[0]?.created_at ?? orders[0]?.created_at ?? null;
    return { total, count, avg, last };
  }, [orders]);

  const saveNotes = useMutation({
    mutationFn: async (notes: string) => {
      const { error } = await supabase.from("customers").update({ internal_notes: notes || null }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Anotações salvas");
      qc.invalidateQueries({ queryKey: ["customer", id] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const removeCustomer = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("customers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cliente removido");
      qc.invalidateQueries({ queryKey: ["customers"] });
      onDeleted();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro (pode haver pedidos vinculados)"),
  });

  if (!customer) {
    return <CardContent className="p-6 text-sm text-muted-foreground">Carregando…</CardContent>;
  }

  return (
    <>
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div className="min-w-0">
          <CardTitle className="truncate">{customer.name}</CardTitle>
          <p className="text-sm text-muted-foreground">{customer.phone}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" asChild>
            <a
              href={`https://wa.me/${customer.phone.replace(/\D/g, "")}`}
              target="_blank"
              rel="noreferrer"
            >
              <MessageCircle className="mr-2 h-4 w-4" /> WhatsApp
            </a>
          </Button>
          {canUpdate && (
            <Button size="sm" variant="outline" onClick={() => onEdit(customer)}>
              <Pencil className="mr-2 h-4 w-4" /> Editar
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-4 overflow-auto">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatBox label="Total gasto" value={formatBRL(stats.total)} />
          <StatBox label="Pedidos" value={String(stats.count)} />
          <StatBox label="Ticket médio" value={formatBRL(stats.avg)} />
          <StatBox
            label="Última compra"
            value={stats.last ? new Date(stats.last).toLocaleDateString("pt-BR") : "—"}
          />
        </div>

        {(customer.last_address || customer.last_neighborhood) && (
          <div className="rounded-lg border p-3 text-sm">
            {customer.last_address && <p>Último endereço: {customer.last_address}</p>}
            {customer.last_neighborhood && (
              <p className="text-muted-foreground">Bairro: {customer.last_neighborhood}</p>
            )}
          </div>
        )}

        {topProducts.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Produtos mais comprados</h3>
            <div className="space-y-1">
              {topProducts.map(([name, qty]) => (
                <div key={name} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <span className="flex items-center gap-2 truncate">
                    <ShoppingBag className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="truncate">{name}</span>
                  </span>
                  <span className="tabular-nums text-muted-foreground">×{qty}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <h3 className="text-sm font-medium">Histórico de pedidos ({orders.length})</h3>
          {orders.length === 0 ? (
            <p className="rounded-md border p-3 text-sm text-muted-foreground">Sem pedidos.</p>
          ) : (
            <div className="divide-y rounded-md border">
              {orders.map((o) => (
                <div key={o.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium capitalize">{o.status}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(o.created_at).toLocaleString("pt-BR")}
                    </p>
                  </div>
                  <span className="font-semibold tabular-nums">{formatBRL(o.total)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-1">
          <label className="text-xs uppercase text-muted-foreground">Observações internas</label>
          <Textarea
            defaultValue={customer.internal_notes ?? ""}
            rows={3}
            readOnly={!canUpdate}
            onBlur={(e) =>
              canUpdate && e.target.value !== (customer.internal_notes ?? "") && saveNotes.mutate(e.target.value)
            }
          />
        </div>

        {canUpdate && <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => confirm("Remover cliente?") && removeCustomer.mutate()}
          >
            <Trash2 className="mr-2 h-4 w-4" /> Remover cliente
          </Button>
        </div>}
      </CardContent>
    </>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function CustomerFormDialog({
  open,
  onOpenChange,
  customer,
  canUpdate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customer: Customer | null;
  canUpdate: boolean;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [notes, setNotes] = useState("");

  useMemo(() => {
    if (open) {
      setName(customer?.name ?? "");
      setPhone(customer?.phone ?? "");
      setAddress(customer?.last_address ?? "");
      setNeighborhood(customer?.last_neighborhood ?? "");
      setNotes(customer?.internal_notes ?? "");
    }
  }, [open, customer]);

  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim() || !phone.trim()) throw new Error("Nome e telefone são obrigatórios");
      if (!canUpdate) throw new Error("Sem permissão para alterar clientes");
      if (customer) {
        const { error } = await supabase
          .from("customers")
          .update({
            name: name.trim(),
            phone: phone.trim(),
            last_address: address.trim() || null,
            last_neighborhood: neighborhood.trim() || null,
            internal_notes: notes.trim() || null,
          })
          .eq("id", customer.id);
        if (error) throw error;
      } else {
        const { data: store } = await supabase.from("stores").select("id").limit(1).maybeSingle();
        if (!store) throw new Error("Loja não encontrada");
        const { error } = await supabase.from("customers").insert({
          store_id: store.id,
          name: name.trim(),
          phone: phone.trim(),
          last_address: address.trim() || null,
          last_neighborhood: neighborhood.trim() || null,
          internal_notes: notes.trim() || null,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(customer ? "Cliente atualizado" : "Cliente cadastrado");
      qc.invalidateQueries({ queryKey: ["customers"] });
      if (customer) qc.invalidateQueries({ queryKey: ["customer", customer.id] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{customer ? "Editar cliente" : "Novo cliente"}</DialogTitle>
          <DialogDescription>Preencha os dados do cliente.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs uppercase text-muted-foreground">Nome</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs uppercase text-muted-foreground">Telefone (WhatsApp)</label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="55DDDNÚMERO" />
          </div>
          <div className="space-y-1">
            <label className="text-xs uppercase text-muted-foreground">Endereço</label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs uppercase text-muted-foreground">Bairro</label>
            <Input value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs uppercase text-muted-foreground">Observações</label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
