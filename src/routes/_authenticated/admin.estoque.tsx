import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { MagicBento } from "@/components/ui/magic-bento";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { formatBRL } from "@/lib/money";
import { AlertTriangle, Package, Layers, Wallet, PackagePlus, SlidersHorizontal } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/estoque")({
  component: StockPage,
});

type VariationWithProduct = {
  id: string;
  name: string;
  stock: number;
  min_stock: number;
  active: boolean;
  cost: number;
  price: number;
  product_id: string;
  products: {
    name: string;
    brand: string | null;
    category_id: string;
    categories: { name: string } | null;
  } | null;
};

type Movement = {
  id: number;
  variation_id: string;
  type: "entry" | "adjustment" | "sale_accept";
  qty_before: number;
  delta: number;
  qty_after: number;
  note: string | null;
  actor_id: string | null;
  created_at: string;
};

type StatusFilter = "all" | "in" | "low" | "out";
type SortAtual = "critical" | "name" | "stock_desc" | "stock_asc";
type PeriodFilter = "all" | "today" | "7d" | "30d";
type TypeFilter = "all" | "entry" | "adjustment" | "sale_accept";

const TYPE_LABEL: Record<Movement["type"], string> = {
  entry: "Entrada",
  adjustment: "Ajuste",
  sale_accept: "Venda",
};

function StockPage() {
  const qc = useQueryClient();
  const [modal, setModal] = useState<
    | { kind: "entry" | "adjust"; variation: VariationWithProduct | null }
    | null
  >(null);
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [pickerId, setPickerId] = useState<string | undefined>();

  // Filters — Atual
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortAtual, setSortAtual] = useState<SortAtual>("critical");

  // Filters — Histórico
  const [hSearch, setHSearch] = useState("");
  const [hType, setHType] = useState<TypeFilter>("all");
  const [hPeriod, setHPeriod] = useState<PeriodFilter>("all");

  const { data: variations = [], isLoading } = useQuery({
    queryKey: ["variations-with-product"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("variations")
        .select(
          "id, name, stock, min_stock, active, cost, price, product_id, products(name, brand, category_id, categories(name))",
        )
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
        .limit(300);
      if (error) throw error;
      return data as unknown as Movement[];
    },
  });

  const categories = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of variations) {
      if (v.products?.category_id && v.products.categories?.name) {
        m.set(v.products.category_id, v.products.categories.name);
      }
    }
    return Array.from(m, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [variations]);

  const varById = useMemo(
    () => new Map(variations.map((v) => [v.id, v])),
    [variations],
  );

  const lastMoveByVar = useMemo(() => {
    const m = new Map<string, Movement>();
    for (const mv of movements) {
      if (!m.has(mv.variation_id)) m.set(mv.variation_id, mv);
    }
    return m;
  }, [movements]);

  // Summary
  const summary = useMemo(() => {
    let totalItems = 0;
    let activeVars = 0;
    let low = 0;
    let value = 0;
    for (const v of variations) {
      if (v.active) {
        activeVars += 1;
        totalItems += v.stock;
        value += v.stock * Number(v.cost || 0);
        if (v.stock <= v.min_stock) low += 1;
      }
    }
    return { totalItems, activeVars, low, value };
  }, [variations]);

  // Atual — filtered/sorted rows
  const rowsAtual = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = variations.filter((v) => {
      if (!v.active) return false;
      if (categoryFilter !== "all" && v.products?.category_id !== categoryFilter)
        return false;
      if (statusFilter === "out" && v.stock !== 0) return false;
      if (statusFilter === "low" && !(v.stock > 0 && v.stock <= v.min_stock))
        return false;
      if (statusFilter === "in" && v.stock <= v.min_stock) return false;
      if (q) {
        const hay = `${v.products?.name ?? ""} ${v.products?.brand ?? ""} ${v.name}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const critScore = (v: VariationWithProduct) =>
      v.stock === 0 ? -1 : v.stock - v.min_stock;
    filtered.sort((a, b) => {
      switch (sortAtual) {
        case "name":
          return (a.products?.name ?? "").localeCompare(b.products?.name ?? "");
        case "stock_desc":
          return b.stock - a.stock;
        case "stock_asc":
          return a.stock - b.stock;
        case "critical":
        default:
          return critScore(a) - critScore(b);
      }
    });
    return filtered;
  }, [variations, search, categoryFilter, statusFilter, sortAtual]);

  // Histórico — filtered
  const rowsHist = useMemo(() => {
    const q = hSearch.trim().toLowerCase();
    const now = Date.now();
    const cutoff =
      hPeriod === "today"
        ? new Date(new Date().setHours(0, 0, 0, 0)).getTime()
        : hPeriod === "7d"
          ? now - 7 * 86400_000
          : hPeriod === "30d"
            ? now - 30 * 86400_000
            : 0;
    return movements.filter((m) => {
      if (hType !== "all" && m.type !== hType) return false;
      if (cutoff && new Date(m.created_at).getTime() < cutoff) return false;
      if (q) {
        const v = varById.get(m.variation_id);
        const hay = `${v?.products?.name ?? ""} ${v?.name ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [movements, hSearch, hType, hPeriod, varById]);

  const entry = useMutation({
    mutationFn: async () => {
      const variation = modal?.variation;
      if (!variation) throw new Error("Selecione uma variação");
      const n = Number(qty);
      if (!Number.isInteger(n) || n <= 0) throw new Error("Quantidade inteira positiva");
      const { error } = await supabase.rpc("stock_entry", {
        _variation_id: variation.id,
        _qty: n,
        _note: note || undefined,
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
      const variation = modal?.variation;
      if (!variation) throw new Error("Selecione uma variação");
      const n = Number(qty);
      if (!Number.isInteger(n) || n < 0) throw new Error("Novo estoque inteiro ≥ 0");
      if (!note.trim()) throw new Error("Motivo obrigatório");
      const { error } = await supabase.rpc("stock_adjust", {
        _variation_id: variation.id,
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

  function openTop(kind: "entry" | "adjust") {
    setModal({ kind, variation: null });
    setPickerId(undefined);
    setQty("");
    setNote("");
  }
  function openRow(variation: VariationWithProduct, kind: "entry" | "adjust") {
    setModal({ kind, variation });
    setPickerId(variation.id);
    setQty(kind === "adjust" ? String(variation.stock) : "");
    setNote("");
  }
  function onPickerChange(id: string) {
    setPickerId(id);
    const v = varById.get(id) ?? null;
    setModal((m) => (m ? { ...m, variation: v } : m));
    if (v && modal?.kind === "adjust") setQty(String(v.stock));
  }
  function close() {
    setModal(null);
    setPickerId(undefined);
    setQty("");
    setNote("");
  }

  const currentVar = modal?.variation ?? null;
  const newQty = Number(qty);
  const diff =
    modal?.kind === "adjust" && currentVar && Number.isFinite(newQty)
      ? newQty - currentVar.stock
      : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Estoque</h1>
          <p className="text-sm text-muted-foreground">
            Ajuste exige motivo. Toda movimentação vira registro auditável.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => openTop("entry")}>
            <PackagePlus className="mr-2 h-4 w-4" /> Entrada
          </Button>
          <Button variant="outline" onClick={() => openTop("adjust")}>
            <SlidersHorizontal className="mr-2 h-4 w-4" /> Ajuste
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard icon={<Package className="h-4 w-4" />} label="Itens em estoque" value={summary.totalItems.toString()} />
        <SummaryCard icon={<Layers className="h-4 w-4" />} label="Variações ativas" value={summary.activeVars.toString()} />
        <SummaryCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Estoque baixo"
          value={summary.low.toString()}
          highlight={summary.low > 0}
        />
        <SummaryCard icon={<Wallet className="h-4 w-4" />} label="Valor em estoque" value={formatBRL(summary.value)} />
      </div>

      <Tabs defaultValue="atual">
        <TabsList>
          <TabsTrigger value="atual">Atual</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="atual" className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Input
              placeholder="Buscar produto ou variação…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="sm:max-w-xs"
            />
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="sm:w-[180px]">
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Categoria: Todas</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <SelectTrigger className="sm:w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Status: Todos</SelectItem>
                <SelectItem value="in">Em estoque</SelectItem>
                <SelectItem value="low">Estoque baixo</SelectItem>
                <SelectItem value="out">Sem estoque</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortAtual} onValueChange={(v) => setSortAtual(v as SortAtual)}>
              <SelectTrigger className="sm:ml-auto sm:w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="critical">Mais críticos</SelectItem>
                <SelectItem value="name">Nome A–Z</SelectItem>
                <SelectItem value="stock_desc">Maior estoque</SelectItem>
                <SelectItem value="stock_asc">Menor estoque</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : variations.length === 0 ? (
            <EmptyState
              title="Nenhuma variação cadastrada ainda"
              description="Cadastre produtos e variações para começar a controlar o estoque."
              action={
                <Button asChild>
                  <Link to="/admin/produtos">Ir para produtos</Link>
                </Button>
              }
            />
          ) : rowsAtual.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma variação para os filtros atuais.
            </p>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produto</TableHead>
                      <TableHead>Variação</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead className="text-right">Estoque</TableHead>
                      <TableHead className="text-right">Mínimo</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Última mov.</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rowsAtual.map((v) => {
                      const last = lastMoveByVar.get(v.id);
                      return (
                        <TableRow key={v.id}>
                          <TableCell>
                            <div className="font-medium">{v.products?.name}</div>
                            {v.products?.brand && (
                              <div className="text-xs text-muted-foreground">{v.products.brand}</div>
                            )}
                          </TableCell>
                          <TableCell>{v.name}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {v.products?.categories?.name ?? "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-semibold">{v.stock}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{v.min_stock}</TableCell>
                          <TableCell><StatusBadge stock={v.stock} min={v.min_stock} /></TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {last ? new Date(last.created_at).toLocaleString("pt-BR") : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="outline" onClick={() => openRow(v, "entry")}>
                                Entrada
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => openRow(v, "adjust")}>
                                Ajuste
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="historico" className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Input
              placeholder="Buscar produto ou variação…"
              value={hSearch}
              onChange={(e) => setHSearch(e.target.value)}
              className="sm:max-w-xs"
            />
            <Select value={hType} onValueChange={(v) => setHType(v as TypeFilter)}>
              <SelectTrigger className="sm:w-[180px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tipo: Todos</SelectItem>
                <SelectItem value="entry">Entrada</SelectItem>
                <SelectItem value="adjustment">Ajuste</SelectItem>
                <SelectItem value="sale_accept">Venda aceita</SelectItem>
              </SelectContent>
            </Select>
            <Select value={hPeriod} onValueChange={(v) => setHPeriod(v as PeriodFilter)}>
              <SelectTrigger className="sm:w-[180px]"><SelectValue placeholder="Período" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Período: Todo</SelectItem>
                <SelectItem value="today">Hoje</SelectItem>
                <SelectItem value="7d">7 dias</SelectItem>
                <SelectItem value="30d">30 dias</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {movements.length === 0 ? (
            <EmptyState
              title="Nenhuma movimentação registrada"
              description="Entradas, ajustes e saídas por venda aparecerão aqui."
            />
          ) : rowsHist.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma movimentação para os filtros atuais.
            </p>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Produto</TableHead>
                      <TableHead>Variação</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-right">Antes</TableHead>
                      <TableHead className="text-right">Δ</TableHead>
                      <TableHead className="text-right">Depois</TableHead>
                      <TableHead>Nota</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rowsHist.map((m) => {
                      const v = varById.get(m.variation_id);
                      return (
                        <TableRow key={m.id}>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {new Date(m.created_at).toLocaleString("pt-BR")}
                          </TableCell>
                          <TableCell>{v?.products?.name ?? "—"}</TableCell>
                          <TableCell>{v?.name ?? m.variation_id.slice(0, 8)}</TableCell>
                          <TableCell><Badge variant="outline">{TYPE_LABEL[m.type]}</Badge></TableCell>
                          <TableCell className="text-right tabular-nums">{m.qty_before}</TableCell>
                          <TableCell className={`text-right tabular-nums ${m.delta > 0 ? "text-emerald-600" : m.delta < 0 ? "text-red-600" : ""}`}>
                            {m.delta > 0 ? "+" : ""}{m.delta}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-medium">{m.qty_after}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{m.note ?? "—"}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!modal} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {modal?.kind === "entry" ? "Entrada de estoque" : "Ajuste de estoque"}
            </DialogTitle>
            {modal?.kind === "adjust" && (
              <DialogDescription>
                O estoque será corrigido e o ajuste ficará registrado na auditoria.
              </DialogDescription>
            )}
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
              <div className="space-y-1">
                <Label>Produto / variação</Label>
                <Select value={pickerId} onValueChange={onPickerChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma variação" />
                  </SelectTrigger>
                  <SelectContent>
                    {variations
                      .filter((v) => v.active)
                      .map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.products?.name} · {v.name} ({v.stock})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              {currentVar && (
                <p className="text-sm text-muted-foreground">
                  Estoque atual: <b>{currentVar.stock}</b>
                </p>
              )}

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

              {modal.kind === "adjust" && currentVar && Number.isFinite(newQty) && qty !== "" && (
                <p className="text-sm">
                  Diferença:{" "}
                  <span className={`font-medium tabular-nums ${diff > 0 ? "text-emerald-600" : diff < 0 ? "text-red-600" : ""}`}>
                    {diff > 0 ? "+" : ""}{diff}
                  </span>
                </p>
              )}

              <div className="space-y-1">
                <Label>
                  {modal.kind === "adjust" ? "Motivo (obrigatório)" : "Observação (opcional)"}
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
                <Button type="submit" disabled={entry.isPending || adjust.isPending || !currentVar}>
                  {modal.kind === "entry" ? "Confirmar entrada" : "Confirmar ajuste"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{label}</span>
          <span className={highlight ? "text-amber-600" : ""}>{icon}</span>
        </div>
        <div className={`mt-1 text-2xl font-semibold tabular-nums ${highlight ? "text-amber-600" : ""}`}>
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ stock, min }: { stock: number; min: number }) {
  if (stock === 0) return <Badge variant="destructive">Sem estoque</Badge>;
  if (stock <= min)
    return (
      <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-900/40 dark:text-amber-200">
        Baixo
      </Badge>
    );
  return <Badge variant="secondary">Ok</Badge>;
}

function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
        <Package className="h-8 w-8 text-muted-foreground" />
        <div>
          <p className="font-medium">{title}</p>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {action}
      </CardContent>
    </Card>
  );
}
