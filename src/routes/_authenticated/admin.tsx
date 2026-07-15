import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import {
  LayoutGrid,
  Package,
  Tag,
  ShoppingCart,
  Users,
  DollarSign,
  Receipt,
  Warehouse,
  Settings,
  LogOut,
  Truck,
  ScrollText,
  type LucideIcon,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminLayout,
});

type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  enabled: boolean;
};

const NAV: readonly NavItem[] = [
  { to: "/admin", label: "Dashboard", icon: LayoutGrid, enabled: true },
  { to: "/admin/produtos", label: "Produtos", icon: Package, enabled: true },
  { to: "/admin/categorias", label: "Categorias", icon: Tag, enabled: true },
  { to: "/admin/pedidos", label: "Pedidos", icon: ShoppingCart, enabled: true },
  { to: "/admin/clientes", label: "Clientes", icon: Users, enabled: true },
  { to: "/admin/vendas", label: "Vendas", icon: DollarSign, enabled: true },
  { to: "/admin/despesas", label: "Despesas", icon: Receipt, enabled: true },
  { to: "/admin/estoque", label: "Estoque", icon: Warehouse, enabled: true },
  { to: "/admin/frete", label: "Frete", icon: Truck, enabled: true },
  { to: "/admin/configuracoes", label: "Configurações", icon: Settings, enabled: true },
  { to: "/admin/auditoria", label: "Auditoria", icon: ScrollText, enabled: true },
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
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="hidden md:flex md:w-64 flex-col border-r border-border bg-surface-contrast px-5 py-8">
        <div className="mb-10">
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Painel</p>
          <Link to="/admin" className="mt-1 block font-display text-3xl font-bold tracking-tight">
            Smoke<span className="text-primary">.</span>
          </Link>
        </div>

        <nav className="flex-1">
          <ul className="space-y-1">
            {NAV.map((n) => {
              const active =
                n.enabled &&
                (n.to === "/admin" ? pathname === "/admin" : pathname.startsWith(n.to));
              const Icon = n.icon;
              const base =
                "flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium transition-colors";
              if (!n.enabled) {
                return (
                  <li key={n.to}>
                    <span
                      className={cn(base, "cursor-not-allowed text-muted-foreground/50")}
                      title="Em breve"
                    >
                      <Icon className="h-4 w-4" />
                      {n.label}
                    </span>
                  </li>
                );
              }
              return (
                <li key={n.to}>
                  <Link
                    to={n.to}
                    className={cn(
                      base,
                      active
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-surface hover:text-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {n.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <button
          onClick={signOut}
          className="mt-6 flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </button>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden flex items-center justify-between border-b border-border px-4 py-3">
          <Link to="/admin" className="font-display text-xl font-bold">
            Smoke<span className="text-primary">.</span>
          </Link>
          <Button variant="outline" size="sm" onClick={signOut}>Sair</Button>
        </header>

        <nav className="md:hidden overflow-x-auto border-b border-border px-2">
          <ul className="flex gap-1 py-2">
            {NAV.filter((n) => n.enabled).map((n) => {
              const active = n.to === "/admin" ? pathname === "/admin" : pathname.startsWith(n.to);
              return (
                <li key={n.to}>
                  <Link
                    to={n.to}
                    className={cn(
                      "block whitespace-nowrap rounded-full px-3 py-1.5 text-sm transition-colors",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-surface hover:text-foreground",
                    )}
                  >
                    {n.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <main className="flex-1 px-4 md:px-10 py-8 max-w-6xl w-full">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
