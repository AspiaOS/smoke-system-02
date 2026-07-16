import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { useCapabilities } from "@/hooks/use-capabilities";
import type { Capability } from "@/lib/authz/matrix";
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
  capability: Capability;
};

const NAV: readonly NavItem[] = [
  { to: "/admin", label: "Dashboard", icon: LayoutGrid, capability: "dashboard.view" },
  { to: "/admin/produtos", label: "Produtos", icon: Package, capability: "products.view" },
  { to: "/admin/categorias", label: "Categorias", icon: Tag, capability: "categories.view" },
  { to: "/admin/pedidos", label: "Pedidos", icon: ShoppingCart, capability: "orders.view" },
  { to: "/admin/clientes", label: "Clientes", icon: Users, capability: "customers.view" },
  { to: "/admin/vendas", label: "Vendas", icon: DollarSign, capability: "sales.view" },
  { to: "/admin/despesas", label: "Despesas", icon: Receipt, capability: "expenses.view" },
  { to: "/admin/estoque", label: "Estoque", icon: Warehouse, capability: "stock.view" },
  { to: "/admin/frete", label: "Frete", icon: Truck, capability: "shipping.view" },
  { to: "/admin/configuracoes", label: "Configurações", icon: Settings, capability: "settings.view" },
  { to: "/admin/auditoria", label: "Auditoria", icon: ScrollText, capability: "audit.view" },
  { to: "/admin/equipe", label: "Equipe", icon: Users, capability: "members.view" },
] as const;


function AdminLayout() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { loading, role, can } = useCapabilities();

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  if (!loading && !role) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold">Sem acesso</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sua conta não é membro ativo desta loja. Peça ao dono para liberar seu acesso.
          </p>
          <Button className="mt-6" onClick={signOut}>Sair</Button>
        </div>
      </div>
    );
  }

  const visibleNav = NAV.filter((n) => can(n.capability));

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="hidden md:flex md:w-64 flex-col border-r border-border bg-surface-contrast px-5 py-8">
        <div className="mb-10">
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Painel</p>
          <Link to="/admin" className="mt-1 block font-display text-3xl font-bold tracking-tight">
            Smoke<span className="text-primary">.</span>
          </Link>
          {role && (
            <p className="mt-2 text-[11px] uppercase tracking-wider text-muted-foreground">
              {role}
            </p>
          )}
        </div>

        <nav className="flex-1">
          <ul className="space-y-1">
            {visibleNav.map((n) => {
              const active =
                n.to === "/admin" ? pathname === "/admin" : pathname.startsWith(n.to);
              const Icon = n.icon;
              return (
                <li key={n.to}>
                  <Link
                    to={n.to}
                    className={cn(
                      "flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium transition-colors",
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
            {visibleNav.map((n) => {
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
