import { queryOne } from "@/lib/db";
import { json, route } from "@/lib/http";

export const GET = route(async () => {
  const started = Date.now();
  const db = await queryOne<{ ok: number }>("SELECT 1 AS ok").then(() => "ok").catch(() => "down");
  return json({ status: db === "ok" ? "ok" : "degraded", db, latencyMs: Date.now() - started, time: new Date().toISOString() }, db === "ok" ? 200 : 503);
});
