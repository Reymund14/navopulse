import { SOS_TYPES, type SosType } from "./constants";

/**
 * Offline SOS SMS payload.
 *
 * When the citizen app cannot reach the API it composes one SMS to the LGU
 * gateway number. The format is compact, human-readable, and fits one
 * 160-character GSM-7 segment:
 *
 *   NVP1 SOS FLD 14.66712,120.94231 P3 R7f3a9c2e1b4d4e0f8a6b5c4d3e2f1a0b N:Stranded sa bubong
 *
 * Fields (space separated, order fixed, note last):
 *   NVP1           format marker + version
 *   SOS            message kind
 *   FLD|FIR|MED|OTH  emergency type
 *   lat,lng        WGS84 decimal degrees, 5 decimals (~1 m)
 *   P<n>           people affected
 *   R<32 hex>      client reference = the report's UUID without dashes, so a
 *                  later online retry of the same report is deduplicated
 *   N:<text>       optional free-text note (rest of the message)
 *
 * The parser is lenient about case, extra whitespace, and missing optional
 * fields, because people sometimes retype these by hand.
 */

export const SMS_MAX_LENGTH = 160;

export interface SosSmsPayload {
  type: SosType;
  lat: number;
  lng: number;
  peopleAffected: number;
  /** UUID with dashes. Optional when parsing, since hand-typed messages may omit it. */
  clientRef?: string;
  note?: string;
}

const CODE_TO_TYPE = Object.fromEntries(
  Object.entries(SOS_TYPES).map(([type, code]) => [code, type as SosType]),
) as Record<string, SosType>;

function uuidToRef(uuid: string): string {
  return uuid.replace(/-/g, "").toLowerCase();
}

function refToUuid(ref: string): string {
  const h = ref.toLowerCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** Strip characters outside GSM-7 basics so the message stays one segment. */
function sanitizeNote(note: string): string {
  return note
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 .,:;!?'()\-/#@]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function encodeSosSms(p: SosSmsPayload): string {
  const head = [
    "NVP1",
    "SOS",
    SOS_TYPES[p.type],
    `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`,
    `P${Math.max(0, Math.min(9999, Math.round(p.peopleAffected)))}`,
    p.clientRef ? `R${uuidToRef(p.clientRef)}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  if (!p.note) return head;
  const room = SMS_MAX_LENGTH - head.length - 3; // " N:"
  const note = sanitizeNote(p.note).slice(0, Math.max(0, room));
  return note ? `${head} N:${note}` : head;
}

export type SmsParseResult =
  | { ok: true; payload: SosSmsPayload }
  | { ok: false; error: string };

export function parseSosSms(body: string): SmsParseResult {
  const text = body.trim().replace(/\s+/g, " ");
  const noteIdx = text.search(/\bN:/i);
  const head = noteIdx >= 0 ? text.slice(0, noteIdx).trim() : text;
  const note = noteIdx >= 0 ? text.slice(noteIdx + 2).trim() : undefined;
  const parts = head.split(" ");

  if (parts[0]?.toUpperCase() !== "NVP1") return { ok: false, error: "Not a NavoPulse payload" };
  if (parts[1]?.toUpperCase() !== "SOS") return { ok: false, error: "Unsupported message kind" };

  const type = CODE_TO_TYPE[(parts[2] ?? "").toUpperCase()];
  if (!type) return { ok: false, error: "Unknown emergency type" };

  const coord = /^(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)$/.exec(parts[3] ?? "");
  if (!coord) return { ok: false, error: "Missing or invalid coordinates" };
  const lat = Number(coord[1]);
  const lng = Number(coord[2]);
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return { ok: false, error: "Coordinates out of range" };

  let peopleAffected = 1;
  let clientRef: string | undefined;
  for (const part of parts.slice(4)) {
    const up = part.toUpperCase();
    if (/^P\d{1,4}$/.test(up)) peopleAffected = Number(up.slice(1));
    else if (/^R[0-9A-F]{32}$/.test(up)) clientRef = refToUuid(part.slice(1));
  }
  return { ok: true, payload: { type, lat, lng, peopleAffected, clientRef, note: note || undefined } };
}
