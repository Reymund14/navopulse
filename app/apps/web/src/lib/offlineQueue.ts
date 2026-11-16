"use client";

import type { CreateIncidentInput } from "@navopulse/shared";

/**
 * Offline report queue (NFR reliability). Reports that cannot be sent are
 * kept in localStorage with their client-generated UUID and retried when the
 * device is back online. The server deduplicates on that UUID, so a retry
 * (or the same report arriving by SMS) never creates a second incident.
 */
export interface QueuedPhoto {
  dataUrl: string;
  exifLat: number | null;
  exifLng: number | null;
  exifTakenAt: string | null;
}

export interface QueuedReport {
  clientId: string;
  kind: "sos" | "report";
  body: Omit<CreateIncidentInput, "mediaIds"> & { mediaIds?: string[] };
  photos: QueuedPhoto[];
  createdAt: string;
  attempts: number;
  lastError?: string;
}

const KEY = "np_queue";
const SENT = "np_sent";

function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    // Storage full: drop photos from queued items rather than lose the report itself.
    if (key === KEY) {
      try {
        localStorage.setItem(key, JSON.stringify((v as QueuedReport[]).map((q) => ({ ...q, photos: [] }))));
      } catch {
        /* give up */
      }
    }
  }
}

export const queue = {
  list: () => read<QueuedReport[]>(KEY, []),
  add(item: QueuedReport) {
    const all = queue.list().filter((q) => q.clientId !== item.clientId);
    write(KEY, [...all, item]);
    window.dispatchEvent(new Event("np-queue"));
  },
  remove(clientId: string) {
    write(KEY, queue.list().filter((q) => q.clientId !== clientId));
    window.dispatchEvent(new Event("np-queue"));
  },
  update(clientId: string, patch: Partial<QueuedReport>) {
    write(KEY, queue.list().map((q) => (q.clientId === clientId ? { ...q, ...patch } : q)));
    window.dispatchEvent(new Event("np-queue"));
  },
  sent: () => read<Record<string, string>>(SENT, {}),
  markSent(clientId: string, controlNumber: string) {
    write(SENT, { ...queue.sent(), [clientId]: controlNumber });
  },
};

export class NetworkError extends Error {}

async function dataUrlToBlob(dataUrl: string) {
  return (await fetch(dataUrl)).blob();
}

async function post(path: string, init: RequestInit) {
  let res: Response;
  try {
    res = await fetch(path, { ...init, credentials: "same-origin" });
  } catch {
    throw new NetworkError("No connection");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error((data as { error?: string }).error ?? `Error ${res.status}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return data;
}

/** Upload photos then create the incident. Throws NetworkError when offline. */
export async function sendReport(item: QueuedReport): Promise<{ controlNumber: string; id: string }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new NetworkError("Offline");
  const mediaIds: string[] = [...(item.body.mediaIds ?? [])];
  for (const p of item.photos) {
    const fd = new FormData();
    fd.append("file", await dataUrlToBlob(p.dataUrl), "photo.jpg");
    fd.append("type", "report");
    if (p.exifLat !== null) fd.append("exifLat", String(p.exifLat));
    if (p.exifLng !== null) fd.append("exifLng", String(p.exifLng));
    if (p.exifTakenAt) fd.append("exifTakenAt", p.exifTakenAt);
    const r = (await post("/api/media", { method: "POST", body: fd })) as { media: { id: string } };
    mediaIds.push(r.media.id);
  }
  const r = (await post("/api/incidents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...item.body, mediaIds }),
  })) as { controlNumber: string; id: string };
  queue.markSent(item.clientId, r.controlNumber);
  return r;
}

let flushing = false;
/** Retry everything in the queue. Called on load, on `online`, and every 30 s. */
export async function flushQueue(): Promise<number> {
  if (flushing) return 0;
  flushing = true;
  let sent = 0;
  try {
    for (const item of queue.list()) {
      try {
        await sendReport(item);
        queue.remove(item.clientId);
        sent++;
      } catch (e) {
        if (e instanceof NetworkError) break;
        const status = (e as { status?: number }).status;
        // Session expired: keep it until the user signs in again.
        queue.update(item.clientId, { attempts: item.attempts + 1, lastError: status === 401 ? "Sign in to send" : (e as Error).message });
      }
    }
  } finally {
    flushing = false;
  }
  return sent;
}

export async function fileToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

export function smsHref(number: string, body: string) {
  const ios = typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);
  return `sms:${number}${ios ? "&" : "?"}body=${encodeURIComponent(body)}`;
}
