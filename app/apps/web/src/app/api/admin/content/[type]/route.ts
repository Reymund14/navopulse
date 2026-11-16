import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { CONTENT_TYPES } from "@/lib/content";
import { query, queryOne } from "@/lib/db";
import { ApiError, json, parseBody, route } from "@/lib/http";

type Ctx = { params: Promise<{ type: string }> };

function contentType(name: string) {
  const t = CONTENT_TYPES[name];
  if (!t) throw new ApiError(404, "Unknown content type");
  return t;
}

export const GET = route<Ctx>(async (req, { params }) => {
  await requireUser(req, "content.manage");
  const t = contentType((await params).type);
  return json({ items: await query(`SELECT ${t.select} FROM ${t.table} ORDER BY ${t.orderBy} LIMIT 500`) });
});

export const POST = route<Ctx>(async (req, { params }) => {
  const user = await requireUser(req, "content.manage");
  const name = (await params).type;
  const t = contentType(name);
  if (!t.allowCreate) throw new ApiError(405, "Items of this type cannot be created here");
  const body = (await parseBody(req, t.schema)) as Record<string, unknown>;
  const cols: string[] = [];
  const vals: unknown[] = [];
  const ph: string[] = [];
  for (const [field, col] of Object.entries(t.columns)) {
    if (body[field] === undefined) continue;
    cols.push(col);
    vals.push(col === "officials" ? JSON.stringify(body[field]) : body[field]);
    ph.push(`$${vals.length}`);
  }
  if (t.pointField && body[t.pointField]) {
    const p = body[t.pointField] as { lat: number; lng: number };
    vals.push(p.lng, p.lat);
    cols.push("location");
    ph.push(`ST_SetSRID(ST_MakePoint($${vals.length - 1}, $${vals.length}), 4326)`);
  }
  if (t.table === "announcements") {
    vals.push(user.id);
    cols.push("created_by");
    ph.push(`$${vals.length}`);
  }
  const row = await queryOne<{ id: string }>(`INSERT INTO ${t.table} (${cols.join(", ")}) VALUES (${ph.join(", ")}) RETURNING id`, vals);
  await audit(req, user.id, `content.create`, name, row!.id, null, body);
  return json({ id: row!.id }, 201);
});
