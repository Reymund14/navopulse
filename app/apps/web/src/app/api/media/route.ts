import { randomUUID } from "node:crypto";
import { requireUser } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { ApiError, json, rateLimit, route } from "@/lib/http";
import { sniffImageType, storage } from "@/lib/providers/storage";
import { can } from "@/lib/rbac";

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Upload one photo (multipart field "file"). The client compresses images
 * before upload and extracts EXIF itself, sending exifLat/exifLng/exifTakenAt
 * as form fields, because EXIF is usually stripped by that compression.
 * type=report (citizen evidence) or type=resolution (responder proof).
 */
export const POST = route(async (req) => {
  const user = await requireUser(req);
  rateLimit(`upload:${user.id}`, 30, 10 * 60_000);
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File)) throw new ApiError(400, "Attach an image in the 'file' field");
  const type = form.get("type") === "resolution" ? "resolution" : "report";
  if (type === "resolution" && !can(user.role, "incident.respond") && !can(user.role, "incident.manage")) {
    throw new ApiError(403, "Only LGU staff can upload resolution photos");
  }
  if (file.size > MAX_BYTES) throw new ApiError(413, "Image is larger than 5 MB");
  const buf = Buffer.from(await file.arrayBuffer());
  const mime = sniffImageType(buf);
  if (!mime) throw new ApiError(415, "Only JPEG, PNG, or WebP images are accepted");

  const num = (k: string) => {
    const v = Number(form.get(k));
    return form.get(k) !== null && Number.isFinite(v) ? v : null;
  };
  const takenAt = form.get("exifTakenAt");
  const id = randomUUID();
  const key = `${type}/${new Date().toISOString().slice(0, 7)}/${id}.${mime.split("/")[1]}`;
  await storage().put(key, buf, mime);
  const row = await queryOne(
    `INSERT INTO incident_media (id, storage_key, mime_type, size_bytes, type, exif_lat, exif_lng, exif_taken_at, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, type, mime_type`,
    [id, key, mime, buf.length, type, num("exifLat"), num("exifLng"),
      typeof takenAt === "string" && !Number.isNaN(Date.parse(takenAt)) ? new Date(takenAt) : null, user.id]);
  return json({ media: row }, 201);
});
