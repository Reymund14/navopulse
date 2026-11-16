/**
 * Domain constants shared by the dashboard, citizen PWA, API, and tests.
 * Keep these in sync with the CHECK constraints in apps/web/db/migrations.
 */

export const ROLES = [
  "citizen",
  "drrmo_dispatcher",
  "tmo_officer",
  "field_responder",
  "pio_admin",
  "super_admin",
] as const;
export type Role = (typeof ROLES)[number];

/** Roles that may sign in to the LGU Web Command Dashboard. */
export const STAFF_ROLES: readonly Role[] = ROLES.filter((r) => r !== "citizen");

export const ROLE_LABELS: Record<Role, string> = {
  citizen: "Citizen",
  drrmo_dispatcher: "DRRMO Dispatcher",
  tmo_officer: "TMO Officer",
  field_responder: "Field Responder",
  pio_admin: "PIO Administrator",
  super_admin: "Super Administrator",
};

export const MODULES = ["emergency", "civic", "traffic"] as const;
export type IncidentModule = (typeof MODULES)[number];

/** Control-number prefixes. INQ is used for NavoBot inquiries, not incidents. */
export const MODULE_CODES = {
  emergency: "EMR",
  civic: "CIV",
  traffic: "TRF",
  inquiry: "INQ",
} as const;
export type ControlModuleCode = (typeof MODULE_CODES)[keyof typeof MODULE_CODES];

export const INCIDENT_STATUSES = [
  "submitted",
  "verified",
  "assigned",
  "in_progress",
  "resolved",
  "rejected",
  "duplicate",
] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const STATUS_LABELS: Record<IncidentStatus, { en: string; fil: string }> = {
  submitted: { en: "Submitted", fil: "Naisumite" },
  verified: { en: "Verified", fil: "Napatunayan" },
  assigned: { en: "Assigned", fil: "Naitalaga" },
  in_progress: { en: "In Progress", fil: "Inaaksyunan" },
  resolved: { en: "Resolved", fil: "Nalutas" },
  rejected: { en: "Rejected", fil: "Tinanggihan" },
  duplicate: { en: "Duplicate", fil: "Doble" },
};

/** Terminal statuses: no further transitions except reopening by a super_admin. */
export const TERMINAL_STATUSES: readonly IncidentStatus[] = ["resolved", "rejected", "duplicate"];

/**
 * Allowed status transitions. The workflow is deliberately forgiving
 * (a dispatcher can skip "verified" and assign directly) but never lets a
 * case move backwards out of a terminal state.
 */
export const STATUS_TRANSITIONS: Record<IncidentStatus, readonly IncidentStatus[]> = {
  submitted: ["verified", "assigned", "rejected", "duplicate"],
  verified: ["assigned", "in_progress", "resolved", "rejected", "duplicate"],
  assigned: ["in_progress", "resolved", "rejected"],
  in_progress: ["resolved", "assigned"],
  resolved: [],
  rejected: [],
  duplicate: [],
};

export function canTransition(from: IncidentStatus, to: IncidentStatus): boolean {
  return STATUS_TRANSITIONS[from].includes(to);
}

export const SOURCES = ["app", "sms", "navobot", "walk_in"] as const;
export type IncidentSource = (typeof SOURCES)[number];

export const PRIORITIES = ["low", "normal", "high", "critical"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const OFFICES = ["DRRMO", "TMO", "PIO"] as const;
export type Office = (typeof OFFICES)[number];

export const ADVISORY_SEVERITIES = ["info", "advisory", "warning", "critical"] as const;
export type AdvisorySeverity = (typeof ADVISORY_SEVERITIES)[number];

export const LANGUAGES = ["en", "fil"] as const;
export type Language = (typeof LANGUAGES)[number];

/** Emergency SOS types and the 3-letter codes used in the offline SMS payload. */
export const SOS_TYPES = {
  flood: "FLD",
  fire: "FIR",
  medical: "MED",
  other: "OTH",
} as const;
export type SosType = keyof typeof SOS_TYPES;

/** Category codes seeded in the database. The SOS types map to EMR_* categories. */
export const SOS_CATEGORY_CODE: Record<SosType, string> = {
  flood: "EMR_FLOOD",
  fire: "EMR_FIRE",
  medical: "EMR_MEDICAL",
  other: "EMR_OTHER",
};

/**
 * Hotlines surfaced by the app and by NavoBot's safety guardrail.
 * 911 is the national emergency number. The local numbers below are
 * PLACEHOLDERS: confirm the official Navotas DRRMO, PNP and BFP numbers with
 * the city and set them through the NEXT_PUBLIC_HOTLINE_* env vars before any
 * public demo. Never ship unverified emergency numbers.
 */
export const HOTLINES = {
  national: "911",
  drrmo: "DRRMO hotline (set NEXT_PUBLIC_HOTLINE_DRRMO)",
  pnp: "Navotas PNP (set NEXT_PUBLIC_HOTLINE_PNP)",
  bfp: "Navotas BFP (set NEXT_PUBLIC_HOTLINE_BFP)",
} as const;

/** Navotas City bounding box (rough), used to sanity-check coordinates. */
export const NAVOTAS_BOUNDS = {
  minLat: 14.62,
  maxLat: 14.72,
  minLng: 120.9,
  maxLng: 120.98,
} as const;

export const NAVOTAS_CENTER = { lat: 14.6667, lng: 120.9427 } as const;
