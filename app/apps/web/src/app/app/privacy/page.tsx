"use client";

import { useCitizen } from "@/components/citizen/CitizenProvider";
import { Screen } from "@/components/citizen/CitizenShell";

/** Short-form privacy notice shown at registration (RA 10173). The full draft is in docs/07-security-privacy.md. */
export default function Privacy() {
  const { lang, t } = useCitizen();
  const en = [
    ["Who we are", "NavoPulse is operated by the City Government of Navotas (PIO, DRRMO and TMO). This prototype is a capstone project and must be reviewed by the city's Data Protection Officer before public launch."],
    ["What we collect", "Your mobile number, name, barangay and language; the reports you send (type, description, photos, GPS location, time); and ratings you give. We do not collect contacts, browsing history or location in the background."],
    ["Why", "To verify your identity, respond to emergencies and civic reports, send you updates and advisories, and improve city services with anonymised statistics."],
    ["Who can see it", "Only the city offices handling your report. Your name and number are hidden from staff who do not need them, and every access is logged. We do not sell or share your data with third parties except emergency partners when needed to save life."],
    ["How we protect it", "Encrypted connections, encryption of mobile numbers and names at rest, role-based access, and audit logs."],
    ["How long", "Reports are kept as public records according to the city's retention schedule; one-time codes are deleted within a day; inactive accounts are reviewed yearly."],
    ["Your rights", "You may access, correct, or ask us to delete your personal data, object to processing, and complain to the National Privacy Commission. Contact the city's Data Protection Officer through City Hall."],
  ];
  const fil = [
    ["Sino kami", "Ang NavoPulse ay pinapatakbo ng Pamahalaang Lungsod ng Navotas (PIO, DRRMO at TMO). Ang prototype na ito ay capstone project at kailangang suriin ng Data Protection Officer ng lungsod bago gamitin ng publiko."],
    ["Ano ang kinokolekta", "Ang iyong mobile number, pangalan, barangay at wika; ang mga ulat na ipinapadala mo (uri, paglalarawan, larawan, GPS na lokasyon, oras); at ang iyong rating. Hindi namin kinukuha ang iyong contacts, browsing history o lokasyon sa background."],
    ["Bakit", "Para ma-verify ka, matugunan ang emergency at mga ulat, mapadalhan ka ng update at abiso, at mapabuti ang serbisyo gamit ang anonymised na estadistika."],
    ["Sino ang makakakita", "Ang mga opisina lamang ng lungsod na humahawak ng iyong ulat. Nakatago ang iyong pangalan at numero sa mga kawaning hindi kailangan ito, at bawat pagtingin ay nakatala."],
    ["Paano pinoprotektahan", "Encrypted na koneksyon, encryption ng mobile number at pangalan, role-based access, at audit logs."],
    ["Gaano katagal", "Ang mga ulat ay itinatago ayon sa retention schedule ng lungsod; ang one-time codes ay binubura sa loob ng isang araw."],
    ["Iyong mga karapatan", "Maaari mong tingnan, itama, o ipabura ang iyong personal na datos, tumutol sa pagproseso, at magreklamo sa National Privacy Commission. Makipag-ugnayan sa Data Protection Officer sa City Hall."],
  ];
  return (
    <Screen title={t("privacyNotice")} back="/app/account">
      <div className="space-y-3 rounded-2xl bg-white p-5 text-sm leading-relaxed shadow-sm">
        {(lang === "fil" ? fil : en).map(([h, b]) => (
          <section key={h}><h2 className="font-semibold">{h}</h2><p className="text-slate-700">{b}</p></section>
        ))}
      </div>
    </Screen>
  );
}
