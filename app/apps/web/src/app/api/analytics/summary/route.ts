import { analyticsSummary, defaultRange } from "@/lib/analytics";
import { requireUser } from "@/lib/auth";
import { json, route } from "@/lib/http";

export const GET = route(async (req) => {
  const user = await requireUser(req, "analytics.read");
  return json(await analyticsSummary(user, defaultRange(new URL(req.url).searchParams)));
});
