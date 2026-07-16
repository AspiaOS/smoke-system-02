import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { formatBRL } from "@/lib/money";
import { toast } from "sonner";
import { MapPin } from "lucide-react";
import { useCapabilities } from "@/hooks/use-capabilities";

export const Route = createFileRoute("/_authenticated/admin/frete")({
  component: ShippingPage,
});

type Neighborhood = {
  id: string;
  name: string;
  delivery_fee: number;
  active: boolean;
  created_at?: string;
};

type StatusFilter = "all" | "active" | "inactive";
type SortKey = "name" | "fee_asc" | "fee_desc" | "recent";

function parseFee(v: string): number {
  const n = Number(v.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

function ShippingPage() {
  const qc = useQueryClient();
  const { can } = useCapabilities();
  const canManage = can("shipping.manage");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortKey>("name");

  const [creating, setCreating] = useState(false);
  const [nName, setNName] = useState("");
  const [nFee, setNFee] = useState("");
  const [nActive, setNActive] = useState(true);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [eName, setEName] = useState("");
  const [eFee, setEFee] = useState("");

  const [deactivate, setDeactivate] = useState<Neighborhood | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["neighborhoods"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("neighborhoods")
        .select("id, name, delivery_fee, active, created_at")
        .order("name");
      if (error) throw error;
      return data as Neighborhood[];
    },
  });

  const summary = useMemo(() => {
    const active = rows.filter((r) => r.active);
    const inactive = rows.length - active.length;
    const avg =
      active.length > 0
        ? active.reduce((s, r) => s + Number(r.delivery_fee || 0), 0) / active.length
        : 0;
    return { active: active.length, inactive, avg };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (statusFilter === "active" && !r.active) return false;
      if (statusFilter === "inactive" && r.active) return false;
      if (q && !r.name.toLowerCase().includes(q)) return false;
      return true;
    });
    list.sort((a, b) => {
      switch (sort) {
        case "fee_asc":
          return Number(a.delivery_fee) - Number(b.delivery_fee);
        case "fee_desc":
          return Number(b.delivery_fee) - Number(a.delivery_fee);
        case "recent":
          return (b.created_at ?? "").localeCompare(a.created_at ?? "");
        case "name":
        default:
          return a.name.localeCompare(b.name);
      }
    });
    return list;
  }, [rows, search, statusFilter, sort]);

  const create = useMutation({
    mutationFn: async () => {
      const name = nName.trim();
      const parsed = parseFee(nFee);
      if (!name) throw new Error("Nome obrigatório");
      if (!Number.isFinite(parsed) || parsed < 0) throw new Error("Valor inválido");
      if (rows.some((r) => r.name.toLowerCase() === name.toLowerCase()))
        throw new Error("Já existe um bairro com este nome");
      const { data: stores } = await supabase.from("stores").select("id").limit(1).single();
      if (!stores) throw new Error("Loja não encontrada");
      const { error } = await supabase
        .from("neighborhoods")
        .insert({ name, delivery_fee: parsed, active: nActive, store_id: stores.id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Bairro adicionado ao checkout.");
      setCreating(false);
      setNName("");
      setNFee("");
      setNActive(true);
      qc.invalidateQueries({ queryKey: ["neighborhoods"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const update = useMutation({
    mutationFn: async (patch: {
      id: string;
      name?: string;
      delivery_fee?: number;
      active?: boolean;
    }) => {
      const { id, ...rest } = patch;
      const { error } = await supabase.from("neighborhoods").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["neighborhoods"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  function startEdit(n: Neighborhood) {
    setEditingId(n.id);
    setEName(n.name);
    setEFee(String(n.delivery_fee).replace(".", ","));
  }
  function cancelEdit() {
    setEditingId(null);
    setEName("");
    setEFee("");
  }
  async function saveEdit(n: Neighborhood) {
    const name = eName.trim();
    const parsed = parseFee(eFee);
    if (!name) return toast.error("Nome obrigatório");
    if (!Number.isFinite(parsed) || parsed < 0) return toast.error("Valor inválido");
    await update.mutateAsync({ id: n.id, name, delivery_fee: parsed });
    toast.success(`Frete atualizado. Novos pedidos usarão o valor de ${formatBRL(parsed)}.`);
    cancelEdit();
  }
  function toggleStatus(n: Neighborhood, next: boolean) {
    if (!next) {
      setDeactivate(n);
      return;
    }
    update.mutate({ id: n.id, active: true });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Frete por bairro</h1>
          <p className="text-sm text-muted-foreground">
            Defina os bairros atendidos e o valor fixo de entrega.
          </p>
        </div>
        {canManage && <Button onClick={() => setCreating(true)}>+ Novo bairro</Button>}
      </div>

      <p className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        Alterações de frete valem apenas para novos pedidos. Pedidos anteriores mantêm o valor original.
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Bairros ativos" value={summary.active.toString()} />
        <SummaryCard label="Inativos" value={summary.inactive.toString()} />
        <SummaryCard label="Frete médio" value={formatBRL(summary.avg)} />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Input
          placeholder="Buscar bairro…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="sm:max-w-xs"
        />
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="sm:w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="active">Ativos</SelectItem>
            <SelectItem value="inactive">Inativos</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="sm:ml-auto sm:w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Nome A–Z</SelectItem>
            <SelectItem value="fee_asc">Menor frete</SelectItem>
            <SelectItem value="fee_desc">Maior frete</SelectItem>
            <SelectItem value="recent">Mais recentes</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <MapPin className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="font-medium">Nenhum bairro cadastrado</p>
              <p className="text-sm text-muted-foreground">
                Adicione os bairros atendidos para liberar as opções de entrega no checkout.
              </p>
            </div>
            {canManage && <Button onClick={() => setCreating(true)}>+ Adicionar primeiro bairro</Button>}
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Nenhum bairro para os filtros atuais.
        </p>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b px-4 py-2 text-sm">
              <span className="font-medium">Bairros atendidos</span>
              <span className="text-xs text-muted-foreground">
                {filtered.length} resultado{filtered.length !== 1 && "s"}
              </span>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bairro</TableHead>
                  <TableHead>Valor do frete</TableHead>
                  <TableHead>Status</TableHead>
                  {canManage && <TableHead className="text-right">Ações</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((n) => {
                  const isEditing = editingId === n.id;
                  return (
                    <TableRow key={n.id}>
                      <TableCell>
                        {isEditing ? (
                          <Input value={eName} onChange={(e) => setEName(e.target.value)} />
                        ) : (
                          <span className="font-medium">{n.name}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <Input
                            value={eFee}
                            onChange={(e) => setEFee(e.target.value)}
                            className="w-32"
                            placeholder="R$ 0,00"
                          />
                        ) : (
                          <span className="tabular-nums">{formatBRL(n.delivery_fee)}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={n.active}
                            onCheckedChange={(v) => toggleStatus(n, v)}
                            disabled={isEditing || !canManage}
                          />
                          {n.active ? (
                            <Badge variant="secondary">Ativo</Badge>
                          ) : (
                            <Badge variant="outline">Inativo</Badge>
                          )}
                        </div>
                      </TableCell>
                      {canManage && <TableCell className="text-right">
                        {isEditing ? (
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="ghost" onClick={cancelEdit}>
                              Cancelar
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => saveEdit(n)}
                              disabled={update.isPending}
                            >
                              Salvar
                            </Button>
                          </div>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => startEdit(n)}>
                            Editar
                          </Button>
                        )}
                      </TableCell>}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* New neighborhood modal */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo bairro</DialogTitle>
            <DialogDescription>Cadastre uma nova área de entrega.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <div className="space-y-1">
              <Label>Nome do bairro *</Label>
              <Input
                value={nName}
                onChange={(e) => setNName(e.target.value)}
                placeholder="Ex.: Jardim América"
                required
              />
            </div>
            <div className="space-y-1">
              <Label>Valor do frete *</Label>
              <Input
                value={nFee}
                onChange={(e) => setNFee(e.target.value)}
                placeholder="R$ 0,00"
                required
              />
            </div>
            <div className="flex items-center gap-3 rounded-md border px-3 py-2">
              <Switch checked={nActive} onCheckedChange={setNActive} />
              <span className="text-sm">{nActive ? "Ativo" : "Inativo"}</span>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreating(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? "Adicionando…" : "Adicionar bairro"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Deactivate confirmation */}
      <AlertDialog open={!!deactivate} onOpenChange={(o) => !o && setDeactivate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desativar bairro?</AlertDialogTitle>
            <AlertDialogDescription>
              {deactivate?.name} deixará de aparecer no checkout. Os pedidos anteriores não serão alterados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deactivate) update.mutate({ id: deactivate.id, active: false });
                setDeactivate(null);
              }}
            >
              Desativar bairro
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}
