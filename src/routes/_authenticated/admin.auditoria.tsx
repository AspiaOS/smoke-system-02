import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/admin/PageHeader";
import { ActivityCalendar, type ActivityDay } from "@/components/admin/ActivityCalendar";
import { translateAction, STOCK_TYPE_LABELS, summarizePayload } from "@/lib/audit-formatters";

export const Route = createFileRoute("/_authenticated/admin/auditoria")({
  validateSearch: (s: Record<string, unknown>) => ({
    tab: (s.tab === "stock" ? "stock" : "events") as "events" | "stock",
    date: typeof s.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.date) ? s.date : undefined,
  }),
  component: AuditPage,
});

type AuditRow = {
  id: number;
  action: string;
  entity: string;
  entity_id: string;
  payload: Record<string, unknown> | null;
  actor_id: string | null;
  created_at: string;
};

type MovementRow = {
  id: number;
  variation_id: string;
  type: string;
  qty_before: number;
  delta: number;
  qty_after: number;
  note: string | null;
  order_id: string | null;
  actor_id: string | null;
  created_at: string;
  variations: { name: string; products: { name: string } | null } | null;
};

const TZ = "America/Sao_Paulo";

function today() {
  return new Date();
}
function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}
function formatDatePt(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const months = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  return `${d} de ${months[m - 1]} de ${y}`;
}
function dayRangeUtc(dateIso: string) {
  // convert local (TZ) day to UTC range
  const start = new Date(`${dateIso}T00:00:00-03:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { fromIso: start.toISOString(), toIso: end.toISOString() };
}

function AuditPage() {
  const { tab, date } = Route.useSearch();
  const navigate = Route.useNavigate();

  const setTab = (t: "events" | "stock") =>
    navigate({ search: (prev) => ({ ...prev, tab: t }), replace: true });
  const setDate = (d: string | null) =>
    navigate({ search: (prev) => ({ ...prev, date: d ?? undefined }), replace: true });

  const { from, to } = useMemo(() => {
    const t = today();
    const to = isoDate(t);
    const f = new Date(t);
    f.setDate(f.getDate() - 364);
    return { from: isoDate(f), to };
  }, []);

  const activityQ = useQuery({
    queryKey: ["audit_activity", tab, from, to],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_audit_activity", {
        p_source: tab === "events" ? "audit" : "stock",
        p_from: from,
        p_to: to,
        p_timezone: TZ,
      });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        date: r.activity_date as string,
        count: Number(r.activity_count),
      })) as ActivityDay[];
    },
  });

  const auditQ = useQuery({
    queryKey: ["audit_logs", date],
    queryFn: async () => {
      let q = supabase
        .from("audit_logs")
        .select("id,action,entity,entity_id,payload,actor_id,created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (date) {
        const { fromIso, toIso } = dayRangeUtc(date);
        q = q.gte("created_at", fromIso).lt("created_at", toIso);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data as AuditRow[];
    },
    enabled: tab === "events",
  });

  const stockQ = useQuery({
    queryKey: ["stock_movements", date],
    queryFn: async () => {
      let q = supabase
        .from("stock_movements")
        .select("id,variation_id,type,qty_before,delta,qty_after,note,order_id,actor_id,created_at,variations(name,products(name))")
        .order("created_at", { ascending: false })
        .limit(200);
      if (date) {
        const { fromIso, toIso } = dayRangeUtc(date);
        q = q.gte("created_at", fromIso).lt("created_at", toIso);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as MovementRow[];
    },
    enabled: tab === "stock",
  });

  const unitLabel = tab === "events" ? "eventos" : "movimentações";

  return (
    <div className="space-y-6">
      <PageHeader title="Auditoria" description="Atividade real dos últimos 12 meses." />

      {activityQ.isError ? (
        <Card>
          <CardContent className="flex items-center justify-between gap-4 p-4 text-sm">
            <span className="text-muted-foreground">Não foi possível carregar a auditoria.</span>
            <Button size="sm" variant="secondary" onClick={() => activityQ.refetch()}>Tentar novamente</Button>
          </CardContent>
        </Card>
      ) : (
        <ActivityCalendar
          days={activityQ.data ?? []}
          unitLabel={unitLabel}
          selectedDate={date ?? null}
          onSelectDate={setDate}
          loading={activityQ.isLoading}
        />
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-2">
          {(["events", "stock"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-full px-4 py-1.5 text-sm transition ${
                tab === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "events" ? "Eventos" : "Estoque"}
            </button>
          ))}
        </div>
        {date && (
          <Button size="sm" variant="secondary" onClick={() => setDate(null)}>
            Limpar dia selecionado
          </Button>
        )}
      </div>

      {date && (
        <p className="text-sm text-muted-foreground">
          {tab === "events" ? "Eventos" : "Movimentações"} de {formatDatePt(date)}
        </p>
      )}

      {tab === "events" ? (
        <Card>
          <CardHeader><CardTitle>Eventos</CardTitle></CardHeader>
          <CardContent className="p-0">
            {auditQ.isLoading && <p className="p-4 text-sm text-muted-foreground">Carregando…</p>}
            {auditQ.isError && <p className="p-4 text-sm text-muted-foreground">Não foi possível carregar os eventos.</p>}
            {!auditQ.isLoading && !auditQ.isError && (auditQ.data ?? []).length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">
                {date ? "Nenhum evento corresponde aos filtros." : "Nenhuma atividade registrada neste período."}
              </p>
            )}
            <div className="divide-y">
              {(auditQ.data ?? []).map((a) => {
                const summary = summarizePayload(a.action, a.payload);
                return (
                  <div key={a.id} className="px-4 py-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{translateAction(a.action)}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {a.entity}{a.entity_id ? ` · ${a.entity_id.slice(0, 8)}` : ""}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(a.created_at).toLocaleString("pt-BR")}
                      </span>
                    </div>
                    {summary && <p className="mt-1 text-xs text-muted-foreground">{summary}</p>}
                    {a.payload && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                          Ver detalhes
                        </summary>
                        <pre className="mt-1 overflow-x-auto rounded bg-muted/40 p-2 text-[11px] text-muted-foreground">
                          {JSON.stringify(a.payload, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader><CardTitle>Movimentações de estoque</CardTitle></CardHeader>
          <CardContent className="p-0">
            {stockQ.isLoading && <p className="p-4 text-sm text-muted-foreground">Carregando…</p>}
            {stockQ.isError && <p className="p-4 text-sm text-muted-foreground">Não foi possível carregar as movimentações.</p>}
            {!stockQ.isLoading && !stockQ.isError && (stockQ.data ?? []).length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">
                {date ? "Nenhuma movimentação corresponde aos filtros." : "Nenhuma movimentação registrada neste período."}
              </p>
            )}
            <div className="divide-y">
              {(stockQ.data ?? []).map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                  <div>
                    <p className="font-medium">
                      {STOCK_TYPE_LABELS[m.type] ?? m.type}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {m.variations?.products?.name ?? "?"}
                      {m.variations?.name ? ` — ${m.variations.name}` : ""}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {new Date(m.created_at).toLocaleString("pt-BR")}
                      {m.order_id ? ` · Pedido #${m.order_id.slice(0, 4).toUpperCase()}` : ""}
                      {m.note ? ` · ${m.note}` : ""}
                    </p>
                  </div>
                  <div className="text-right text-xs tabular-nums">
                    <p className={m.delta > 0 ? "text-primary" : m.delta < 0 ? "text-destructive" : "text-muted-foreground"}>
                      {m.delta > 0 ? "+" : m.delta < 0 ? "−" : ""}{Math.abs(m.delta)}
                    </p>
                    <p className="text-muted-foreground">{m.qty_before} → {m.qty_after}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
