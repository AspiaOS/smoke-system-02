import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ControlShell } from "@/components/control/ControlShell";
import { getPlatformAdminSelf } from "@/lib/authz.functions";
import { getSecurityOverview } from "@/lib/platform.functions";

export const Route = createFileRoute("/control/seguranca")({
  ssr: false,
  head: () => ({ meta: [{ title: "Segurança — Smoke Control" }, { name: "robots", content: "noindex" }] }),
  beforeLoad: async () => {
    const admin = await getPlatformAdminSelf().catch(() => null);
    if (!admin) throw redirect({ to: "/control/login" });
    return { admin };
  },
  loader: ({ context }) =>
    context.queryClient.ensureQueryData({
      queryKey: ["control", "security"],
      queryFn: () => getSecurityOverview(),
    }),
  errorComponent: ({ error }) => (
    <ControlShell title="Segurança">
      <div className="text-red-400 text-sm">Erro: {String((error as Error)?.message ?? error)}</div>
    </ControlShell>
  ),
  notFoundComponent: () => <div className="p-8 text-muted-foreground">Página não encontrada.</div>,
  component: SegurancaPage,
});

function SegurancaPage() {
  const { data } = useSuspenseQuery({
    queryKey: ["control", "security"],
    queryFn: () => getSecurityOverview(),
  });

  const alerts: Array<{ level: "warn" | "info"; msg: string }> = [];
  if (data.super_admins.length <= 1) {
    alerts.push({
      level: "warn",
      msg: "Apenas 1 super_admin ativo. Considere promover um segundo para evitar bloqueio operacional.",
    });
  }
  const inactiveSuper = data.super_admins.filter((s) => s.profile_status && s.profile_status !== "active");
  if (inactiveSuper.length > 0) {
    alerts.push({
      level: "warn",
      msg: `${inactiveSuper.length} super_admin(s) com profile não-ativo — o acesso é bloqueado pelo assertPlatformAdmin.`,
    });
  }

  return (
    <ControlShell title="Segurança">
      {alerts.length > 0 && (
        <div className="mb-6 space-y-2">
          {alerts.map((a, i) => (
            <div
              key={i}
              className={
                a.level === "warn"
                  ? "border border-amber-500/30 bg-amber-500/5 text-amber-200 rounded-lg px-4 py-3 text-sm"
                  : "border border-border bg-card text-muted-foreground rounded-lg px-4 py-3 text-sm"
              }
            >
              {a.msg}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="border border-border rounded-lg p-5 bg-card">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Super admins</div>
          <div className="text-3xl font-semibold mt-2">{data.super_admins.length}</div>
        </div>
        <div className="border border-border rounded-lg p-5 bg-card">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Support admins</div>
          <div className="text-3xl font-semibold mt-2">{data.support_admins_count}</div>
        </div>
        <div className="border border-border rounded-lg p-5 bg-card">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Security auditors</div>
          <div className="text-3xl font-semibold mt-2">{data.security_auditors_count}</div>
        </div>
      </div>

      <section className="border border-border rounded-lg bg-card overflow-hidden mb-8">
        <div className="px-4 py-3 border-b border-border bg-muted">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Super admins ativos</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2">Nome</th>
              <th className="text-left px-4 py-2">Email</th>
              <th className="text-left px-4 py-2">Profile</th>
              <th className="text-left px-4 py-2">Última atividade</th>
            </tr>
          </thead>
          <tbody>
            {data.super_admins.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">Nenhum super_admin ativo.</td></tr>
            ) : (
              data.super_admins.map((s) => (
                <tr key={s.user_id} className="border-t border-border">
                  <td className="px-4 py-2">
                    <Link to="/control/contas/$id" params={{ id: s.user_id }} className="text-primary hover:underline">
                      {s.display_name || s.email || s.user_id}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{s.email || "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground">{s.profile_status ?? "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {s.last_seen_at ? new Date(s.last_seen_at).toLocaleString("pt-BR") : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <section className="border border-border rounded-lg bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Alterações de acesso recentes</h2>
          <Link to="/control/auditoria" className="text-xs text-primary hover:underline">Ver tudo →</Link>
        </div>
        <table className="w-full text-sm">
          <thead className="text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2">Quando</th>
              <th className="text-left px-4 py-2">Ação</th>
              <th className="text-left px-4 py-2">Ator</th>
              <th className="text-left px-4 py-2">Alvo</th>
              <th className="text-left px-4 py-2">Loja</th>
            </tr>
          </thead>
          <tbody>
            {data.recent_events.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">Nenhum evento recente.</td></tr>
            ) : (
              data.recent_events.map((e) => (
                <tr key={e.id} className="border-t border-border">
                  <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
                    {new Date(e.created_at).toLocaleString("pt-BR")}
                  </td>
                  <td className="px-4 py-2">
                    <span className="inline-flex px-2 py-0.5 rounded bg-primary text-primary-foreground text-xs font-mono">{e.action}</span>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{e.actor_email ?? "—"}</td>
                  <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{e.target_type}:{(e.target_id ?? "").slice(0, 8)}</td>
                  <td className="px-4 py-2 text-muted-foreground">{e.store_name ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </ControlShell>
  );
}