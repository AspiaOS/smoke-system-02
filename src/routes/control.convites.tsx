import { createFileRoute, redirect } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ControlShell } from "@/components/control/ControlShell";
import { Button } from "@/components/ui/button";
import { getPlatformAdminSelf } from "@/lib/authz.functions";
import { listPendingInvites, resendInvite, revokeInvite } from "@/lib/platform.functions";
import { platformRoleHasCapability } from "@/lib/authz/matrix";

export const Route = createFileRoute("/control/convites")({
  ssr: false,
  head: () => ({ meta: [{ title: "Convites — Smoke Control" }, { name: "robots", content: "noindex" }] }),
  beforeLoad: async () => {
    const admin = await getPlatformAdminSelf().catch(() => null);
    if (!admin) throw redirect({ to: "/control/login" });
    return { admin };
  },
  loader: ({ context }) =>
    context.queryClient.ensureQueryData({
      queryKey: ["control", "invites"],
      queryFn: () => listPendingInvites(),
    }),
  errorComponent: ({ error }) => (
    <ControlShell title="Convites">
      <div className="text-red-400 text-sm">Erro: {String((error as Error)?.message ?? error)}</div>
    </ControlShell>
  ),
  notFoundComponent: () => <div className="p-8 text-muted-foreground">Página não encontrada.</div>,
  component: InvitesPage,
});

function InvitesPage() {
  const { admin } = Route.useRouteContext();
  const qc = useQueryClient();
  const { data } = useSuspenseQuery({
    queryKey: ["control", "invites"],
    queryFn: () => listPendingInvites(),
  });
  const resendFn = useServerFn(resendInvite);
  const revokeFn = useServerFn(revokeInvite);
  const canManage = platformRoleHasCapability(admin.role, "accounts.invite");

  const [busy, setBusy] = useState<string | null>(null);
  const [lastLink, setLastLink] = useState<string | null>(null);

  async function withBusy(key: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(key);
    try {
      await fn();
      toast.success(ok);
      qc.invalidateQueries({ queryKey: ["control", "invites"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha");
    } finally {
      setBusy(null);
    }
  }

  async function handleResend(id: string) {
    setBusy(`re-${id}`);
    try {
      const r = await resendFn({ data: { invitationId: id } });
      const link = `${window.location.origin}${r.link}`;
      setLastLink(link);
      await navigator.clipboard.writeText(link).catch(() => {});
      toast.success("Convite reenviado; link copiado.");
      qc.invalidateQueries({ queryKey: ["control", "invites"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha");
    } finally {
      setBusy(null);
    }
  }

  return (
    <ControlShell title="Convites pendentes">
      {lastLink && (
        <div className="mb-4 border border-primary/30 bg-primary/5 rounded-lg p-3 text-xs">
          <div className="text-muted-foreground mb-1">Novo link (copiado):</div>
          <code className="text-foreground break-all">{lastLink}</code>
        </div>
      )}
      {data.length === 0 ? (
        <div className="text-muted-foreground text-sm py-16 text-center border border-dashed border-border rounded-lg">
          Nenhum convite pendente.
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-3">Email</th>
                <th className="text-left px-4 py-3">Loja</th>
                <th className="text-left px-4 py-3">Papel</th>
                <th className="text-left px-4 py-3">Convidado por</th>
                <th className="text-left px-4 py-3">Expira</th>
                <th className="text-right px-4 py-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <td className="px-4 py-3">{row.email}</td>
                  <td className="px-4 py-3">{row.store_name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{row.role}</td>
                  <td className="px-4 py-3 text-muted-foreground">{row.invited_by_email ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={row.expired ? "text-amber-300" : "text-muted-foreground"}>
                      {new Date(row.expires_at).toLocaleDateString("pt-BR")}
                      {row.expired && " (expirado)"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canManage && (
                      <div className="inline-flex gap-1">
                        <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => handleResend(row.id)}>
                          Reenviar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy !== null}
                          onClick={() => {
                            if (!confirm(`Cancelar convite para ${row.email}?`)) return;
                            withBusy(`rv-${row.id}`, () => revokeFn({ data: { invitationId: row.id } }), "Convite cancelado");
                          }}
                        >
                          Cancelar
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted-foreground mt-4">{data.length} convite(s) pendente(s).</p>
    </ControlShell>
  );
}