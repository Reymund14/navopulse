import { createSign } from "node:crypto";
import { env } from "../env";

/**
 * Push notification abstraction. FCM covers Android, web, and iOS (via APNs
 * through FCM). The console provider is the default until the city's Firebase
 * project is set up.
 */
export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface PushSendResult {
  token: string;
  ok: boolean;
  error?: string;
  /** Token is permanently invalid and should be deleted. */
  unregistered?: boolean;
}

export interface PushProvider {
  readonly name: string;
  send(tokens: string[], msg: PushMessage): Promise<PushSendResult[]>;
}

export class ConsolePushProvider implements PushProvider {
  readonly name = "console";
  async send(tokens: string[], msg: PushMessage) {
    console.log(`[push:console] ${tokens.length} device(s): ${msg.title} — ${msg.body}`);
    return tokens.map((token) => ({ token, ok: true }));
  }
}

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

/** FCM HTTP v1 API using a service-account JSON (FCM_SERVICE_ACCOUNT_JSON). */
export class FcmPushProvider implements PushProvider {
  readonly name = "fcm";
  private accessToken: { value: string; expiresAt: number } | null = null;
  constructor(private sa: ServiceAccount) {}

  private async token(): Promise<string> {
    if (this.accessToken && this.accessToken.expiresAt > Date.now() + 60_000) return this.accessToken.value;
    const now = Math.floor(Date.now() / 1000);
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
      iss: this.sa.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
    })}`;
    const signature = createSign("RSA-SHA256").update(unsigned).sign(this.sa.private_key).toString("base64url");
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
    });
    const data = (await res.json()) as { access_token: string; expires_in: number };
    this.accessToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
    return data.access_token;
  }

  async send(tokens: string[], msg: PushMessage): Promise<PushSendResult[]> {
    const access = await this.token();
    return Promise.all(
      tokens.map(async (token) => {
        const res = await fetch(`https://fcm.googleapis.com/v1/projects/${this.sa.project_id}/messages:send`, {
          method: "POST",
          headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
          body: JSON.stringify({ message: { token, notification: { title: msg.title, body: msg.body }, data: msg.data } }),
        });
        if (res.ok) return { token, ok: true };
        const err = (await res.json().catch(() => ({}))) as { error?: { status?: string; message?: string } };
        return { token, ok: false, error: err.error?.message ?? `HTTP ${res.status}`, unregistered: err.error?.status === "NOT_FOUND" || err.error?.status === "UNREGISTERED" };
      }),
    );
  }
}

let cached: PushProvider | null = null;
export function pushProvider(): PushProvider {
  if (cached) return cached;
  if (env.pushProvider === "fcm") {
    if (!env.fcmServiceAccountJson) throw new Error("PUSH_PROVIDER=fcm requires FCM_SERVICE_ACCOUNT_JSON");
    cached = new FcmPushProvider(JSON.parse(env.fcmServiceAccountJson) as ServiceAccount);
  } else {
    cached = new ConsolePushProvider();
  }
  return cached;
}

export function setPushProvider(p: PushProvider | null) {
  cached = p;
}
