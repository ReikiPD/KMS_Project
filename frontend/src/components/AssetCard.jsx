import { Clock3, Eye, FileText, PlayCircle } from "lucide-react";
import { Badge, Button, Card, Tooltip } from "@idds/react";
import { Link } from "react-router-dom";
import documentFallback from "../assets/knowledge/document-fallback.png";
import videoFallback from "../assets/knowledge/video-fallback.png";
import { uploadUrl } from "../lib/api";
import { formatRelativeTime } from "../lib/dateTime";

const isVideo = (asset) => asset.asset_type === "video";

const fileKind = (asset) => {
  const filename = String(asset.file_url || "").split("?")[0];
  const extension = filename.includes(".") ? filename.split(".").pop().toUpperCase() : "";
  if (extension) return extension;
  return isVideo(asset) ? "VIDEO" : "PDF";
};

const highlightedTitle = (title, query) => {
  const terms = String(query || "").match(/[\p{L}\p{N}]+/gu)?.filter((term) => term.length > 1) || [];
  if (!terms.length) return title;
  const escaped = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const matcher = new RegExp(`(${escaped})`, "gi");
  return String(title).split(matcher).map((part, index) => (
    terms.some((term) => term.toLocaleLowerCase("id-ID") === part.toLocaleLowerCase("id-ID"))
      ? <mark key={`${part}-${index}`}>{part}</mark>
      : part
  ));
};

export default function AssetCard({ asset, compact = false, searchQuery = "", onPreview }) {
  const video = isVideo(asset);
  const typeLabel = video ? "Video" : "Dokumen";
  const TypeIcon = video ? PlayCircle : FileText;
  const fallbackImage = video ? videoFallback : documentFallback;
  const mediaSrc = uploadUrl(asset.thumbnail_url) || fallbackImage;
  const mediaAlt = asset.thumbnail_url ? `Thumbnail ${asset.title}` : `Ilustrasi ${typeLabel.toLowerCase()} bertema transportasi`;

  return (
    <div className="kms-asset-card-shell">
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
            <h3 className="kms-asset-card-title">{highlightedTitle(asset.title, searchQuery)}</h3>
            <p className="kms-asset-card-file"><TypeIcon size={15} aria-hidden="true" />{typeLabel} · {fileKind(asset)}</p>
            <div className="kms-asset-card-meta">
              <span><Eye size={15} aria-hidden="true" />{asset.view_count || 0} dilihat</span>
              <span><Clock3 size={15} aria-hidden="true" />{formatRelativeTime(asset.created_at, { prefix: "Dibuat ", invalid: "Baru ditambahkan", justNow: "Baru ditambahkan" })}</span>
            </div>
          </div>
          <div className={`kms-asset-card-footer ${video ? "kms-asset-card-footer--video" : ""}`} aria-label={`Tipe aset: ${typeLabel}`} />
        </Card>
      </Link>
      {onPreview && <Tooltip variant="basic" title="Pratinjau cepat" placement="top" showArrow={true}><Button className="kms-asset-card-preview" hierarchy="secondary" size="sm" onClick={() => onPreview(asset)} aria-label={`Pratinjau cepat ${asset.title}`}><Eye size={16} /></Button></Tooltip>}
    </div>
  );
}
