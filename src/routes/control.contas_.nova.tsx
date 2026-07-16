import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getPlatformAdminSelf, listStoresForControl } from "@/lib/authz.functions";
import { inviteAccount } from "@/lib/platform.functions";
import { ControlShell } from "@/components/control/ControlShell";
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
import { platformRoleHasCapability } from "@/lib/authz/matrix";

export const Route = createFileRoute("/control/contas_/nova")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/control/login" });
    const me = await getPlatformAdminSelf();
    if (!me || !platformRoleHasCapability(me.role, "accounts.invite")) {
      throw redirect({ to: "/control" });
    }
  },
  component: NovaContaPage,
});

const ROLES = ["manager", "seller", "stock_operator", "auditor"] as const;

function NovaContaPage() {
  const navigate = useNavigate();
  const inviteFn = useServerFn(inviteAccount);
  const listStoresFn = useServerFn(listStoresForControl);
  const stores = useQuery({ queryKey: ["control", "stores"], queryFn: () => listStoresFn() });

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [storeId, setStoreId] = useState<string>("");
  const [role, setRole] = useState<string>("seller");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<
    | {
        link: string;
        expiresAt: string;
        userAlreadyExists: boolean;
      }
    | null
  >(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!storeId) {
      toast.error("Selecione a loja do convite");
      return;
    }
    setLoading(true);
    try {
      const res = await inviteFn({
        data: { email, displayName, storeId, role },
      });
      const fullLink = `${window.location.origin}${res.link}`;
      setResult({
        link: fullLink,
        expiresAt: res.expiresAt,
        userAlreadyExists: res.userAlreadyExists,
      });
      toast.success("Convite gerado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao gerar convite");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ControlShell title="Convidar conta">
      {result ? (
        <div className="max-w-xl space-y-5">
          <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-100">
            <p className="font-medium">Convite pronto para envio.</p>
            <p className="mt-1 text-emerald-200/80">
              Compartilhe este link com {email}. Ele expira em{" "}
              {new Date(result.expiresAt).toLocaleString("pt-BR")}.
            </p>
            {result.userAlreadyExists && (
              <p className="mt-2 text-emerald-200/80">
                O email já tem cadastro — basta que a pessoa faça login e abra o link.
              </p>
            )}
          </div>
          <div>
            <Label>Link do convite</Label>
            <div className="flex gap-2 mt-1">
              <Input readOnly value={result.link} onFocus={(e) => e.currentTarget.select()} />
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(result.link);
                    toast.success("Link copiado");
                  } catch {
                    toast.error("Não foi possível copiar");
                  }
                }}
              >
                Copiar
              </Button>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" onClick={() => navigate({ to: "/control/contas" })}>
              Voltar para contas
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setResult(null);
                setDisplayName("");
                setEmail("");
                setStoreId("");
                setRole("seller");
              }}
            >
              Enviar outro convite
            </Button>
          </div>
        </div>
      ) : (
      <form onSubmit={onSubmit} className="max-w-xl space-y-5">
        <div>
          <Label htmlFor="displayName">Nome</Label>
          <Input
            id="displayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="pt-4 border-t border-border space-y-4">
          <h2 className="text-sm font-medium text-neutral-300">Loja e papel (obrigatórios)</h2>
          <div>
            <Label>Loja</Label>
            <Select value={storeId} onValueChange={setStoreId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma loja" />
              </SelectTrigger>
              <SelectContent>
                {stores.data?.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Papel</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={loading || !storeId}>
            {loading ? "Gerando..." : "Gerar convite"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate({ to: "/control/contas" })}
          >
            Cancelar
          </Button>
        </div>
      </form>
      )}
    </ControlShell>
  );
}
