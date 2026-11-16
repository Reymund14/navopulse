import { deviceTokenSchema } from "@navopulse/shared";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { json, parseBody, route } from "@/lib/http";

/** Register an FCM token for push notifications (called by the app after permission is granted). */
export const POST = route(async (req) => {
  const user = await requireUser(req);
  const { platform, token } = await parseBody(req, deviceTokenSchema);
  await query(
    `INSERT INTO device_tokens (user_id, platform, token) VALUES ($1,$2,$3)
     ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform, last_seen_at = now()`,
    [user.id, platform, token]);
  return json({ ok: true }, 201);
});

export const DELETE = route(async (req) => {
  const user = await requireUser(req);
  const { token } = await parseBody(req, deviceTokenSchema.pick({ token: true }));
  await query(`DELETE FROM device_tokens WHERE user_id = $1 AND token = $2`, [user.id, token]);
  return json({ ok: true });
});
