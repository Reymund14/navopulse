import { createHash } from "node:crypto";
import { env } from "./env";
import { hmacSha256Hex, safeEqual } from "./crypto";

/**
 * NavoBot (Copilot Studio) → Power Automate → this webhook.
 *
 * Two ways to authenticate, checked in this order:
 *  1. X-Api-Key: <NAVOBOT_API_KEY>      simplest for Power Automate's HTTP action
 *  2. X-NavoPulse-Timestamp: <unix seconds>
 *     X-NavoPulse-Signature: sha256=<hex HMAC-SHA256(NAVOBOT_WEBHOOK_SECRET, `${timestamp}.${rawBody}`)>
 *     Requests older than 5 minutes are rejected to stop replays.
 */
export function verifyNavobotRequest(headers: Headers, rawBody: string, now = Date.now()): boolean {
  const apiKey = process.env.NAVOBOT_API_KEY;
  const given = headers.get("x-api-key");
  if (apiKey && given) return safeEqual(given, apiKey);

  const secret = env.navobotWebhookSecret;
  if (!secret) return false;
  const ts = headers.get("x-navopulse-timestamp");
  const sig = headers.get("x-navopulse-signature");
  if (!ts || !sig || !/^\d{9,11}$/.test(ts)) return false;
  if (Math.abs(now / 1000 - Number(ts)) > 300) return false;
  const expected = `sha256=${hmacSha256Hex(secret, `${ts}.${rawBody}`)}`;
  return safeEqual(sig, expected);
}

export function signNavobotBody(rawBody: string, secret: string, ts = Math.floor(Date.now() / 1000)) {
  return { "X-NavoPulse-Timestamp": String(ts), "X-NavoPulse-Signature": `sha256=${hmacSha256Hex(secret, `${ts}.${rawBody}`)}` };
}

/** Map whatever category the bot captured (code or Taglish words) to a category code. */
// Order matters: more specific phrases first ("fire lane" is a traffic issue, not a fire).
const KEYWORDS: [RegExp, string][] = [
  [/emergency route|fire lane|evacuation route/i, "TRF_EMERGENCY_ROUTE"],
  [/sunog|\bfire\b|nasusunog/i, "EMR_FIRE"],
  [/daluyong|storm surge|\bmalalaking alon\b|\balon\b/i, "EMR_STORM_SURGE"],
  [/medical|medikal|hinimatay|nahimatay|injur|sugat|ambulan/i, "EMR_MEDICAL"],
  [/rescue|stranded|lubog|\bbaha\b|\bbinaha\b|flood/i, "EMR_FLOOD"],
  [/kanal|drain|imburnal/i, "CIV_DRAINAGE"],
  [/basura|garbage|waste|dump|trash/i, "CIV_WASTE"],
  [/ilaw|streetlight|street light|poste/i, "CIV_STREETLIGHT"],
  [/\bpark(ed|ing)?\b|nakaparada|nakapark|double park/i, "TRF_ILLEGAL_PARKING"],
  [/aksidente|accident|banggaan|nabangga/i, "TRF_ACCIDENT"],
  [/harang|obstruct|vendor|nakaharang/i, "TRF_OBSTRUCTION"],
  [/butas|pothole|\bsira(ng)?\b|damaged|broken|bridge|tulay|manhole/i, "CIV_INFRA"],
];

export function mapNavobotCategory(category: string, description: string, knownCodes: Set<string>): string {
  const upper = category.trim().toUpperCase();
  if (knownCodes.has(upper)) return upper;
  for (const [re, code] of KEYWORDS) if (re.test(category)) return code;
  for (const [re, code] of KEYWORDS) if (re.test(description)) return code;
  return "CIV_OTHER";
}

/** Deterministic UUID so Power Automate retries of the same ticket are idempotent. */
export function navobotClientId(conversationId: string, category: string, description: string): string {
  const h = createHash("sha256").update(`navobot|${conversationId}|${category}|${description}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
