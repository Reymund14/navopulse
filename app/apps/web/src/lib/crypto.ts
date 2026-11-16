import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "./env";

/**
 * Field-level encryption for personal data at rest (RA 10173).
 * Format: v1.<iv b64url>.<tag b64url>.<ciphertext b64url>
 */
function key(): Buffer {
  const k = Buffer.from(env.dataEncryptionKey, "base64");
  if (k.length !== 32) throw new Error("DATA_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
  return k;
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(".");
}

export function decrypt(value: string | null | undefined): string | null {
  if (!value) return null;
  const [v, iv, tag, ct] = value.split(".");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("Unrecognised ciphertext format");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}

/** Deterministic keyed digest for looking up a value without storing it. */
export function lookupHash(value: string): string {
  return createHmac("sha256", key()).update(`lookup:${value}`).digest("hex");
}

export function hmacSha256Hex(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** "+639171234567" -> "+63 917 *** 4567" for roles that do not need the full number. */
export function maskMobile(m: string | null): string | null {
  if (!m) return null;
  return m.length >= 8 ? `${m.slice(0, 3)} ${m.slice(3, 6)} *** ${m.slice(-4)}` : "***";
}

export function maskName(name: string | null): string | null {
  if (!name) return null;
  return name
    .split(/\s+/)
    .map((p) => (p.length <= 1 ? p : `${p[0]}${"*".repeat(Math.min(p.length - 1, 4))}`))
    .join(" ");
}
