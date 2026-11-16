# PIO Handover Manual: NavoBot Knowledge Base and Topics

For the Public Information Office staff who will own NavoBot after the capstone. No programming needed. Read together with `04-sharepoint-knowledge-base.md` (how the KB is organised) and `05-navobot-copilot-studio.md` (how NavoBot was built).

## 1. Who does what

| Role | Person (fill in) | Responsibilities |
|---|---|---|
| NavoBot owner (PIO head) | | Approves changes to instructions and topics; signs off the monthly report |
| KB administrator (2 PIO staff) | | Reviews and publishes documents; runs the test script; watches analytics |
| Office content owners | DRRMO, TMO, BPLO, Treasurer, City Engineering, CHO, CSWDO, barangays | Write and update their documents; answer accuracy questions |
| Copilot Studio maker | | Edits topics and flows; publishes the agent |
| City IT/MIS | | Microsoft 365 licences and permissions; NavoPulse server; API key for the flow |
| Data Protection Officer | | Approves anything that touches personal data (report topic, transcripts) |

Keep at least two people with **owner** access to the Copilot Studio agent, the Power Automate flow, and the SharePoint site, so the bot never depends on one account. Use City accounts, not personal ones.

## 2. Updating knowledge (SharePoint)

### 2.1 Routine update
1. The office owner edits or uploads the document in its library, following the naming convention (`Topic_Subject_Barangay_Lang_YYYY-MM`), fills in the metadata (Office, Language, EffectiveDate, ReviewDue, SourceReference) and sets **ApprovalStatus = For Review**.
2. The KB administrator checks:
   - Facts match the official source (ordinance, memo, Charter).
   - Plain language; headings per question; answer in the first sentence.
   - No personal data of private persons; numbers are official office lines confirmed by the office.
   - Filipino and English versions agree.
3. Approve and publish as a **major version** (ApprovalStatus = Approved). Move the old file to `Archive` or mark it Superseded.
4. Wait for re-indexing (can take several hours), then ask NavoBot the questions for that topic (§4) in the Copilot Studio **Test** pane and in the app.
5. Record the change in the KB change log (a SharePoint list: date, document, change, who approved, test result).

### 2.2 Urgent correction (wrong hotline, wrong evacuation center, wrong fee that is causing harm)
1. In Copilot Studio → **Knowledge**, turn **off** the knowledge source that contains the wrong document, or remove the document from the library. Publish the agent.
2. Fix and re-approve the document.
3. Re-enable the source after re-indexing and test.
4. If residents may have acted on the wrong information, coordinate a correction advisory with the DRRMO (dashboard → Broadcast alerts).

### 2.3 Seasonal calendar

| When | What |
|---|---|
| January | Business permit renewal documents (BPLO), Citizen's Charter changes |
| April–May | DRRMO flood protocols, evacuation centers, go-bag list before rainy season |
| After each typhoon/flood activation | DRRMO lessons learned; update evacuation centers if changed |
| After barangay elections | All 18 barangay directory pages |
| Quarterly | Transit fares and routes (TMO), City Services FAQ, stale-content view |

The **Barangay Directory** also exists in the NavoPulse dashboard (Content → Barangays). Keep both the same: update the dashboard first (the app reads it), then the SharePoint page.

## 3. Maintaining topics (Copilot Studio)

### 3.1 Safe changes PIO can make
- Add **trigger phrases** to existing topics when residents phrase things differently (take real phrases from analytics, §5). Add Taglish, misspellings and local words ("cedula", "CTC", "baha", "high tide", "lumikas").
- Edit fixed **messages** (greetings, closing lines) in both languages.
- Add **synonyms** to the Barangay entity (e.g. "NBBS" variations).
- Update the hotline text in the Emergency topic **only** with numbers confirmed in writing by the DRRMO.

### 3.2 Changes that need the NavoBot owner's approval
- Anything in the agent **instructions** (§3 of `05-navobot-copilot-studio.md`), especially grounding and emergency rules.
- Turning **general knowledge / web search** on (keep it **off**).
- New topics, or changes to the **Report an issue** topic and its flow (personal data; also involves IT and the DPO).
- Changing authentication or channels.

### 3.3 Change procedure
1. Make the change in Copilot Studio (unpublished draft).
2. Test in the **Test** pane with the relevant rows of the test script, and all **safety** rows (2, 3, 4, 5, 6, 8, 13, 14, 22, 24).
3. Publish. Re-test 3 questions in the NavoPulse app.
4. Log the change (date, what, who, test result).

### 3.4 The "Report an issue" flow
- The Power Automate flow **Create NavoPulse Ticket** sends reports to `https://<navopulse-host>/api/integrations/navobot/tickets` with the `X-Api-Key` header. If IT rotates the key, they update the flow at the same time (`12-runbook.md` §9).
- If tickets stop appearing in the dashboard (**NavoBot tickets**), check the flow's **run history**: HTTP 401 = key mismatch (call IT); 422 = the bot did not collect a location or barangay (fix the topic); 400 = a field is invalid (for example `language` not `en`/`fil`/`taglish`, or an empty description); 5xx/timeouts = NavoPulse server problem (call IT).
- Do not add questions that collect sensitive personal data (ID numbers, health details beyond "someone is injured", exact home address when a landmark is enough).

## 4. Monthly test

Run the full test script in `05-navobot-copilot-studio.md` §8 once a month and after every publish. Fill in:

| Date | Tester | # passed / total | Safety cases all passed? | Failures and fixes |
|---|---|---|---|---|
| | | | | |

If any **safety** case fails (emergency routing, invented flood/evacuation info, invented numbers, accepting OTP/passwords), treat it as urgent (§2.2): fix before the bot is announced again.

## 5. Reading analytics

Copilot Studio **Analytics** shows sessions, engagement, resolution and escalation rates, abandoned sessions, and topic usage, and lets you review transcripts (subject to the retention you set).

Monthly routine:
1. **Unrecognised / fallback questions:** list the top 10. For each: add trigger phrases, or ask the owning office for a document if the KB is missing the answer.
2. **Low-satisfaction answers** (thumbs down / CSAT, if enabled): read the transcript, find the document that produced the answer, fix it.
3. **Report an issue completions:** compare with NavoPulse **Analytics** → NavoBot ticket volume and **NavoBot tickets** list. Big gaps mean the flow is failing.
4. **Emergency topic hits:** spikes indicate an ongoing event; share with the DRRMO.

Transcripts can contain personal data. Only the KB administrators and owner should review them, and the retention should be the shortest that still allows this monthly review (proposed 30 days, see `07-security-privacy.md` §4).

## 6. Monthly report template

| Item | Value |
|---|---|
| Period | |
| NavoBot sessions | |
| Top 5 topics | |
| Unanswered questions (top 10) and action taken | |
| Tickets created via NavoBot (NavoPulse analytics) | |
| Documents added / updated / archived | |
| Test script result | |
| Incidents (wrong answers reported) and corrections | |
| Requests to offices for new content | |

## 7. Handover checklist

- [ ] Two PIO owners added to the Copilot Studio agent, Power Automate flow and SharePoint site
- [ ] Developer's personal accounts removed from all of them
- [ ] API key for the flow stored in Key Vault / environment variable, known to IT only
- [ ] Hotline numbers in the Emergency topic and `NEXT_PUBLIC_HOTLINE_*` confirmed in writing by DRRMO, PNP, BFP
- [ ] All placeholder barangay hotlines and officials replaced in the dashboard and SharePoint
- [ ] KB change log list and test log created
- [ ] Transcript retention configured and approved by the DPO
- [ ] PIO staff walked through §2–§5 once with the developer
