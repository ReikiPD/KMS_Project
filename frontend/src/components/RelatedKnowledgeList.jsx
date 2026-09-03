import { Building2, CalendarDays, Eye, FileText, PlayCircle } from "lucide-react";
import { Link } from "react-router-dom";
import documentFallback from "../assets/knowledge/document-fallback.png";
import videoFallback from "../assets/knowledge/video-fallback.png";
import { uploadUrl } from "../lib/api";
import { formatIndonesianDate, formatRelativeTime } from "../lib/dateTime";
import WorkUnitLabel from "./WorkUnitLabel";
import { publicAssetPath } from "../lib/routes";

export default function RelatedKnowledgeList({ assets = [], className = "" }) {
  if (!assets.length) {
    return <p className="rounded-xl border border-dashed border-border-subtle p-4 text-sm leading-6 text-content-secondary">Belum ada pengetahuan lain yang dapat direkomendasikan.</p>;
  }

  return (
    <ol className={`kms-related-list ${className}`.trim()}>
      {assets.map((asset) => {
        const video = asset.asset_type === "video";
        const thumbnail = uploadUrl(asset.thumbnail_url) || (video ? videoFallback : documentFallback);
        const source = asset.work_unit?.name || asset.category?.name || "KMS Kemenhub";

        return (
          <li key={asset.id}>
            <Link to={publicAssetPath(asset)} className="kms-related-item" aria-label={`Buka pengetahuan: ${asset.title}`}>
              <img src={thumbnail} alt="" className="kms-related-thumb" loading="lazy" decoding="async" />
              <span className="min-w-0 py-0.5">
                <span className="flex items-center gap-1 text-xs font-semibold text-content-guide">{video ? <PlayCircle size={13} /> : <FileText size={13} />}{video ? "Video" : "Dokumen"}</span>
                <span className="kms-related-title">{asset.title}</span>
                <div className="mt-1 flex min-w-0 items-center gap-1 text-xs text-content-secondary"><Building2 className="shrink-0" size={13} />{asset.work_unit ? <WorkUnitLabel name={asset.work_unit.name} alias={asset.work_unit.alias} className="block truncate" /> : <span className="truncate">{source}</span>}</div>
                <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-content-secondary"><span className="inline-flex items-center gap-1"><CalendarDays size={13} /><time dateTime={asset.created_at || undefined} title={`Tanggal unggah: ${formatIndonesianDate(asset.created_at, { shortMonth: true })}`}>{formatRelativeTime(asset.created_at, { useYang: true, invalid: "Waktu unggah tidak tersedia" })}</time></span><span className="inline-flex items-center gap-1"><Eye size={13} />{asset.view_count || 0}</span></span>
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
