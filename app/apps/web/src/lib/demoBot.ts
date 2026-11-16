import { HOTLINES } from "@navopulse/shared";
import { query } from "./db";

/**
 * Offline stand-in for NavoBot, used when Copilot Studio is not configured
 * (no DIRECTLINE_SECRET / COPILOT_TOKEN_ENDPOINT). It follows the same safety
 * rules as the real agent: answer only from known content, admit when it does
 * not know, and route emergencies to SOS and hotlines. It is a demo fallback,
 * not a replacement for the SharePoint-grounded agent.
 */
export interface BotReply {
  text: string;
  suggestions?: string[];
  action?: "sos" | "report" | "transport" | "directory";
}

const EMERGENCY = /(tulong|saklolo|help|emergency|sunog|fire|nalulunod|drowning|lubog|stranded|hindi makahinga|can't breathe|nahimatay|unconscious|dugo|bleeding|rescue)/i;

const isFil = (s: string) => /\b(ang|ng|sa|po|ano|paano|saan|kailan|mga|ko|ba|naman|yung|kumuha|magkano)\b/i.test(s);

export async function demoBotReply(message: string): Promise<BotReply> {
  const m = message.trim();
  const fil = isFil(m);
  if (!m) return { text: fil ? "Ano ang maitutulong ko?" : "How can I help?" };

  if (EMERGENCY.test(m)) {
    return {
      action: "sos",
      text: fil
        ? `Kung may panganib sa buhay, pindutin agad ang SOS button o tumawag sa ${HOTLINES.national}. Hindi ako makakapag-dispatch ng rescue mula sa chat.`
        : `If a life is in danger, press the SOS button now or call ${HOTLINES.national}. I cannot dispatch rescue from this chat.`,
      suggestions: ["SOS"],
    };
  }
  if (/(baha|flood|tide|high tide|bagyo|typhoon|evacuat|lumikas)/i.test(m)) {
    const adv = await query<{ title: string; body_en: string; body_fil: string }>(
      `SELECT title, body_en, body_fil FROM advisories WHERE (expires_at IS NULL OR expires_at > now()) ORDER BY sent_at DESC LIMIT 2`);
    if (!adv.length) {
      return { text: fil ? "Walang aktibong abiso ngayon mula sa DRRMO. Para sa evacuation, sundin lamang ang opisyal na anunsyo ng lungsod." : "There is no active DRRMO advisory right now. For evacuation, follow only official city announcements." };
    }
    return { text: (fil ? "Mga kasalukuyang abiso ng lungsod:\n" : "Current city advisories:\n") + adv.map((a) => `• ${a.title}: ${fil ? a.body_fil : a.body_en}`).join("\n") };
  }
  if (/(report|ireport|i-report|ulat|reklamo|complain|basura|parking|nakaparada|butas|sira)/i.test(m)) {
    return {
      action: "report",
      text: fil ? "Maaari mong i-report ito gamit ang Report a concern. Lagyan ng larawan at lokasyon para mabilis maaksyunan. Bibigyan ka ng control number." : "You can report this with Report a concern. Add a photo and location so it can be acted on quickly. You will get a control number.",
      suggestions: [fil ? "Mag-report" : "Report"],
    };
  }
  if (/(jeep|bus|tricycle|traysikel|sakay|ruta|route|fare|pamasahe|commute|papunta)/i.test(m)) {
    const routes = await query<{ name: string; fare_min: number | null }>(`SELECT name, fare_min::float AS fare_min FROM transit_routes WHERE is_active ORDER BY name LIMIT 6`);
    return {
      action: "transport",
      text: (fil ? "Mga ruta sa Transport Hub:\n" : "Routes in the Transport Hub:\n") + routes.map((r) => `• ${r.name}${r.fare_min ? ` (from ₱${r.fare_min})` : ""}`).join("\n"),
    };
  }
  if (/(barangay|kapitan|captain|hotline|numero|contact)/i.test(m)) {
    const all = await query<{ name: string; hotline: string | null }>(`SELECT name, hotline FROM barangays ORDER BY name`);
    const hit = all.find((b) => m.toLowerCase().includes(b.name.toLowerCase()));
    if (hit) return { action: "directory", text: `${hit.name}: ${hit.hotline ?? (fil ? "walang nakatalang hotline" : "no hotline on file")}. ${fil ? "Tingnan ang Barangay Directory para sa detalye." : "See the Barangay Directory for details."}` };
    return { action: "directory", text: fil ? "Buksan ang Barangay Directory para sa mga hotline at opisyal ng 18 barangay ng Navotas." : "Open the Barangay Directory for hotlines and officials of all 18 Navotas barangays." };
  }
  if (/(permit|business|negosyo|cedula|clearance|license|lisensya|requirements)/i.test(m)) {
    return {
      text: fil
        ? "Ang listahan ng requirements ay nasa Citizen's Charter ng lungsod. (Demo mode: ikonekta ang NavoBot sa Copilot Studio para sa eksaktong sagot mula sa SharePoint knowledge base.)"
        : "The requirements are listed in the city's Citizen's Charter. (Demo mode: connect NavoBot to Copilot Studio for exact answers from the SharePoint knowledge base.)",
    };
  }
  return {
    text: fil
      ? "Pasensya na, hindi ko alam ang sagot diyan at ayokong manghula. Subukan ang ibang tanong, o tumawag sa City Hall."
      : "Sorry, I don't know the answer to that and I won't guess. Try another question, or contact City Hall.",
    suggestions: fil ? ["May baha ba?", "Paano mag-report ng basura?", "Ruta papuntang Divisoria"] : ["Any flood advisory?", "How do I report illegal parking?", "Route to Divisoria"],
  };
}
