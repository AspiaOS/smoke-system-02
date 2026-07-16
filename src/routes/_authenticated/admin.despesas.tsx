import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MagicBento } from "@/components/ui/magic-bento";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBRL, numericToCents, centsToNumeric } from "@/lib/money";
import { toast } from "sonner";
import { Pencil, Plus, Receipt, Search, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/despesas")({
  component: ExpensesPage,
});

type Expense = {
  id: string;
  description: string;
  category: string;
  amount: number;
  expense_date: string;
};

type PeriodKey = "today" | "7d" | "30d" | "month" | "prev_month";
type SortKey = "recent" | "amount";

const CATEGORIES = [
  "Mercadoria",
  "Embalagens",
  "Frete",
  "Taxas",
  "Marketing",
  "Manutenção",
  "Aluguel",
  "Energia",
  "Internet",
  "Geral",
];

function periodRange(key: PeriodKey): { from: string; to: string } {
  const now = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (key === "today") return { from: iso(now), to: iso(now) };
  if (key === "7d") {
    const from = new Date(now); from.setDate(from.getDate() - 6);
    return { from: iso(from), to: iso(now) };
  }
  if (key === "30d") {
    const from = new Date(now); from.setDate(from.getDate() - 29);
    return { from: iso(from), to: iso(now) };
  }
  if (key === "month") {
    return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) };
  }
  const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const last = new Date(now.getFullYear(), now.getMonth(), 0);
  return { from: iso(first), to: iso(last) };
}

function ExpensesPage() {
  const qc = useQueryClient();
  const [period, setPeriod] = useState<PeriodKey>("30d");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("recent");
  const [query, setQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [deleting, setDeleting] = useState<Expense | null>(null);

  const range = useMemo(() => periodRange(period), [period]);

  const { data: expenses = [] } = useQuery({
    queryKey: ["expenses", range.from, range.to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .gte("expense_date", range.from)
        .lte("expense_date", range.to)
        .order("expense_date", { ascending: false });
      if (error) throw error;
      return data as Expense[];
    },
  });

  const { data: grossProfitCents = 0 } = useQuery({
    queryKey: ["sales-profit-range", range.from, range.to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("gross_profit")
        .gte("created_at", `${range.from}T00:00:00`)
        .lte("created_at", `${range.to}T23:59:59`);
      if (error) throw error;
      return (data as { gross_profit: number }[]).reduce(
        (a, s) => a + numericToCents(s.gross_profit),
        0,
      );
    },
  });

  const filtered = useMemo(() => {
    let list = expenses;
    if (categoryFilter !== "all") list = list.filter((e) => e.category === categoryFilter);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((e) => e.description.toLowerCase().includes(q));
    }
    if (sort === "amount") list = [...list].sort((a, b) => Number(b.amount) - Number(a.amount));
    else list = [...list].sort((a, b) => b.expense_date.localeCompare(a.expense_date));
    return list;
  }, [expenses, categoryFilter, query, sort]);

  const totalExpensesCents = filtered.reduce((a, e) => a + numericToCents(e.amount), 0);
  const netCents = grossProfitCents - totalExpensesCents;

  const categoriesInData = useMemo(() => {
    const set = new Set(expenses.map((e) => e.category));
    return Array.from(set);
  }, [expenses]);

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Despesa removida");
      qc.invalidateQueries({ queryKey: ["expenses"] });
      setDeleting(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Despesas</h1>
          <p className="text-sm text-muted-foreground">
            Registre os gastos e acompanhe o resultado real da loja.
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" /> Nova despesa
        </Button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por descrição..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={period} onValueChange={(v) => setPeriod(v as PeriodKey)}>
          <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Hoje</SelectItem>
            <SelectItem value="7d">7 dias</SelectItem>
            <SelectItem value="30d">30 dias</SelectItem>
            <SelectItem value="month">Este mês</SelectItem>
            <SelectItem value="prev_month">Mês anterior</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[200px]">
            <span className="truncate">Categoria: <SelectValue /></span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {Array.from(new Set([...CATEGORIES, ...categoriesInData])).map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="w-[160px] sm:ml-auto"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Mais recentes</SelectItem>
            <SelectItem value="amount">Maior valor</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Summary label="Lucro bruto" value={formatBRL(grossProfitCents / 100)} />
        <Summary label="Despesas" value={`- ${formatBRL(totalExpensesCents / 100)}`} />
        <Summary
          label="Resultado após despesas"
          value={formatBRL(netCents / 100)}
          highlight={netCents >= 0 ? "primary" : "destructive"}
        />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Despesas do período</CardTitle>
          <span className="text-xs text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? "lançamento" : "lançamentos"}
          </span>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 p-8 text-center">
              <div className="rounded-full bg-muted p-2.5">
                <Receipt className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="space-y-0.5">
                <p className="font-medium">Nenhuma despesa registrada neste período</p>
                <p className="text-sm text-muted-foreground">
                  Os gastos adicionados aparecerão aqui e serão considerados no resultado da loja.
                </p>
              </div>
              <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}>
                <Plus className="mr-2 h-4 w-4" /> Adicionar primeira despesa
              </Button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(e.expense_date + "T00:00:00").toLocaleDateString("pt-BR")}
                        </TableCell>
                        <TableCell className="font-medium">{e.description}</TableCell>
                        <TableCell><Badge variant="secondary">{e.category}</Badge></TableCell>
                        <TableCell className="text-right tabular-nums text-destructive">
                          - {formatBRL(e.amount)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="icon" variant="ghost" onClick={() => { setEditing(e); setFormOpen(true); }}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setDeleting(e)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
                <span className="text-muted-foreground">
                  {filtered.length} {filtered.length === 1 ? "despesa registrada" : "despesas registradas"}
                </span>
                <span className="font-semibold tabular-nums">
                  Total: {formatBRL(totalExpensesCents / 100)}
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <ExpenseFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        expense={editing}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir despesa?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && (
                <>A despesa “{deleting.description}”, no valor de {formatBRL(deleting.amount)}, será removida dos resultados do período.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleting && remove.mutate(deleting.id)}
            >
              Excluir despesa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Summary({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: "primary" | "destructive";
}) {
  const color =
    highlight === "primary" ? "text-primary" : highlight === "destructive" ? "text-destructive" : "";
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase text-muted-foreground">{label}</p>
        <p className={`mt-1 text-xl font-semibold tabular-nums ${color}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function ExpenseFormDialog({
  open,
  onOpenChange,
  expense,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  expense: Expense | null;
}) {
  const qc = useQueryClient();
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Geral");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));

  useMemo(() => {
    if (open) {
      setDescription(expense?.description ?? "");
      setCategory(expense?.category ?? "Geral");
      setAmount(expense ? String(expense.amount) : "");
      setExpenseDate(expense?.expense_date ?? new Date().toISOString().slice(0, 10));
    }
  }, [open, expense]);

  const save = useMutation({
    mutationFn: async () => {
      const cents = numericToCents(amount);
      if (!description.trim()) throw new Error("Descrição obrigatória");
      if (!category.trim()) throw new Error("Categoria obrigatória");
      if (cents <= 0) throw new Error("Valor deve ser maior que zero");
      if (!expenseDate) throw new Error("Data obrigatória");

      if (expense) {
        const { error } = await supabase
          .from("expenses")
          .update({
            description: description.trim(),
            category: category.trim(),
            amount: Number(centsToNumeric(cents)),
            expense_date: expenseDate,
          })
          .eq("id", expense.id);
        if (error) throw error;
      } else {
        const { data: store } = await supabase.from("stores").select("id").limit(1).maybeSingle();
        if (!store) throw new Error("Loja não encontrada");
        const { error } = await supabase.from("expenses").insert({
          store_id: store.id,
          description: description.trim(),
          category: category.trim(),
          amount: Number(centsToNumeric(cents)),
          expense_date: expenseDate,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(expense ? "Despesa atualizada" : "Despesa registrada");
      qc.invalidateQueries({ queryKey: ["expenses"] });
      onOpenChange(false);
    },
    onError: () =>
      toast.error("Não foi possível registrar a despesa. Tente novamente."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{expense ? "Editar despesa" : "Nova despesa"}</DialogTitle>
          <DialogDescription>Registre um gasto da operação.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs uppercase text-muted-foreground">Descrição *</label>
            <Input
              placeholder="Ex.: compra de embalagens"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs uppercase text-muted-foreground">Categoria *</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs uppercase text-muted-foreground">Valor *</label>
              <Input
                type="number"
                step="0.01"
                placeholder="0,00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs uppercase text-muted-foreground">Data *</label>
              <Input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Salvando…" : "Salvar despesa"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
