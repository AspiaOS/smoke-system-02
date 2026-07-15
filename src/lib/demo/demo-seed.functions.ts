import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const seedDemoFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { profile: "small" | "full" }) => {
    if (input.profile !== "small" && input.profile !== "full") {
      throw new Error("profile inválido");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const { runSeed } = await import("./demo-seed.runner.server");
    return runSeed(context.supabase, context.userId, data.profile);
  });
