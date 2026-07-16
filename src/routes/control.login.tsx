import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getPlatformAdminSelf } from "@/lib/authz.functions";
import { ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/control/login")({
  ssr: false,
  head: () => ({ meta: [{ title: "Smoke Control — Acesso" }, { name: "robots", content: "noindex" }] }),
  component: ControlLoginPage,
});

function ControlLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error: signErr } = await supabase.auth.signInWithPassword({ email, password });
      if (signErr) {
        setError("Credenciais inválidas.");
        return;
      }
      const admin = await getPlatformAdminSelf();
      if (!admin) {
        await supabase.auth.signOut();
        setError("Acesso não autorizado à Central de Controle.");
        return;
      }
      navigate({ to: "/control", replace: true });
    } catch {
      setError("Não foi possível autenticar. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-black text-neutral-100 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-8">
          <ShieldCheck className="h-6 w-6 text-violet-400" />
          <div>
            <div className="font-semibold tracking-wide">SMOKE CONTROL</div>
            <div className="text-xs text-neutral-500">Central de administração</div>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 bg-[#111014] border border-neutral-800 rounded-lg p-6">
          <div>
            <label className="block text-xs text-neutral-400 mb-1">Email</label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-black border border-neutral-800 rounded px-3 py-2 text-sm focus:border-violet-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-neutral-400 mb-1">Senha</label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-black border border-neutral-800 rounded px-3 py-2 text-sm focus:border-violet-500 focus:outline-none"
            />
          </div>
          {error ? (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded px-3 py-2">
              {error}
            </div>
          ) : null}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-violet-500 hover:bg-violet-400 text-black font-medium rounded px-3 py-2 text-sm disabled:opacity-50"
          >
            {loading ? "Entrando…" : "Entrar"}
          </button>
        </form>
        <p className="text-xs text-neutral-600 mt-6 text-center">
          Acesso restrito a administradores da plataforma.
        </p>
      </div>
    </div>
  );
}
