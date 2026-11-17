import { getUser } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { ApiError, route } from "@/lib/http";
import { scopeSql } from "@/lib/incidents";
import { uuidParam } from "@/lib/params";
import { storage } from "@/lib/providers/storage";
import { can } from "@/lib/rbac";

/** Serve a photo to its uploader, the incident's reporter, or staff who can see the incident. */
export const GET = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const user = await getUser(req);
  if (!user) throw new ApiError(401, "Sign in required");
  const id = uuidParam((await params).id);
  const m = await queryOne<{ storage_key: string; mime_type: string; incident_id: string | null; uploaded_by: string | null; reporter_id: string | null }>(
    `SELECT m.storage_key, m.mime_type, m.incident_id, m.uploaded_by, i.reporter_id
     FROM incident_media m LEFT JOIN incidents i ON i.id = m.incident_id WHERE m.id = $1`, [id]);
  if (!m) throw new ApiError(404, "Not found");
  let allowed = m.uploaded_by === user.id || (m.reporter_id !== null && m.reporter_id === user.id);
  if (!allowed && m.incident_id && can(user.role, "incident.read")) {
    const p: unknown[] = [m.incident_id];
    const scope = scopeSql(user, p);
    allowed = !!(await queryOne(`SELECT 1 FROM incidents i JOIN incident_categories c ON c.id = i.category_id WHERE i.id = $1 AND ${scope}`, p));
  }
  if (!allowed) throw new ApiError(404, "Not found");
  const provider = storage();
  // Providers with direct URLs (Supabase) let the browser fetch the bytes, so
  // photo traffic never counts against this server. Fall back to streaming.
  if (provider.signedUrl) {
    try {
      const url = await provider.signedUrl(m.storage_key, 60);
      return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "no-store" } });
    } catch {
      /* fall through to proxying the file */
    }
  }
  const data = await provider.get(m.storage_key);
  if (!data) throw new ApiError(404, "File missing");
  // Storage keys are UUIDs and photos are never rewritten, so they are immutable.
  return new Response(new Uint8Array(data), { headers: { "Content-Type": m.mime_type, "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
});
