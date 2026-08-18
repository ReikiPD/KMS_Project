import { CheckCircle2, TriangleAlert } from "lucide-react";
import { Badge } from "@idds/react";

export default function AssetQualityPanel({ quality }) {
  return <section className={`rounded-lg border p-4 ${quality.complete ? "border-emerald-200 bg-emerald-50/60" : "border-amber-200 bg-amber-50/60"}`} aria-label="Status kualitas aset">
    <div className="flex items-start justify-between gap-3"><div className="flex items-center gap-2"><span className={quality.complete ? "text-emerald-700" : "text-amber-700"}>{quality.complete ? <CheckCircle2 size={18} /> : <TriangleAlert size={18} />}</span><div><h2 className="text-sm font-bold text-content-primary">Kualitas aset</h2><p className="mt-0.5 text-xs text-content-secondary">Lengkapi metadata agar aset lebih mudah ditemukan.</p></div></div><Badge type="soft" variant={quality.complete ? "success" : "warning"} size="sm">{quality.completed}/{quality.total}</Badge></div>
    {!quality.complete && <p className="mt-3 text-xs leading-5 text-content-secondary">Perlu diisi: {quality.checks.filter(([, complete]) => !complete).map(([label]) => label).join(", ")}.</p>}
  </section>;
}
