import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export function json(data: unknown, init?: number | ResponseInit) {
  return NextResponse.json(data, typeof init === "number" ? { status: init } : init);
}

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError(400, "Request body must be JSON");
  }
  return schema.parse(raw);
}

/**
 * Client IP for rate limiting and audit logs. X-Forwarded-For is only trusted
 * when TRUST_PROXY=1 (set it when running behind a reverse proxy that
 * overwrites the header), otherwise anyone could spoof it.
 */
export function clientIp(req: Request): string | null {
  const fwd = process.env.TRUST_PROXY === "1" ? req.headers.get("x-forwarded-for") : null;
  const ip = fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip");
  return ip && /^[0-9a-fA-F:.]+$/.test(ip) ? ip : null;
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

/** Wrap a route handler with uniform error handling. */
export function route<C = unknown>(fn: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      if (err instanceof ApiError) {
        const retry = (err.details as { retryAfterSeconds?: number } | undefined)?.retryAfterSeconds;
        return json({ error: err.message, details: err.details }, { status: err.status, headers: retry ? { "Retry-After": String(retry) } : undefined });
      }
      if (err instanceof ZodError) {
        return json({ error: "Validation failed", details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, 400);
      }
      console.error("[api] unhandled error", err);
      return json({ error: "Internal server error" }, 500);
    }
  };
}

// ------------------------------------------------------------ rate limiting
// Fixed-window counter per key, in process memory. Good enough for a single
// instance; put Redis behind this function when running several replicas.
const windows = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const w = windows.get(key);
  if (!w || w.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    if (windows.size > 50_000) {
      for (const [k, v] of windows) if (v.resetAt <= now) windows.delete(k);
    }
    return;
  }
  w.count += 1;
  if (w.count > limit) {
    throw new ApiError(429, "Too many requests. Please wait and try again.", { retryAfterSeconds: Math.ceil((w.resetAt - now) / 1000) });
  }
}
