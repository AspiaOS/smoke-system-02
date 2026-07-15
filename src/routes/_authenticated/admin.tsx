import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminLayout,
});

const NAV = [
  { to: "/admin", label: "Pedidos" },
  { to: "/admin/produtos", label: "Produtos" },
  { to: "/admin/categorias", label: "Categorias" },
  { to: "/admin/estoque", label: "Estoque" },
  { to: "/admin/frete", label: "Frete" },
] as const;

function AdminLayout() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const { data: isOwner } = useQuery({
    queryKey: ["is_owner"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("is_owner");
      if (error) throw error;
      return Boolean(data);
    },
  });

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  if (isOwner === false) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold">Sem acesso</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sua conta não tem permissão de dono. Peça ao dono para liberar seu acesso.
          </p>
          <Button className="mt-6" onClick={signOut}>Sair</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/admin" className="text-lg font-semibold">Smoke · Painel</Link>
          <Button variant="outline" size="sm" onClick={signOut}>Sair</Button>
        </div>
        <nav className="mx-auto max-w-6xl overflow-x-auto px-2">
          <ul className="flex gap-1 py-1">
            {NAV.map((n) => {
              const active = n.to === "/admin" ? pathname === "/admin" : pathname.startsWith(n.to);
              return (
                <li key={n.to}>
                  <Link
                    to={n.to}
                    className={cn(
                      "block whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                    )}
                  >
                    {n.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
