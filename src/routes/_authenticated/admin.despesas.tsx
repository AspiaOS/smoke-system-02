import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBRL, numericToCents, centsToNumeric } from "@/lib/money";
import { toast } from "sonner";

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

function firstOfMonth() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

function ExpensesPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ description: "", category: "Geral", amount: "", expense_date: new Date().toISOString().slice(0, 10) });
  const [from, setFrom] = useState(firstOfMonth());

  const { data: expenses = [] } = useQuery({
    queryKey: ["expenses", from],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .gte("expense_date", from)
        .order("expense_date", { ascending: false });
      if (error) throw error;
      return data as Expense[];
    },
  });

  const { data: profitData } = useQuery({
    queryKey: ["sales-profit-since", from],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("gross_profit")
        .gte("created_at", `${from}T00:00:00`);
      if (error) throw error;
      return (data as { gross_profit: number }[]).reduce((a, s) => a + numericToCents(s.gross_profit), 0);
    },
  });

  const totalExpensesCents = expenses.reduce((a, e) => a + numericToCents(e.amount), 0);
  const grossProfitCents = profitData ?? 0;
  const netCents = grossProfitCents - totalExpensesCents;

  const create = useMutation({
    mutationFn: async () => {
      const cents = numericToCents(form.amount);
      if (!form.description.trim() || cents <= 0) throw new Error("Descrição e valor obrigatórios");
      const { data: store } = await supabase.from("stores").select("id").limit(1).maybeSingle();
      if (!store) throw new Error("Loja não encontrada");
      const { error } = await supabase.from("expenses").insert({
        store_id: store.id,
        description: form.description.trim(),
        category: form.category.trim() || "Geral",
        amount: centsToNumeric(cents),
        expense_date: form.expense_date,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Despesa registrada");
      setForm({ ...form, description: "", amount: "" });
      qc.invalidateQueries({ queryKey: ["expenses"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["expenses"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Despesas</h1>
        <p className="text-sm text-muted-foreground">Impacto direto no lucro do período.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Summary label="Lucro bruto" value={formatBRL(grossProfitCents / 100)} />
        <Summary label="Despesas" value={`- ${formatBRL(totalExpensesCents / 100)}`} />
        <Summary label="Lucro líquido" value={formatBRL(netCents / 100)} highlight={netCents >= 0 ? "primary" : "destructive"} />
      </div>

      <Card>
        <CardHeader><CardTitle>Nova despesa</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <Input placeholder="Descrição" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="md:col-span-2" />
          <Input placeholder="Categoria" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          <Input type="number" step="0.01" placeholder="Valor" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <Input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} />
          <Button onClick={() => create.mutate()} disabled={create.isPending} className="md:col-span-1">Adicionar</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Histórico desde</CardTitle>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-auto" />
        </CardHeader>
        <CardContent className="p-0">
          {expenses.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nenhuma despesa no período.</p>}
          <div className="divide-y">
            {expenses.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium">{e.description}</p>
                  <p className="text-xs text-muted-foreground">{e.category} · {new Date(e.expense_date).toLocaleDateString("pt-BR")}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold tabular-nums text-destructive">- {formatBRL(e.amount)}</span>
                  <Button variant="ghost" size="sm" onClick={() => confirm("Remover?") && remove.mutate(e.id)}>×</Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Summary({ label, value, highlight }: { label: string; value: string; highlight?: "primary" | "destructive" }) {
  const color = highlight === "primary" ? "text-primary" : highlight === "destructive" ? "text-destructive" : "";
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase text-muted-foreground">{label}</p>
        <p className={`mt-1 text-xl font-semibold ${color}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
