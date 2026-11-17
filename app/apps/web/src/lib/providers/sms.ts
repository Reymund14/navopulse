import { env } from "../env";

/**
 * SMS gateway abstraction. Swap providers with SMS_PROVIDER without touching
 * call sites. Inbound messages arrive at POST /api/integrations/sms/inbound,
 * which each provider's webhook is configured to call.
 */
export interface SmsSendResult {
  providerMessageId: string | null;
  status: "sent" | "failed";
  error?: string;
}

export interface SmsProvider {
  readonly name: string;
  send(to: string, body: string): Promise<SmsSendResult>;
}

/** Logs messages instead of sending them. Default for development and demos. */
export class ConsoleSmsProvider implements SmsProvider {
  readonly name = "console";
  async send(to: string, body: string): Promise<SmsSendResult> {
    console.log(`[sms:console] -> ${to}: ${body}`);
    return { providerMessageId: `console-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, status: "sent" };
  }
}

/** Semaphore (semaphore.co), a Philippine SMS API. Needs SEMAPHORE_API_KEY. */
export class SemaphoreSmsProvider implements SmsProvider {
  readonly name = "semaphore";
  constructor(private apiKey: string, private senderName: string) {}
  async send(to: string, body: string): Promise<SmsSendResult> {
    const params = new URLSearchParams({ apikey: this.apiKey, number: to.replace(/^\+63/, "0"), message: body, sendername: this.senderName });
    try {
      const res = await fetch("https://api.semaphore.co/api/v4/messages", { method: "POST", body: params });
      const data = (await res.json().catch(() => null)) as Array<{ message_id?: number }> | { message?: string } | null;
      if (!res.ok || !Array.isArray(data)) return { providerMessageId: null, status: "failed", error: `HTTP ${res.status}` };
      return { providerMessageId: String(data[0]?.message_id ?? ""), status: "sent" };
    } catch (e) {
      return { providerMessageId: null, status: "failed", error: (e as Error).message };
    }
  }
}

/** Twilio fallback. Needs TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER. */
export class TwilioSmsProvider implements SmsProvider {
  readonly name = "twilio";
  constructor(private sid: string, private token: string, private from: string) {}
  async send(to: string, body: string): Promise<SmsSendResult> {
    const auth = Buffer.from(`${this.sid}:${this.token}`).toString("base64");
    try {
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${this.sid}/Messages.json`, {
        method: "POST",
        headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ To: to, From: this.from, Body: body }),
      });
      const data = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
      if (!res.ok) return { providerMessageId: null, status: "failed", error: data.message ?? `HTTP ${res.status}` };
      return { providerMessageId: data.sid ?? null, status: "sent" };
    } catch (e) {
      return { providerMessageId: null, status: "failed", error: (e as Error).message };
    }
  }
}

let cached: SmsProvider | null = null;
export function smsProvider(): SmsProvider {
  if (cached) return cached;
  switch (env.smsProvider) {
    case "semaphore":
      if (!env.semaphoreApiKey) throw new Error("SMS_PROVIDER=semaphore requires SEMAPHORE_API_KEY");
      cached = new SemaphoreSmsProvider(env.semaphoreApiKey, env.semaphoreSenderName);
      break;
    case "twilio":
      if (!env.twilioAccountSid || !env.twilioAuthToken || !env.twilioFromNumber) throw new Error("SMS_PROVIDER=twilio requires TWILIO_* variables");
      cached = new TwilioSmsProvider(env.twilioAccountSid, env.twilioAuthToken, env.twilioFromNumber);
      break;
    default:
      cached = new ConsoleSmsProvider();
  }
  console.log(`[sms:debug] using provider=${cached.name}`);
  return cached;
}

/** Test hook. */
export function setSmsProvider(p: SmsProvider | null) {
  cached = p;
}
