import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { LogOut, LayoutDashboard, Users, Store, ScrollText, Mail, KeyRound, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

const NAV = [
  { to: "/control", label: "Visão geral", icon: LayoutDashboard, exact: true },
  { to: "/control/contas", label: "Contas", icon: Users, exact: false },
  { to: "/control/lojas", label: "Lojas", icon: Store, exact: false },
  { to: "/control/convites", label: "Convites", icon: Mail, exact: false },
  { to: "/control/permissoes", label: "Permissões", icon: KeyRound, exact: false },
  { to: "/control/seguranca", label: "Segurança", icon: ShieldCheck, exact: false },
  { to: "/control/auditoria", label: "Auditoria", icon: ScrollText, exact: false },
] as const;

export function ControlShell({ children, title }: { children: ReactNode; title: string }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/control/login", replace: true });
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="hidden md:flex md:w-64 flex-col border-r border-border bg-surface-contrast px-5 py-8">
        <div className="mb-10">
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Central</p>
          <Link to="/control" className="mt-1 flex items-baseline gap-2">
            <span className="font-display text-3xl font-bold tracking-tight">
              Smoke<span className="text-primary">.</span>
            </span>
            <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-primary-foreground">
              Control
            </span>
          </Link>
          <p className="mt-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            administração
          </p>
        </div>

        <nav className="flex-1">
          <ul className="space-y-1">
            {NAV.map((item) => {
              const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
              const Icon = item.icon;
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    className={cn(
                      "flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium transition-colors",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-surface hover:text-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
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
          <Link to="/control" className="flex items-baseline gap-2">
            <span className="font-display text-xl font-bold">
              Smoke<span className="text-primary">.</span>
            </span>
            <span className="rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-widest text-primary-foreground">
              Control
            </span>
          </Link>
          <button onClick={signOut} className="text-sm text-muted-foreground hover:text-foreground">Sair</button>
        </header>

        <nav className="md:hidden overflow-x-auto border-b border-border px-2">
          <ul className="flex gap-1 py-2">
            {NAV.map((item) => {
              const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    className={cn(
                      "block whitespace-nowrap rounded-full px-3 py-1.5 text-sm transition-colors",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-surface hover:text-foreground",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <main className="flex-1 px-4 md:px-10 py-8 w-full">
          <h1 className="text-2xl font-display font-semibold mb-6">{title}</h1>
          {children}
        </main>
      </div>
    </div>
  );
}
