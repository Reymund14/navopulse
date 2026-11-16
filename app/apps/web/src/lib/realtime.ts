import { Client } from "pg";
import { env } from "./env";

/**
 * Postgres LISTEN/NOTIFY fan-out. One dedicated connection per server process
 * listens on the "incidents" channel (fed by the incidents_notify trigger) and
 * forwards each payload to every open Server-Sent Events stream.
 */
export interface IncidentEvent {
  op: "INSERT" | "UPDATE";
  id: string;
  module: string;
  status: string;
  priority: string;
  controlNumber: string;
}

type Listener = (e: IncidentEvent) => void;

const g = globalThis as unknown as { __npRealtime?: { listeners: Set<Listener>; client: Client | null; connecting: Promise<void> | null } };
const state = (g.__npRealtime ??= { listeners: new Set(), client: null, connecting: null });

async function ensureConnected() {
  if (state.client) return;
  if (state.connecting) return state.connecting;
  state.connecting = (async () => {
    const client = new Client({ connectionString: env.databaseUrl });
    client.on("notification", (msg) => {
      if (!msg.payload) return;
      try {
        const evt = JSON.parse(msg.payload) as IncidentEvent;
        for (const l of state.listeners) l(evt);
      } catch {
        /* ignore malformed payloads */
      }
    });
    client.on("error", (err) => {
      console.error("[realtime] listener connection lost", err.message);
      state.client = null;
      // Reconnect lazily on the next subscriber, or now if streams are open.
      if (state.listeners.size) setTimeout(() => void ensureConnected(), 2000);
    });
    await client.connect();
    await client.query("LISTEN incidents");
    state.client = client;
  })().finally(() => {
    state.connecting = null;
  });
  return state.connecting;
}

export async function subscribe(listener: Listener): Promise<() => void> {
  await ensureConnected();
  state.listeners.add(listener);
  return () => {
    state.listeners.delete(listener);
  };
}
