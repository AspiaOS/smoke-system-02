import { createFileRoute } from "@tanstack/react-router";

// Endpoint público (bypassa auth) protegido por CRON_SECRET.
// Chame periodicamente (a cada 5-15 minutos) via pg_cron ou scheduler externo:
//   curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
//        https://<host>/api/public/cron/expire-orders
async function handle(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response("cron_not_configured", { status: 503 });

  const auth = request.headers.get("authorization") ?? "";
  const provided = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!provided || provided !== secret) {
    return new Response("unauthorized", { status: 401 });
  }

  let olderThan = "1 hour";
  if (request.method === "POST") {
    try {
      const body = (await request.json().catch(() => ({}))) as { older_than?: string };
      if (typeof body.older_than === "string" && /^[0-9]+ (minutes?|hours?|days?)$/.test(body.older_than)) {
        olderThan = body.older_than;
      }
    } catch {
      // ignore malformed body
    }
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("expire_pending_orders", {
    _older_than: olderThan,
  });
  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
  return new Response(JSON.stringify({ ok: true, expired: data ?? 0, older_than: olderThan }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/cron/expire-orders")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
});
