import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { acceptInvite } from "@/lib/team.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/invite/$token")({
  component: InvitePage,
});

function InvitePage() {
  const { token } = useParams({ from: "/invite/$token" });
  const navigate = useNavigate();
  const acceptFn = useServerFn(acceptInvite);
  const [state, setState] = useState<"checking" | "need_auth" | "accepting" | "done" | "error">(
    "checking",
  );
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        setState("need_auth");
        return;
      }
      setState("accepting");
      acceptFn({ data: { token } })
        .then(() => {
          setState("done");
          toast.success("Você entrou na equipe");
          setTimeout(() => navigate({ to: "/admin", replace: true }), 1200);
        })
        .catch((e) => {
          setState("error");
          setMessage(e instanceof Error ? e.message : "Falha ao aceitar convite");
        });
    });
  }, [token, acceptFn, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold">Convite de equipe</h1>
        {state === "checking" && (
          <p className="mt-4 text-sm text-muted-foreground">Verificando...</p>
        )}
        {state === "need_auth" && (
          <>
            <p className="mt-4 text-sm text-muted-foreground">
              Faça login com o email convidado para aceitar.
            </p>
            <Button
              className="mt-6"
              onClick={() =>
                navigate({
                  to: "/auth",
                  search: { redirect: `/invite/${token}` } as never,
                })
              }
            >
              Fazer login
            </Button>
          </>
        )}
        {state === "accepting" && (
          <p className="mt-4 text-sm text-muted-foreground">Aceitando convite...</p>
        )}
        {state === "done" && (
          <p className="mt-4 text-sm text-green-500">Redirecionando ao painel...</p>
        )}
        {state === "error" && (
          <>
            <p className="mt-4 text-sm text-red-500">{message}</p>
            <Button className="mt-6" variant="outline" onClick={() => navigate({ to: "/" })}>
              Voltar
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
