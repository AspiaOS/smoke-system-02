import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/cron/expire-orders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.CRON_SECRET;
        if (!secret) {
          return new Response("cron_not_configured", { status: 503 });
        }

        const header = request.headers.get("authorization") ?? "";
        const expected = `Bearer ${secret}`;
        // Timing-safe compare
        if (header.length !== expected.length) {
          return new Response("unauthorized", { status: 401 });
        }
        let diff = 0;
        for (let i = 0; i < header.length; i++) {
          diff |= header.charCodeAt(i) ^ expected.charCodeAt(i);
        }
        if (diff !== 0) {
          return new Response("unauthorized", { status: 401 });
        }

        const url = new URL(request.url);
        const olderThanMinutes = Math.max(
          1,
          Math.min(1440, Number(url.searchParams.get("minutes") ?? 60) || 60),
        );

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.rpc("expire_pending_orders", {
          _older_than: `${olderThanMinutes} minutes`,
        });
        if (error) {
          console.error("[cron/expire-orders]", error);
          return new Response("rpc_error", { status: 500 });
        }
        return Response.json({ expired: data ?? 0, minutes: olderThanMinutes });
      },
    },
  },
});