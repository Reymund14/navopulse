import { createIncidentSchema, incidentFilterSchema, NAVOTAS_BOUNDS } from "@navopulse/shared";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { ApiError, json, parseBody, rateLimit, route } from "@/lib/http";
import { createIncident, listIncidents } from "@/lib/incidents";
import { can } from "@/lib/rbac";

/** Dashboard incident list / map feed. */
export const GET = route(async (req) => {
  const user = await requireUser(req, "incident.read");
  const sp = new URL(req.url).searchParams;
  const multi = (k: string) => (sp.get(k) ? sp.get(k)!.split(",").filter(Boolean) : undefined);
  const filters = incidentFilterSchema.parse({
    module: sp.get("module") || undefined,
    status: multi("status"),
    source: multi("source"),
    priority: multi("priority"),
    barangayId: sp.get("barangayId") || undefined,
    categoryCode: sp.get("category") || undefined,
    from: sp.get("from") || undefined,
    to: sp.get("to") || undefined,
    q: sp.get("q") || undefined,
    limit: sp.get("limit") ?? undefined,
  });
  const incidents = await listIncidents(user, filters);
  return json({ incidents });
});

/**
 * Create a report. Citizens submit from the app (source "app"); staff can log
 * walk-in and phone reports (source "walk_in"). Idempotent on clientId.
 */
export const POST = route(async (req) => {
  const user = await requireUser(req, ["citizen.self", "incident.create_walkin"]);
  rateLimit(`incident:${user.id}`, 20, 10 * 60_000);
  const body = await parseBody(req, createIncidentSchema);
  const { lat, lng } = body.location;
  const b = NAVOTAS_BOUNDS;
  if (lat < b.minLat || lat > b.maxLat || lng < b.minLng || lng > b.maxLng) {
    throw new ApiError(422, "The location is outside Navotas City. Move the pin to where the incident is.");
  }
  const isStaff = can(user.role, "incident.create_walkin");
  const result = await createIncident({
    clientId: body.clientId,
    categoryCode: body.categoryCode,
    description: body.description,
    lat, lng,
    accuracy: body.location.accuracy ?? null,
    locationSource: body.locationSource,
    addressText: body.addressText,
    peopleAffected: body.peopleAffected,
    observedAt: body.observedAt,
    source: isStaff ? "walk_in" : "app",
    reporterId: isStaff ? null : user.id,
    mediaIds: body.mediaIds,
  });
  if (isStaff && result.created) await audit(req, user.id, "incident.create_walkin", "incident", result.id);
  return json(result, result.created ? 201 : 200);
});
