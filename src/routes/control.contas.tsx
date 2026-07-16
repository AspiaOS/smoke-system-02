import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ControlShell } from "@/components/control/ControlShell";
import { getPlatformAdminSelf, listAccounts } from "@/lib/authz.functions";
import { platformRoleHasCapability } from "@/lib/authz/matrix";


export const Route = createFileRoute("/control/contas")({
  ssr: false,
  head: () => ({ meta: [{ title: "Contas — Smoke Control" }, { name: "robots", content: "noindex" }] }),
  beforeLoad: async () => {
    const admin = await getPlatformAdminSelf().catch(() => null);
    if (!admin) throw redirect({ to: "/control/login" });
    return { admin };
  },
  loader: ({ context }) =>
    context.queryClient.ensureQueryData({
      queryKey: ["control", "accounts"],
      queryFn: () => listAccounts(),
    }),
  errorComponent: ({ error }) => (
    <ControlShell title="Contas">
      <div className="text-red-400 text-sm">Erro: {String((error as Error)?.message ?? error)}</div>
    </ControlShell>
  ),
  notFoundComponent: () => <div className="p-8 text-neutral-400">Página não encontrada.</div>,
  component: ContasPage,
});

const STATUS_COLORS: Record<string, string> = {
  active: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30",
  suspended: "text-amber-300 bg-amber-500/10 border-amber-500/30",
  archived: "text-neutral-400 bg-neutral-500/10 border-neutral-600/30",
};

function ContasPage() {
  const { admin } = Route.useRouteContext();
  const canInvite = platformRoleHasCapability(admin.role, "accounts.invite");
  const { data } = useSuspenseQuery({
    queryKey: ["control", "accounts"],
    queryFn: () => listAccounts(),
  });

  return (
    <ControlShell title="Contas">
      <div className="flex justify-end mb-4">
        {canInvite && (
          <Link
            to="/control/contas/nova"
            className="inline-flex items-center gap-1 rounded-md border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-sm text-violet-200 hover:bg-violet-500/20"
          >
            + Nova conta
          </Link>
        )}
      </div>
      {data.length === 0 ? (
        <div className="text-neutral-500 text-sm py-16 text-center border border-dashed border-neutral-800 rounded-lg">
          Nenhuma conta encontrada.
        </div>
      ) : (
        <>
          <div className="border border-neutral-800 rounded-lg overflow-hidden bg-[#111014]">
            <table className="w-full text-sm">
              <thead className="bg-black/40 text-neutral-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-3">Nome</th>
                  <th className="text-left px-4 py-3">Email</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Memberships</th>
                  <th className="text-left px-4 py-3">Criada</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row) => (
                  <tr key={row.id} className="border-t border-neutral-800">
                    <td className="px-4 py-3">{row.display_name || "—"}</td>
                    <td className="px-4 py-3 text-neutral-400">{row.email || "—"}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block text-xs px-2 py-0.5 rounded border ${
                          STATUS_COLORS[row.status] ?? ""
                        }`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-neutral-400">
                      {row.memberships.length === 0
                        ? "—"
                        : row.memberships
                            .map((m) => `${m.role}${m.status !== "active" ? ` (${m.status})` : ""}`)
                            .join(", ")}
                    </td>
                    <td className="px-4 py-3 text-neutral-500">
                      {new Date(row.created_at).toLocaleDateString("pt-BR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-neutral-600 mt-4">{data.length} conta(s).</p>
        </>
      )}
    </ControlShell>
  );
}

