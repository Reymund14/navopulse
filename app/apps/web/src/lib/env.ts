/**
 * Central, validated access to environment configuration.
 * In development every secret has a clearly-insecure default so the app runs
 * with zero setup; in production a missing secret is a startup error.
 */
const isProd = process.env.NODE_ENV === "production";

function req(name: string, devDefault: string): string {
  const v = process.env[name];
  if (v && v.length > 0) return v;
  if (isProd && process.env.NAVOPULSE_ALLOW_DEV_SECRETS !== "1") {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return devDefault;
}

/** Dev default in development, undefined in production unless set. */
function devOnly(name: string, devDefault: string): string | undefined {
  const v = process.env[name];
  if (v && v.length > 0) return v;
  return isProd ? undefined : devDefault;
}

function opt(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

export const env = {
  isProd,
  get databaseUrl() {
    return req("DATABASE_URL", "postgres://navopulse:navopulse@localhost:5432/navopulse");
  },
  get sessionSecret() {
    return req("SESSION_SECRET", "dev-only-session-secret-change-me-0123456789abcdef");
  },
  /** 32 bytes, base64. Generate with: openssl rand -base64 32 */
  get dataEncryptionKey() {
    return req("DATA_ENCRYPTION_KEY", "ZGV2LW9ubHktZGF0YS1rZXktY2hhbmdlLW1lLTMyYnk=");
  },
  /** Optional when NAVOBOT_API_KEY is used instead of HMAC signing. */
  get navobotWebhookSecret() {
    return devOnly("NAVOBOT_WEBHOOK_SECRET", "dev-navobot-secret");
  },
  get smsInboundSecret() {
    return req("SMS_INBOUND_SECRET", "dev-sms-inbound-secret");
  },
  get smsProvider() {
    return (opt("SMS_PROVIDER") ?? "console") as "console" | "semaphore" | "twilio";
  },
  semaphoreApiKey: opt("SEMAPHORE_API_KEY"),
  semaphoreSenderName: opt("SEMAPHORE_SENDER_NAME") ?? "NAVOPULSE",
  twilioAccountSid: opt("TWILIO_ACCOUNT_SID"),
  twilioAuthToken: opt("TWILIO_AUTH_TOKEN"),
  twilioFromNumber: opt("TWILIO_FROM_NUMBER"),
  get pushProvider() {
    return (opt("PUSH_PROVIDER") ?? "console") as "console" | "fcm";
  },
  fcmServiceAccountJson: opt("FCM_SERVICE_ACCOUNT_JSON"),
  get storageDir() {
    return opt("STORAGE_DIR") ?? `${process.cwd()}/storage`;
  },
  get appUrl() {
    return opt("APP_URL") ?? "http://localhost:3000";
  },
  /** Show OTP codes in the API response (development/demo only). */
  get exposeOtp() {
    return !isProd || process.env.NAVOPULSE_DEMO_OTP === "1";
  },
};
