import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SupabaseStorage } from "@/lib/providers/storage";

// Minimal stand-in for the Supabase Storage REST API.
const objects = new Map<string, Buffer>();
const calls: { method: string; url: string; headers: IncomingMessage["headers"]; body: Buffer }[] = [];
let server: Server;
let api: SupabaseStorage;

beforeAll(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      calls.push({ method: req.method!, url: req.url!, headers: req.headers, body });
      if (req.method === "POST" && req.url === "/storage/v1/bucket") return res.writeHead(400).end("bucket exists");
      if (req.url?.startsWith("/storage/v1/object/navopulse-media/")) {
        const key = decodeURIComponent(req.url.slice("/storage/v1/object/navopulse-media/".length));
        if (req.method === "POST") {
          objects.set(key, body);
          return res.writeHead(200).end("{}");
        }
        const data = objects.get(key);
        return data ? res.writeHead(200).end(data) : res.writeHead(404).end();
      }
      res.writeHead(500).end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  api = new SupabaseStorage(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, "service-key", "navopulse-media");
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe("SupabaseStorage", () => {
  it("uploads with auth headers and creates the private bucket once", async () => {
    await api.put("report/2026-11/a b.jpg", Buffer.from("first"), "image/jpeg");
    await api.put("resolution/2026-11/c.png", Buffer.from("second"), "image/png");

    const bucketCalls = calls.filter((c) => c.url === "/storage/v1/bucket");
    expect(bucketCalls).toHaveLength(1);
    expect(JSON.parse(bucketCalls[0]!.body.toString())).toMatchObject({ public: false });

    const upload = calls.find((c) => c.url.endsWith("a%20b.jpg"))!;
    expect(upload.headers.authorization).toBe("Bearer service-key");
    expect(upload.headers["content-type"]).toBe("image/jpeg");
    expect(upload.body.toString()).toBe("first");
  });

  it("downloads an object, and returns null for a missing key", async () => {
    await expect(api.get("report/2026-11/a b.jpg")).resolves.toEqual(Buffer.from("first"));
    await expect(api.get("report/2026-11/missing.jpg")).resolves.toBeNull();
  });
});
