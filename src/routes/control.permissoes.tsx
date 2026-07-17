import { createFileRoute, redirect } from "@tanstack/react-router";
import { ControlShell } from "@/components/control/ControlShell";
import { getPlatformAdminSelf } from "@/lib/authz.functions";
import {
  PLATFORM_MATRIX,
  STORE_MATRIX,
  type Capability,
  type MembershipRole,
  type PlatformCapability,
  type PlatformRole,
} from "@/lib/authz/matrix";

export const Route = createFileRoute("/control/permissoes")({
  ssr: false,
  head: () => ({ meta: [{ title: "Permissões — Smoke Control" }, { name: "robots", content: "noindex" }] }),
  beforeLoad: async () => {
    const admin = await getPlatformAdminSelf().catch(() => null);
    if (!admin) throw redirect({ to: "/control/login" });
    return { admin };
  },
  errorComponent: ({ error }) => (
    <ControlShell title="Permissões">
      <div className="text-red-400 text-sm">Erro: {String((error as Error)?.message ?? error)}</div>
    </ControlShell>
  ),
  notFoundComponent: () => <div className="p-8 text-muted-foreground">Página não encontrada.</div>,
  component: PermissoesPage,
});

function Matrix<Role extends string, Cap extends string>({
  title,
  roles,
  matrix,
}: {
  title: string;
  roles: Role[];
  matrix: Record<Role, readonly Cap[]>;
}) {
  const allCaps = Array.from(new Set(roles.flatMap((r) => matrix[r] as readonly Cap[]))).sort() as Cap[];
  return (
    <section className="border border-border rounded-lg bg-card overflow-hidden mb-8">
      <div className="px-4 py-3 border-b border-border bg-muted">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2 sticky left-0 bg-card">Capacidade</th>
              {roles.map((r) => (
                <th key={r} className="px-3 py-2 text-center whitespace-nowrap">{r}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allCaps.map((cap) => (
              <tr key={cap} className="border-t border-border">
                <td className="px-4 py-2 font-mono text-xs text-foreground sticky left-0 bg-card">{cap}</td>
                {roles.map((r) => {
                  const has = (matrix[r] as readonly Cap[]).includes(cap);
                  return (
                    <td key={r} className="px-3 py-2 text-center">
                      {has ? (
                        <span className="text-primary font-semibold">●</span>
                      ) : (
                        <span className="text-muted-foreground/40">·</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PermissoesPage() {
  const platformRoles: PlatformRole[] = ["super_admin", "support_admin", "security_auditor"];
  const storeRoles: MembershipRole[] = ["owner", "manager", "seller", "stock_operator", "auditor"];

  return (
    <ControlShell title="Permissões">
      <p className="text-sm text-muted-foreground mb-6 max-w-3xl">
        Fonte única de verdade da autorização. Toda checagem no servidor consulta esta matriz.
        Overrides por usuário ainda não são suportados nesta fase — para alterar capacidades, mude o papel do usuário.
      </p>

      <Matrix<PlatformRole, PlatformCapability>
        title="Central de Controle (platform_admins)"
        roles={platformRoles}
        matrix={PLATFORM_MATRIX}
      />

      <Matrix<MembershipRole, Capability>
        title="Loja (store_memberships)"
        roles={storeRoles}
        matrix={STORE_MATRIX}
      />
    </ControlShell>
  );
}