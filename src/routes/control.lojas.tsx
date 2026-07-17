import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ControlShell } from "@/components/control/ControlShell";
import { getPlatformAdminSelf, listStoresForControl } from "@/lib/authz.functions";
import { platformRoleHasCapability } from "@/lib/authz/matrix";


export const Route = createFileRoute("/control/lojas")({
  ssr: false,
  head: () => ({ meta: [{ title: "Lojas — Smoke Control" }, { name: "robots", content: "noindex" }] }),
  beforeLoad: async () => {
    const admin = await getPlatformAdminSelf().catch(() => null);
    if (!admin) throw redirect({ to: "/control/login" });
    return { admin };
  },
  loader: ({ context }) =>
    context.queryClient.ensureQueryData({
      queryKey: ["control", "stores"],
      queryFn: () => listStoresForControl(),
    }),
  errorComponent: ({ error }) => (
    <ControlShell title="Lojas">
      <div className="text-red-400 text-sm">Erro: {String((error as Error)?.message ?? error)}</div>
    </ControlShell>
  ),
  notFoundComponent: () => <div className="p-8 text-muted-foreground">Página não encontrada.</div>,
  component: LojasPage,
});

function LojasPage() {
  const { admin } = Route.useRouteContext();
  const canCreate = platformRoleHasCapability(admin.role, "stores.create");
  const { data } = useSuspenseQuery({
    queryKey: ["control", "stores"],
    queryFn: () => listStoresForControl(),
  });

  const HeaderActions = canCreate ? (
    <Link
      to="/control/lojas/nova"
      className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/20"
    >
      + Nova loja
    </Link>
  ) : null;


  return (
    <ControlShell title="Lojas">
      <div className="flex justify-end mb-4">{HeaderActions}</div>
      {data.length === 0 ? (
        <div className="text-muted-foreground text-sm py-16 text-center border border-dashed border-border rounded-lg">
          Nenhuma loja cadastrada.
        </div>
      ) : (
        <>
          <div className="border border-border rounded-lg overflow-hidden bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted text-muted-foreground text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-3">Nome</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Owner(s)</th>
                  <th className="text-left px-4 py-3">Membros</th>
                  <th className="text-left px-4 py-3">Criada</th>
                </tr>
              </thead>
              <tbody>
                {data.map((s) => (
                  <tr key={s.id} className="border-t border-border">
                    <td className="px-4 py-3 font-medium">
                      <Link to="/control/lojas/$id" params={{ id: s.id }} className="text-primary hover:underline">
                        {s.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block text-xs px-2 py-0.5 rounded border ${
                          s.status === "active"
                            ? "text-emerald-300 bg-emerald-500/10 border-emerald-500/30"
                            : "text-red-300 bg-red-500/10 border-red-500/30"
                        }`}
                      >
                        {s.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {s.owners === 0 ? (
                        <span className="italic">sem owner</span>
                      ) : (
                        (() => {
                          const shown = s.owner_names.slice(0, 2);
                          const rest = s.owner_names.slice(2);
                          return (
                            <span className="inline-flex flex-wrap items-center gap-1">
                              <span className="text-foreground">{shown.join(", ") || "—"}</span>
                              {rest.length > 0 && (
                                <span
                                  className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border"
                                  title={rest.join("\n")}
                                >
                                  +{rest.length}
                                </span>
                              )}
                            </span>
                          );
                        })()
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{s.members}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(s.created_at).toLocaleDateString("pt-BR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground mt-4">{data.length} loja(s).</p>
        </>
      )}
    </ControlShell>
  );

}
