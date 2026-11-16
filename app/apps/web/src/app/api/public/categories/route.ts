import { query } from "@/lib/db";
import { json, route } from "@/lib/http";

export const GET = route(async () => {
  const rows = await query(
    `SELECT id, code, name_en, name_fil, module, default_office, priority, color FROM incident_categories WHERE is_active ORDER BY sort_order`);
  return json({ categories: rows }, { headers: { "Cache-Control": "public, max-age=300" } });
});
