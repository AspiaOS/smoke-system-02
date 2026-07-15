import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/estoque")({
  component: StockPage,
});

type VariationWithProduct = {
  id: string;
  name: string;
  stock: number;
  min_stock: number;
  active: boolean;
  product_id: string;
  products: { name: string; brand: string | null } | null;
};

type Movement = {
  id: number;
  variation_id: string;
  type: "entry" | "adjustment" | "sale_accept";
  qty_before: number;
  delta: number;
  qty_after: number;
  note: string | null;
  created_at: string;
};

function StockPage() {
  const qc = useQueryClient();
  const [modal, setModal] = useState<{ variation: VariationWithProduct; kind: "entry" | "adjust" } | null>(null);
  const [qty, setQty] = useState<string>("");
  const [note, setNote] = useState<string>("");

  const { data: variations = [], isLoading } = useQuery({
    queryKey: ["variations-with-product"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("variations")
        .select("id, name, stock, min_stock, active, product_id, products(name, brand)")
        .order("stock", { ascending: true });
      if (error) throw error;
      return data as unknown as VariationWithProduct[];
    },
  });

  const { data: movements = [] } = useQuery({
    queryKey: ["movements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_movements")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as unknown as Movement[];
    },
  });

  const entry = useMutation({
    mutationFn: async () => {
      if (!modal) throw new Error("no modal");
      const n = Number(qty);
      if (!Number.isInteger(n) || n <= 0) throw new Error("Quantidade inteira positiva");
      const { error } = await supabase.rpc("stock_entry", {
        _variation_id: modal.variation.id,
        _qty: n,
        _note: note || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Entrada registrada");
      close();
      qc.invalidateQueries({ queryKey: ["variations-with-product"] });
      qc.invalidateQueries({ queryKey: ["movements"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const adjust = useMutation({
    mutationFn: async () => {
      if (!modal) throw new Error("no modal");
      const n = Number(qty);
      if (!Number.isInteger(n) || n < 0) throw new Error("Novo estoque inteiro ≥ 0");
      if (!note.trim()) throw new Error("Motivo obrigatório");
      const { error } = await supabase.rpc("stock_adjust", {
        _variation_id: modal.variation.id,
        _new_qty: n,
        _note: note.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ajuste registrado");
      close();
      qc.invalidateQueries({ queryKey: ["variations-with-product"] });
      qc.invalidateQueries({ queryKey: ["movements"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  function open(variation: VariationWithProduct, kind: "entry" | "adjust") {
    setModal({ variation, kind });
    setQty(kind === "adjust" ? String(variation.stock) : "");
    setNote("");
  }
  function close() {
    setModal(null);
    setQty("");
    setNote("");
  }

  const varById = new Map(variations.map((v) => [v.id, v]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Estoque</h1>
        <p className="text-sm text-muted-foreground">
          Ajuste exige motivo. Toda movimentação vira registro auditável.
        </p>
      </div>

      <Tabs defaultValue="atual">
        <TabsList>
          <TabsTrigger value="atual">Atual</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="atual" className="space-y-3">
          {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {variations.map((v) => {
            const low = v.stock <= v.min_stock;
            return (
              <Card key={v.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    {v.products?.brand && (
                      <p className="text-xs text-muted-foreground">{v.products.brand}</p>
                    )}
                    <p className="font-medium">
                      {v.products?.name} · <span className="text-muted-foreground">{v.name}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Mínimo: {v.min_stock} {!v.active && "· inativa"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {low && <Badge variant="destructive">baixo</Badge>}
                    <span className="text-lg font-semibold tabular-nums">{v.stock}</span>
                    <Button size="sm" variant="outline" onClick={() => open(v, "entry")}>
                      Entrada
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => open(v, "adjust")}>
                      Ajustar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="historico">
          <Card>
            <CardHeader><CardTitle>Últimas 100 movimentações</CardTitle></CardHeader>
            <CardContent>
              {movements.length === 0 && (
                <p className="text-sm text-muted-foreground">Sem movimentações ainda.</p>
              )}
              <ul className="divide-y text-sm">
                {movements.map((m) => {
                  const v = varById.get(m.variation_id);
                  return (
                    <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <div>
                        <p className="font-medium">
                          {v ? `${v.products?.name} · ${v.name}` : m.variation_id}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(m.created_at).toLocaleString("pt-BR")}
                          {m.note ? ` · ${m.note}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <Badge variant="outline">{m.type}</Badge>
                        <span className="tabular-nums text-muted-foreground">
                          {m.qty_before} → {m.qty_after} ({m.delta > 0 ? "+" : ""}
                          {m.delta})
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!modal} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {modal?.kind === "entry" ? "Entrada de estoque" : "Ajustar estoque"}
            </DialogTitle>
          </DialogHeader>
          {modal && (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (modal.kind === "entry") entry.mutate();
                else adjust.mutate();
              }}
            >
              <p className="text-sm text-muted-foreground">
                {modal.variation.products?.name} · {modal.variation.name} — atual{" "}
                <b>{modal.variation.stock}</b>
              </p>
              <div className="space-y-1">
                <Label>
                  {modal.kind === "entry" ? "Quantidade a somar" : "Novo estoque"}
                </Label>
                <Input
                  type="number"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  min={0}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label>
                  {modal.kind === "adjust" ? "Motivo (obrigatório)" : "Nota (opcional)"}
                </Label>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  required={modal.kind === "adjust"}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={close}>Cancelar</Button>
                <Button type="submit" disabled={entry.isPending || adjust.isPending}>
                  Confirmar
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
