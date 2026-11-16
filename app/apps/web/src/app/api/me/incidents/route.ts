import { requireUser } from "@/lib/auth";
import { json, route } from "@/lib/http";
import { listOwnIncidents } from "@/lib/incidents";

export const GET = route(async (req) => {
  const user = await requireUser(req, "citizen.self");
  return json({ incidents: await listOwnIncidents(user.id) });
});
