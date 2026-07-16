import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getPlatformAdminSelf } from "@/lib/authz.functions";

/**
 * Fase 4 — Guarda server-side de `/control/*`.
 *
 * Loader server-side chama getPlatformAdminSelf (server function com
 * requireSupabaseAuth + assertPlatformAdmin) ANTES de renderizar qualquer
 * filho. Sem sessão → redirect para /control/login. Autenticado mas não
 * admin → "Acesso não autorizado à Central de Controle", sem flash do shell.
 *
 * A rota /control/login é pública (fluxo de acesso), então é isenta.
 */
export const Route = createFileRoute("/control")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    if (location.pathname === "/control/login") return {};

    const admin = await getPlatformAdminSelf().catch(() => "UNAUTHENTICATED" as const);

    if (admin === "UNAUTHENTICATED") {
      throw redirect({ to: "/control/login" });
    }
    if (admin === null) {
      // Autenticado, mas não é admin ativo (ou profile suspenso). Fail-closed.
      throw new Error("UNAUTHORIZED_CONTROL");
    }
    return { admin };
  },
  errorComponent: ({ error }) => {
    const msg = (error as Error)?.message ?? String(error);
    if (msg === "UNAUTHORIZED_CONTROL") {
      return (
        <div className="min-h-screen bg-[#0a0a0c] text-neutral-200 flex items-center justify-center p-8">
          <div className="max-w-md text-center border border-neutral-800 rounded-lg p-8 bg-[#111014]">
            <h1 className="text-2xl font-semibold text-red-400 mb-3">
              Acesso não autorizado
            </h1>
            <p className="text-sm text-neutral-400">
              Sua conta não tem permissão para acessar a Central de Controle.
            </p>
          </div>
        </div>
      );
    }
    return (
      <div className="p-8 text-red-400 text-sm">
        Erro ao carregar a Central: {msg}
      </div>
    );
  },
  component: () => <Outlet />,
});
