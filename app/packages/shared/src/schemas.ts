import { z } from "zod";
import {
  ADVISORY_SEVERITIES,
  INCIDENT_STATUSES,
  LANGUAGES,
  PRIORITIES,
  ROLES,
  SOS_TYPES,
  SOURCES,
} from "./constants";

/** Philippine mobile numbers, normalised to +639XXXXXXXXX. */
export const phMobile = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s()-]/g, ""))
  .transform((v) => (v.startsWith("09") ? `+63${v.slice(1)}` : v.startsWith("639") ? `+${v}` : v))
  .pipe(z.string().regex(/^\+639\d{9}$/, "Use a PH mobile number like 0917 123 4567"));

export const latLng = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().nonnegative().optional(),
});

export const sosTypeSchema = z.enum(Object.keys(SOS_TYPES) as [keyof typeof SOS_TYPES, ...(keyof typeof SOS_TYPES)[]]);

/** Citizen-submitted report (SOS or civic). clientId makes retries idempotent. */
export const createIncidentSchema = z.object({
  clientId: z.uuid(),
  categoryCode: z.string().min(2).max(40),
  description: z.string().trim().max(2000).default(""),
  location: latLng,
  addressText: z.string().trim().max(300).optional(),
  peopleAffected: z.number().int().min(0).max(100000).optional(),
  /** EXIF timestamp from the photo, if any (ISO string). */
  observedAt: z.iso.datetime({ offset: true }).optional(),
  locationSource: z.enum(["device", "exif", "manual"]).default("device"),
  mediaIds: z.array(z.uuid()).max(5).default([]),
});
export type CreateIncidentInput = z.infer<typeof createIncidentSchema>;

/** Payload Power Automate sends to POST /api/integrations/navobot/tickets. */
export const navobotTicketSchema = z.object({
  conversationId: z.string().min(1).max(200),
  /** Category code (e.g. CIV_WASTE) or a free-text category the bot captured. */
  category: z.string().min(1).max(80),
  description: z.string().trim().min(1).max(2000),
  location: latLng.optional(),
  addressText: z.string().trim().max(300).optional(),
  barangay: z.string().trim().max(80).optional(),
  citizen: z
    .object({
      name: z.string().trim().max(120).optional(),
      mobileNumber: z.string().trim().max(20).optional(),
    })
    .optional(),
  language: z.enum(["en", "fil", "taglish"]).optional(),
  transcriptUrl: z.url().optional(),
});
export type NavobotTicketInput = z.infer<typeof navobotTicketSchema>;

export const statusChangeSchema = z.object({
  status: z.enum(INCIDENT_STATUSES),
  note: z.string().trim().max(1000).optional(),
});

export const assignSchema = z.object({
  unitId: z.uuid(),
  note: z.string().trim().max(1000).optional(),
});

export const mergeSchema = z.object({
  duplicateOfId: z.uuid(),
  note: z.string().trim().max(1000).optional(),
});

export const noteSchema = z.object({ body: z.string().trim().min(1).max(2000) });

export const resolveSchema = z.object({
  note: z.string().trim().min(1).max(2000),
  mediaIds: z.array(z.uuid()).max(5).default([]),
});

export const feedbackSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
});

export const advisorySchema = z.object({
  title: z.string().trim().min(3).max(160),
  bodyEn: z.string().trim().min(3).max(1000),
  bodyFil: z.string().trim().min(3).max(1000),
  severity: z.enum(ADVISORY_SEVERITIES),
  barangayIds: z.array(z.uuid()).default([]), // empty = all barangays
  channels: z.array(z.enum(["push", "sms"])).min(1),
});

export const staffLoginSchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(200),
});

export const otpRequestSchema = z.object({ mobileNumber: phMobile });
export const otpVerifySchema = z.object({
  mobileNumber: phMobile,
  code: z.string().regex(/^\d{6}$/),
  fullName: z.string().trim().max(120).optional(),
  barangayId: z.uuid().optional(),
  preferredLanguage: z.enum(LANGUAGES).optional(),
  /** RA 10173: registration requires explicit consent to the privacy notice. */
  privacyConsent: z.literal(true).optional(),
});

export const incidentFilterSchema = z.object({
  module: z.enum(["emergency", "civic", "traffic"]).optional(),
  status: z.array(z.enum(INCIDENT_STATUSES)).optional(),
  source: z.array(z.enum(SOURCES)).optional(),
  priority: z.array(z.enum(PRIORITIES)).optional(),
  barangayId: z.uuid().optional(),
  categoryCode: z.string().optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  q: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(10000).default(500),
});

export const userAdminSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.email(),
  role: z.enum(ROLES),
  password: z.string().min(10).max(200).optional(),
  isActive: z.boolean().default(true),
});

export const deviceTokenSchema = z.object({
  platform: z.enum(["android", "ios", "web"]),
  token: z.string().min(10).max(4096),
});
