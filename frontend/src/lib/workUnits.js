const EXACT_SHORT_NAMES = new Map([
  ["inspektorat jenderal", "Itjen"],
  ["inspektorat jendral", "Itjen"],
  ["pusat data dan teknologi informasi perhubungan", "Pusdatin"],
  ["direktorat jenderal perhubungan darat", "Ditjen Hubdat"],
  ["direktorat jenderal perhubungan laut", "Ditjen Hubla"],
  ["direktorat jenderal perhubungan udara", "Ditjen Hubud"],
  ["direktorat jenderal perkeretaapian", "Ditjen Perkeretaapian"],
  ["direktorat jenderal integrasi transportasi dan multimoda", "Ditjen Intram"],
  ["pusat pengembangan sumber daya manusia perhubungan", "PPSDM"],
  ["badan pengembangan sumber daya manusia perhubungan", "BPSDM"],
  ["badan kebijakan transportasi", "BKT"],
  ["sekretariat badan kebijakan transportasi", "Sekretariat BKT"],
  ["pusat kebijakan sarana transportasi", "Pusjak Sarana"],
  ["pusat kebijakan prasarana transportasi dan integrasi moda", "Pusjak PTIM"],
  ["pusat kebijakan prasarana dan integrasi moda", "Pusjak PIM"],
  ["pusat kebijakan lalu lintas, angkutan, dan transportasi perkotaan", "Pusjak LLATP"],
  ["pusat kebijakan lalu lintas dan angkutan transportasi", "Pusjak LLAT"],
  ["pusat kebijakan keselamatan dan keamanan transportasi", "Pusjak KKT"],
]);

const FULL_NAME_ALIASES = new Map([
  ["pusjak pkst", "Pusat Kebijakan Sarana Transportasi"],
  ["pusjak sarana", "Pusat Kebijakan Sarana Transportasi"],
  ["pusjak ptim", "Pusat Kebijakan Prasarana Transportasi dan Integrasi Moda"],
  ["pusjak llatp", "Pusat Kebijakan Lalu Lintas, Angkutan, dan Transportasi Perkotaan"],
  ["pusjak kkt", "Pusat Kebijakan Keselamatan dan Keamanan Transportasi"],
]);

const CONNECTOR_WORDS = new Set(["dan", "dari", "ke", "pada", "serta", "untuk", "yang"]);

export const workUnitFullName = (value) => {
  const sourceName = String(value || "").trim().replace(/\s+/g, " ");
  if (!sourceName) return "";
  return FULL_NAME_ALIASES.get(sourceName.toLocaleLowerCase("id-ID")) || sourceName;
};

export const workUnitShortName = (value, maxLength = 24) => {
  const fullName = workUnitFullName(value);
  if (!fullName) return "Unit belum diisi";

  const exactName = EXACT_SHORT_NAMES.get(fullName.toLocaleLowerCase("id-ID"));
  if (exactName) return exactName;
  if (fullName.length <= maxLength) return fullName;

  const phraseShortened = fullName
    .replace(/^Direktorat Jenderal\b/i, "Ditjen")
    .replace(/^Sekretariat Jenderal\b/i, "Setjen")
    .replace(/^Inspektorat Jenderal\b/i, "Itjen")
    .replace(/\bPerhubungan Darat\b/i, "Hubdat")
    .replace(/\bPerhubungan Laut\b/i, "Hubla")
    .replace(/\bPerhubungan Udara\b/i, "Hubud");
  if (phraseShortened.length <= maxLength) return phraseShortened;

  const initials = fullName
    .split(" ")
    .filter((word) => word && !CONNECTOR_WORDS.has(word.toLocaleLowerCase("id-ID")))
    .map((word) => word[0])
    .join("")
    .toUpperCase();
  return initials.length >= 2 ? initials.slice(0, 10) : phraseShortened;
};
