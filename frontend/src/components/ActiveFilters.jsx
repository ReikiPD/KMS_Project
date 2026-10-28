import { X } from "lucide-react";
import { Button } from "@idds/react";

export default function ActiveFilters({ items = [], onReset }) {
  if (!items.length) return null;
  return <div className="kms-active-filters" aria-label="Filter aktif">
    {items.map(item => <button key={item.key} type="button" className="kms-filter-chip" onClick={item.onRemove} aria-label={`Hapus filter ${item.label}`}><span>{item.label}</span><X size={14} aria-hidden="true" /></button>)}
    {onReset && <Button hierarchy="tertiary" size="sm" onClick={onReset}>Reset semua</Button>}
  </div>;
}
