# ISO/IEC 25010 Evaluation Instrument

NavoPulse is evaluated against the eight quality characteristics of **ISO/IEC 25010:2011** named in the project spec: Functional Suitability, Performance Efficiency, Compatibility, Usability, Reliability, Security, Maintainability, Portability. (ISO/IEC 25010:2023 revised the model to nine characteristics, adding Safety and renaming some; if the panel requires the 2023 model, map Usability → Interaction Capability and Portability → Flexibility and add Safety items.)

Two versions:

| Version | Respondents | Items | Focus |
|---|---|---|---|
| **A. Residents** | 30 to 50 Navotas residents | 27 | Citizen PWA, SOS, reporting, NavoBot, information features |
| **B. LGU officers** | 10 to 15 City officers (DRRMO, TMO, PIO, responders, IT) | 33 | Command dashboard, workflow, analytics, administration, deployment |

Both use the same item bank and codes, so `tools/iso25010/compute.py` can pool shared items. A blank cell means the item is not on that version.

## 1. Rating scale and verbal interpretation

| Scale | Response | Range of weighted mean | Verbal interpretation | Quality rating |
|---|---|---|---|---|
| 5 | Strongly Agree (Lubos na sumasang-ayon) | 4.21 – 5.00 | Strongly Agree | Excellent |
| 4 | Agree (Sumasang-ayon) | 3.41 – 4.20 | Agree | Very Good |
| 3 | Moderately Agree (Katamtamang sumasang-ayon) | 2.61 – 3.40 | Moderately Agree | Good |
| 2 | Disagree (Hindi sumasang-ayon) | 1.81 – 2.60 | Disagree | Fair |
| 1 | Strongly Disagree (Lubos na hindi sumasang-ayon) | 1.00 – 1.80 | Strongly Disagree | Poor |

Interval width = (5 − 1) / 5 = 0.80. Means are rounded to two decimals before interpretation.

Weighted mean per item: **WM = Σ(f·x) / N**, where *x* is the scale value, *f* the number of respondents who chose it, *N* the number of respondents who answered the item. Standard deviation is the sample SD. The characteristic mean pools all answers to its items; the overall mean is the average of the eight characteristic means.

## 2. Item bank

Legend: **R** = on the residents' version, **L** = on the LGU officers' version.

### 2.1 Functional Suitability

| Code | Sub-characteristic | Statement (English) | Pahayag (Filipino) | R | L |
|---|---|---|---|---|---|
| FS1 | Functional completeness | NavoPulse provides all the functions I need for my tasks. | Mayroon ang NavoPulse ng lahat ng function na kailangan ko. | ✓ | ✓ |
| FS2 | Functional correctness | The information shown (status, control number, location, advisories) is accurate. | Tama ang impormasyong ipinapakita (status, control number, lokasyon, abiso). | ✓ | ✓ |
| FS3 | Functional correctness | Reports are recorded with the correct category, location and details. | Naitatala ang mga ulat sa tamang kategorya, lokasyon at detalye. | ✓ | ✓ |
| FS4 | Functional appropriateness | Sending an SOS or report needs only the steps that are necessary. | Kaunting hakbang lang ang kailangan para magpadala ng SOS o ulat. | ✓ | |
| FS5 | Functional appropriateness | The verify → assign → resolve workflow matches how our office handles cases. | — | | ✓ |
| FS6 | Functional completeness | The analytics and exports give the figures our office needs for reports. | — | | ✓ |

### 2.2 Performance Efficiency

| Code | Sub-characteristic | Statement (English) | Pahayag (Filipino) | R | L |
|---|---|---|---|---|---|
| PE1 | Time behaviour | Screens and pages load quickly. | Mabilis mag-load ang mga screen at pahina. | ✓ | ✓ |
| PE2 | Time behaviour | I receive a control number within a few seconds of sending a report. | Nakakatanggap ako ng control number ilang segundo lang matapos magpadala. | ✓ | |
| PE3 | Time behaviour | New incidents appear on the live map almost immediately. | — | | ✓ |
| PE4 | Resource utilization | The app does not drain my battery or use too much mobile data. | Hindi malakas kumain ng baterya at mobile data ang app. | ✓ | |
| PE5 | Capacity | The map stays responsive when thousands of incidents are shown. | — | | ✓ |

### 2.3 Compatibility

| Code | Sub-characteristic | Statement (English) | Pahayag (Filipino) | R | L |
|---|---|---|---|---|---|
| CO1 | Co-existence | NavoPulse works properly alongside other apps on my device or browser. | Maayos gumagana ang NavoPulse kasabay ng ibang app sa aking device o browser. | ✓ | ✓ |
| CO2 | Interoperability | Reports from the app, SMS and NavoBot appear as one consistent record. | Iisa at tugma ang record ng ulat mula sa app, SMS at NavoBot. | ✓ | ✓ |
| CO3 | Interoperability | NavoBot chat, maps and direction links work correctly inside NavoPulse. | Maayos gumagana ang NavoBot, mapa at direction link sa loob ng NavoPulse. | ✓ | |
| CO4 | Interoperability | Exported CSV/Excel files open correctly in our office tools. | — | | ✓ |

### 2.4 Usability

| Code | Sub-characteristic | Statement (English) | Pahayag (Filipino) | R | L |
|---|---|---|---|---|---|
| US1 | Appropriateness recognizability | I can tell at a glance what each part of the system is for. | Madali kong makita kung para saan ang bawat bahagi ng system. | ✓ | ✓ |
| US2 | Learnability | I learned to use the system quickly without training. | Mabilis kong natutunang gamitin ang system kahit walang training. | ✓ | ✓ |
| US3 | Operability | The SOS button is easy to find and press in one tap. | Madaling hanapin at pindutin nang isang tap ang SOS button. | ✓ | |
| US4 | Operability | Filtering and finding incidents on the dashboard is easy. | — | | ✓ |
| US5 | User error protection | The system prevents mistakes or lets me fix them easily (clear messages, confirmations). | Napipigilan o madaling maitama ang pagkakamali (malinaw na mensahe, kumpirmasyon). | ✓ | ✓ |
| US6 | User interface aesthetics | The interface is pleasant and uncluttered. | Maganda at hindi magulo ang itsura ng system. | ✓ | ✓ |
| US7 | Accessibility | Text, buttons and colours are easy to read and use, in Filipino or English. | Madaling basahin at gamitin ang teksto, button at kulay, sa Filipino o Ingles. | ✓ | |

### 2.5 Reliability

| Code | Sub-characteristic | Statement (English) | Pahayag (Filipino) | R | L |
|---|---|---|---|---|---|
| RE1 | Maturity | The system works without errors during normal use. | Gumagana ang system nang walang error sa karaniwang paggamit. | ✓ | ✓ |
| RE2 | Availability | The system is available whenever I need it. | Available ang system tuwing kailangan ko. | ✓ | ✓ |
| RE3 | Fault tolerance | Without a data connection, my report is saved or can be sent by SMS. | Kahit walang data, naka-save ang ulat ko o maipapadala sa SMS. | ✓ | |
| RE4 | Recoverability | After a connection loss or error, I can continue without losing my work. | Pagkatapos mawalan ng koneksyon o mag-error, nakakapagpatuloy ako nang hindi nawawala ang ginawa ko. | ✓ | ✓ |
| RE5 | Fault tolerance | Retried or repeated submissions do not create duplicate cases. | — | | ✓ |

### 2.6 Security

| Code | Sub-characteristic | Statement (English) | Pahayag (Filipino) | R | L |
|---|---|---|---|---|---|
| SE1 | Confidentiality | Personal information is protected and seen only by authorised personnel. | Protektado ang personal na impormasyon at awtorisadong kawani lang ang nakakakita. | ✓ | ✓ |
| SE2 | Integrity | Only authorised roles can change incident status, content or user accounts. | — | | ✓ |
| SE3 | Non-repudiation | Actions are recorded with who did them and when (audit log). | — | | ✓ |
| SE4 | Accountability | Viewing reporter contact details is logged, which discourages misuse. | — | | ✓ |
| SE5 | Authenticity | The sign-in process (OTP or password) reliably verifies who I am. | Maaasahan ang pag-sign in (OTP o password) sa pagpapatunay kung sino ako. | ✓ | ✓ |
| SE6 | Confidentiality | The privacy notice clearly explains how my data is used. | Malinaw na ipinaliliwanag ng Privacy Notice kung paano ginagamit ang aking datos. | ✓ | |
| SE7 | Confidentiality | Only I can see my own reports in the app. | Ako lang ang nakakakita ng sarili kong mga ulat sa app. | ✓ | |

### 2.7 Maintainability

| Code | Sub-characteristic | Statement (English) | Pahayag (Filipino) | R | L |
|---|---|---|---|---|---|
| MA1 | Modularity | Changing one part (content, categories, SMS provider) does not disrupt other parts. | — | | ✓ |
| MA2 | Analysability | When a problem occurs, the cause is easy to find (notification, SMS and audit logs). | — | | ✓ |
| MA3 | Modifiability | Content (announcements, directory, transit) can be updated without a developer. | — | | ✓ |
| MA4 | Testability | The system's functions are easy to test and verify (test accounts, demo data). | — | | ✓ |
| MA5 | Reusability | Its components (API, integrations) could be reused for other city services. | — | | ✓ |
| MA6 | Modifiability | Updates to the app arrive without disrupting my use or losing my reports. | Dumarating ang update ng app nang hindi naaabala ang paggamit ko o nawawala ang aking mga ulat. | ✓ | |

### 2.8 Portability

| Code | Sub-characteristic | Statement (English) | Pahayag (Filipino) | R | L |
|---|---|---|---|---|---|
| PO1 | Adaptability | The system works well on different devices and screen sizes. | Maayos gumagana ang system sa iba't ibang device at laki ng screen. | ✓ | ✓ |
| PO2 | Installability | Installing NavoPulse on my phone ("Add to Home Screen") is easy. | Madaling i-install ang NavoPulse sa aking phone ("Add to Home Screen"). | ✓ | |
| PO3 | Installability | The system can be deployed on the city's servers with reasonable effort. | — | | ✓ |
| PO4 | Replaceability | NavoPulse can replace our current manual or hotline logging process. | — | | ✓ |

## 3. Version A: Residents (printable)

**NavoPulse Evaluation Questionnaire for Residents / Talatanungan para sa mga Residente**

Part I. Profile (optional): age bracket (18–24, 25–34, 35–44, 45–59, 60+), sex, barangay, phone type (Android/iPhone), prior use of city hotlines (yes/no). Do not ask for name or mobile number.

Part II. After completing the assigned tasks, rate each statement: 5 Strongly Agree, 4 Agree, 3 Moderately Agree, 2 Disagree, 1 Strongly Disagree.

Items in order: FS1, FS2, FS3, FS4, PE1, PE2, PE4, CO1, CO2, CO3, US1, US2, US3, US5, US6, US7, RE1, RE2, RE3, RE4, SE1, SE5, SE6, SE7, MA6, PO1, PO2 (27 items; wording from §2, Filipino first, English below).

Part III. Open-ended: What did you like most? What should be improved? Would you use NavoPulse during a flood? Why?

Assigned tasks before rating (15 to 20 minutes, guided): install the PWA; sign in with OTP; send a test SOS (staging); send a civic report with a photo; check My reports; ask NavoBot two questions; view advisories and the Barangay Directory; switch language; send an SOS in airplane mode and use the SMS option.

## 4. Version B: LGU officers (printable)

**NavoPulse Evaluation Questionnaire for LGU Officers**

Part I. Profile: office (DRRMO, TMO, PIO, field unit, IT/MIS, other), position, years in service, role used during the test.

Part II. Rate each statement 1 to 5 as above. Items in order: FS1, FS2, FS3, FS5, FS6, PE1, PE3, PE5, CO1, CO2, CO4, US1, US2, US4, US5, US6, RE1, RE2, RE4, RE5, SE1, SE2, SE3, SE4, SE5, MA1, MA2, MA3, MA4, MA5, PO1, PO3, PO4 (33 items).

Part III. Open-ended: Which feature saves your office the most time? What is missing for daily operations? Concerns about data privacy or security?

Assigned tasks before rating (30 to 45 minutes, by role): monitor the live map during a simulated surge of reports; verify, assign, merge and resolve incidents; send a barangay-targeted advisory; edit content (PIO); export analytics; review the audit log (admin). IT/MIS staff also review the deployment guide (`12-runbook.md`) for PO3 and MA items.

## 5. Sampling and administration

**Sample size.**
- Residents: 30 to 50, as set by the spec. Use stratified purposive sampling across both districts, at least 2 respondents per barangay (18 barangays → 36 minimum), mixing age groups and phone types. Include residents of flood-prone coastal barangays.
- LGU officers: 10 to 15 by total enumeration or purposive sampling of the actual users: about 4 DRRMO (dispatch + responders), 3 TMO (officer + enforcers), 3 PIO, 1 to 2 IT/MIS, 1 to 2 supervisors.
- The populations of actual staff users are small, so Slovin's formula is not used for the LGU group; state this in the methodology.

**Procedure.**
1. Get approval from the City (Administrator/PIO) and the university's ethics process.
2. Pilot test the instrument with 5 people not in the sample; revise unclear items. Compute Cronbach's alpha from the pilot and full data (`compute.py` reports it per characteristic; ≥ 0.70 acceptable).
3. Run sessions on a staging deployment with demo data, never on production with real reports.
4. Give the respondent an informed consent form: purpose, voluntary participation, anonymity, how responses are stored (RA 10173), right to withdraw.
5. Run the task list (§3/§4) with a facilitator who only explains, never helps complete tasks.
6. Respondent answers the questionnaire right after the tasks (paper or Microsoft/Google Forms). Use respondent codes (R01, L01), never names.
7. Encode responses in a CSV: `respondent_id,group,FS1,FS2,…` with `group` = `resident` or `lgu`, values 1–5, blank for items not on that version. Double-check encoding (second person verifies 20% of rows).
8. Compute:

```bash
python3 tools/iso25010/compute.py responses.csv --out results_summary.csv
python3 tools/iso25010/compute.py responses.csv --group lgu --no-items
```

   The script prints item, characteristic and overall weighted means, SD, verbal interpretation and quality rating per group and for all respondents, and writes the summary CSV (columns: level, group, code, characteristic, n, f1–f5, weighted_mean, sd, interpretation, rating, cronbach_alpha). `tools/iso25010/sample_responses.csv` is **synthetic sample data** for testing the script, not survey results.

9. Present results per characteristic in a table (WM, SD, interpretation) for each group, then the overall; discuss the lowest-rated items and the open-ended answers.

**Bias controls.** The developer should not personally collect resident responses (use a trained facilitator); shuffle the order of characteristics between paper sets if possible; include the open-ended part so low ratings can be explained.
