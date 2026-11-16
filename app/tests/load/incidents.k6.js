/**
 * NavoPulse load test (k6). Run against STAGING, never production.
 *
 *   k6 run -e BASE_URL=https://staging.example.org tests/load/incidents.k6.js
 *   k6 run -e BASE_URL=http://localhost:3000 -e DASH_VUS=20 -e CITIZEN_VUS=10 tests/load/incidents.k6.js
 *
 * Scenarios
 *   dashboard  logs in once as dispatch@navopulse.local (setup), then every VU
 *              polls GET /api/incidents?limit=5000 (the map feed) and
 *              GET /api/analytics/summary. Threshold: p95 < 500 ms each.
 *   citizens   each VU signs in as its own synthetic citizen through OTP
 *              (/api/auth/otp/request returns devCode outside production or
 *              when NAVOPULSE_DEMO_OTP=1), then files EMR_FLOOD reports with
 *              random clientId UUIDs inside Navotas. Threshold: p95 < 500 ms.
 *
 * Environment variables
 *   BASE_URL          default http://localhost:3000
 *   STAFF_EMAIL       default dispatch@navopulse.local
 *   STAFF_PASSWORD    default NavoPulse!2026 (the seeded demo password)
 *   DASH_VUS          default 10     CITIZEN_VUS  default 5
 *   DURATION          default 2m
 *   SPOOF_XFF         default 1. The API's in-memory rate limiter keys OTP
 *                     requests on the client IP taken from X-Forwarded-For
 *                     (10 OTP requests per IP per 15 min). Load generators
 *                     run from one IP, so each VU sends a synthetic
 *                     X-Forwarded-For. This only works when nothing in front
 *                     of the app overwrites the header; see the security
 *                     review (docs/07-security-privacy.md, A05). Set 0 when
 *                     the staging proxy strips it, and raise the limits there.
 *
 * Rate limits the script respects (src/lib/http.ts callers)
 *   POST /api/incidents   20 per user per 10 min  -> each citizen VU files at
 *                         most 15 reports, then registers a fresh number.
 *   POST /api/auth/otp/request  3 per number per 15 min -> new random number
 *                         per login.
 *
 * Data created: one citizen user per citizen login (+63 998 xxx xxxx) and the
 * reports. Clean up afterwards with the SQL in docs/08-testing-plan.md.
 */
import http from "k6/http";
import { check, fail, sleep } from "k6";
import { Counter } from "k6/metrics";

const BASE_URL = (__ENV.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const STAFF_EMAIL = __ENV.STAFF_EMAIL || "dispatch@navopulse.local";
const STAFF_PASSWORD = __ENV.STAFF_PASSWORD || "NavoPulse!2026";
const DURATION = __ENV.DURATION || "2m";
const SPOOF_XFF = (__ENV.SPOOF_XFF || "1") === "1";
const REPORTS_PER_CITIZEN = 15;

const created = new Counter("incidents_created");
const deduplicated = new Counter("incidents_deduplicated");

export const options = {
  scenarios: {
    dashboard: {
      executor: "constant-vus",
      exec: "dashboard",
      vus: Number(__ENV.DASH_VUS || 10),
      duration: DURATION,
    },
    citizens: {
      executor: "constant-vus",
      exec: "citizen",
      vus: Number(__ENV.CITIZEN_VUS || 5),
      duration: DURATION,
      startTime: "5s",
    },
  },
  thresholds: {
    "http_req_duration{name:incidents_list}": ["p(95)<500"],
    "http_req_duration{name:analytics_summary}": ["p(95)<500"],
    "http_req_duration{name:incident_create}": ["p(95)<500"],
    "checks{scenario:dashboard}": ["rate>0.99"],
    "checks{scenario:citizens}": ["rate>0.99"],
    http_req_failed: ["rate<0.01"],
  },
};

// ------------------------------------------------------------------ helpers

function uuidv4() {
  // k6 >= 0.52 exposes Web Crypto as a global; fall back to Math.random.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const h = [];
  for (let i = 0; i < 16; i++) h.push(Math.floor(Math.random() * 256));
  h[6] = (h[6] & 0x0f) | 0x40; // version 4
  h[8] = (h[8] & 0x3f) | 0x80; // RFC 4122 variant
  const s = h.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

const rand = (min, max) => min + Math.random() * (max - min);

function fakeIp() {
  return `10.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${1 + Math.floor(Math.random() * 254)}`;
}

function jsonHeaders(token, ip) {
  const h = { "Content-Type": "application/json" };
  if (token) h.Authorization = `Bearer ${token}`;
  if (ip && SPOOF_XFF) h["X-Forwarded-For"] = ip;
  return h;
}

// ------------------------------------------------------------------ setup

export function setup() {
  const health = http.get(`${BASE_URL}/api/health`);
  if (health.status !== 200) fail(`API not healthy at ${BASE_URL}: HTTP ${health.status} ${health.body}`);

  const res = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email: STAFF_EMAIL, password: STAFF_PASSWORD }),
    { headers: jsonHeaders(null, fakeIp()), tags: { name: "staff_login" } },
  );
  if (res.status !== 200) fail(`Staff login failed: HTTP ${res.status} ${res.body}`);
  return { staffToken: res.json("token") };
}

// ------------------------------------------------------------------ scenario: dashboard

export function dashboard(data) {
  const params = (name) => ({ headers: { Authorization: `Bearer ${data.staffToken}` }, tags: { name } });

  const list = http.get(`${BASE_URL}/api/incidents?limit=5000`, params("incidents_list"));
  check(list, {
    "incidents 200": (r) => r.status === 200,
    "incidents is an array": (r) => Array.isArray(r.json("incidents")),
  });

  const summary = http.get(`${BASE_URL}/api/analytics/summary`, params("analytics_summary"));
  check(summary, {
    "summary 200": (r) => r.status === 200,
    "summary has totals": (r) => r.json("totals") !== null && r.json("totals") !== undefined,
  });

  sleep(rand(1, 3)); // a dispatcher refreshes the map every few seconds at most
}

// ------------------------------------------------------------------ scenario: citizens

// Per-VU state (each VU has its own JS runtime).
let session = null; // { token, ip, filed }

function signInCitizen() {
  const ip = fakeIp();
  const mobile = `+63998${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
  const req = http.post(`${BASE_URL}/api/auth/otp/request`, JSON.stringify({ mobileNumber: mobile }), {
    headers: jsonHeaders(null, ip),
    tags: { name: "otp_request" },
  });
  if (!check(req, { "otp request 200": (r) => r.status === 200, "devCode present": (r) => !!r.json("devCode") })) {
    // devCode is only returned outside production or with NAVOPULSE_DEMO_OTP=1.
    fail(`OTP request failed or devCode missing: HTTP ${req.status} ${req.body}`);
  }
  const verify = http.post(
    `${BASE_URL}/api/auth/otp/verify`,
    JSON.stringify({
      mobileNumber: mobile,
      code: req.json("devCode"),
      fullName: `Load Test ${__VU}`,
      preferredLanguage: "fil",
      privacyConsent: true,
    }),
    { headers: jsonHeaders(null, ip), tags: { name: "otp_verify" } },
  );
  if (!check(verify, { "otp verify 200": (r) => r.status === 200 })) fail(`OTP verify failed: HTTP ${verify.status} ${verify.body}`);
  session = { token: verify.json("token"), ip, filed: 0 };
}

export function citizen() {
  if (!session || session.filed >= REPORTS_PER_CITIZEN) signInCitizen();

  const clientId = uuidv4();
  const body = JSON.stringify({
    clientId,
    categoryCode: "EMR_FLOOD",
    description: "k6 load test: tubig hanggang tuhod",
    location: { lat: rand(14.64, 14.69), lng: rand(120.935, 120.96), accuracy: rand(3, 30) },
    peopleAffected: 1 + Math.floor(Math.random() * 6),
    locationSource: "device",
  });
  const res = http.post(`${BASE_URL}/api/incidents`, body, {
    headers: jsonHeaders(session.token, session.ip),
    tags: { name: "incident_create" },
  });
  session.filed += 1;
  const ok = check(res, {
    "incident 201": (r) => r.status === 201,
    "control number format": (r) => /^NVP-EMR-\d{8}-\d{6}$/.test(r.json("controlNumber") || ""),
  });
  if (ok) created.add(1);

  // Idempotency spot-check: resending the same clientId must return 200 with the same number.
  if (ok && Math.random() < 0.1) {
    const again = http.post(`${BASE_URL}/api/incidents`, body, {
      headers: jsonHeaders(session.token, session.ip),
      tags: { name: "incident_retry" },
    });
    session.filed += 1;
    if (check(again, {
      "retry 200": (r) => r.status === 200,
      "retry same control number": (r) => r.json("controlNumber") === res.json("controlNumber"),
    })) deduplicated.add(1);
  }

  sleep(rand(2, 5));
}
