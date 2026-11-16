import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { CONTENT_TYPES } from "@/lib/content";
import { query, queryOne } from "@/lib/db";
import { ApiError, json, parseBody, route } from "@/lib/http";
import { uuidParam } from "@/lib/params";

type Ctx = { params: Promise<{ type: string; id: string }> };

async function resolve(params: Ctx["params"]) {
  const { type, id } = await params;
  const t = CONTENT_TYPES[type];
  if (!t) throw new ApiError(404, "Unknown content type");
  return { t, type, id: uuidParam(id) };
}

export const PATCH = route<Ctx>(async (req, { params }) => {
  const user = await requireUser(req, "content.manage");
  const { t, type, id } = await resolve(params);
  const body = (await parseBody(req, t.schema.partial())) as Record<string, unknown>;
  const before = await queryOne(`SELECT ${t.select} FROM ${t.table} WHERE id = $1`, [id]);
  if (!before) throw new ApiError(404, "Not found");
  const sets: string[] = [];
  const vals: unknown[] = [id];
  for (const [field, col] of Object.entries(t.columns)) {
    if (body[field] === undefined) continue;
    vals.push(col === "officials" ? JSON.stringify(body[field]) : body[field]);
    sets.push(`${col} = $${vals.length}`);
  }
  if (t.pointField && body[t.pointField] !== undefined) {
    const p = body[t.pointField] as { lat: number; lng: number } | null;
    if (p) {
      vals.push(p.lng, p.lat);
      sets.push(`location = ST_SetSRID(ST_MakePoint($${vals.length - 1}, $${vals.length}), 4326)`);
    } else sets.push("location = NULL");
  }
  if (!sets.length) throw new ApiError(400, "Nothing to update");
  if (t.table === "barangays") sets.push("updated_at = now()");
  await query(`UPDATE ${t.table} SET ${sets.join(", ")} WHERE id = $1`, vals);
  await audit(req, user.id, "content.update", type, id, before, body);
  return json({ ok: true });
});

export const DELETE = route<Ctx>(async (req, { params }) => {
  const user = await requireUser(req, "content.manage");
  const { t, type, id } = await resolve(params);
  if (!t.allowDelete) throw new ApiError(405, "Items of this type cannot be deleted");
  const before = await queryOne(`SELECT ${t.select} FROM ${t.table} WHERE id = $1`, [id]);
  if (!before) throw new ApiError(404, "Not found");
  await query(`DELETE FROM ${t.table} WHERE id = $1`, [id]);
  await audit(req, user.id, "content.delete", type, id, before, null);
  return json({ ok: true });
});
