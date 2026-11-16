/**
 * Demo seed data for Navotas City.
 *
 * IMPORTANT: barangay centroids are approximate and boundaries are generated
 * (Voronoi cells clipped to a rough city outline) so the map looks right in a
 * demo. Before production, import official boundaries from PSA/NAMRIA with
 * `pnpm --filter @navopulse/web tsx scripts/import-boundaries.ts file.geojson`.
 * Officials, hotlines and businesses are placeholders, not real people or
 * numbers.
 */

export interface BarangaySeed {
  name: string;
  district: 1 | 2;
  lat: number;
  lng: number;
}

// The 18 barangays of Navotas City.
export const BARANGAYS: BarangaySeed[] = [
  { name: "Tanza 1", district: 2, lat: 14.6985, lng: 120.9335 },
  { name: "Tanza 2", district: 2, lat: 14.6905, lng: 120.9312 },
  { name: "Tangos North", district: 2, lat: 14.6812, lng: 120.9358 },
  { name: "Tangos South", district: 2, lat: 14.6748, lng: 120.9372 },
  { name: "San Jose", district: 2, lat: 14.6688, lng: 120.9398 },
  { name: "Daanghari", district: 2, lat: 14.6642, lng: 120.9418 },
  { name: "San Roque", district: 2, lat: 14.6600, lng: 120.9408 },
  { name: "Sipac-Almacen", district: 1, lat: 14.6612, lng: 120.9462 },
  { name: "Navotas West", district: 1, lat: 14.6560, lng: 120.9432 },
  { name: "Navotas East", district: 1, lat: 14.6548, lng: 120.9478 },
  { name: "Bagumbayan North", district: 1, lat: 14.6492, lng: 120.9478 },
  { name: "Bagumbayan South", district: 1, lat: 14.6448, lng: 120.9492 },
  { name: "Bangculasi", district: 1, lat: 14.6418, lng: 120.9532 },
  { name: "North Bay Boulevard North", district: 1, lat: 14.6560, lng: 120.9528 },
  { name: "San Rafael Village", district: 1, lat: 14.6520, lng: 120.9568 },
  { name: "NBBS Proper", district: 1, lat: 14.6462, lng: 120.9572 },
  { name: "NBBS Kaunlaran", district: 1, lat: 14.6492, lng: 120.9608 },
  { name: "NBBS Dagat-dagatan", district: 1, lat: 14.6440, lng: 120.9630 },
];

/** Rough outline of the city used to clip the generated barangay cells (lng lat). */
export const CITY_OUTLINE_WKT =
  "POLYGON((120.9265 14.7045, 120.9395 14.7040, 120.9440 14.6800, 120.9480 14.6680, 120.9560 14.6620, 120.9680 14.6560, 120.9690 14.6420, 120.9580 14.6370, 120.9470 14.6390, 120.9395 14.6500, 120.9350 14.6620, 120.9300 14.6800, 120.9265 14.7045))";

export interface CategorySeed {
  code: string;
  nameEn: string;
  nameFil: string;
  module: "emergency" | "civic" | "traffic";
  office: "DRRMO" | "TMO" | "PIO";
  priority: "low" | "normal" | "high" | "critical";
  color: string;
}

export const CATEGORIES: CategorySeed[] = [
  { code: "EMR_FLOOD", nameEn: "Flood / Rescue", nameFil: "Baha / Rescue", module: "emergency", office: "DRRMO", priority: "critical", color: "#2563eb" },
  { code: "EMR_FIRE", nameEn: "Fire", nameFil: "Sunog", module: "emergency", office: "DRRMO", priority: "critical", color: "#dc2626" },
  { code: "EMR_MEDICAL", nameEn: "Medical emergency", nameFil: "Medikal na emergency", module: "emergency", office: "DRRMO", priority: "high", color: "#db2777" },
  { code: "EMR_STORM_SURGE", nameEn: "Storm surge", nameFil: "Daluyong", module: "emergency", office: "DRRMO", priority: "critical", color: "#7c3aed" },
  { code: "EMR_OTHER", nameEn: "Other emergency", nameFil: "Ibang emergency", module: "emergency", office: "DRRMO", priority: "high", color: "#ea580c" },
  { code: "CIV_WASTE", nameEn: "Waste dumping", nameFil: "Pagtatapon ng basura", module: "civic", office: "TMO", priority: "normal", color: "#65a30d" },
  { code: "CIV_INFRA", nameEn: "Damaged infrastructure", nameFil: "Sirang imprastraktura", module: "civic", office: "TMO", priority: "normal", color: "#a16207" },
  { code: "CIV_DRAINAGE", nameEn: "Clogged drainage", nameFil: "Baradong kanal", module: "civic", office: "DRRMO", priority: "high", color: "#0891b2" },
  { code: "CIV_STREETLIGHT", nameEn: "Broken streetlight", nameFil: "Sirang ilaw sa kalye", module: "civic", office: "TMO", priority: "low", color: "#ca8a04" },
  { code: "CIV_OTHER", nameEn: "Other civic concern", nameFil: "Ibang concern", module: "civic", office: "PIO", priority: "low", color: "#64748b" },
  { code: "TRF_ILLEGAL_PARKING", nameEn: "Illegal parking", nameFil: "Ilegal na pagparada", module: "traffic", office: "TMO", priority: "normal", color: "#f59e0b" },
  { code: "TRF_OBSTRUCTION", nameEn: "Road obstruction", nameFil: "Harang sa kalsada", module: "traffic", office: "TMO", priority: "normal", color: "#d97706" },
  { code: "TRF_EMERGENCY_ROUTE", nameEn: "Blocked emergency route", nameFil: "Nakaharang sa emergency route", module: "traffic", office: "TMO", priority: "high", color: "#b45309" },
  { code: "TRF_ACCIDENT", nameEn: "Road accident", nameFil: "Aksidente sa kalsada", module: "traffic", office: "TMO", priority: "high", color: "#9f1239" },
];

export const UNITS = [
  { name: "DRRMO Rescue Boat 1", office: "DRRMO", type: "Rescue boat", contact: "Radio Ch. 5" },
  { name: "DRRMO Rescue Boat 2", office: "DRRMO", type: "Rescue boat", contact: "Radio Ch. 5" },
  { name: "DRRMO Rescue Team Alpha", office: "DRRMO", type: "Search and rescue team", contact: "Radio Ch. 3" },
  { name: "DRRMO Rescue Team Bravo", office: "DRRMO", type: "Search and rescue team", contact: "Radio Ch. 3" },
  { name: "Ambulance 1", office: "DRRMO", type: "Ambulance", contact: "Radio Ch. 7" },
  { name: "Ambulance 2", office: "DRRMO", type: "Ambulance", contact: "Radio Ch. 7" },
  { name: "TMO Enforcer Team A", office: "TMO", type: "Traffic enforcers", contact: "Radio Ch. 9" },
  { name: "TMO Enforcer Team B", office: "TMO", type: "Traffic enforcers", contact: "Radio Ch. 9" },
  { name: "TMO Tow Truck 1", office: "TMO", type: "Tow truck", contact: "Radio Ch. 9" },
  { name: "City Engineering Crew", office: "TMO", type: "Maintenance crew", contact: "Radio Ch. 11" },
] as const;

export const DEMO_PASSWORD = "NavoPulse!2026";

export const STAFF = [
  { email: "admin@navopulse.local", fullName: "Sofia Super Admin", role: "super_admin" },
  { email: "dispatch@navopulse.local", fullName: "Dante Dispatcher", role: "drrmo_dispatcher" },
  { email: "tmo@navopulse.local", fullName: "Tomas TMO Officer", role: "tmo_officer" },
  { email: "pio@navopulse.local", fullName: "Pia PIO Admin", role: "pio_admin" },
  { email: "responder@navopulse.local", fullName: "Rico Responder", role: "field_responder", unit: "DRRMO Rescue Team Alpha" },
  { email: "enforcer@navopulse.local", fullName: "Elena Enforcer", role: "field_responder", unit: "TMO Enforcer Team A" },
] as const;

export const CITIZENS = [
  { mobile: "+639170000001", fullName: "Juan Dela Cruz", barangay: "Tangos North", lang: "fil" },
  { mobile: "+639170000002", fullName: "Maria Santos", barangay: "San Jose", lang: "fil" },
  { mobile: "+639170000003", fullName: "Jose Rizal Reyes", barangay: "Bagumbayan North", lang: "en" },
  { mobile: "+639170000004", fullName: "Ana Lim", barangay: "NBBS Kaunlaran", lang: "en" },
] as const;

export const DESCRIPTIONS: Record<string, string[]> = {
  EMR_FLOOD: ["Hanggang baywang na ang tubig, may matanda sa bahay", "Stranded kami sa second floor, need rescue", "Flood waters rising fast near the fish port", "May bata at buntis na kailangang ilikas"],
  EMR_FIRE: ["Sunog sa may kanto, kumakalat na", "Smoke coming from a house near the chapel", "Nasusunog ang poste ng kuryente"],
  EMR_MEDICAL: ["Nahimatay si lola, hindi makahinga", "Injured fisherman at the pier", "Buntis na manganganak na, walang masakyan"],
  EMR_STORM_SURGE: ["Mataas ang alon, umaabot na sa kalsada", "Seawall overtopping near the coast"],
  EMR_OTHER: ["Natumbang puno, may naipit", "Live wire on the street after the storm"],
  CIV_WASTE: ["Tambak ng basura sa gilid ng kanal", "Illegal dumping beside the river every night", "Basura sa bakanteng lote, mabaho na"],
  CIV_INFRA: ["Malaking butas sa kalsada", "Broken footbridge railing", "Sirang manhole cover, delikado"],
  CIV_DRAINAGE: ["Barado ang kanal, umaapaw kahit konting ulan", "Drainage clogged with plastic"],
  CIV_STREETLIGHT: ["Patay ang ilaw sa buong kalye", "Streetlight flickering near the school"],
  CIV_OTHER: ["Maingay na videoke hanggang madaling araw", "Stray dogs near the market"],
  TRF_ILLEGAL_PARKING: ["Naka-double park sa M. Naval St.", "Truck parked overnight blocking the lane", "Tricycles parked on the sidewalk"],
  TRF_OBSTRUCTION: ["Sidewalk vendors blocking the road", "Construction materials on the street"],
  TRF_EMERGENCY_ROUTE: ["Nakaharang ang sasakyan sa emergency route papuntang evacuation center", "Parked jeepneys blocking the fire lane"],
  TRF_ACCIDENT: ["Banggaan ng tricycle at motor", "Jeepney sideswiped a pedicab"],
};

export const TRANSIT_ROUTES = [
  {
    code: "J-NAV-DIV", name: "Navotas – Divisoria", mode: "jeepney", origin: "Navotas (Tangos)", destination: "Divisoria, Manila",
    fareMin: 13, fareNotes: "Minimum fare for the first 4 km; verify against the current LTFRB fare matrix.",
    description: "Via M. Naval St., North Bay Boulevard and R-10.",
    path: [[120.9358, 14.6812], [120.9398, 14.6688], [120.9432, 14.6560], [120.9528, 14.6460], [120.9640, 14.6300]],
    stops: [["Tangos Terminal", "terminal", 120.9358, 14.6812], ["San Jose Church", "stop", 120.9398, 14.6688], ["Navotas City Hall", "stop", 120.9432, 14.656], ["Divisoria", "terminal", 120.964, 14.63]],
  },
  {
    code: "J-NAV-MON", name: "Navotas – Monumento", mode: "jeepney", origin: "Navotas Fish Port", destination: "Monumento, Caloocan",
    fareMin: 13, fareNotes: "Verify against the current LTFRB fare matrix.",
    description: "Via C-4 Road and Letre.",
    path: [[120.9530, 14.6460], [120.9600, 14.6500], [120.9700, 14.6560], [120.9840, 14.6570]],
    stops: [["Navotas Fish Port Terminal", "terminal", 120.953, 14.646], ["C-4 / Letre", "stop", 120.97, 14.656], ["Monumento", "terminal", 120.984, 14.657]],
  },
  {
    code: "T-TANZA", name: "Tanza – Tangos Tricycle", mode: "tricycle", origin: "Tanza 1", destination: "Tangos South",
    fareMin: 15, fareNotes: "Per passenger; special trips cost more. Fares set by city ordinance.",
    description: "TODA route serving the northern barangays.",
    path: [[120.9335, 14.6985], [120.9312, 14.6905], [120.9358, 14.6812], [120.9372, 14.6748]],
    stops: [["Tanza TODA", "terminal", 120.9335, 14.6985], ["Tangos South TODA", "terminal", 120.9372, 14.6748]],
  },
  {
    code: "B-NAV-PITX", name: "Navotas – PITX (Bus)", mode: "bus", origin: "Navotas City Hall", destination: "PITX, Parañaque",
    fareMin: 15, fareNotes: "Distance-based; verify with the operator.",
    description: "Point-to-point bus via R-10 and Roxas Boulevard.",
    path: [[120.9432, 14.6560], [120.9600, 14.6250], [120.9800, 14.5800], [120.9900, 14.5100]],
    stops: [["Navotas City Hall", "terminal", 120.9432, 14.656], ["PITX", "terminal", 120.99, 14.51]],
  },
] as const;

export const ANNOUNCEMENTS = [
  {
    titleEn: "Registration for the Navotas Scholarship Program is open", titleFil: "Bukas na ang rehistro para sa Navotas Scholarship Program",
    bodyEn: "Sample announcement. Applications are accepted at City Hall and online. Bring a report card and barangay certificate.",
    bodyFil: "Halimbawang anunsyo. Tumatanggap ng aplikasyon sa City Hall at online. Magdala ng report card at barangay certificate.",
  },
  {
    titleEn: "Business permit renewal: use the online queue", titleFil: "Pag-renew ng business permit: gamitin ang online queue",
    bodyEn: "Sample announcement. Ask NavoBot for the list of requirements before visiting the Business Permits and Licensing Office.",
    bodyFil: "Halimbawang anunsyo. Tanungin si NavoBot ang listahan ng requirements bago pumunta sa BPLO.",
  },
  {
    titleEn: "Clean-up drive this Saturday", titleFil: "Clean-up drive ngayong Sabado",
    bodyEn: "Sample announcement. Join your barangay's coastal clean-up at 6:00 AM.",
    bodyFil: "Halimbawang anunsyo. Sumali sa coastal clean-up ng inyong barangay, 6:00 AM.",
  },
];

export const BUSINESSES = [
  { name: "Sample: Tangos Fresh Catch", category: "Seafood", barangay: "Tangos North", description: "Fresh fish and seafood from the morning catch." },
  { name: "Sample: Kusina sa Daanghari", category: "Restaurant", barangay: "Daanghari", description: "Home-style Filipino meals." },
  { name: "Sample: San Jose Hardware", category: "Hardware", barangay: "San Jose", description: "Construction and flood-proofing supplies." },
  { name: "Sample: Bagumbayan Bakeshop", category: "Bakery", barangay: "Bagumbayan North", description: "Pandesal and pastries from 5 AM." },
  { name: "Sample: NBBS Boat Repair", category: "Services", barangay: "NBBS Dagat-dagatan", description: "Fishing boat and engine repair." },
];
