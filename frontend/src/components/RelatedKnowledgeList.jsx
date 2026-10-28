import { CalendarDays, Eye, FileText, PlayCircle } from "lucide-react";
import { Link } from "react-router-dom";
import EmptyState from "./EmptyState";
import { PublicImage } from "./PublicVisual";
import { uploadUrl } from "../lib/api";
import { formatIndonesianDate, formatRelativeTime } from "../lib/dateTime";
import WorkUnitLabel from "./WorkUnitLabel";
import WorkUnitLogo from "./WorkUnitLogo";
import { publicAssetPath } from "../lib/routes";
import { assetThumbnailKind } from "../lib/publicVisuals";

export default function RelatedKnowledgeList({ assets = [], className = "" }) {
  if (!assets.length) {
    return <EmptyState className="kms-empty-state--compact" illustration="empty-knowledge" title="Belum ada rekomendasi" description="Pengetahuan lain yang sudah terbit akan direkomendasikan di sini." />;
  }

  return (
    <ol className={`kms-related-list ${className}`.trim()}>
      {assets.map((asset) => {
        const video = asset.asset_type === "video";
        const source = asset.work_unit?.name || asset.category?.name || "KMS Kemenhub";

        return (
          <li key={asset.id}>
            <Link to={publicAssetPath(asset)} className="kms-related-item" aria-label={`Buka pengetahuan: ${asset.title}`}>
              <PublicImage sources={[uploadUrl(asset.thumbnail_url)]} fallback={assetThumbnailKind(asset)} className="kms-related-thumb" />
              <span className="min-w-0 py-0.5">
                <span className="flex items-center gap-1 text-xs font-semibold text-content-guide">{video ? <PlayCircle size={13} /> : <FileText size={13} />}{video ? "Video" : "Dokumen"}</span>
                <span className="kms-related-title">{asset.title}</span>
                <div className="mt-1 flex min-w-0 items-center gap-1 text-xs text-content-secondary">
                  <WorkUnitLogo unit={asset.work_unit} className="kms-asset-unit-logo" />
                  {asset.work_unit ? <WorkUnitLabel name={asset.work_unit.name} alias={asset.work_unit.alias} className="block truncate" /> : <span className="truncate">{source}</span>}
                </div>
                <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-content-secondary"><span className="inline-flex items-center gap-1"><CalendarDays size={13} /><time dateTime={asset.created_at || undefined} title={`Tanggal unggah: ${formatIndonesianDate(asset.created_at, { shortMonth: true })}`}>{formatRelativeTime(asset.created_at, { useYang: true, invalid: "Waktu unggah tidak tersedia" })}</time></span><span className="inline-flex items-center gap-1"><Eye size={13} />{asset.view_count || 0}</span></span>
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
