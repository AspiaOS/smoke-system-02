import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ControlShell } from "@/components/control/ControlShell";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getPlatformAdminSelf, listStoresForControl } from "@/lib/authz.functions";
import {
  getAccountDetail,
  setAccountStatus,
  assignMembership,
  removeMembership,
  revokeInvite,
} from "@/lib/platform.functions";
import { platformRoleHasCapability } from "@/lib/authz/matrix";

const ROLES = ["owner", "manager", "seller", "stock_operator", "auditor"] as const;

export const Route = createFileRoute("/control/contas_/$id")({
  ssr: false,
  head: () => ({ meta: [{ title: "Conta — Smoke Control" }, { name: "robots", content: "noindex" }] }),
  beforeLoad: async () => {
    const admin = await getPlatformAdminSelf().catch(() => null);
    if (!admin) throw redirect({ to: "/control/login" });
    return { admin };
  },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData({
      queryKey: ["control", "account", params.id],
      queryFn: () => getAccountDetail({ data: { userId: params.id } }),
    }),
  errorComponent: ({ error }) => (
    <ControlShell title="Conta">
      <div className="text-red-400 text-sm">Erro: {String((error as Error)?.message ?? error)}</div>
    </ControlShell>
  ),
  notFoundComponent: () => <ControlShell title="Conta"><div className="text-muted-foreground">Conta não encontrada.</div></ControlShell>,
  component: ContaDetalhePage,
});

function ContaDetalhePage() {
  const { admin } = Route.useRouteContext();
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data } = useSuspenseQuery({
    queryKey: ["control", "account", id],
    queryFn: () => getAccountDetail({ data: { userId: id } }),
  });
  const { data: stores } = useSuspenseQuery({
    queryKey: ["control", "stores"],
    queryFn: () => listStoresForControl(),
  });

  const setStatusFn = useServerFn(setAccountStatus);
  const assignFn = useServerFn(assignMembership);
  const removeFn = useServerFn(removeMembership);
  const revokeFn = useServerFn(revokeInvite);

  const canSuspend = platformRoleHasCapability(admin.role, "accounts.suspend");
  const canReactivate = platformRoleHasCapability(admin.role, "accounts.reactivate");
  const canArchive = platformRoleHasCapability(admin.role, "accounts.archive");
  const canChangeRole = platformRoleHasCapability(admin.role, "memberships.change_role");
  const canRemoveMember = platformRoleHasCapability(admin.role, "memberships.remove");
  const canRevokeInvite = platformRoleHasCapability(admin.role, "accounts.invite");

  const [busy, setBusy] = useState<string | null>(null);
  const [newStoreId, setNewStoreId] = useState("");
  const [newRole, setNewRole] = useState<string>("seller");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["control", "account", id] });

  async function withBusy(key: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(key);
    try {
      await fn();
      toast.success(ok);
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha");
    } finally {
      setBusy(null);
    }
  }

  return (
    <ControlShell title={data.display_name || data.email || "Conta"}>
      <div className="mb-6">
        <Link to="/control/contas" className="text-xs text-muted-foreground hover:text-foreground">← Voltar</Link>
      </div>

      <section className="border border-border rounded-lg p-5 bg-card mb-6">
        <h2 className="text-sm uppercase tracking-wide text-muted-foreground mb-3">Dados</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-muted-foreground text-xs">Email</dt><dd>{data.email || "—"}</dd></div>
          <div><dt className="text-muted-foreground text-xs">Status</dt><dd>{data.status}</dd></div>
          <div><dt className="text-muted-foreground text-xs">Papel plataforma</dt><dd>{data.platform_role ?? "—"}</dd></div>
          <div><dt className="text-muted-foreground text-xs">Criada em</dt><dd>{new Date(data.created_at).toLocaleString("pt-BR")}</dd></div>
          <div><dt className="text-muted-foreground text-xs">Último acesso</dt><dd>{data.last_seen_at ? new Date(data.last_seen_at).toLocaleString("pt-BR") : "—"}</dd></div>
        </dl>
        <div className="flex gap-2 mt-4">
          {data.status !== "active" && canReactivate && (
            <Button size="sm" disabled={busy !== null} onClick={() => withBusy("act", () => setStatusFn({ data: { userId: id, status: "active" } }), "Conta reativada")}>
              Reativar
            </Button>
          )}
          {data.status === "active" && canSuspend && (
            <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => withBusy("sus", () => setStatusFn({ data: { userId: id, status: "suspended" } }), "Conta suspensa")}>
              Suspender
            </Button>
          )}
          {data.status !== "archived" && canArchive && (
            <Button size="sm" variant="destructive" disabled={busy !== null} onClick={() => {
              if (!confirm("Arquivar essa conta? Não desfaz.")) return;
              withBusy("arc", () => setStatusFn({ data: { userId: id, status: "archived" } }), "Conta arquivada");
            }}>
              Arquivar
            </Button>
          )}
        </div>
      </section>

      <section className="border border-border rounded-lg p-5 bg-card mb-6">
        <h2 className="text-sm uppercase tracking-wide text-muted-foreground mb-3">Memberships</h2>
        {data.memberships.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem vínculos.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-muted-foreground text-xs uppercase">
              <tr><th className="text-left py-2">Loja</th><th className="text-left">Papel</th><th className="text-left">Status</th><th></th></tr>
            </thead>
            <tbody>
              {data.memberships.map((m) => (
                <tr key={m.store_id} className="border-t border-border">
                  <td className="py-2">
                    <Link to="/control/lojas/$id" params={{ id: m.store_id }} className="text-primary hover:underline">
                      {m.store_name}
                    </Link>
                  </td>
                  <td>
                    {canChangeRole ? (
                      <Select value={m.role} onValueChange={(v) => withBusy(`role-${m.store_id}`, () => assignFn({ data: { userId: id, storeId: m.store_id, role: v } }), "Papel atualizado")}>
                        <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : m.role}
                  </td>
                  <td className="text-muted-foreground">{m.status}</td>
                  <td className="text-right">
                    {canRemoveMember && m.status === "active" && (
                      <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => {
                        if (!confirm(`Remover vínculo em ${m.store_name}?`)) return;
                        withBusy(`rem-${m.store_id}`, () => removeFn({ data: { userId: id, storeId: m.store_id } }), "Vínculo removido");
                      }}>Remover</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {canChangeRole && (
          <div className="mt-4 flex gap-2 items-end border-t border-border pt-4">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">Adicionar vínculo</label>
              <Select value={newStoreId} onValueChange={setNewStoreId}>
                <SelectTrigger><SelectValue placeholder="Loja" /></SelectTrigger>
                <SelectContent>
                  {(stores ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Papel</label>
              <Select value={newRole} onValueChange={setNewRole}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button disabled={!newStoreId || busy !== null} onClick={() => withBusy("add", () => assignFn({ data: { userId: id, storeId: newStoreId, role: newRole } }), "Vínculo adicionado")}>
              Adicionar
            </Button>
          </div>
        )}
      </section>

      {data.invitations.length > 0 && (
        <section className="border border-border rounded-lg p-5 bg-card mb-6">
          <h2 className="text-sm uppercase tracking-wide text-muted-foreground mb-3">Convites</h2>
          <table className="w-full text-sm">
            <thead className="text-muted-foreground text-xs uppercase">
              <tr><th className="text-left py-2">Loja</th><th className="text-left">Papel</th><th className="text-left">Status</th><th className="text-left">Expira</th><th></th></tr>
            </thead>
            <tbody>
              {data.invitations.map((i) => (
                <tr key={i.id} className="border-t border-border">
                  <td className="py-2">{i.store_name}</td>
                  <td>{i.role}</td>
                  <td className="text-muted-foreground">{i.status}</td>
                  <td className="text-muted-foreground">{new Date(i.expires_at).toLocaleDateString("pt-BR")}</td>
                  <td className="text-right">
                    {i.status === "pending" && canRevokeInvite && (
                      <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => withBusy(`inv-${i.id}`, () => revokeFn({ data: { invitationId: i.id } }), "Convite revogado")}>
                        Revogar
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {data.recent_events.length > 0 && (
        <section className="border border-border rounded-lg p-5 bg-card">
          <h2 className="text-sm uppercase tracking-wide text-muted-foreground mb-3">Eventos recentes</h2>
          <ul className="space-y-2 text-sm">
            {data.recent_events.map((e) => (
              <li key={e.id} className="border-t border-border pt-2">
                <div className="flex justify-between">
                  <span className="text-foreground">{e.action}</span>
                  <span className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString("pt-BR")}</span>
                </div>
                {e.payload_json && <pre className="text-xs text-muted-foreground mt-1 overflow-x-auto">{e.payload_json}</pre>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </ControlShell>
  );
}