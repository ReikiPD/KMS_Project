import { useEffect, useState } from "react";
import { BasicDropdown } from "@idds/react";
import { Check, Moon, Settings2, Sun, Type } from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";

const SCALE_OPTIONS = [
  { value: "normal", label: "Normal", description: "Ukuran standar" },
  { value: "large", label: "Besar", description: "Teks 6% lebih besar" },
  { value: "xlarge", label: "Sangat besar", description: "Teks 12% lebih besar" },
];

const getSavedScale = () => {
  try {
    const saved = window.localStorage.getItem("kms-font-scale");
    return SCALE_OPTIONS.some((option) => option.value === saved) ? saved : "normal";
  } catch {
    return "normal";
  }
};

const THEME_OPTIONS = [
  { value: "light", label: "Terang", description: "Latar cerah", icon: Sun },
  { value: "dark", label: "Gelap", description: "Latar redup", icon: Moon },
];

export default function AccessibilityMenu({ className = "", placement = "bottom-end" }) {
  const [scale, setScale] = useState(getSavedScale);
  const { mode, setTheme } = useTheme();

  useEffect(() => {
    document.documentElement.dataset.fontScale = scale;
    try { window.localStorage.setItem("kms-font-scale", scale); } catch { /* Preferensi tetap aktif selama sesi. */ }
  }, [scale]);

  return <BasicDropdown
    placement={placement}
    className="kms-accessibility-dropdown"
    trigger={<button type="button" className={`kms-accessibility-trigger ${className}`} aria-label="Pengaturan tampilan dan aksesibilitas" title="Pengaturan tampilan"><Settings2 size={18} /></button>}
    content={<div className="overflow-hidden rounded-lg border border-border-subtle bg-page-primary p-2 shadow-lg">
      <div className="flex items-center gap-2 px-2 pb-2 pt-1"><Settings2 size={16} className="text-content-guide" /><div><p className="text-sm font-bold text-content-primary">Pengaturan tampilan</p><p className="text-[11px] text-content-secondary">Sesuaikan kenyamanan membaca</p></div></div>
      <div className="border-y border-border-subtle py-2">
        <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-content-secondary">Mode pencahayaan</p>
        <div className="grid grid-cols-2 gap-1">{THEME_OPTIONS.map((option) => {
          const Icon = option.icon;
          return <button key={option.value} type="button" className={`kms-accessibility-option ${mode === option.value ? "kms-accessibility-option--active" : ""}`} onClick={() => setTheme(option.value)} aria-pressed={mode === option.value}><span className="flex items-center gap-2"><Icon size={16} /><span><strong>{option.label}</strong><small>{option.description}</small></span></span>{mode === option.value && <Check size={15} />}</button>;
        })}</div>
      </div>
      <div className="pt-2"><div className="flex items-center gap-2 px-2 pb-1.5"><Type size={15} className="text-content-guide" /><p className="text-[11px] font-semibold uppercase tracking-wide text-content-secondary">Ukuran teks</p></div><div className="space-y-1">{SCALE_OPTIONS.map((option) => <button key={option.value} type="button" className={`kms-accessibility-option ${scale === option.value ? "kms-accessibility-option--active" : ""}`} onClick={() => setScale(option.value)} aria-pressed={scale === option.value}><span><strong>{option.label}</strong><small>{option.description}</small></span>{scale === option.value && <Check size={16} />}</button>)}</div></div>
    </div>}
  />;
}
