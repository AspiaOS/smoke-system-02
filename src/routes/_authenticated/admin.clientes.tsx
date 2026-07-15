import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBRL } from "@/lib/money";
import { toast } from "sonner";

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
};

type OrderRow = {
  id: string;
  status: string;
  total: number;
  created_at: string;
};

function ClientsPage() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const { data: customers = [] } = useQuery({
    queryKey: ["customers", query],
    queryFn: async () => {
      let q = supabase.from("customers").select("*").order("updated_at", { ascending: false }).limit(100);
      if (query.trim()) {
        const like = `%${query.trim()}%`;
        q = q.or(`name.ilike.${like},phone.ilike.${like}`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data as Customer[];
    },
  });

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div className="space-y-3">
        <div>
          <h1 className="text-2xl font-semibold">Clientes</h1>
          <p className="text-sm text-muted-foreground">Histórico por WhatsApp.</p>
        </div>
        <Input placeholder="Buscar por nome ou telefone" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="space-y-2">
          {customers.length === 0 && <p className="text-sm text-muted-foreground">Nenhum cliente.</p>}
          {customers.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelected(c.id)}
              className={`w-full rounded-lg border p-3 text-left text-sm transition hover:bg-muted/50 ${
                selected === c.id ? "border-primary" : ""
              }`}
            >
              <p className="font-medium">{c.name}</p>
              <p className="text-xs text-muted-foreground">{c.phone}</p>
              {c.last_neighborhood && (
                <p className="text-xs text-muted-foreground">{c.last_neighborhood}</p>
              )}
            </button>
          ))}
        </div>
      </div>

      <div>
        {selected ? (
          <CustomerDetail id={selected} />
        ) : (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              Selecione um cliente para ver o histórico.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function CustomerDetail({ id }: { id: string }) {
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
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro (pode haver pedidos vinculados)"),
  });

  if (!customer) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-2">
          <div>
            <CardTitle>{customer.name}</CardTitle>
            <p className="text-sm text-muted-foreground">{customer.phone}</p>
          </div>
          <a
            href={`https://wa.me/${customer.phone.replace(/\D/g, "")}`}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-primary hover:underline"
          >
            Abrir WhatsApp
          </a>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {customer.last_address && <p>Último endereço: {customer.last_address}</p>}
          {customer.last_neighborhood && <p>Bairro: {customer.last_neighborhood}</p>}
          <div className="space-y-1">
            <label className="text-xs uppercase text-muted-foreground">Anotações internas</label>
            <Textarea
              defaultValue={customer.internal_notes ?? ""}
              rows={3}
              onBlur={(e) => e.target.value !== (customer.internal_notes ?? "") && saveNotes.mutate(e.target.value)}
            />
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => confirm("Remover cliente?") && removeCustomer.mutate()}
          >
            Remover cliente
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Pedidos ({orders.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          {orders.length === 0 && <p className="p-4 text-sm text-muted-foreground">Sem pedidos.</p>}
          <div className="divide-y">
            {orders.map((o) => (
              <div key={o.id} className="flex items-center justify-between px-4 py-3 text-sm">
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
        </CardContent>
      </Card>
    </div>
  );
}
