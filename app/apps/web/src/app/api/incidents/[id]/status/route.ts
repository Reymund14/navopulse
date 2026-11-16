import { statusChangeSchema } from "@navopulse/shared";
import { requireUser } from "@/lib/auth";
import { json, parseBody, route } from "@/lib/http";
import { changeStatus } from "@/lib/incidents";
import { uuidParam } from "@/lib/params";

export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const user = await requireUser(req, ["incident.manage", "incident.respond"]);
  const { status, note } = await parseBody(req, statusChangeSchema);
  return json(await changeStatus(user, uuidParam((await params).id), status, note, req));
});
