import { assignSchema } from "@navopulse/shared";
import { requireUser } from "@/lib/auth";
import { json, parseBody, route } from "@/lib/http";
import { assignUnit } from "@/lib/incidents";
import { uuidParam } from "@/lib/params";

export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const user = await requireUser(req, "incident.manage");
  const { unitId, note } = await parseBody(req, assignSchema);
  return json(await assignUnit(user, uuidParam((await params).id), unitId, note, req));
});
