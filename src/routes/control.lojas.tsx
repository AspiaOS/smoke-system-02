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
  notFoundComponent: () => <div className="p-8 text-neutral-400">Página não encontrada.</div>,
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
      className="inline-flex items-center gap-1 rounded-md border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-sm text-violet-200 hover:bg-violet-500/20"
    >
      + Nova loja
    </Link>
  ) : null;


  if (data.length === 0) {
    return (
      <ControlShell title="Lojas">
        <div className="text-neutral-500 text-sm py-16 text-center border border-dashed border-neutral-800 rounded-lg">
          Nenhuma loja cadastrada.
        </div>
      </ControlShell>
    );
  }

  return (
    <ControlShell title="Lojas">
      <div className="border border-neutral-800 rounded-lg overflow-hidden bg-[#111014]">
        <table className="w-full text-sm">
          <thead className="bg-black/40 text-neutral-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-3">Nome</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Owners</th>
              <th className="text-left px-4 py-3">Membros</th>
              <th className="text-left px-4 py-3">Criada</th>
            </tr>
          </thead>
          <tbody>
            {data.map((s) => (
              <tr key={s.id} className="border-t border-neutral-800">
                <td className="px-4 py-3 font-medium">{s.name}</td>
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
                <td className="px-4 py-3 text-neutral-400">{s.owners}</td>
                <td className="px-4 py-3 text-neutral-400">{s.members}</td>
                <td className="px-4 py-3 text-neutral-500">
                  {new Date(s.created_at).toLocaleDateString("pt-BR")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-neutral-600 mt-4">
        {data.length} loja(s). Criação, suspensão e transferência de propriedade chegam na próxima fase.
      </p>
    </ControlShell>
  );
}
