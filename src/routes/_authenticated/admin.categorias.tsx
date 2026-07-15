import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/categorias")({
  component: CategoriesPage,
});

type Category = {
  id: string;
  name: string;
  active: boolean;
  sort_order: number;
};

function CategoriesPage() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [sortOrder, setSortOrder] = useState(0);

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, active, sort_order")
        .order("sort_order");
      if (error) throw error;
      return data as Category[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data: stores } = await supabase.from("stores").select("id").limit(1).single();
      if (!stores) throw new Error("Loja não encontrada");
      const { error } = await supabase
        .from("categories")
        .insert({ name, sort_order: sortOrder, store_id: stores.id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Categoria criada");
      setName("");
      setSortOrder(0);
      qc.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const update = useMutation({
    mutationFn: async (patch: Partial<Category> & { id: string }) => {
      const { id, ...rest } = patch;
      const { error } = await supabase.from("categories").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["categories"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Categorias</h1>
        <p className="text-sm text-muted-foreground">
          Categoria inativa esconde seus produtos da vitrine.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nova categoria</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              create.mutate();
            }}
          >
            <div className="flex-1 min-w-[200px] space-y-1">
              <Label htmlFor="cat-name">Nome</Label>
              <Input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="w-28 space-y-1">
              <Label htmlFor="cat-sort">Ordem</Label>
              <Input
                id="cat-sort"
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
              />
            </div>
            <Button type="submit" disabled={create.isPending}>Adicionar</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Existentes</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {!isLoading && categories.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma categoria.</p>
          )}
          <ul className="divide-y">
            {categories.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 py-3">
                <Input
                  className="max-w-xs"
                  defaultValue={c.name}
                  onBlur={(e) => {
                    if (e.target.value !== c.name) update.mutate({ id: c.id, name: e.target.value });
                  }}
                />
                <Input
                  className="w-24"
                  type="number"
                  defaultValue={c.sort_order}
                  onBlur={(e) => {
                    const v = Number(e.target.value) || 0;
                    if (v !== c.sort_order) update.mutate({ id: c.id, sort_order: v });
                  }}
                />
                <div className="flex items-center gap-2">
                  <Switch
                    checked={c.active}
                    onCheckedChange={(v) => update.mutate({ id: c.id, active: v })}
                  />
                  <span className="text-sm text-muted-foreground">
                    {c.active ? "Ativa" : "Inativa"}
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
