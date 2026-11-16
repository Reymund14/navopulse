import { describe, expect, it } from "vitest";
import {
  canTransition,
  createIncidentSchema,
  encodeSosSms,
  formatControlNumber,
  manilaDateKey,
  messages,
  parseControlNumber,
  parseSosSms,
  phMobile,
  SMS_MAX_LENGTH,
} from "../src";

describe("control numbers", () => {
  it("formats with zero-padded sequence", () => {
    expect(formatControlNumber("EMR", "20261019", 123)).toBe("NVP-EMR-20261019-000123");
  });
  it("round-trips through the parser", () => {
    expect(parseControlNumber("nvp-civ-20261019-000001")).toEqual({ code: "CIV", dateKey: "20261019", sequence: 1 });
    expect(parseControlNumber("NVP-XXX-20261019-000001")).toBeNull();
  });
  it("uses the Manila calendar date", () => {
    // 2026-10-18 17:30 UTC is 2026-10-19 01:30 in Manila
    expect(manilaDateKey(new Date("2026-10-18T17:30:00Z"))).toBe("20261019");
    expect(manilaDateKey(new Date("2026-10-18T15:59:00Z"))).toBe("20261018");
  });
  it("rejects bad sequences", () => {
    expect(() => formatControlNumber("EMR", "20261019", 0)).toThrow();
    expect(() => formatControlNumber("EMR", "20261019", 1_000_000)).toThrow();
  });
});

describe("offline SOS SMS payload", () => {
  const clientRef = "7f3a9c2e-1b4d-4e0f-8a6b-5c4d3e2f1a0b";
  it("encodes within one SMS segment and parses back", () => {
    const sms = encodeSosSms({
      type: "flood",
      lat: 14.667123,
      lng: 120.942311,
      peopleAffected: 4,
      clientRef,
      note: "Stranded kami sa bubong, may matanda at bata. Tubig hanggang dibdib na! ".repeat(3),
    });
    expect(sms.length).toBeLessThanOrEqual(SMS_MAX_LENGTH);
    expect(sms.startsWith("NVP1 SOS FLD 14.66712,120.94231 P4 R7f3a9c2e")).toBe(true);
    const parsed = parseSosSms(sms);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.payload).toMatchObject({ type: "flood", lat: 14.66712, lng: 120.94231, peopleAffected: 4, clientRef });
      expect(parsed.payload.note).toMatch(/^Stranded kami/);
    }
  });
  it("accepts hand-typed lowercase messages without a reference", () => {
    const parsed = parseSosSms("  nvp1 sos fir 14.65,120.95  p2  n: sunog sa kanto ");
    expect(parsed).toEqual({
      ok: true,
      payload: { type: "fire", lat: 14.65, lng: 120.95, peopleAffected: 2, clientRef: undefined, note: "sunog sa kanto" },
    });
  });
  it("rejects garbage", () => {
    expect(parseSosSms("hello po").ok).toBe(false);
    expect(parseSosSms("NVP1 SOS XYZ 14,120").ok).toBe(false);
    expect(parseSosSms("NVP1 SOS FLD nowhere").ok).toBe(false);
  });
});

describe("workflow", () => {
  it("never leaves a terminal status", () => {
    expect(canTransition("submitted", "verified")).toBe(true);
    expect(canTransition("resolved", "in_progress")).toBe(false);
    expect(canTransition("duplicate", "verified")).toBe(false);
  });
});

describe("validation", () => {
  it("normalises PH mobile numbers", () => {
    expect(phMobile.parse("0917 123 4567")).toBe("+639171234567");
    expect(phMobile.parse("639171234567")).toBe("+639171234567");
    expect(() => phMobile.parse("12345")).toThrow();
  });
  it("requires a client UUID for idempotency", () => {
    const base = { categoryCode: "EMR_FLOOD", location: { lat: 14.66, lng: 120.94 } };
    expect(createIncidentSchema.safeParse(base).success).toBe(false);
    expect(createIncidentSchema.safeParse({ ...base, clientId: crypto.randomUUID() }).success).toBe(true);
  });
});

describe("i18n", () => {
  it("has a Filipino string for every English key", () => {
    for (const key of Object.keys(messages.en)) expect(messages.fil[key as keyof typeof messages.en]).toBeTruthy();
  });
});
