import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ControlShell } from "@/components/control/ControlShell";
import { getPlatformAdminSelf } from "@/lib/authz.functions";
import { listPlatformAuditLogs } from "@/lib/platform.functions";

type AuditSearch = { action?: string; targetType?: string; limit?: number };

export const Route = createFileRoute("/control/auditoria")({
  ssr: false,
  head: () => ({ meta: [{ title: "Auditoria — Smoke Control" }, { name: "robots", content: "noindex" }] }),
  validateSearch: (s: Record<string, unknown>): AuditSearch => ({
    action: typeof s.action === "string" && s.action ? s.action : undefined,
    targetType: typeof s.targetType === "string" && s.targetType ? s.targetType : undefined,
    limit: typeof s.limit === "number" ? Math.min(Math.max(s.limit, 25), 500) : undefined,
  }),
  loaderDeps: ({ search }) => ({ action: search.action, targetType: search.targetType, limit: search.limit }),
  beforeLoad: async () => {
    const admin = await getPlatformAdminSelf().catch(() => null);
    if (!admin) throw redirect({ to: "/control/login" });
    return { admin };
  },
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData({
      queryKey: ["control", "audit", deps.action ?? null, deps.targetType ?? null, deps.limit ?? 200],
      queryFn: () =>
        listPlatformAuditLogs({
          data: { action: deps.action, targetType: deps.targetType, limit: deps.limit ?? 200 },
        }),
    }),
  errorComponent: ({ error }) => (
    <ControlShell title="Auditoria">
      <div className="text-red-400 text-sm">Erro ao carregar: {String((error as Error)?.message ?? error)}</div>
    </ControlShell>
  ),
  notFoundComponent: () => <div className="p-8 text-muted-foreground">Página não encontrada.</div>,
  component: AuditPage,
});

function AuditPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data } = useSuspenseQuery({
    queryKey: ["control", "audit", search.action ?? null, search.targetType ?? null, search.limit ?? 200],
    queryFn: () =>
      listPlatformAuditLogs({
        data: { action: search.action, targetType: search.targetType, limit: search.limit ?? 200 },
      }),
  });

  return (
    <ControlShell title="Auditoria da plataforma">
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-xs uppercase tracking-wide text-muted-foreground mb-1">Ação</label>
          <input
            type="text"
            defaultValue={search.action ?? ""}
            placeholder="ex.: account.suspended"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const v = (e.target as HTMLInputElement).value.trim();
                navigate({ search: (p) => ({ ...p, action: v || undefined }) });
              }
            }}
            className="border border-border bg-card rounded px-2 py-1 text-sm w-56 focus:outline-none focus:border-primary/50"
          />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wide text-muted-foreground mb-1">Tipo de alvo</label>
          <select
            value={search.targetType ?? ""}
            onChange={(e) =>
              navigate({ search: (p) => ({ ...p, targetType: e.target.value || undefined }) })
            }
            className="border border-border bg-card rounded px-2 py-1 text-sm focus:outline-none focus:border-primary/50"
          >
            <option value="">Todos</option>
            <option value="account">account</option>
            <option value="store">store</option>
            <option value="membership">membership</option>
            <option value="invitation">invitation</option>
          </select>
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wide text-muted-foreground mb-1">Limite</label>
          <select
            value={String(search.limit ?? 200)}
            onChange={(e) =>
              navigate({ search: (p) => ({ ...p, limit: Number(e.target.value) }) })
            }
            className="border border-border bg-card rounded px-2 py-1 text-sm focus:outline-none focus:border-primary/50"
          >
            <option value="50">50</option>
            <option value="100">100</option>
            <option value="200">200</option>
            <option value="500">500</option>
          </select>
        </div>
        {(search.action || search.targetType) && (
          <button
            onClick={() => navigate({ search: () => ({}) })}
            className="text-xs text-muted-foreground hover:text-foreground border border-border rounded px-2 py-1"
          >
            Limpar
          </button>
        )}
      </div>

      <div className="border border-border rounded-lg bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted text-muted-foreground text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-3">Quando</th>
              <th className="text-left px-4 py-3">Ação</th>
              <th className="text-left px-4 py-3">Alvo</th>
              <th className="text-left px-4 py-3">Ator</th>
              <th className="text-left px-4 py-3">Loja</th>
              <th className="text-left px-4 py-3">Detalhes</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  Nenhum evento encontrado com esses filtros.
                </td>
              </tr>
            )}
            {data.map((row) => (
              <tr key={row.id} className="border-t border-border align-top">
                <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                  {new Date(row.created_at).toLocaleString("pt-BR")}
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex px-2 py-0.5 rounded bg-primary text-primary-foreground text-xs font-mono">
                    {row.action}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-foreground">
                  <div>{row.target_type}</div>
                  <div className="text-muted-foreground">{row.target_id}</div>
                </td>
                <td className="px-4 py-3 text-foreground">{row.actor_email ?? "—"}</td>
                <td className="px-4 py-3 text-foreground">{row.store_name ?? "—"}</td>
                <td className="px-4 py-3">
                  <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-all max-w-md">
                    {row.payload && Object.keys(row.payload as object).length > 0
                      ? JSON.stringify(row.payload, null, 0)
                      : "—"}
                  </pre>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground mt-4">
        Registros imutáveis. {data.length} evento(s) exibido(s) (limite {search.limit ?? 200}).
      </p>
    </ControlShell>
  );
}
