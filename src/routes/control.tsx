import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
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

    // 1) Sem sessão → redirect limpo, SEM invocar server fn (evita o throw
    //    cru do requireSupabaseAuth virar RUNTIME_ERROR na overlay).
    const { data: sess } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
    if (!sess?.session) {
      throw redirect({ to: "/control/login" });
    }

    // 2) Com sessão: chama a server fn. Se o token estiver inválido/expirado,
    //    trata como sessão perdida e redireciona. Se retornar null, é
    //    autenticado-mas-não-admin → errorComponent explícito.
    let admin: Awaited<ReturnType<typeof getPlatformAdminSelf>>;
    try {
      admin = await getPlatformAdminSelf();
    } catch {
      await supabase.auth.signOut().catch(() => {});
      throw redirect({ to: "/control/login" });
    }
    if (admin === null) {
      throw new Error("UNAUTHORIZED_CONTROL");
    }
    return { admin };
  },
  errorComponent: ({ error }) => {
    const msg = (error as Error)?.message ?? String(error);
    if (msg === "UNAUTHORIZED_CONTROL") {
      return (
        <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-8">
          <div className="max-w-md text-center border border-border rounded-lg p-8 bg-card">
            <h1 className="text-2xl font-semibold text-red-400 mb-3">
              Acesso não autorizado
            </h1>
            <p className="text-sm text-muted-foreground">
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
