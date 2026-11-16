import { ApiError, json, rateLimit, route, clientIp } from "@/lib/http";

/**
 * Issue a short-lived Direct Line token for the embedded Web Chat, so the
 * Direct Line secret never reaches the browser. Configure either:
 *   COPILOT_TOKEN_ENDPOINT  the token endpoint URL shown in Copilot Studio
 *                           (Settings > Channels > Mobile app), or
 *   DIRECTLINE_SECRET       a Direct Line channel secret.
 */
export const GET = route(async (req) => {
  rateLimit(`dl-token:${clientIp(req) ?? "unknown"}`, 30, 10 * 60_000);
  const endpoint = process.env.COPILOT_TOKEN_ENDPOINT;
  const secret = process.env.DIRECTLINE_SECRET;
  if (endpoint) {
    const res = await fetch(endpoint);
    if (!res.ok) throw new ApiError(502, "Could not reach Copilot Studio");
    const data = (await res.json()) as { token: string };
    return json({ token: data.token });
  }
  if (secret) {
    const res = await fetch("https://directline.botframework.com/v3/directline/tokens/generate", {
      method: "POST", headers: { Authorization: `Bearer ${secret}` },
    });
    if (!res.ok) throw new ApiError(502, "Could not get a Direct Line token");
    const data = (await res.json()) as { token: string; expires_in: number };
    return json({ token: data.token, expiresIn: data.expires_in });
  }
  throw new ApiError(404, "NavoBot is not connected to Copilot Studio; using demo mode");
});
