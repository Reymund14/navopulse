# Capstone Defense Demo Script (under 10 minutes)

Goal: show the full incident lifecycle across all three intake channels (app, NavoBot, SMS) on one live map, ending with the citizen's rating and the analytics.

## 0. Preparation (the day before and 30 minutes before)

Environment: staging or a laptop, never production.

```bash
cp .env.example apps/web/.env.local   # Next.js reads env files from apps/web when run with pnpm dev
# In apps/web/.env.local: NAVOBOT_API_KEY=demo-navobot-key, NEXT_PUBLIC_DEMO_MODE=1,
# and delete the empty NEXT_PUBLIC_MAP_TILE_URL= / NEXT_PUBLIC_HOTLINE_*= / STORAGE_DIR= lines (see 12-runbook.md §1).
# Leave SMS_PROVIDER and PUSH_PROVIDER as console (messages print in the server log).
docker compose up -d db
pnpm install
pnpm db:reset                         # migrate + seed ~600 incidents over 60 days (truncates everything)
pnpm dev                              # http://localhost:3000
```

Why `pnpm dev`: the on-screen OTP (`devCode`) is returned only when `NODE_ENV` is not `production` or `NAVOPULSE_DEMO_OTP=1`, and production refuses the built-in dev secrets. If you prefer a production build (`pnpm build && pnpm start`, faster pages), set real secrets plus `NAVOPULSE_DEMO_OTP=1` for the demo and remove it afterwards. With `pnpm dev`, open every page once beforehand so the first compile does not happen in front of the panel.

Screens:
- **Screen A (projector, left):** desktop browser, `http://localhost:3000/dashboard`, signed in as `dispatch@navopulse.local`, Command map open, sound **on**.
- **Screen B (phone or narrow browser window, right):** `http://localhost:3000/app`, signed out. Use a phone on the same network (`http://<laptop-ip>:3000/app`) and allow location; otherwise Chrome DevTools device mode with a location override at San Jose (14.6688, 120.9398).
- **Screen C (second browser profile):** for `responder@navopulse.local` (phone-sized window).
- **Terminal:** in the repo, with the two curl commands below pasted and ready; server log visible (console SMS/push lines).
- Have a small JPG on the desktop for the resolution photo.

All passwords: `NavoPulse!2026`. Demo citizens: `+639170000001` to `+639170000004` (Juan Dela Cruz is `…0001`, barangay Tangos North).

Plan B: if Wi-Fi fails, everything runs on localhost; if location fails, drag the pin; if the projector loses sound, point at the red highlight.

## 1. Opening (0:00 – 0:45)

Say: "NavoPulse brings three channels, the citizen app, NavoBot chat and plain SMS, into one command map for the DRRMO, TMO and PIO. I will follow one flood SOS from the resident to the rescue team and back to the resident's rating."

Show Screen A: map of Navotas with clusters and heatmap from 60 days of seeded data. Toggle **barangay boundaries** ("approximations for the demo, to be replaced with official PSA/NAMRIA boundaries"). Mention the filters by type, status, barangay, date and source.

## 2. Citizen SOS from the PWA (0:45 – 2:30)

Screen B:
1. Open `/app` → **Mag-sign in**. Enter `0917 000 0001` → **Ipadala ang code**. The demo banner shows the 6-digit code ("in production this arrives by SMS"). Enter it → **I-verify**.
2. Home → tap the red **SOS** → **Baha / Flood**. Location is captured (show accuracy). People affected: 3. Description: "Hanggang baywang na ang tubig, may matanda." Optionally add a photo.
3. **Ipadala ang ulat** → confirmation with control number `NVP-EMR-<today>-…`. Read it out.

Screen A, at the same moment: the **alert sound** plays and the new pin is highlighted without refreshing (Postgres LISTEN/NOTIFY → Server-Sent Events).

Optional 15-second aside: on the SOS screen, point to **Ipadala sa SMS**: "if there is no data, the app composes this SMS so the report still reaches us; I will show the server side in a minute."

## 3. Dispatcher verifies and assigns (2:30 – 4:00)

Screen A:
1. Click the new pin → detail panel: photo, location source and accuracy, people affected, reporter name and number (visible to the dispatcher, and that view is written to the audit log), timeline, and **possible duplicates** within 150 m.
2. **Verify**.
3. **Assign crew** → choose **DRRMO Rescue Team Alpha** → note "Bring the boat" → **Assign and notify**. Status becomes Assigned; the unit becomes unavailable.
4. Click **Navigate** to show the Google Maps/OSM route link for the team.
5. In the terminal/server log, show the console push line to the citizen ("Update sa ulat … Naitalaga").

## 4. NavoBot ticket through the webhook (4:00 – 5:15)

Say: "When a resident reports something in NavoBot, Copilot Studio's 'Report an issue' topic calls a Power Automate flow, which calls this webhook. Here is exactly what that flow sends."

Terminal (needs `NAVOBOT_API_KEY=demo-navobot-key` in the server env):

```bash
curl -sS -X POST http://localhost:3000/api/integrations/navobot/tickets \
  -H "Content-Type: application/json" -H "X-Api-Key: demo-navobot-key" \
  -d '{"conversationId":"defense-001","category":"basura","description":"Tambak ng basura sa gilid ng kanal malapit sa simbahan","barangay":"San Jose","language":"taglish"}'
```

Point at the response: `controlNumber` (`NVP-CIV-…`), `reply_fil` (the sentence the bot reads back), `trackUrl`. Run it **again**: same control number, `created:false` (Power Automate retries never create duplicates).

Note for the panel: the dispatcher does not see it because waste is a TMO category; sign in as `pio@` or `tmo@` later, or filter Source = NavoBot as `admin@` if time allows. (Optional: show the Copilot Studio test pane or the demo bot at `/app/chat` answering "May baha ba ngayon?" with "check Advisories", the no-invention rule.)

## 5. Offline SMS fallback (5:15 – 6:15)

Say: "Now a resident with no mobile data. The app composed this SMS; the SMS gateway forwards it to our inbound webhook."

```bash
curl -sS -X POST http://localhost:3000/api/integrations/sms/inbound \
  -H "Content-Type: application/json" -H "X-Webhook-Secret: dev-sms-inbound-secret" \
  -d '{"from":"09170000002","messageId":"defense-sms-001","provider":"demo","body":"NVP1 SOS FLD 14.66712,120.94231 P2 N:Stranded sa bubong"}'
```

Screen A: alert sound again; new pin with source **SMS**. Server log: the acknowledgement SMS "SOS received. Control no. NVP-EMR-…". Mention: one 160-character segment, `R<id>` reference makes the later online retry a no-op, and the sender's number is stored encrypted.

Optional: this SOS is next to the app SOS; open it and use **Merge duplicate** to show deduplication (the second reporter is told "Tracked under …").

## 6. Responder resolves with a photo (6:15 – 7:45)

Screen C: sign in at `/dashboard` as `responder@navopulse.local`.
1. Only the incidents assigned to **Rescue Team Alpha** are visible; the app SOS is there. Reporter contact is **masked**; mention **Reveal contact** is logged (optional click).
2. **Start response** → status In Progress (Screen A updates live).
3. **Resolve** → attach the JPG as resolution photo → note "Residents evacuated safely to the covered court." → submit.

Screen A: status Resolved; unit available again.

## 7. Citizen sees the update and rates (7:45 – 8:45)

Screen B: open **Aking mga ulat** → the report shows **Nalutas / Resolved**, the status history and the resolution photo. The notification inbox shows the update ("I-rate ang aming serbisyo…"). Tap **5 stars**, comment "Mabilis ang aksyon, salamat!" → submit.

## 8. Close with analytics and accountability (8:45 – 9:45)

Screen A (as dispatcher, or switch to `admin@`):
1. **Analytics:** counts by type, barangay, status; average response and resolution times; NavoBot ticket volume; satisfaction (now including the new rating). Click **Export** (CSV/Excel, no personal data) or **PDF** (print).
2. `admin@` → **Audit log**, filter `pii.`: the dispatcher's view of the reporter is recorded (RA 10173). Filter `incident.`: verify, assign, resolve with actor and time.

Closing line: "One report, three channels, one map, and every step is traceable. Next steps are the native app, official boundaries and hotlines from the City, and the ISO 25010 evaluation with residents and LGU officers."

## Timing summary

| Segment | Time |
|---|---|
| Opening and map | 0:45 |
| Citizen SOS | 1:45 |
| Verify + assign | 1:30 |
| NavoBot webhook | 1:15 |
| SMS fallback | 1:00 |
| Responder resolve | 1:30 |
| Citizen rating | 1:00 |
| Analytics + audit | 1:00 |
| **Total** | **9:45** |

## Reset between rehearsals

```bash
pnpm db:reset    # re-seeds; demo citizen sessions are cleared, sign in again
```

Change `conversationId` and `messageId` in the curl commands if you do not reset, otherwise they return the earlier incidents (idempotency).
