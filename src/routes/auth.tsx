import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowUpRight, Eye, EyeOff } from "lucide-react";
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
  const [showPassword, setShowPassword] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  async function routeAfterAuth(userId: string) {
    const { data } = await supabase
      .from("platform_admins")
      .select("active")
      .eq("user_id", userId)
      .eq("active", true)
      .maybeSingle();
    navigate({ to: data ? "/control" : "/admin", replace: true });
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) void routeAfterAuth(data.session.user.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  function validate(): boolean {
    const next: { email?: string; password?: string } = {};
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) next.email = "E-mail inválido";
    if (!password || password.length < 6) next.password = "Senha deve ter ao menos 6 caracteres";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          const msg = error.message.toLowerCase();
          if (msg.includes("invalid")) {
            setErrors({ password: "E-mail ou senha incorretos" });
          } else {
            toast.error(error.message);
          }
          return;
        }
        const { data: sess } = await supabase.auth.getSession();
        if (sess.session) await routeAfterAuth(sess.session.user.id);
        else navigate({ to: "/admin", replace: true });

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
      toast.error(err instanceof Error ? err.message : "Falha ao autenticar");
    } finally {
      setLoading(false);
    }
  }

  async function onForgotPassword() {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErrors({ email: "Informe seu e-mail para recuperar a senha" });
      return;
    }
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth`,
      });
      if (error) throw error;
      toast.success("Enviamos um link de recuperação para seu email.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao enviar email");
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* softer lime glow for better legibility */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-40 top-1/3 h-[520px] w-[520px] rounded-full opacity-10 blur-[140px]"
        style={{ background: "var(--color-primary)" }}
      />

      <header className="relative z-10 flex items-center justify-between px-6 py-6 md:px-10">
        <Link to="/" className="flex items-baseline gap-0.5">
          <span className="font-display text-3xl font-bold tracking-tight">SMOKE</span>
          <span className="text-3xl font-bold text-primary">.</span>
        </Link>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-md flex-col px-4 pb-16 sm:px-6">
        <section className="rounded-[28px] border border-border bg-surface/90 p-6 backdrop-blur sm:p-7">
          <h1 className="font-display text-4xl font-bold leading-[1.05] tracking-tight">
            {mode === "signin" ? (
              <>Bem-vindo<br />de volta</>
            ) : (
              <>Criar<br />conta</>
            )}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {mode === "signin"
              ? "Acesse o painel administrativo da sua loja."
              : "Cadastre-se para acessar o painel."}
          </p>

          <form onSubmit={onSubmit} className="mt-7 space-y-5" noValidate>
            {mode === "signup" && (
              <Field label="Nome">
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Seu nome"
                  className={inputClass}
                />
              </Field>
            )}

            <Field label="Email">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errors.email) setErrors((p) => ({ ...p, email: undefined }));
                }}
                placeholder="voce@dominio.com"
                autoComplete="email"
                className={inputClass}
                aria-invalid={!!errors.email}
              />
              {errors.email && <FieldError>{errors.email}</FieldError>}
            </Field>

            <Field
              label="Senha"
              action={
                mode === "signin" ? (
                  <button
                    type="button"
                    onClick={onForgotPassword}
                    className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground transition hover:text-primary"
                  >
                    Esqueci minha senha
                  </button>
                ) : null
              }
            >
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errors.password) setErrors((p) => ({ ...p, password: undefined }));
                  }}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  placeholder="••••••••"
                  className={`${inputClass} pr-12`}
                  aria-invalid={!!errors.password}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground transition hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <FieldError>{errors.password}</FieldError>}
            </Field>

            {mode === "signin" && (
              <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={keepSignedIn}
                  onChange={(e) => setKeepSignedIn(e.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                Manter conectado
              </label>
            )}

            <button
              type="submit"
              disabled={loading}
              className="group flex w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-4 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-60"
            >
              {loading
                ? mode === "signin" ? "Entrando…" : "Criando conta…"
                : mode === "signin" ? "Entrar" : "Criar conta"}
              {!loading && (
                <ArrowUpRight className="h-4 w-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              )}
            </button>

            <p className="text-center text-sm text-muted-foreground">
              {mode === "signin" ? "Primeiro acesso? " : "Já tem conta? "}
              <button
                type="button"
                onClick={() => {
                  setMode(mode === "signin" ? "signup" : "signin");
                  setErrors({});
                }}
                className="font-semibold text-primary underline-offset-4 hover:underline"
              >
                {mode === "signin" ? "Criar conta" : "Entrar"}
              </button>
            </p>
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

const inputClass =
  "w-full rounded-full bg-surface-contrast px-5 py-3.5 text-sm text-foreground outline-none ring-1 ring-border transition placeholder:text-muted-foreground focus:ring-primary";

function Field({
  label,
  action,
  children,
}: {
  label: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          {label}
        </span>
        {action}
      </span>
      {children}
    </label>
  );
}

function FieldError({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 pl-5 text-xs text-destructive">{children}</p>;
}
