import { noteSchema } from "@navopulse/shared";
import { requireUser } from "@/lib/auth";
import { json, parseBody, route } from "@/lib/http";
import { addNote } from "@/lib/incidents";
import { uuidParam } from "@/lib/params";

export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const user = await requireUser(req, ["incident.manage", "incident.respond"]);
  const { body } = await parseBody(req, noteSchema);
  return json({ note: await addNote(user, uuidParam((await params).id), body, req) }, 201);
});
