import { z } from "zod";

/**
 * Content types managed by the PIO in the dashboard. Each entry maps API
 * fields (camelCase) to columns and defines validation, so one generic CRUD
 * route serves every type.
 */
const point = z.object({ lat: z.number().min(14.5).max(14.8), lng: z.number().min(120.8).max(121.1) });

export interface ContentType {
  table: string;
  schema: z.ZodObject;
  /** camelCase field -> column */
  columns: Record<string, string>;
  /** Field holding a point, stored in column "location". */
  pointField?: string;
  select: string;
  orderBy: string;
  allowCreate: boolean;
  allowDelete: boolean;
}

export const CONTENT_TYPES: Record<string, ContentType> = {
  announcements: {
    table: "announcements",
    schema: z.object({
      titleEn: z.string().trim().min(3).max(200), titleFil: z.string().trim().min(3).max(200),
      bodyEn: z.string().trim().min(3).max(5000), bodyFil: z.string().trim().min(3).max(5000),
      imageUrl: z.url().optional().nullable(), isPublished: z.boolean().default(true),
    }),
    columns: { titleEn: "title_en", titleFil: "title_fil", bodyEn: "body_en", bodyFil: "body_fil", imageUrl: "image_url", isPublished: "is_published" },
    select: "id, title_en, title_fil, body_en, body_fil, image_url, is_published, published_at",
    orderBy: "published_at DESC",
    allowCreate: true, allowDelete: true,
  },
  events: {
    table: "events",
    schema: z.object({
      title: z.string().trim().min(3).max(200), description: z.string().trim().max(5000).default(""),
      venue: z.string().trim().max(200).optional().nullable(), barangayId: z.uuid().optional().nullable(),
      startsAt: z.iso.datetime({ offset: true }), endsAt: z.iso.datetime({ offset: true }).optional().nullable(),
      location: point.optional().nullable(), isPublished: z.boolean().default(true),
    }),
    columns: { title: "title", description: "description", venue: "venue", barangayId: "barangay_id", startsAt: "starts_at", endsAt: "ends_at", isPublished: "is_published" },
    pointField: "location",
    select: "id, title, description, venue, barangay_id, starts_at, ends_at, is_published, ST_Y(location) AS lat, ST_X(location) AS lng",
    orderBy: "starts_at DESC",
    allowCreate: true, allowDelete: true,
  },
  businesses: {
    table: "businesses",
    schema: z.object({
      name: z.string().trim().min(2).max(200), category: z.string().trim().min(2).max(80),
      description: z.string().trim().max(2000).default(""), address: z.string().trim().max(300).optional().nullable(),
      contact: z.string().trim().max(120).optional().nullable(), barangayId: z.uuid().optional().nullable(),
      location: point.optional().nullable(), isPublished: z.boolean().default(true),
    }),
    columns: { name: "name", category: "category", description: "description", address: "address", contact: "contact", barangayId: "barangay_id", isPublished: "is_published" },
    pointField: "location",
    select: "id, name, category, description, address, contact, barangay_id, is_published, ST_Y(location) AS lat, ST_X(location) AS lng",
    orderBy: "name",
    allowCreate: true, allowDelete: true,
  },
  transit_routes: {
    table: "transit_routes",
    schema: z.object({
      code: z.string().trim().min(2).max(30), name: z.string().trim().min(2).max(200),
      mode: z.enum(["jeepney", "bus", "tricycle", "pedicab", "ferry", "uv_express"]),
      origin: z.string().trim().min(2).max(200), destination: z.string().trim().min(2).max(200),
      fareMin: z.number().nonnegative().max(10000).optional().nullable(), fareNotes: z.string().trim().max(500).optional().nullable(),
      description: z.string().trim().max(2000).default(""), isActive: z.boolean().default(true),
    }),
    columns: { code: "code", name: "name", mode: "mode", origin: "origin", destination: "destination", fareMin: "fare_min", fareNotes: "fare_notes", description: "description", isActive: "is_active" },
    select: "id, code, name, mode, origin, destination, fare_min::float AS fare_min, fare_notes, description, is_active",
    orderBy: "mode, name",
    allowCreate: true, allowDelete: true,
  },
  barangays: {
    table: "barangays",
    schema: z.object({
      hotline: z.string().trim().max(120).optional().nullable(),
      address: z.string().trim().max(300).optional().nullable(),
      population: z.number().int().nonnegative().optional().nullable(),
      officials: z.array(z.object({ position: z.string().trim().max(80), name: z.string().trim().max(120), contact: z.string().trim().max(80).optional() })).max(30).optional(),
    }),
    columns: { hotline: "hotline", address: "address", population: "population", officials: "officials" },
    select: "id, name, district, hotline, address, population, officials",
    orderBy: "name",
    allowCreate: false, allowDelete: false,
  },
};
