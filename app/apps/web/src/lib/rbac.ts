import type { Role } from "@navopulse/shared";

/**
 * Permission matrix. Every API route checks one of these; the dashboard uses
 * the same table to decide which navigation items to show.
 */
export const PERMISSIONS = {
  "incident.read": ["drrmo_dispatcher", "tmo_officer", "pio_admin", "field_responder", "super_admin"],
  "incident.manage": ["drrmo_dispatcher", "tmo_officer", "pio_admin", "super_admin"],
  "incident.respond": ["field_responder", "drrmo_dispatcher", "tmo_officer", "super_admin"],
  "incident.create_walkin": ["drrmo_dispatcher", "tmo_officer", "pio_admin", "super_admin"],
  "pii.reveal": ["drrmo_dispatcher", "tmo_officer", "field_responder", "super_admin"],
  "units.read": ["drrmo_dispatcher", "tmo_officer", "field_responder", "super_admin"],
  "units.manage": ["drrmo_dispatcher", "tmo_officer", "super_admin"],
  "broadcast.send": ["drrmo_dispatcher", "pio_admin", "super_admin"],
  "content.manage": ["pio_admin", "super_admin"],
  "analytics.read": ["drrmo_dispatcher", "tmo_officer", "pio_admin", "super_admin"],
  "notifications.read": ["drrmo_dispatcher", "pio_admin", "super_admin"],
  "sms.read": ["drrmo_dispatcher", "super_admin"],
  "users.manage": ["super_admin"],
  "audit.read": ["super_admin"],
  "settings.manage": ["super_admin"],
  "citizen.self": ["citizen"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

/** The office whose incidents a role works on; null means "no office filter". */
export function officeScope(role: Role): "DRRMO" | "TMO" | "PIO" | null {
  switch (role) {
    case "drrmo_dispatcher":
      return "DRRMO";
    case "tmo_officer":
      return "TMO";
    case "pio_admin":
      return "PIO";
    default:
      return null;
  }
}

/** Roles that see reporter identity unmasked by default (still access-logged). */
export function seesReporterIdentity(role: Role): boolean {
  return role === "drrmo_dispatcher" || role === "tmo_officer" || role === "super_admin";
}
