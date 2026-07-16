import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getPlatformAdminSelf, listStoresForControl } from "@/lib/authz.functions";
import { createAccount } from "@/lib/platform.functions";
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
  const createAccountFn = useServerFn(createAccount);
  const listStoresFn = useServerFn(listStoresForControl);
  const stores = useQuery({ queryKey: ["control", "stores"], queryFn: () => listStoresFn() });

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [storeId, setStoreId] = useState<string>("none");
  const [role, setRole] = useState<string>("seller");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await createAccountFn({
        data: {
          email,
          displayName,
          password,
          storeId: storeId !== "none" ? storeId : undefined,
          role: storeId !== "none" ? role : undefined,
        },
      });
      toast.success("Conta criada");
      navigate({ to: "/control/contas" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao criar conta");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ControlShell title="Nova conta">
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
        <div>
          <Label htmlFor="password">Senha inicial (mín. 8)</Label>
          <Input
            id="password"
            type="password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <div className="pt-4 border-t border-neutral-800 space-y-4">
          <h2 className="text-sm font-medium text-neutral-300">Vínculo opcional à loja</h2>
          <div>
            <Label>Loja</Label>
            <Select value={storeId} onValueChange={setStoreId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem vínculo</SelectItem>
                {stores.data?.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {storeId !== "none" && (
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
          )}
        </div>
        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={loading}>
            {loading ? "Criando..." : "Criar conta"}
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
    </ControlShell>
  );
}
