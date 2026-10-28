import { workUnitVisualKind } from "./workUnits.js";

const UNIT_MODES = { sea: "laut", air: "udara", road: "darat", rail: "kereta" };
const MODE_TERMS = [
  ["laut", ["perhubungan laut", "hubla", "pelayaran", "kapal", "pelabuhan", "maritim", "laut"]],
  ["udara", ["perhubungan udara", "hubud", "penerbangan", "bandar udara", "bandara", "pesawat", "udara"]],
  ["kereta", ["perkeretaapian", "kereta", "stasiun"]],
  ["darat", ["perhubungan darat", "hubdat", "angkutan jalan", "terminal", "kendaraan", "lalu lintas", "darat"]],
];

const normalize = value => typeof value === "string" ? value.normalize("NFKC").toLocaleLowerCase("id-ID").replace(/\s+/g, " ").trim() : "";
const modeFromText = value => {
  const text = normalize(value);
  return MODE_TERMS.find(([, terms]) => terms.some(term => text.includes(term)))?.[0];
};

export function echelonOneUnit(unit) {
  if (Number(unit?.echelon_level) === 3 && unit?.grandparent_name) return { name: unit.grandparent_name, alias: unit.grandparent_alias, ...(unit.grandparent_logo_url ? { logo_url: unit.grandparent_logo_url } : {}) };
  if (Number(unit?.echelon_level) === 2 && unit?.parent_name) return { name: unit.parent_name, alias: unit.parent_alias, ...(unit.parent_logo_url ? { logo_url: unit.parent_logo_url } : {}) };
  return unit;
}

export const workUnitVisualMode = unit => UNIT_MODES[workUnitVisualKind(unit)] || "umum";

export function assetVisualMode(asset) {
  const unit = asset?.work_unit;
  return UNIT_MODES[workUnitVisualKind(echelonOneUnit(unit))]
    || UNIT_MODES[workUnitVisualKind(unit)]
    || modeFromText(asset?.category?.name)
    || modeFromText(asset?.title)
    || "umum";
}

export const assetThumbnailKind = asset => `thumb-${assetVisualMode(asset)}-${asset?.asset_type === "video" ? "video" : "document"}`;

export function topicIconKind(name) {
  const text = normalize(name);
  if (text.includes("keselamatan")) return "safety";
  if (["sdm", "sumber daya", "pelatihan"].some(term => text.includes(term))) return "education";
  if (["kebijakan", "regulasi"].some(term => text.includes(term))) return "policy";
  return modeFromText(text) || "tag";
}
