import { query } from "@/lib/db";
import { json, route } from "@/lib/http";

/** Angat Navotas: announcements, upcoming events, and local businesses. */
export const GET = route(async () => {
  const [announcements, events, businesses] = await Promise.all([
    query(`SELECT id, title_en, title_fil, body_en, body_fil, image_url, published_at FROM announcements
           WHERE is_published AND published_at <= now() ORDER BY published_at DESC LIMIT 30`),
    query(`SELECT e.id, e.title, e.description, e.venue, e.starts_at, e.ends_at, b.name AS barangay,
                  ST_Y(e.location) AS lat, ST_X(e.location) AS lng
           FROM events e LEFT JOIN barangays b ON b.id = e.barangay_id
           WHERE e.is_published AND COALESCE(e.ends_at, e.starts_at) >= now() ORDER BY e.starts_at LIMIT 30`),
    query(`SELECT bz.id, bz.name, bz.category, bz.description, bz.address, bz.contact, b.name AS barangay,
                  ST_Y(bz.location) AS lat, ST_X(bz.location) AS lng
           FROM businesses bz LEFT JOIN barangays b ON b.id = bz.barangay_id WHERE bz.is_published ORDER BY bz.name`),
  ]);
  return json({ announcements, events, businesses });
});
