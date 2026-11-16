import { mergeSchema } from "@navopulse/shared";
import { requireUser } from "@/lib/auth";
import { json, parseBody, route } from "@/lib/http";
import { mergeDuplicate } from "@/lib/incidents";
import { uuidParam } from "@/lib/params";

export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const user = await requireUser(req, "incident.manage");
  const { duplicateOfId, note } = await parseBody(req, mergeSchema);
  return json(await mergeDuplicate(user, uuidParam((await params).id), duplicateOfId, note, req));
});
