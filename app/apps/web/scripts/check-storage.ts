/**
 * End-to-end check for Supabase Storage against a real project. Not part of the
 * test suite (needs credentials):
 *   cd app
 *   $env:SUPABASE_URL="https://<ref>.supabase.co"
 *   $env:SUPABASE_SERVICE_ROLE_KEY="<service role key>"
 *   pnpm storage:check
 *
 * Uploads a 1x1 PNG to health/storage-check.png (overwritten each run), asks for
 * a signed URL, and fetches it the way the browser will after /api/media redirects.
 */
import { storage } from "../src/lib/providers/storage";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
const KEY = "health/storage-check.png";

async function main() {
  const provider = storage();
  if (!provider.signedUrl) {
    throw new Error("Supabase is not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  }

  await provider.put(KEY, PNG, "image/png");
  console.log("ok   upload (bucket created if missing)");

  const url = await provider.signedUrl(KEY, 60);
  console.log(`ok   signed url ${url.split("?")[0]}`);

  const res = await fetch(url);
  if (res.status !== 200) throw new Error(`signed download returned ${res.status}: ${await res.text()}`);
  const body = Buffer.from(await res.arrayBuffer());
  if (!body.equals(PNG)) throw new Error(`downloaded ${body.length} bytes differ from the ${PNG.length} uploaded`);

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) throw new Error(`content-type is "${contentType}", not an image type`);

  console.log(`ok   download ${body.length} bytes as ${contentType}`);
  console.log("PASS Supabase Storage works end to end");
}

main().catch((e) => {
  console.error("FAIL", e instanceof Error ? e.message : e);
  process.exit(1);
});
