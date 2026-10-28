export function fieldError({ value, label, required, disabled, type, min, max, minLength, rule }) {
  if (disabled) return "";
  const text = String(value ?? "").trim();
  const name = label.replace(/\s*\*$/, "");
  if (required && (!text || (Array.isArray(value) && !value.length))) return `${name} wajib diisi.`;
  if (text && type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return "Masukkan alamat email yang valid.";
  if (text && minLength && text.length < minLength) return `${name} minimal ${minLength} karakter.`;
  if (text && type === "number" && (!Number.isFinite(Number(text)) || (min != null && Number(text) < Number(min)) || (max != null && Number(text) > Number(max)))) return `${name} harus berupa angka${min != null && max != null ? ` antara ${min} dan ${max}` : " yang valid"}.`;
  return rule?.(value) || "";
}
