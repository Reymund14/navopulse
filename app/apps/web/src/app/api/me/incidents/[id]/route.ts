import { requireUser } from "@/lib/auth";
import { json, route } from "@/lib/http";
import { getOwnIncident } from "@/lib/incidents";
import { uuidParam } from "@/lib/params";

export const GET = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const user = await requireUser(req, "citizen.self");
  return json({ incident: await getOwnIncident(user.id, uuidParam((await params).id)) });
});
