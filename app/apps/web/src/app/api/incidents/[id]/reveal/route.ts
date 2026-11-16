import { requireUser } from "@/lib/auth";
import { json, route } from "@/lib/http";
import { revealReporter } from "@/lib/incidents";
import { uuidParam } from "@/lib/params";

/** Reveal masked reporter contact. Always written to the audit log. */
export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const user = await requireUser(req, "pii.reveal");
  return json({ reporter: await revealReporter(user, uuidParam((await params).id), req) });
});
