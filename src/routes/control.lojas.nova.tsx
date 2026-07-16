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

export const Route = createFileRoute("/control/lojas/nova")({
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
  const [ownerPassword, setOwnerPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await createStoreFn({
        data: { storeName, ownerEmail, ownerName, ownerPassword },
      });
      toast.success("Loja criada");
      navigate({ to: "/control/lojas" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao criar loja");
    } finally {
      setLoading(false);
    }
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
        <div className="pt-4 border-t border-neutral-800">
          <h2 className="text-sm font-medium text-neutral-300 mb-3">Dono da loja</h2>
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
            <div>
              <Label htmlFor="ownerPassword">Senha inicial (mín. 8)</Label>
              <Input
                id="ownerPassword"
                type="password"
                minLength={8}
                value={ownerPassword}
                onChange={(e) => setOwnerPassword(e.target.value)}
                required
              />
            </div>
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={loading}>
            {loading ? "Criando..." : "Criar loja e dono"}
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
