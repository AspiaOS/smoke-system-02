import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBRL } from "@/lib/money";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/frete")({
  component: ShippingPage,
});

type Neighborhood = {
  id: string;
  name: string;
  delivery_fee: string;
  active: boolean;
};

function ShippingPage() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [fee, setFee] = useState("");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["neighborhoods"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("neighborhoods")
        .select("id, name, delivery_fee, active")
        .order("name");
      if (error) throw error;
      return data as Neighborhood[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data: stores } = await supabase.from("stores").select("id").limit(1).single();
      if (!stores) throw new Error("Loja não encontrada");
      const parsed = Number(fee.replace(",", "."));
      if (!Number.isFinite(parsed) || parsed < 0) throw new Error("Valor inválido");
      const { error } = await supabase
        .from("neighborhoods")
        .insert({ name, delivery_fee: parsed, store_id: stores.id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Bairro adicionado");
      setName("");
      setFee("");
      qc.invalidateQueries({ queryKey: ["neighborhoods"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const update = useMutation({
    mutationFn: async (patch: Partial<Neighborhood> & { id: string }) => {
      const { id, ...rest } = patch;
      const { error } = await supabase.from("neighborhoods").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["neighborhoods"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Frete por bairro</h1>
        <p className="text-sm text-muted-foreground">
          Bairros inativos somem do checkout. Pedidos passados mantêm o valor congelado.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle>Novo bairro</CardTitle></CardHeader>
        <CardContent>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim() || !fee) return;
              create.mutate();
            }}
          >
            <div className="flex-1 min-w-[200px] space-y-1">
              <Label>Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="w-32 space-y-1">
              <Label>Frete (R$)</Label>
              <Input value={fee} onChange={(e) => setFee(e.target.value)} required />
            </div>
            <Button type="submit" disabled={create.isPending}>Adicionar</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Bairros existentes</CardTitle></CardHeader>
        <CardContent>
          {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {!isLoading && rows.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum bairro cadastrado.</p>
          )}
          <ul className="divide-y">
            {rows.map((n) => (
              <li key={n.id} className="flex flex-wrap items-center gap-3 py-3">
                <Input
                  className="max-w-xs"
                  defaultValue={n.name}
                  onBlur={(e) => e.target.value !== n.name && update.mutate({ id: n.id, name: e.target.value })}
                />
                <Input
                  className="w-32"
                  type="number"
                  step="0.01"
                  defaultValue={n.delivery_fee}
                  onBlur={(e) => {
                    if (e.target.value !== n.delivery_fee)
                      update.mutate({ id: n.id, delivery_fee: e.target.value });
                  }}
                />
                <span className="text-xs text-muted-foreground">{formatBRL(n.delivery_fee)}</span>
                <div className="ml-auto flex items-center gap-2">
                  <Switch
                    checked={n.active}
                    onCheckedChange={(v) => update.mutate({ id: n.id, active: v })}
                  />
                  <span className="text-sm text-muted-foreground">
                    {n.active ? "Ativo" : "Inativo"}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
