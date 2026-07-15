import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/produtos/")({
  component: ProductsPage,
});

type ProductRow = {
  id: string;
  name: string;
  brand: string | null;
  visible: boolean;
  active: boolean;
  category_id: string;
  variations: { stock: number; active: boolean }[];
};

function ProductsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [categoryId, setCategoryId] = useState<string | undefined>();

  const { data: categories = [] } = useQuery({
    queryKey: ["categories", "active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name")
        .eq("active", true)
        .order("sort_order");
      if (error) throw error;
      return data as { id: string; name: string }[];
    },
  });

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, brand, visible, active, category_id, variations(stock, active)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as ProductRow[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!categoryId) throw new Error("Selecione uma categoria");
      const { data: stores } = await supabase.from("stores").select("id").limit(1).single();
      if (!stores) throw new Error("Loja não encontrada");
      const { data, error } = await supabase
        .from("products")
        .insert({
          name,
          brand: brand || null,
          category_id: categoryId,
          store_id: stores.id,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: (id) => {
      toast.success("Produto criado");
      setName("");
      setBrand("");
      setCategoryId(undefined);
      setCreating(false);
      qc.invalidateQueries({ queryKey: ["products"] });
      window.location.href = `/admin/produtos/${id}`;
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const filtered = products.filter((p) =>
    (p.name + " " + (p.brand ?? "")).toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Produtos</h1>
          <p className="text-sm text-muted-foreground">
            Estoque total = soma das variações. Produto sem variação com estoque não vai à vitrine.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>Novo produto</Button>
      </div>

      {creating && (
        <Card>
          <CardHeader><CardTitle>Novo produto</CardTitle></CardHeader>
          <CardContent>
            <form
              className="grid gap-3 md:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!name.trim()) return;
                create.mutate();
              }}
            >
              <div className="space-y-1">
                <Label>Nome</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="space-y-1">
                <Label>Marca</Label>
                <Input value={brand} onChange={(e) => setBrand(e.target.value)} />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>Categoria</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger><SelectValue placeholder="Escolha uma categoria" /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2 flex gap-2">
                <Button type="submit" disabled={create.isPending}>Criar e editar</Button>
                <Button type="button" variant="outline" onClick={() => setCreating(false)}>
                  Cancelar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Input
        placeholder="Buscar por nome ou marca…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {!isLoading && filtered.length === 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Nenhum produto. Comece criando o primeiro.
        </p>
      )}

      <ul className="grid gap-3 md:grid-cols-2">
        {filtered.map((p) => {
          const totalStock = p.variations.reduce(
            (s, v) => s + (v.active ? v.stock : 0),
            0,
          );
          return (
            <li key={p.id}>
              <Link
                to="/admin/produtos/$id"
                params={{ id: p.id }}
                className="block"
              >
                <Card className="transition-colors hover:bg-accent">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        {p.brand && <p className="text-xs text-muted-foreground">{p.brand}</p>}
                        <p className="font-medium">{p.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Estoque: {totalStock} · {p.variations.length} variações
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {p.visible ? (
                          <Badge variant="default">Visível</Badge>
                        ) : (
                          <Badge variant="secondary">Oculto</Badge>
                        )}
                        {!p.active && <Badge variant="outline">Inativo</Badge>}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
