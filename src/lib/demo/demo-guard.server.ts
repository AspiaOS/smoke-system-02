// Guard server-only para operações do gerador demo.
// Nunca importe este arquivo em código de cliente.

export function assertDemoEnabled(): void {
  if (process.env.ALLOW_DEMO_SEED !== "true") {
    throw new Error(
      "DEMO_DISABLED: defina ALLOW_DEMO_SEED=true nos secrets deste ambiente para liberar o gerador. Em produção o secret não deve existir.",
    );
  }
}

export function environmentSummary() {
  return {
    supabaseUrl: process.env.SUPABASE_URL ?? "(sem SUPABASE_URL)",
    allowDemoSeed: process.env.ALLOW_DEMO_SEED === "true",
  };
}
