import { requireUser } from "@/lib/auth";
import { json, route } from "@/lib/http";
import { getIncidentDetail } from "@/lib/incidents";
import { uuidParam } from "@/lib/params";

export const GET = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const user = await requireUser(req, "incident.read");
  const id = uuidParam((await params).id);
  return json({ incident: await getIncidentDetail(user, id, req) });
});
