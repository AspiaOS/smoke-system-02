import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { LogOut, LayoutDashboard, Users, Store, ShieldCheck, ScrollText } from "lucide-react";
import type { ReactNode } from "react";

const NAV = [
  { to: "/control", label: "Visão geral", icon: LayoutDashboard, exact: true },
  { to: "/control/contas", label: "Contas", icon: Users, exact: false },
  { to: "/control/lojas", label: "Lojas", icon: Store, exact: false },
] as const;

export function ControlShell({ children, title }: { children: ReactNode; title: string }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/control/login", replace: true });
  }

  return (
    <div className="min-h-screen bg-black text-neutral-100">
      <div className="grid grid-cols-[240px_1fr] min-h-screen">
        <aside className="border-r border-neutral-800 bg-[#111014] flex flex-col">
          <div className="px-5 py-6 border-b border-neutral-800">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-violet-400" />
              <span className="font-semibold tracking-wide">SMOKE CONTROL</span>
            </div>
            <p className="text-xs text-neutral-500 mt-1">Central de administração</p>
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
                      ? "bg-violet-500/15 text-violet-200 border border-violet-500/30"
                      : "text-neutral-400 hover:text-neutral-100 hover:bg-neutral-900"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
            <div className="pt-4 mt-4 border-t border-neutral-800 space-y-1 px-1">
              <div className="px-2 text-[10px] uppercase tracking-wider text-neutral-600 pb-2">
                Em breve
              </div>
              <div className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-neutral-600 cursor-not-allowed">
                <ScrollText className="h-4 w-4" /> Auditoria
              </div>
            </div>
          </nav>
          <button
            onClick={signOut}
            className="flex items-center gap-2 px-5 py-4 border-t border-neutral-800 text-sm text-neutral-400 hover:text-neutral-100"
          >
            <LogOut className="h-4 w-4" /> Sair
          </button>
        </aside>
        <main className="min-w-0">
          <header className="border-b border-neutral-800 px-8 py-5 bg-[#0a0a0d]">
            <h1 className="text-lg font-semibold">{title}</h1>
          </header>
          <div className="p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
