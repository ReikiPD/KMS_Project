import { Building2, CalendarDays, Eye, FileText, PlayCircle } from "lucide-react";
import { Link } from "react-router-dom";
import documentFallback from "../assets/knowledge/document-fallback.png";
import videoFallback from "../assets/knowledge/video-fallback.png";
import { uploadUrl } from "../lib/api";

const formatDate = (value) => value
  ? new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value))
  : "Tanggal tidak tersedia";

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
            <Link to={`/detail/${asset.id}`} className="kms-related-item" aria-label={`Buka pengetahuan: ${asset.title}`}>
              <img src={thumbnail} alt="" className="kms-related-thumb" />
              <span className="min-w-0 py-0.5">
                <span className="flex items-center gap-1 text-xs font-semibold text-content-guide">{video ? <PlayCircle size={13} /> : <FileText size={13} />}{video ? "Video" : "Dokumen"}</span>
                <span className="kms-related-title">{asset.title}</span>
                <span className="mt-1 flex items-center gap-1 truncate text-xs text-content-secondary"><Building2 size={13} />{source}</span>
                <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-content-secondary"><span className="inline-flex items-center gap-1"><CalendarDays size={13} />{formatDate(asset.created_at)}</span><span className="inline-flex items-center gap-1"><Eye size={13} />{asset.view_count || 0}</span></span>
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
