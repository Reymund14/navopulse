import { z } from "zod";
import { demoBotReply } from "@/lib/demoBot";
import { clientIp, json, parseBody, rateLimit, route } from "@/lib/http";

export const POST = route(async (req) => {
  rateLimit(`demo-bot:${clientIp(req) ?? "unknown"}`, 60, 60_000);
  const { message } = await parseBody(req, z.object({ message: z.string().max(1000) }));
  return json(await demoBotReply(message));
});
