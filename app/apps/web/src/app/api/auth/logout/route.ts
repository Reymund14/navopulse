import { NextResponse } from "next/server";
import { getUser, revokeSession, SESSION_COOKIE } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { route } from "@/lib/http";

export const POST = route(async (req) => {
  const user = await getUser(req);
  if (user) {
    await revokeSession(user.sessionId);
    await audit(req, user.id, "auth.logout", "user", user.id);
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set({ name: SESSION_COOKIE, value: "", path: "/", expires: new Date(0) });
  return res;
});
