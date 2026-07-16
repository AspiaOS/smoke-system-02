import { createFileRoute, Link, redirect } from "@tanstack/react-router";
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
import { getPlatformAdminSelf } from "@/lib/authz.functions";
import {
  getStoreDetail,
  setStoreStatus,
  transferStoreOwnership,
  removeMembership,
  revokeInvite,
} from "@/lib/platform.functions";
import { platformRoleHasCapability } from "@/lib/authz/matrix";

export const Route = createFileRoute("/control/lojas_/$id")({
  ssr: false,
  head: () => ({ meta: [{ title: "Loja — Smoke Control" }, { name: "robots", content: "noindex" }] }),
  beforeLoad: async () => {
    const admin = await getPlatformAdminSelf().catch(() => null);
    if (!admin) throw redirect({ to: "/control/login" });
    return { admin };
  },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData({
      queryKey: ["control", "store", params.id],
      queryFn: () => getStoreDetail({ data: { storeId: params.id } }),
    }),
  errorComponent: ({ error }) => (
    <ControlShell title="Loja">
      <div className="text-red-400 text-sm">Erro: {String((error as Error)?.message ?? error)}</div>
    </ControlShell>
  ),
  notFoundComponent: () => <ControlShell title="Loja"><div className="text-neutral-400">Loja não encontrada.</div></ControlShell>,
  component: LojaDetalhePage,
});

function LojaDetalhePage() {
  const { admin } = Route.useRouteContext();
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { data } = useSuspenseQuery({
    queryKey: ["control", "store", id],
    queryFn: () => getStoreDetail({ data: { storeId: id } }),
  });

  const setStatusFn = useServerFn(setStoreStatus);
  const transferFn = useServerFn(transferStoreOwnership);
  const removeFn = useServerFn(removeMembership);
  const revokeFn = useServerFn(revokeInvite);

  const canSuspend = platformRoleHasCapability(admin.role, "stores.suspend");
  const canReactivate = platformRoleHasCapability(admin.role, "stores.reactivate");
  const canTransfer = platformRoleHasCapability(admin.role, "stores.transfer_ownership");
  const canRemove = platformRoleHasCapability(admin.role, "memberships.remove");
  const canRevoke = platformRoleHasCapability(admin.role, "accounts.invite");

  const [busy, setBusy] = useState<string | null>(null);
  const [newOwner, setNewOwner] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["control", "store", id] });

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

  const activeMembers = data.members.filter((m) => m.status === "active");
  const currentOwners = activeMembers.filter((m) => m.role === "owner");
  const transferCandidates = activeMembers.filter((m) => m.role !== "owner");

  return (
    <ControlShell title={data.name}>
      <div className="mb-6">
        <Link to="/control/lojas" className="text-xs text-neutral-500 hover:text-neutral-300">← Voltar</Link>
      </div>

      <section className="border border-neutral-800 rounded-lg p-5 bg-[#111014] mb-6">
        <h2 className="text-sm uppercase tracking-wide text-neutral-500 mb-3">Dados</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-neutral-500 text-xs">Status</dt><dd>{data.status}</dd></div>
          <div><dt className="text-neutral-500 text-xs">Criada em</dt><dd>{new Date(data.created_at).toLocaleString("pt-BR")}</dd></div>
          <div><dt className="text-neutral-500 text-xs">Owner(s)</dt><dd>{currentOwners.map((o) => o.display_name || o.email).join(", ") || "—"}</dd></div>
          {data.suspended_at && (
            <div><dt className="text-neutral-500 text-xs">Suspensa em</dt><dd>{new Date(data.suspended_at).toLocaleString("pt-BR")}{data.suspended_reason ? ` — ${data.suspended_reason}` : ""}</dd></div>
          )}
        </dl>
        <div className="flex gap-2 mt-4">
          {data.status === "suspended" && canReactivate && (
            <Button size="sm" disabled={busy !== null} onClick={() => withBusy("act", () => setStatusFn({ data: { storeId: id, status: "active" } }), "Loja reativada")}>Reativar</Button>
          )}
          {data.status === "active" && canSuspend && (
            <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => {
              const reason = prompt("Motivo (opcional):") ?? undefined;
              withBusy("sus", () => setStatusFn({ data: { storeId: id, status: "suspended", reason } }), "Loja suspensa");
            }}>Suspender</Button>
          )}
        </div>
      </section>

      <section className="border border-neutral-800 rounded-lg p-5 bg-[#111014] mb-6">
        <h2 className="text-sm uppercase tracking-wide text-neutral-500 mb-3">Membros</h2>
        <table className="w-full text-sm">
          <thead className="text-neutral-500 text-xs uppercase">
            <tr><th className="text-left py-2">Nome</th><th className="text-left">Email</th><th className="text-left">Papel</th><th className="text-left">Status</th><th></th></tr>
          </thead>
          <tbody>
            {data.members.map((m) => (
              <tr key={m.user_id} className="border-t border-neutral-800">
                <td className="py-2">
                  <Link to="/control/contas/$id" params={{ id: m.user_id }} className="text-violet-300 hover:underline">
                    {m.display_name || m.email || m.user_id}
                  </Link>
                </td>
                <td className="text-neutral-400">{m.email}</td>
                <td>{m.role}</td>
                <td className="text-neutral-400">{m.status}</td>
                <td className="text-right">
                  {canRemove && m.status === "active" && (
                    <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => {
                      if (!confirm(`Remover ${m.display_name || m.email}?`)) return;
                      withBusy(`rem-${m.user_id}`, () => removeFn({ data: { userId: m.user_id, storeId: id } }), "Removido");
                    }}>Remover</Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {canTransfer && transferCandidates.length > 0 && (
        <section className="border border-neutral-800 rounded-lg p-5 bg-[#111014] mb-6">
          <h2 className="text-sm uppercase tracking-wide text-neutral-500 mb-3">Transferir propriedade</h2>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Select value={newOwner} onValueChange={setNewOwner}>
                <SelectTrigger><SelectValue placeholder="Escolha o novo dono" /></SelectTrigger>
                <SelectContent>
                  {transferCandidates.map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {m.display_name || m.email} — {m.role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="destructive"
              disabled={!newOwner || busy !== null}
              onClick={() => {
                if (!confirm("Transferir propriedade? O owner atual vira gerente.")) return;
                withBusy("transfer", () => transferFn({ data: { storeId: id, newOwnerUserId: newOwner } }), "Propriedade transferida");
                setNewOwner("");
              }}
            >
              Transferir
            </Button>
          </div>
          <p className="text-xs text-neutral-500 mt-2">A operação é atômica: o(s) owner(s) atual(is) são rebaixados a gerente e o alvo é promovido a owner na mesma transação.</p>
        </section>
      )}

      {data.pending_invitations.length > 0 && (
        <section className="border border-neutral-800 rounded-lg p-5 bg-[#111014]">
          <h2 className="text-sm uppercase tracking-wide text-neutral-500 mb-3">Convites pendentes</h2>
          <table className="w-full text-sm">
            <thead className="text-neutral-500 text-xs uppercase">
              <tr><th className="text-left py-2">Email</th><th className="text-left">Papel</th><th className="text-left">Expira</th><th></th></tr>
            </thead>
            <tbody>
              {data.pending_invitations.map((i) => (
                <tr key={i.id} className="border-t border-neutral-800">
                  <td className="py-2">{i.email}</td>
                  <td>{i.role}</td>
                  <td className="text-neutral-500">{new Date(i.expires_at).toLocaleDateString("pt-BR")}</td>
                  <td className="text-right">
                    {canRevoke && (
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
    </ControlShell>
  );
}