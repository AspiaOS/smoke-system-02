import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { seedDemoFn } from "@/lib/demo/demo-seed.functions";
import { resetDemoFn } from "@/lib/demo/demo-reset.functions";
import { validateDemoFn } from "@/lib/demo/demo-validate.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { toast } from "sonner";
import { formatBRL } from "@/lib/money";
import { AlertTriangle, PlayCircle, CheckCircle2, XCircle, Trash2, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/demo")({
  component: DemoPage,
});

function DemoPage() {
  const qc = useQueryClient();
  const seedFn = useServerFn(seedDemoFn);
  const validateFn = useServerFn(validateDemoFn);
  const resetFn = useServerFn(resetDemoFn);

  const [confirmReset, setConfirmReset] = useState(false);

  const manifestQ = useQuery({
    queryKey: ["demo-manifest"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("demo_manifest")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const seedM = useMutation({
    mutationFn: (profile: "small" | "full") => seedFn({ data: { profile } }),
    onSuccess: () => {
      toast.success("Seed concluído. Validando…");
      qc.invalidateQueries({ queryKey: ["demo-manifest"] });
      validateM.mutate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha no seed"),
  });

  const validateM = useMutation({
    mutationFn: () => validateFn(),
    onSuccess: (res) => {
      toast[res.ok ? "success" : "error"](
        res.ok ? "Validação: todas aprovadas." : "Validação: falhas encontradas.",
      );
      qc.invalidateQueries({ queryKey: ["demo-manifest"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha na validação"),
  });

  const resetM = useMutation({
    mutationFn: () => resetFn(),
    onSuccess: (res) => {
      const total = Object.values(res.removed).reduce((s, n) => s + n, 0);
      toast.success(`Reset concluído. ${total} linhas removidas.`);
      qc.invalidateQueries({ queryKey: ["demo-manifest"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha no reset"),
  });

  const manifest = manifestQ.data;
  const summary = manifest?.summary as
    | {
        counts?: Record<string, number>;
        financials?: Record<string, number>;
        profile?: string;
        seed?: number;
      }
    | null;
  const validation = manifest?.validation as
    | { ok: boolean; checks: { name: string; passed: boolean; detail?: string }[]; scenarios: { found: number; total: number } }
    | null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dados de demonstração</h1>
        <p className="text-sm text-muted-foreground">
          Gerador determinístico de dados fictícios para testar todas as telas. Bloqueado quando{" "}
          <span className="font-mono">ALLOW_DEMO_SEED</span> não estiver definido.
        </p>
      </div>

      <Card className="border-amber-500/40 bg-amber-500/5">
        <CardContent className="flex gap-3 p-4 text-sm">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <p className="font-medium">Uso restrito</p>
            <p className="text-muted-foreground">
              Nunca execute em produção. Todos os pedidos passam pelo fluxo oficial
              (create_public_order → accept_order / cancel_order) e o estoque só muda
              via stock_entry / stock_adjust. O reset apaga somente os registros do lote,
              usando o manifest.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        <ActionCard
          icon={<PlayCircle className="h-4 w-4" />}
          label="Semear (small)"
          hint="Perfil rápido: ~12 produtos, ~30 pedidos."
          disabled={seedM.isPending || !!manifest}
          loading={seedM.isPending && seedM.variables === "small"}
          onClick={() => seedM.mutate("small")}
        />
        <ActionCard
          icon={<PlayCircle className="h-4 w-4" />}
          label="Semear (full)"
          hint="Perfil completo: ~40 produtos, ~120 pedidos."
          disabled={seedM.isPending || !!manifest}
          loading={seedM.isPending && seedM.variables === "full"}
          onClick={() => seedM.mutate("full")}
        />
        <ActionCard
          icon={<RefreshCw className="h-4 w-4" />}
          label="Validar lote"
          hint="Roda as 20+ checagens de invariantes."
          disabled={validateM.isPending || !manifest}
          loading={validateM.isPending}
          onClick={() => validateM.mutate()}
        />
        <ActionCard
          icon={<Trash2 className="h-4 w-4" />}
          label="Resetar lote demo"
          hint="Apaga somente IDs listados no manifest e reverte configurações."
          disabled={resetM.isPending || !manifest}
          loading={resetM.isPending}
          onClick={() => setConfirmReset(true)}
          destructive
        />
      </div>

      {!manifest && !manifestQ.isLoading && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Nenhum lote demo ativo. Rode <b>Semear (small)</b> ou <b>Semear (full)</b> para popular a base.
          </CardContent>
        </Card>
      )}

      {manifest && (
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Manifest ativo
                </p>
                <p className="font-mono text-sm">{manifest.run_id}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">Perfil: {manifest.profile}</Badge>
                <Badge variant="outline">Seed: {manifest.seed}</Badge>
                <StatusBadge status={manifest.status} />
              </div>
            </div>

            {manifest.error && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                <p className="font-medium">Erro:</p>
                <p className="font-mono">{manifest.error}</p>
              </div>
            )}

            {summary?.counts && (
              <div>
                <p className="mb-2 text-sm font-medium">Registros criados</p>
                <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                  {Object.entries(summary.counts).map(([k, v]) => (
                    <div key={k} className="rounded border p-2">
                      <p className="text-xs text-muted-foreground">{k}</p>
                      <p className="font-semibold tabular-nums">{v}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {summary?.financials && (
              <div>
                <p className="mb-2 text-sm font-medium">Financeiro (vendas do lote)</p>
                <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                  {Object.entries(summary.financials).map(([k, v]) => (
                    <div key={k} className="rounded border p-2">
                      <p className="text-xs text-muted-foreground">{k}</p>
                      <p className="font-semibold tabular-nums">{formatBRL(v)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {validation && (
              <div>
                <p className="mb-2 flex items-center gap-2 text-sm font-medium">
                  Validações · cenários {validation.scenarios.found}/{validation.scenarios.total}
                  {validation.ok ? (
                    <Badge className="bg-emerald-500/20 text-emerald-600">todas aprovadas</Badge>
                  ) : (
                    <Badge variant="destructive">falhas</Badge>
                  )}
                </p>
                <ul className="max-h-64 space-y-1 overflow-auto rounded border p-2 text-xs">
                  {validation.checks.map((c, i) => (
                    <li key={i} className="flex items-start gap-2">
                      {c.passed ? (
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
                      )}
                      <span className={c.passed ? "" : "text-destructive"}>
                        {c.name}
                        {c.detail && <span className="text-muted-foreground"> — {c.detail}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-end">
              <Button variant="outline" size="sm" asChild>
                <Link to="/admin">Ir para o painel</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resetar lote demo?</AlertDialogTitle>
            <AlertDialogDescription>
              Vai apagar somente os registros listados no manifest e reverter as configurações
              da loja para o snapshot pré-seed. Dados que já existiam antes do lote não são
              tocados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setConfirmReset(false);
                resetM.mutate();
              }}
            >
              Resetar lote
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ActionCard({
  icon, label, hint, onClick, disabled, loading, destructive,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  destructive?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div>
          <p className="flex items-center gap-2 text-sm font-medium">{icon} {label}</p>
          <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        </div>
        <Button
          size="sm"
          variant={destructive ? "outline" : "default"}
          className={destructive ? "text-destructive" : ""}
          onClick={onClick}
          disabled={disabled}
        >
          {loading ? "Executando…" : "Executar"}
        </Button>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "complete") return <Badge className="bg-emerald-500/20 text-emerald-600">complete</Badge>;
  if (status === "running") return <Badge className="bg-amber-500/20 text-amber-600">running</Badge>;
  return <Badge variant="destructive">failed</Badge>;
}
