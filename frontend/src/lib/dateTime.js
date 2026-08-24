const TIME_UNITS = [
  { seconds: 31_536_000, label: "tahun" },
  { seconds: 2_592_000, label: "bulan" },
  { seconds: 604_800, label: "minggu" },
  { seconds: 86_400, label: "hari" },
  { seconds: 3_600, label: "jam" },
  { seconds: 60, label: "menit" },
];

export const formatRelativeTime = (value, { prefix = "", useYang = false, invalid = "Waktu tidak tersedia", justNow = "Baru saja" } = {}) => {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return invalid;

  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1_000));
  if (elapsedSeconds < 60) return justNow;

  const interval = TIME_UNITS.find((item) => elapsedSeconds >= item.seconds) || TIME_UNITS.at(-1);
  const amount = Math.floor(elapsedSeconds / interval.seconds);
  return `${prefix}${amount} ${interval.label} ${useYang ? "yang " : ""}lalu`.trim();
};

export const formatIndonesianDate = (value, options = {}) => {
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) return "Tanggal tidak tersedia";
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: options.shortMonth ? "short" : "long",
    year: "numeric",
  }).format(timestamp);
};
