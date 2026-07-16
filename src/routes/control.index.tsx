import { createFileRoute, redirect } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ControlShell } from "@/components/control/ControlShell";
import { getPlatformAdminSelf, getControlDashboard } from "@/lib/authz.functions";

export const Route = createFileRoute("/control/")({
  ssr: false,
  head: () => ({ meta: [{ title: "Smoke Control" }, { name: "robots", content: "noindex" }] }),
  beforeLoad: async () => {
    const admin = await getPlatformAdminSelf().catch(() => null);
    if (!admin) throw redirect({ to: "/control/login" });
    return { admin };
  },
  loader: ({ context }) =>
    context.queryClient.ensureQueryData({
      queryKey: ["control", "dashboard"],
      queryFn: () => getControlDashboard(),
    }),
  errorComponent: ({ error }) => (
    <ControlShell title="Visão geral">
      <div className="text-red-400 text-sm">Erro ao carregar: {String((error as Error)?.message ?? error)}</div>
    </ControlShell>
  ),
  notFoundComponent: () => <div className="p-8 text-neutral-400">Página não encontrada.</div>,
  component: ControlDashboardPage,
});

function ControlDashboardPage() {
  const { data } = useSuspenseQuery({
    queryKey: ["control", "dashboard"],
    queryFn: () => getControlDashboard(),
  });

  const cards = [
    { label: "Contas ativas", value: data.accountsActive },
    { label: "Contas suspensas", value: data.accountsSuspended },
    { label: "Lojas ativas", value: data.storesActive },
    { label: "Lojas suspensas", value: data.storesSuspended },
    { label: "Admins da plataforma", value: data.platformAdmins },
    { label: "Convites pendentes", value: data.pendingInvitations },
  ];

  return (
    <ControlShell title="Visão geral">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {cards.map((c) => (
          <div
            key={c.label}
            className="border border-neutral-800 rounded-lg p-5 bg-[#111014]"
          >
            <div className="text-xs uppercase tracking-wide text-neutral-500">{c.label}</div>
            <div className="text-3xl font-semibold mt-2">{c.value}</div>
          </div>
        ))}
      </div>
    </ControlShell>
  );
}
