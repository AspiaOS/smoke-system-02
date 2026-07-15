import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/admin", replace: true });
    });
  }, [navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/admin", replace: true });
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/admin`,
            data: { display_name: displayName || email.split("@")[0] },
          },
        });
        if (error) throw error;
        toast.success("Conta criada. Verifique seu email para confirmar.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao autenticar";
      toast.error(
        msg.toLowerCase().includes("invalid") ? "Email ou senha incorretos." : msg,
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* soft lime glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-40 top-1/3 h-[520px] w-[520px] rounded-full opacity-25 blur-[120px]"
        style={{ background: "var(--color-primary)" }}
      />

      <header className="relative z-10 flex items-center justify-between px-6 py-6 md:px-10">
        <Link to="/" className="flex items-baseline gap-0.5">
          <span className="font-display text-3xl font-bold tracking-tight">SMOKE</span>
          <span className="text-3xl font-bold text-primary">.</span>
        </Link>
        <div className="flex flex-col items-end">
          <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Entrar
          </span>
          <span className="mt-1 h-px w-10 bg-primary" />
        </div>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-md flex-col px-6 pb-16">
        <section className="rounded-[28px] border border-border bg-surface/90 p-7 backdrop-blur">
          <h1 className="font-display text-4xl font-bold leading-[1.05] tracking-tight">
            {mode === "signin" ? (
              <>
                Bem-vindo<br />de volta
              </>
            ) : (
              <>
                Criar<br />conta
              </>
            )}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Painel restrito ao time da loja.
          </p>

          <form onSubmit={onSubmit} className="mt-7 space-y-5">
            {mode === "signup" && (
              <Field label="Nome">
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Seu nome"
                  className="w-full rounded-full bg-surface-contrast px-5 py-3.5 text-sm text-foreground outline-none ring-1 ring-border transition focus:ring-primary"
                />
              </Field>
            )}

            <Field label="Email">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@dominio.com"
                autoComplete="email"
                className="w-full rounded-full bg-surface-contrast px-5 py-3.5 text-sm text-foreground outline-none ring-1 ring-border transition placeholder:text-muted-foreground focus:ring-primary"
              />
            </Field>

            <Field label="Senha">
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                placeholder="••••••••"
                className="w-full rounded-full bg-surface-contrast px-5 py-3.5 text-sm text-foreground outline-none ring-1 ring-border transition placeholder:text-muted-foreground focus:ring-primary"
              />
            </Field>

            <button
              type="submit"
              disabled={loading}
              className="group flex w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-4 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-60"
            >
              {loading ? "Aguarde…" : mode === "signin" ? "Entrar" : "Criar conta"}
              <ArrowUpRight className="h-4 w-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </button>

            <button
              type="button"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              className="block w-full text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground transition hover:text-foreground"
            >
              {mode === "signin"
                ? "Primeiro acesso? Criar conta"
                : "Já tenho conta — entrar"}
            </button>
          </form>
        </section>

        <Link
          to="/"
          className="mx-auto mt-8 inline-flex items-center gap-2 rounded-full border border-border bg-surface-contrast px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Voltar à vitrine
        </Link>
      </main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
