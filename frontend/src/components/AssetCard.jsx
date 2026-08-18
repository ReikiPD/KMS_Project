import { Clock3, Eye, FileText, PlayCircle } from "lucide-react";
import { Badge, Card } from "@idds/react";
import { Link } from "react-router-dom";
import documentFallback from "../assets/knowledge/document-fallback.png";
import videoFallback from "../assets/knowledge/video-fallback.png";
import { uploadUrl } from "../lib/api";

const isVideo = (asset) => asset.asset_type === "video";

const fileKind = (asset) => {
  const filename = String(asset.file_url || "").split("?")[0];
  const extension = filename.includes(".") ? filename.split(".").pop().toUpperCase() : "";
  if (extension) return extension;
  return isVideo(asset) ? "VIDEO" : "PDF";
};

const relativeCreatedAt = (value) => {
  const createdAt = new Date(value).getTime();
  if (!Number.isFinite(createdAt)) return "Baru ditambahkan";
  const elapsedDays = Math.max(0, Math.floor((Date.now() - createdAt) / 86_400_000));
  if (elapsedDays === 0) return "Dibuat hari ini";
  if (elapsedDays === 1) return "Dibuat kemarin";
  if (elapsedDays < 7) return `Dibuat ${elapsedDays} hari lalu`;
  const elapsedWeeks = Math.floor(elapsedDays / 7);
  if (elapsedDays < 30) return `Dibuat ${elapsedWeeks} minggu lalu`;
  const elapsedMonths = Math.floor(elapsedDays / 30);
  if (elapsedDays < 365) return `Dibuat ${elapsedMonths} bulan lalu`;
  const elapsedYears = Math.floor(elapsedDays / 365);
  return `Dibuat ${elapsedYears} tahun lalu`;
};

export default function AssetCard({ asset, compact = false }) {
  const video = isVideo(asset);
  const typeLabel = video ? "Video" : "Dokumen";
  const TypeIcon = video ? PlayCircle : FileText;
  const fallbackImage = video ? videoFallback : documentFallback;
  const mediaSrc = uploadUrl(asset.thumbnail_url) || fallbackImage;
  const mediaAlt = asset.thumbnail_url ? `Thumbnail ${asset.title}` : `Ilustrasi ${typeLabel.toLowerCase()} bertema transportasi`;

  return (
    <Link to={`/detail/${asset.id}`} className="kms-asset-card-link block rounded-xl focus:outline-none">
      <Card
        variant="basic"
        mediaPosition="top"
        mediaSrc={mediaSrc}
        mediaAlt={mediaAlt}
        showHeader={false}
        hoverable
        className={`kms-asset-card overflow-hidden p-0 ${compact ? "kms-asset-card--compact" : ""}`}
      >
        <Badge className="kms-asset-card-type" type="soft" variant={video ? "info" : "brand"} size="sm" prefixIcon={<TypeIcon size={14} />}>{fileKind(asset)}</Badge>
        <div className="kms-asset-card-content">
          <h3 className="kms-asset-card-title">{asset.title}</h3>
          <p className="kms-asset-card-file"><TypeIcon size={15} aria-hidden="true" />{typeLabel} · {fileKind(asset)}</p>
          <div className="kms-asset-card-meta">
            <span><Eye size={15} aria-hidden="true" />{asset.view_count || 0} dilihat</span>
            <span><Clock3 size={15} aria-hidden="true" />{relativeCreatedAt(asset.created_at)}</span>
          </div>
        </div>
        <div className={`kms-asset-card-footer ${video ? "kms-asset-card-footer--video" : ""}`} aria-label={`Tipe aset: ${typeLabel}`} />
      </Card>
    </Link>
  );
}
