import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getPlatformAdminSelf } from "@/lib/authz.functions";
import { createStore } from "@/lib/platform.functions";
import { ControlShell } from "@/components/control/ControlShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { platformRoleHasCapability } from "@/lib/authz/matrix";

export const Route = createFileRoute("/control/lojas_/nova")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/control/login" });
    const me = await getPlatformAdminSelf();
    if (!me || !platformRoleHasCapability(me.role, "stores.create")) {
      throw redirect({ to: "/control" });
    }
  },
  component: NovaLojaPage,
});

function NovaLojaPage() {
  const navigate = useNavigate();
  const createStoreFn = useServerFn(createStore);
  const [storeName, setStoreName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [invite, setInvite] = useState<{
    link: string;
    expiresAt: string;
    userAlreadyExists: boolean;
  } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await createStoreFn({
        data: { storeName, ownerEmail, ownerName },
      });
      const inviteLink =
        typeof window !== "undefined"
          ? `${window.location.origin}${res.link}`
          : res.link;
      setInvite({
        link: inviteLink,
        expiresAt: res.expiresAt,
        userAlreadyExists: res.userAlreadyExists,
      });
      toast.success("Loja criada — envie o convite ao dono");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao criar loja");
    } finally {
      setLoading(false);
    }
  }

  if (invite) {
    return (
      <ControlShell title="Nova loja">
        <div className="max-w-xl space-y-4">
          <h2 className="text-sm font-medium text-foreground">
            Loja criada. Envie o link de convite ao dono.
          </h2>
          <p className="text-sm text-muted-foreground">
            O dono precisa abrir o link, autenticar-se com{" "}
            <span className="font-medium">{ownerEmail}</span> e aceitar o convite para
            ativar a propriedade da loja.
            {invite.userAlreadyExists
              ? " Esse email já tem conta na plataforma."
              : " Esse email ainda não tem conta — ele precisará se cadastrar antes de aceitar."}
          </p>
          <div className="rounded-md border border-border bg-muted/30 p-3 text-sm break-all font-mono">
            {invite.link}
          </div>
          <p className="text-xs text-muted-foreground">
            Expira em {new Date(invite.expiresAt).toLocaleString("pt-BR")}.
          </p>
          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              onClick={() => {
                if (typeof navigator !== "undefined" && navigator.clipboard) {
                  navigator.clipboard.writeText(invite.link);
                  toast.success("Link copiado");
                }
              }}
            >
              Copiar link
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate({ to: "/control/lojas" })}
            >
              Voltar às lojas
            </Button>
          </div>
        </div>
      </ControlShell>
    );
  }

  return (
    <ControlShell title="Nova loja">
      <form onSubmit={onSubmit} className="max-w-xl space-y-5">
        <div>
          <Label htmlFor="storeName">Nome da loja</Label>
          <Input
            id="storeName"
            value={storeName}
            onChange={(e) => setStoreName(e.target.value)}
            required
          />
        </div>
        <div className="pt-4 border-t border-border">
          <h2 className="text-sm font-medium text-foreground mb-3">Dono da loja</h2>
          <p className="text-xs text-muted-foreground mb-3">
            O dono receberá um link de convite e definirá a própria senha ao aceitar.
          </p>
          <div className="space-y-4">
            <div>
              <Label htmlFor="ownerName">Nome</Label>
              <Input
                id="ownerName"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="ownerEmail">Email</Label>
              <Input
                id="ownerEmail"
                type="email"
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                required
              />
            </div>
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={loading}>
            {loading ? "Criando..." : "Criar loja e convidar dono"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate({ to: "/control/lojas" })}
          >
            Cancelar
          </Button>
        </div>
      </form>
    </ControlShell>
  );
}
