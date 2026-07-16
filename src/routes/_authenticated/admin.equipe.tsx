import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCapabilities } from "@/hooks/use-capabilities";
import {
  listMembers,
  listInvites,
  createInvite,
  cancelInvite,
  changeMemberRole,
  suspendMember,
  reactivateMember,
  removeMember,
} from "@/lib/team.functions";
import type { MembershipRole } from "@/lib/authz/matrix";
import { Copy, Trash2, UserX, UserCheck, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/equipe")({
  component: EquipePage,
});

const ROLE_LABELS: Record<MembershipRole, string> = {
  owner: "Dono",
  manager: "Gerente",
  seller: "Vendedor",
  stock_operator: "Estoque",
  auditor: "Auditor",
};

const INVITABLE_ROLES: MembershipRole[] = ["manager", "seller", "stock_operator", "auditor"];

function EquipePage() {
  const qc = useQueryClient();
  const { can } = useCapabilities();
  const listMembersFn = useServerFn(listMembers);
  const listInvitesFn = useServerFn(listInvites);
  const createInviteFn = useServerFn(createInvite);
  const cancelInviteFn = useServerFn(cancelInvite);
  const changeRoleFn = useServerFn(changeMemberRole);
  const suspendFn = useServerFn(suspendMember);
  const reactivateFn = useServerFn(reactivateMember);
  const removeFn = useServerFn(removeMember);

  const members = useQuery({ queryKey: ["team", "members"], queryFn: () => listMembersFn() });
  const invites = useQuery({ queryKey: ["team", "invites"], queryFn: () => listInvitesFn() });

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MembershipRole>("seller");
  const [lastLink, setLastLink] = useState<string | null>(null);

  const inviteMut = useMutation({
    mutationFn: (v: { email: string; role: MembershipRole }) =>
      createInviteFn({ data: v }),
    onSuccess: (r) => {
      const link = `${window.location.origin}${r.link}`;
      setLastLink(link);
      setEmail("");
      void navigator.clipboard.writeText(link).catch(() => {});
      toast.success("Convite criado. Link copiado.");
      qc.invalidateQueries({ queryKey: ["team", "invites"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao criar convite"),
  });

  function refresh() {
    qc.invalidateQueries({ queryKey: ["team"] });
  }

  const canInvite = can("members.invite");
  const canChangeRole = can("members.change_role");
  const canSuspend = can("members.suspend");
  const canRemove = can("members.remove");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Equipe</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gerencie os membros da loja e envie convites por link.
        </p>
      </div>

      {canInvite && (
        <section className="rounded-2xl border border-border bg-surface p-6">
          <h2 className="text-lg font-semibold">Convidar por link</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Ao criar o convite, um link único é gerado e copiado. Compartilhe apenas com a pessoa convidada.
          </p>
          <form
            className="mt-4 grid gap-3 sm:grid-cols-[1fr,180px,auto]"
            onSubmit={(e) => {
              e.preventDefault();
              if (!email.trim()) return;
              inviteMut.mutate({ email: email.trim(), role });
            }}
          >
            <div>
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="pessoa@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <Label>Papel</Label>
              <Select value={role} onValueChange={(v) => setRole(v as MembershipRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INVITABLE_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={inviteMut.isPending}>
                {inviteMut.isPending ? "Criando..." : "Gerar convite"}
              </Button>
            </div>
          </form>

          {lastLink && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-background p-3 text-sm">
              <code className="flex-1 truncate">{lastLink}</code>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  void navigator.clipboard.writeText(lastLink);
                  toast.success("Link copiado");
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          )}
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold">Membros</h2>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-contrast text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Papel</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {members.isLoading && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    Carregando...
                  </td>
                </tr>
              )}
              {members.data?.map((m) => (
                <tr key={m.id} className="border-t border-border">
                  <td className="px-4 py-3">{m.display_name ?? "—"}</td>
                  <td className="px-4 py-3">{m.email ?? "—"}</td>
                  <td className="px-4 py-3">
                    {canChangeRole && m.role !== "owner" ? (
                      <Select
                        value={m.role}
                        onValueChange={(v) => {
                          changeRoleFn({ data: { id: m.id, role: v as MembershipRole } })
                            .then(() => {
                              toast.success("Papel atualizado");
                              refresh();
                            })
                            .catch((e) =>
                              toast.error(e instanceof Error ? e.message : "Falha"),
                            );
                        }}
                      >
                        <SelectTrigger className="h-8 w-[140px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {INVITABLE_ROLES.map((r) => (
                            <SelectItem key={r} value={r}>
                              {ROLE_LABELS[r]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      ROLE_LABELS[m.role]
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        m.status === "active"
                          ? "text-green-500"
                          : m.status === "suspended"
                            ? "text-yellow-500"
                            : "text-red-500"
                      }
                    >
                      {m.status === "active"
                        ? "Ativo"
                        : m.status === "suspended"
                          ? "Suspenso"
                          : "Removido"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {m.role !== "owner" && (
                      <div className="flex justify-end gap-1">
                        {canSuspend && m.status === "active" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              suspendFn({ data: { id: m.id } })
                                .then(() => {
                                  toast.success("Suspenso");
                                  refresh();
                                })
                                .catch((e) =>
                                  toast.error(e instanceof Error ? e.message : "Falha"),
                                )
                            }
                          >
                            <UserX className="h-4 w-4" />
                          </Button>
                        )}
                        {canSuspend && m.status === "suspended" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              reactivateFn({ data: { id: m.id } })
                                .then(() => {
                                  toast.success("Reativado");
                                  refresh();
                                })
                                .catch((e) =>
                                  toast.error(e instanceof Error ? e.message : "Falha"),
                                )
                            }
                          >
                            <UserCheck className="h-4 w-4" />
                          </Button>
                        )}
                        {canRemove && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              if (!confirm("Remover este membro?")) return;
                              removeFn({ data: { id: m.id } })
                                .then(() => {
                                  toast.success("Removido");
                                  refresh();
                                })
                                .catch((e) =>
                                  toast.error(e instanceof Error ? e.message : "Falha"),
                                );
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {members.data?.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    Nenhum membro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Convites</h2>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-contrast text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Papel</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Expira</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {invites.data?.map((i) => (
                <tr key={i.id} className="border-t border-border">
                  <td className="px-4 py-3">{i.email}</td>
                  <td className="px-4 py-3">{ROLE_LABELS[i.role]}</td>
                  <td className="px-4 py-3">{i.status}</td>
                  <td className="px-4 py-3">
                    {new Date(i.expires_at).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canInvite && i.status === "pending" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          cancelInviteFn({ data: { id: i.id } })
                            .then(() => {
                              toast.success("Cancelado");
                              refresh();
                            })
                            .catch((e) =>
                              toast.error(e instanceof Error ? e.message : "Falha"),
                            )
                        }
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {invites.data?.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    Sem convites.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
