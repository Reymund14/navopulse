import { NAVOTAS_BOUNDS, navobotTicketSchema, phMobile, STATUS_LABELS } from "@navopulse/shared";
import { nextControlNumber } from "@/lib/controlNumbers";
import { query, queryOne } from "@/lib/db";
import { env } from "@/lib/env";
import { ApiError, clientIp, json, rateLimit, route } from "@/lib/http";
import { createIncident } from "@/lib/incidents";
import { mapNavobotCategory, navobotClientId, verifyNavobotRequest } from "@/lib/navobot";

/**
 * POST /api/integrations/navobot/tickets
 * Called by the Power Automate flow behind NavoBot's "Report an issue" topic.
 * Returns plain sentences the bot can read back to the citizen.
 */
export const POST = route(async (req) => {
  rateLimit(`navobot:${clientIp(req) ?? "unknown"}`, 120, 60_000);
  const raw = await req.text();
  if (!verifyNavobotRequest(req.headers, raw)) throw new ApiError(401, "Invalid webhook credentials");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ApiError(400, "Body must be JSON");
  }
  const body = navobotTicketSchema.parse(parsed);
  const codes = new Set((await query<{ code: string }>(`SELECT code FROM incident_categories WHERE is_active`)).map((r) => r.code));
  const categoryCode = mapNavobotCategory(body.category, body.description, codes);

  // Location: GPS shared in chat, else the barangay's centroid.
  let lat = body.location?.lat;
  let lng = body.location?.lng;
  let barangayId: string | null = null;
  let locationSource: "navobot" | "barangay_centroid" = "navobot";
  if (body.barangay) {
    const b = await queryOne<{ id: string; lat: number; lng: number }>(
      `SELECT id, ST_Y(centroid) AS lat, ST_X(centroid) AS lng FROM barangays
       WHERE lower(name) = lower($1) OR lower(replace(name, ' ', '')) = lower(replace($1, ' ', ''))
          OR lower(name) LIKE lower($1) || '%' ORDER BY length(name) LIMIT 1`, [body.barangay]);
    if (b) {
      barangayId = b.id;
      if (lat === undefined || lng === undefined) {
        lat = b.lat;
        lng = b.lng;
        locationSource = "barangay_centroid";
      }
    }
  }
  if (lat === undefined || lng === undefined) {
    throw new ApiError(422, "Location needed. Ask the citizen to share their location or name their barangay.", {
      reply_en: "I need your location to send this report. Please share your location or tell me your barangay.",
      reply_fil: "Kailangan ko ang iyong lokasyon para maipadala ang ulat. Paki-share ang lokasyon o sabihin ang iyong barangay.",
    });
  }

  if (lat < NAVOTAS_BOUNDS.minLat || lat > NAVOTAS_BOUNDS.maxLat || lng < NAVOTAS_BOUNDS.minLng || lng > NAVOTAS_BOUNDS.maxLng) {
    throw new ApiError(422, "Location is outside Navotas City", {
      reply_en: "That location seems to be outside Navotas City. Please share your location again or tell me your barangay.",
      reply_fil: "Mukhang nasa labas ng Navotas ang lokasyon. Paki-share muli ang lokasyon o sabihin ang iyong barangay.",
    });
  }

  const mobile = body.citizen?.mobileNumber ? phMobile.safeParse(body.citizen.mobileNumber) : null;
  const clientId = navobotClientId(body.conversationId, body.category, body.description);

  // Record the conversation as an inquiry, reusing it on retries.
  let inquiry = await queryOne<{ id: string; control_number: string }>(
    `SELECT q.id, q.control_number FROM inquiries q JOIN incidents i ON i.inquiry_id = q.id WHERE i.client_id = $1`, [clientId]);
  if (!inquiry) {
    inquiry = await queryOne(
      `INSERT INTO inquiries (control_number, channel, conversation_id, topic, transcript_ref, status)
       VALUES ($1, 'navobot', $2, $3, $4, 'converted') RETURNING id, control_number`,
      [await nextControlNumber("INQ"), body.conversationId, `Report: ${body.category}`.slice(0, 200), body.transcriptUrl ?? null]);
  }

  const result = await createIncident({
    clientId,
    categoryCode,
    description: body.description,
    lat, lng,
    locationSource,
    addressText: body.addressText,
    barangayId,
    source: "navobot",
    reporterName: body.citizen?.name ?? null,
    reporterMobile: mobile?.success ? mobile.data : null,
    inquiryId: inquiry!.id,
  });
  // Link to an existing citizen account when the number matches one.
  if (result.created && mobile?.success) {
    await query(`UPDATE incidents SET reporter_id = u.id FROM users u WHERE incidents.id = $1 AND u.mobile_hash = incidents.reporter_mobile_hash AND u.role = 'citizen'`, [result.id]);
  }

  const status = STATUS_LABELS[result.status];
  return json({
    ok: true,
    created: result.created,
    incidentId: result.id,
    controlNumber: result.controlNumber,
    inquiryControlNumber: inquiry!.control_number,
    category: categoryCode,
    status: result.status,
    trackUrl: `${env.appUrl}/app/reports`,
    reply_en: `Your report has been sent to the city. Your control number is ${result.controlNumber}. Status: ${status.en}. Keep this number to track your report.`,
    reply_fil: `Naipadala na ang iyong ulat sa lungsod. Ang iyong control number ay ${result.controlNumber}. Status: ${status.fil}. Itago ang numerong ito para masubaybayan ang ulat.`,
  }, result.created ? 201 : 200);
});
