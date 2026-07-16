import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { LogOut, LayoutDashboard, Users, Store, ShieldCheck, ScrollText } from "lucide-react";
import type { ReactNode } from "react";

const NAV = [
  { to: "/control", label: "Visão geral", icon: LayoutDashboard, exact: true },
  { to: "/control/contas", label: "Contas", icon: Users, exact: false },
  { to: "/control/lojas", label: "Lojas", icon: Store, exact: false },
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
    <div className="min-h-screen bg-black text-foreground">
      <div className="grid grid-cols-[240px_1fr] min-h-screen">
        <aside className="border-r border-border bg-card flex flex-col">
          <div className="px-5 py-6 border-b border-border">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <span className="font-semibold tracking-wide">SMOKE CONTROL</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Central de administração</p>
          </div>
          <nav className="flex-1 px-2 py-4 space-y-1">
            {NAV.map((item) => {
              const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition ${
                    active
                      ? "bg-primary text-primary-foreground border border-primary/30"
                      : "text-muted-foreground hover:text-foreground hover:bg-surface"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <button
            onClick={signOut}
            className="flex items-center gap-2 px-5 py-4 border-t border-border text-sm text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-4 w-4" /> Sair
          </button>
        </aside>
        <main className="min-w-0">
          <header className="border-b border-border px-8 py-5 bg-background">
            <h1 className="text-lg font-semibold">{title}</h1>
          </header>
          <div className="p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
