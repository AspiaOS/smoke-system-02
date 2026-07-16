import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/admin/PageHeader";

export const Route = createFileRoute("/_authenticated/admin/auditoria")({
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
  created_at: string;
  variations: { name: string; products: { name: string } | null } | null;
};

function AuditPage() {
  const [tab, setTab] = useState<"audit" | "stock">("audit");

  const { data: audit = [] } = useQuery({
    queryKey: ["audit_logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("id,action,entity,entity_id,payload,actor_id,created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as AuditRow[];
    },
    enabled: tab === "audit",
  });

  const { data: movements = [] } = useQuery({
    queryKey: ["stock_movements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_movements")
        .select("id,variation_id,type,qty_before,delta,qty_after,note,created_at,variations(name,products(name))")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as unknown as MovementRow[];
    },
    enabled: tab === "stock",
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Auditoria" description="Últimos 200 eventos do sistema." />

      <div className="flex gap-2">
        {(["audit", "stock"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-1.5 text-sm transition ${
              tab === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "audit" ? "Eventos" : "Estoque"}
          </button>
        ))}
      </div>

      {tab === "audit" ? (
        <Card>
          <CardHeader><CardTitle>Eventos</CardTitle></CardHeader>
          <CardContent className="p-0">
            {audit.length === 0 && <p className="p-4 text-sm text-muted-foreground">Sem eventos.</p>}
            <div className="divide-y">
              {audit.map((a) => (
                <div key={a.id} className="px-4 py-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{a.action}</Badge>
                      <span className="text-xs text-muted-foreground">{a.entity} · {a.entity_id.slice(0, 8)}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(a.created_at).toLocaleString("pt-BR")}
                    </span>
                  </div>
                  {a.payload && (
                    <pre className="mt-1 overflow-x-auto text-xs text-muted-foreground">
                      {JSON.stringify(a.payload, null, 0)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader><CardTitle>Movimentações de estoque</CardTitle></CardHeader>
          <CardContent className="p-0">
            {movements.length === 0 && <p className="p-4 text-sm text-muted-foreground">Sem movimentações.</p>}
            <div className="divide-y">
              {movements.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                  <div>
                    <p className="font-medium">
                      {m.variations?.products?.name ?? "?"}
                      <span className="text-muted-foreground"> — {m.variations?.name ?? ""}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {m.type} · {new Date(m.created_at).toLocaleString("pt-BR")}
                      {m.note ? ` · ${m.note}` : ""}
                    </p>
                  </div>
                  <div className="text-right text-xs tabular-nums">
                    <p className={m.delta >= 0 ? "text-secondary" : "text-destructive"}>
                      {m.delta >= 0 ? "+" : ""}{m.delta}
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
