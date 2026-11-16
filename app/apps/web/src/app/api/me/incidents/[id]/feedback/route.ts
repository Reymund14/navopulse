import { feedbackSchema } from "@navopulse/shared";
import { requireUser } from "@/lib/auth";
import { json, parseBody, route } from "@/lib/http";
import { submitFeedback } from "@/lib/incidents";
import { uuidParam } from "@/lib/params";

export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const user = await requireUser(req, "citizen.self");
  const { rating, comment } = await parseBody(req, feedbackSchema);
  return json({ feedback: await submitFeedback(user.id, uuidParam((await params).id), rating, comment) });
});
