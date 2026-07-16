import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GripVertical, Pencil, Trash2, Search, Check, X, Plus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatCard } from "@/components/admin/StatCard";
import { ConfirmDeleteDialog } from "@/components/admin/ConfirmDeleteDialog";
import { MagicBento } from "@/components/ui/magic-bento";

export const Route = createFileRoute("/_authenticated/admin/categorias")({
  component: CategoriesPage,
});

type Category = {
  id: string;
  name: string;
  active: boolean;
  sort_order: number;
  color: string;
  product_count: number;
};

const COLORS = ["#22c55e", "#3b82f6", "#f97316", "#a855f7", "#ec4899", "#eab308", "#ef4444", "#14b8a6"];

function CategoriesPage() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [sortOrder, setSortOrder] = useState(0);
  const [color, setColor] = useState(COLORS[0]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [toDelete, setToDelete] = useState<Category | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ["categories", "admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, active, sort_order, color, products(count)")
        .order("sort_order");
      if (error) throw error;
      return (data as unknown as (Omit<Category, "product_count"> & { products: { count: number }[] })[])
        .map((c) => ({ ...c, product_count: c.products?.[0]?.count ?? 0 }));
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data: stores } = await supabase.from("stores").select("id").limit(1).single();
      if (!stores) throw new Error("Loja não encontrada");
      const { error } = await supabase
        .from("categories")
        .insert({ name, sort_order: sortOrder, color, store_id: stores.id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Categoria criada");
      setName("");
      setSortOrder(0);
      setColor(COLORS[0]);
      qc.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const update = useMutation({
    mutationFn: async (patch: Partial<Category> & { id: string }) => {
      const { id, product_count: _pc, ...rest } = patch;
      const { error } = await supabase.from("categories").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["categories"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const reorder = useMutation({
    mutationFn: async (rows: { id: string; sort_order: number }[]) => {
      for (const r of rows) {
        const { error } = await supabase.from("categories").update({ sort_order: r.sort_order }).eq("id", r.id);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["categories"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Categoria removida");
      setToDelete(null);
      qc.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const stats = useMemo(() => ({
    total: categories.length,
    active: categories.filter((c) => c.active).length,
    products: categories.reduce((s, c) => s + c.product_count, 0),
  }), [categories]);

  const filtered = categories.filter((c) => {
    if (filter === "active" && !c.active) return false;
    if (filter === "inactive" && c.active) return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handleDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const ids = filtered.map((c) => c.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    const reordered = [...filtered];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    const rows = reordered.map((c, i) => ({ id: c.id, sort_order: i * 10 }));
    reorder.mutate(rows);
    setDragId(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Categorias"
        description="Organize como seus produtos aparecem na loja. Categorias desativadas ficam ocultas da vitrine."
      />

      <MagicBento
        className="grid gap-3 sm:grid-cols-3"
        enableStars
        enableSpotlight
        enableBorderGlow
        enableTilt={false}
        enableMagnetism={false}
        clickEffect
        spotlightRadius={400}
        particleCount={8}
        glowColor="132, 0, 255"
      >
        <StatCard label="Categorias" value={stats.total} />
        <StatCard label="Ativas" value={stats.active} />
        <StatCard label="Produtos" value={stats.products} />
      </MagicBento>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Nova categoria</CardTitle></CardHeader>
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
            <div className="w-24 space-y-1">
              <Label htmlFor="cat-sort">Ordem</Label>
              <Input
                id="cat-sort"
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-1">
              <Label>Cor</Label>
              <div className="flex h-10 items-center gap-1.5 rounded-md border px-2">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`h-5 w-5 rounded-full ring-offset-background transition-all ${color === c ? "ring-2 ring-ring ring-offset-2" : ""}`}
                    style={{ backgroundColor: c }}
                    aria-label={`Cor ${c}`}
                  />
                ))}
              </div>
            </div>
            <Button type="submit" disabled={create.isPending}>
              <Plus className="h-4 w-4" /> Criar categoria
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar categoria…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filter} onValueChange={(v: "all" | "active" | "inactive") => setFilter(v)}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="active">Ativas</SelectItem>
            <SelectItem value="inactive">Inativas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="grid grid-cols-[32px_1fr_120px_80px_120px_100px] items-center gap-3 border-b px-4 py-2.5 text-xs font-medium uppercase text-muted-foreground">
            <span />
            <span>Nome</span>
            <span>Produtos</span>
            <span>Ordem</span>
            <span>Status</span>
            <span className="text-right">Ações</span>
          </div>

          {isLoading && <p className="p-4 text-sm text-muted-foreground">Carregando…</p>}
          {!isLoading && filtered.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">Nenhuma categoria encontrada.</p>
          )}

          <ul>
            {filtered.map((c) => (
              <li
                key={c.id}
                draggable
                onDragStart={() => setDragId(c.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(c.id)}
                onDragEnd={() => setDragId(null)}
                className={`grid grid-cols-[32px_1fr_120px_80px_120px_100px] items-center gap-3 border-b px-4 py-3 text-sm last:border-b-0 ${
                  dragId === c.id ? "opacity-50" : "hover:bg-muted/40"
                }`}
              >
                <GripVertical className="h-4 w-4 cursor-grab text-muted-foreground active:cursor-grabbing" />

                <div className="flex items-center gap-2 min-w-0">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
                  {editing === c.id ? (
                    <div className="flex items-center gap-1">
                      <Input
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="h-8"
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => {
                          if (editName.trim() && editName !== c.name) {
                            update.mutate({ id: c.id, name: editName.trim() });
                          }
                          setEditing(null);
                        }}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditing(null)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <span className="truncate font-medium">{c.name}</span>
                  )}
                </div>

                <span className="text-xs text-muted-foreground">
                  {c.product_count} {c.product_count === 1 ? "produto" : "produtos"}
                </span>

                <span className="text-xs tabular-nums text-muted-foreground">{c.sort_order}</span>

                <div className="flex items-center gap-2">
                  <Switch
                    checked={c.active}
                    onCheckedChange={(v) => update.mutate({ id: c.id, active: v })}
                  />
                  <span className={`inline-flex items-center gap-1.5 text-xs ${c.active ? "text-emerald-500" : "text-muted-foreground"}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${c.active ? "bg-emerald-500" : "bg-muted-foreground"}`} />
                    {c.active ? "Ativa" : "Oculta"}
                  </span>
                </div>

                <div className="flex items-center justify-end gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => { setEditing(c.id); setEditName(c.name); }}
                    aria-label="Editar"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => setToDelete(c)}
                    aria-label="Excluir"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <ConfirmDeleteDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`Excluir "${toDelete?.name ?? ""}"?`}
        description={
          toDelete && toDelete.product_count > 0
            ? `Esta categoria possui ${toDelete.product_count} ${toDelete.product_count === 1 ? "produto" : "produtos"}. A exclusão será bloqueada se houver produtos vinculados.`
            : "Esta ação não pode ser desfeita."
        }
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
      />
    </div>
  );
}
