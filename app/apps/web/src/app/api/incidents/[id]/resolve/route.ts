import { resolveSchema } from "@navopulse/shared";
import { requireUser } from "@/lib/auth";
import { json, parseBody, route } from "@/lib/http";
import { resolveIncident } from "@/lib/incidents";
import { uuidParam } from "@/lib/params";

export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const user = await requireUser(req, ["incident.manage", "incident.respond"]);
  const { note, mediaIds } = await parseBody(req, resolveSchema);
  return json(await resolveIncident(user, uuidParam((await params).id), note, mediaIds, req));
});
