import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import { env } from "../env";

/**
 * File storage abstraction. LocalDiskStorage is used for development and
 * single-server deployments; SupabaseStorage is used when SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY are set (bucket stays private; the app serves the
 * files through its own authenticated /api/media route).
 */
export interface StorageProvider {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
}

export class LocalDiskStorage implements StorageProvider {
  constructor(private root: string) {}
  private path(key: string) {
    const p = normalize(join(this.root, key));
    if (!p.startsWith(normalize(this.root))) throw new Error("Invalid storage key");
    return p;
  }
  async put(key: string, data: Buffer) {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, data);
  }
  async get(key: string) {
    try {
      return await readFile(this.path(key));
    } catch {
      return null;
    }
  }
}

/**
 * Supabase Storage over the REST API with the service-role key. Only the server
 * holds that key; the bucket is private and photos are streamed by /api/media.
 */
export class SupabaseStorage implements StorageProvider {
  private bucketReady: Promise<void> | null = null;
  constructor(private url: string, private key: string, private bucket: string) {}

  private get base() {
    return `${this.url.replace(/\/+$/, "")}/storage/v1`;
  }
  private headers(extra: Record<string, string> = {}) {
    return { apikey: this.key, Authorization: `Bearer ${this.key}`, ...extra };
  }
  private objectPath(key: string) {
    return `${this.base}/object/${this.bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;
  }
  /** Create the private bucket once, on first upload (400/409 = already there). */
  private ensureBucket() {
    this.bucketReady ??= (async () => {
      const res = await fetch(`${this.base}/bucket`, {
        method: "POST",
        headers: this.headers({ "Content-Type": "application/json" }),
        body: JSON.stringify({ id: this.bucket, name: this.bucket, public: false }),
      });
      if (!res.ok && res.status !== 400 && res.status !== 409) {
        throw new Error(`Supabase bucket setup failed: ${res.status} ${await res.text()}`);
      }
    })();
    return this.bucketReady;
  }
  async put(key: string, data: Buffer, contentType: string) {
    await this.ensureBucket();
    const res = await fetch(this.objectPath(key), {
      method: "POST",
      headers: this.headers({ "Content-Type": contentType, "x-upsert": "true" }),
      body: new Uint8Array(data),
    });
    if (!res.ok) throw new Error(`Supabase upload failed: ${res.status} ${await res.text()}`);
  }
  async get(key: string) {
    const res = await fetch(this.objectPath(key), { headers: this.headers() });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Supabase download failed: ${res.status} ${await res.text()}`);
    return Buffer.from(await res.arrayBuffer());
  }
}

let cached: StorageProvider | null = null;
export function storage(): StorageProvider {
  cached ??= env.supabaseUrl && env.supabaseServiceRoleKey
    ? new SupabaseStorage(env.supabaseUrl, env.supabaseServiceRoleKey, env.supabaseStorageBucket)
    : new LocalDiskStorage(env.storageDir);
  return cached;
}

/** Accept only real images, checked by magic bytes rather than the declared type. */
export function sniffImageType(buf: Buffer): "image/jpeg" | "image/png" | "image/webp" | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length > 12 && buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP") return "image/webp";
  return null;
}
