import { getUser } from "@/lib/auth";
import { json, route } from "@/lib/http";
import { PERMISSIONS, can, type Permission } from "@/lib/rbac";

export const GET = route(async (req) => {
  const user = await getUser(req);
  if (!user) return json({ user: null });
  const permissions = (Object.keys(PERMISSIONS) as Permission[]).filter((p) => can(user.role, p));
  const { sessionId: _s, ...rest } = user;
  void _s;
  return json({ user: rest, permissions });
});
