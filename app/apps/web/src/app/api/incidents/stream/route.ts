import { requireUser } from "@/lib/auth";
import { route } from "@/lib/http";
import { subscribe } from "@/lib/realtime";
import { officeScope } from "@/lib/rbac";
import { queryOne } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Server-Sent Events stream of incident changes for the dashboard.
 * Events are filtered to the viewer's office so nobody is alerted about
 * cases they cannot open.
 */
export const GET = route(async (req) => {
  const user = await requireUser(req, "incident.read");
  const office = officeScope(user.role);
  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      send("ready", { ok: true });
      const unsubscribe = await subscribe(async (evt) => {
        try {
          if (user.role !== "super_admin") {
            const visible = await queryOne(
              `SELECT 1 FROM incidents i JOIN incident_categories c ON c.id = i.category_id
               WHERE i.id = $1 AND ${user.role === "field_responder" ? "i.assigned_unit_id = $2" : office === "PIO" ? "(c.default_office = $2 OR i.source = 'navobot')" : "c.default_office = $2"}`,
              [evt.id, user.role === "field_responder" ? user.unitId : office]);
            if (!visible) return;
          }
          send("incident", evt);
        } catch {
          /* stream closed */
        }
      });
      const ping = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          /* closed */
        }
      }, 25_000);
      cleanup = () => {
        clearInterval(ping);
        unsubscribe();
      };
      req.signal.addEventListener("abort", () => {
        cleanup?.();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
    cancel() {
      cleanup?.();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" },
  });
});
