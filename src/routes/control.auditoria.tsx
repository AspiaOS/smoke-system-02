import { createFileRoute, redirect } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ControlShell } from "@/components/control/ControlShell";
import { getPlatformAdminSelf } from "@/lib/authz.functions";
import { listPlatformAuditLogs } from "@/lib/platform.functions";

export const Route = createFileRoute("/control/auditoria")({
  ssr: false,
  head: () => ({ meta: [{ title: "Auditoria — Smoke Control" }, { name: "robots", content: "noindex" }] }),
  beforeLoad: async () => {
    const admin = await getPlatformAdminSelf().catch(() => null);
    if (!admin) throw redirect({ to: "/control/login" });
    return { admin };
  },
  loader: ({ context }) =>
    context.queryClient.ensureQueryData({
      queryKey: ["control", "audit"],
      queryFn: () => listPlatformAuditLogs({ data: { limit: 200 } }),
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
  const { data } = useSuspenseQuery({
    queryKey: ["control", "audit"],
    queryFn: () => listPlatformAuditLogs({ data: { limit: 200 } }),
  });

  return (
    <ControlShell title="Auditoria da plataforma">
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
                  Nenhum evento registrado ainda.
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
                <td className="px-4 py-3 font-mono text-xs text-neutral-300">
                  <div>{row.target_type}</div>
                  <div className="text-muted-foreground">{row.target_id}</div>
                </td>
                <td className="px-4 py-3 text-neutral-300">{row.actor_email ?? "—"}</td>
                <td className="px-4 py-3 text-neutral-300">{row.store_name ?? "—"}</td>
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
        Registros imutáveis. Exibindo até 200 eventos mais recentes.
      </p>
    </ControlShell>
  );
}
