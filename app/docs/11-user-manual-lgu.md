# NavoPulse User Manual: LGU Command Dashboard

For City staff using the dashboard at `https://<city-domain>/dashboard`. One section per role; read §1 first.

> Screen names follow the dashboard navigation (`Command map`, `Incidents`, `Field crews`, `Broadcast alerts`, `NavoBot tickets`, `Content`, `Analytics`, `Notification log`, `Users`, `Audit log`). The dashboard is still being finished; if a label differs slightly, the function is the same. Everything you do is recorded in the audit log.

## 1. Common to all roles

### 1.1 Signing in and out
1. Go to `/dashboard`. You are redirected to the sign-in page.
2. Enter your City email and password. After 10 failed attempts from one network in 5 minutes you must wait.
3. Your session lasts 12 hours. Sign out from the menu when you leave a shared computer. If the super admin disables your account or changes your role, you are signed out at once.

Demo accounts (staging/demo only; listed on the sign-in page when `NEXT_PUBLIC_DEMO_MODE=1`; password `NavoPulse!2026`): `admin@`, `dispatch@`, `tmo@`, `pio@`, `responder@`, `enforcer@` + `navopulse.local`.

### 1.2 What you can see
The menu only shows what your role allows. Incidents are limited to your office:

| Role | Incidents you see |
|---|---|
| DRRMO dispatcher | Categories owned by DRRMO: all emergencies (flood, fire, medical, storm surge, other) and clogged drainage |
| TMO officer | Categories owned by TMO: traffic/DisipliNavo (illegal parking, obstruction, blocked emergency route, accident), waste, damaged infrastructure, streetlights |
| PIO admin | "Other civic concern" plus every ticket created through NavoBot |
| Field responder | Only incidents assigned to your unit |
| Super admin | Everything |

### 1.3 Statuses

| Status | Set by | Meaning |
|---|---|---|
| Submitted | system | New report |
| Verified | dispatcher/officer | Confirmed real and in scope |
| Assigned | Assign action | A unit is responsible |
| In Progress | responder or office | Team working on it |
| Resolved | Resolve action | Done, with note (and photo) |
| Rejected | dispatcher/officer | Not actionable (prank, out of scope); always add a note |
| Duplicate | Merge action | Same as an existing case |

Resolved, Rejected and Duplicate are final. Every change notifies the reporter (app, push, or SMS).

### 1.4 Reporter privacy
Reporter names and numbers are personal data (RA 10173). Dispatchers, TMO officers and super admins see them, and each view is logged. PIO admins and responders see them masked (`J*** D***`, `+63 917 *** 0001`). Responders can press **Reveal contact** when they must call the reporter; this is logged with your name and time. Never copy reporter details into chats, notes, or personal phones beyond what the response needs.

---

## 2. DRRMO dispatcher (`drrmo_dispatcher`)

### 2.1 Monitor the Command map
1. Open **Command map**. Pins are colored by category; numbers are clusters (zoom in to split them).
2. Layers: pins, **heatmap** (where reports concentrate), **barangay boundaries**, **units** (current unit locations).
3. Filters: type/module, status, source (app, SMS, NavoBot, walk-in), priority, barangay, date range, search by control number or text.
4. New and changed incidents appear without refreshing. A **new SOS plays an alert sound and highlights the pin**. Keep the browser tab open and the sound on during operations. If the connection drops, the page reconnects by itself.

Note: barangay boundaries shown in this version are approximations, not official boundaries.

### 2.2 Triage an incident
1. Click a pin or a row in **Incidents** to open the detail panel: category, priority, description, people affected, photos (with photo GPS/time when available), location and its source (device GPS, photo, SMS, NavoBot, barangay centroid) and accuracy, reporter, timeline, internal notes, and **possible duplicates** (same category, open, within 150 m and 24 h).
2. Decide:
   - **Verify** when the report is credible.
   - **Merge duplicate** into an existing case if it is a duplicate (choose the original from the possible-duplicates list). The reporter is told "Tracked under NVP-…".
   - **Reject** with a note for pranks or reports outside the City's scope.
3. Add **internal notes** for anything the team should know. Citizens never see notes.

Tip: SMS reports use the location typed in the SMS; NavoBot reports without GPS are placed at the barangay center (location source "barangay_centroid"). Call the reporter (contact shown) to get the exact spot when needed.

### 2.3 Assign a field crew
1. In the incident, press **Assign crew** (or **Reassign**) and pick an available DRRMO unit; the list only shows units of the incident's office. Add an optional note and press **Assign and notify** (rescue boats, rescue teams, ambulances).
2. The status becomes **Assigned**, the unit becomes unavailable, and the reporter is notified with the unit name.
3. Press **Navigate** to open directions to the incident in Google Maps/OSM; send the link to the team by radio/phone.
4. To reassign, assign another unit. To pull a unit back to verification, set status **Verified** (note: this does not clear the unit link; reassign or resolve instead where possible).

### 2.4 Manage units (**Field crews**)
See all DRRMO units, their availability and active cases. Add a unit (name, type, contact) or update availability and contact. Units become available again automatically when their last active case is resolved.

### 2.5 Log a walk-in or phone report
For reports received by phone or at the desk, create a report from the dashboard. It gets `source = walk_in` and a normal control number. Read the control number back to the caller.

### 2.6 Send an emergency broadcast (**Broadcast alerts**)
1. Write a short title and the message in **English and Filipino**.
2. Severity: Info, Advisory, Warning, or **Critical**.
3. Target: all barangays, or select the affected barangays.
4. Channels: Push and/or SMS. Critical alerts also go by SMS to residents whose push fails.
5. Send. The screen shows how many residents were targeted. Advisories show in the app for 2 days.

Only broadcast information confirmed by the DRRMO. Do not include personal data. There is a limit of 10 broadcasts per 10 minutes per user.

### 2.7 Logs and analytics
- **Notification log:** every push/SMS/in-app message, with failures and errors.
- **SMS log** (DRRMO and super admin): every inbound/outbound SMS with masked numbers, parse errors, and the incident it created.
- **Analytics:** counts by status, category, barangay and source; daily trend; average/median response time and resolution time; satisfaction; NavoBot ticket volume. Choose a date range and export **CSV** or **Excel**. Exports contain no names or numbers. For PDF, use the browser's Print → Save as PDF.

---

## 3. TMO officer (`tmo_officer`)

Same tools as the dispatcher (§2.1 to §2.5 and §2.7) for TMO categories.

1. **Command map / Incidents:** filter module **Traffic** for DisipliNavo reports (illegal parking, obstructions, blocked emergency routes, accidents) or **Civic** for waste, damaged infrastructure and streetlights.
2. Photos from DisipliNavo Cam show the photo's own GPS and time when available. Compare them with the reported location before verifying.
3. **Prioritise blocked emergency routes** (high priority) during floods and evacuations.
4. **Assign crew** with TMO units: enforcer teams, tow truck, City Engineering crew.
5. Resolve with a clear note, e.g. "Vehicle towed, owner cited", and a resolution photo.
6. TMO officers cannot send broadcasts; ask the DRRMO or PIO.

---

## 4. Field responder (`field_responder`)

Designed for a phone. Your account is linked to one unit (e.g. DRRMO Rescue Team Alpha, TMO Enforcer Team A).

1. Sign in at `/dashboard` on your phone. You see **only incidents assigned to your unit**.
2. Open an incident: category, description, people affected, photos, location. Tap **Navigate** for directions.
3. When you head out or arrive, tap **Start response** (status In Progress).
4. Need to call the reporter? Tap **Reveal contact** (logged).
5. Add notes for the dispatcher if needed.
6. When done:
   1. Take a **resolution photo** (JPG/PNG/WebP, max 5 MB) that shows the result, without faces where possible.
   2. Write a short **resolution note** (required): what was done.
   3. Tap **Resolve**. The reporter is notified and asked to rate the service.
7. Update your unit's **availability** and location in **Field crews** when going off duty or returning to base.

You cannot verify, reject or merge cases; ask the dispatcher.

---

## 5. PIO admin (`pio_admin`)

### 5.1 Content (**Content**)
Manage what residents see in the app:

| Content | Fields | Notes |
|---|---|---|
| Announcements | Title and body in English and Filipino, image URL, published | Shown in Angat Navotas, newest first |
| Events | Title, description, venue, barangay, start/end, map point, published | Only upcoming events are shown |
| Businesses | Name, category, description, address, contact, barangay, map point, published | Get the owner's consent before listing contact details |
| Transit routes | Code, name, mode, origin, destination, minimum fare, fare notes, description, active | Route lines and stops cannot be edited from the dashboard yet |
| Barangays | Hotline, address, population, officials (position, name, contact) | Barangays cannot be added or removed. The seeded values are placeholders: replace them with numbers and names confirmed by each barangay |

Every change is logged with before/after values.

### 5.2 NavoBot tickets
**NavoBot tickets** lists conversations that became reports (INQ control numbers) and the incident each created. NavoBot-created incidents also appear in your **Incidents** list, so you can route them: verify and leave for the owning office, add notes, or reject. Reporter details are masked for PIO.

### 5.3 Broadcasts
Same as §2.6. Coordinate flood and evacuation messages with the DRRMO before sending.

### 5.4 Analytics and logs
Analytics (your scope) and the **Notification log** are available. Use them for PIO reports on public engagement and NavoBot volume.

### 5.5 NavoBot knowledge base
Maintaining SharePoint documents and NavoBot topics is described in `13-pio-handover.md`.

---

## 6. Super admin (`super_admin`)

Sees and can do everything above for all offices, plus:

### 6.1 Users (**Users**)
1. **Create** staff: name, email, role, initial password (at least 10 characters), and for responders, the unit.
2. **Edit:** change role, link/unlink a unit, reset password, disable/enable. Changing role, disabling, or resetting a password signs the user out everywhere.
3. You cannot disable or demote your own account, and you cannot turn a citizen account into staff (or the reverse).
4. Disable accounts of staff who leave on their last day.

### 6.2 Audit log (**Audit log**)
Shows the latest 500 entries: who, what, when, from which IP, with before/after. Filter by action prefix:

| Prefix | Examples |
|---|---|
| `auth.` | `auth.login`, `auth.login_failed`, `auth.logout` |
| `incident.` | `status_change`, `assign`, `merge`, `note`, `resolve`, `create_walkin` |
| `pii.` | `pii.view` (unmasked reporter viewed), `pii.reveal` |
| `content.` / `advisory.` / `unit.` / `user.` | create/update/delete, broadcasts |
| `analytics.export` | data exports |

Review `pii.` and `auth.login_failed` weekly.

### 6.3 Not yet available from the dashboard
Managing incident categories and system settings is not built in this version; categories are set by the database seed. Ask the developer/IT for changes.
