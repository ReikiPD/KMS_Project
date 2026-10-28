import { Clock3, Eye, FileText, PlayCircle } from "lucide-react";
import { Badge, Button, Card } from "@idds/react";
import { Link } from "react-router-dom";
import { usePublicImageSources, usePublicVisualSource } from "../hooks/usePublicVisual";
import WorkUnitLabel from "./WorkUnitLabel";
import WorkUnitLogo from "./WorkUnitLogo";
import { uploadUrl } from "../lib/api";
import { formatRelativeTime } from "../lib/dateTime";
import { publicAssetPath } from "../lib/routes";
import { assetThumbnailKind, echelonOneUnit } from "../lib/publicVisuals";

const isVideo = (asset) => asset.asset_type === "video";

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

export default function AssetCard({ asset, compact = false, searchQuery = "", onPreview, variant = "home", nonInteractive = false, thumbnailSrc }) {
  const video = isVideo(asset);
  const panorama = variant === "panorama";
  const typeLabel = video ? "Video" : "Dokumen";
  const TypeIcon = video ? PlayCircle : FileText;
  const fallbackImage = usePublicVisualSource(assetThumbnailKind(asset));
  const { src: mediaSrc, onError } = usePublicImageSources([thumbnailSrc || uploadUrl(asset.thumbnail_url), fallbackImage]);
  const mediaAlt = mediaSrc === fallbackImage ? `Ilustrasi ${typeLabel.toLowerCase()} pengetahuan` : `Thumbnail ${asset.title}`;
  const displayedUnit = echelonOneUnit(asset.work_unit);

  const CardContainer = nonInteractive ? "div" : Link;
  return (
    <div className={`kms-asset-card-shell ${variant === "library" ? "kms-asset-card-shell--library" : ""} ${panorama ? "kms-asset-card-shell--panorama" : ""}`} onErrorCapture={event => { if (event.target.matches(".ina-card__media img")) onError(event); }}>
      <CardContainer {...(nonInteractive ? {} : { to: publicAssetPath(asset) })} className="kms-asset-card-link block rounded-xl focus:outline-none">
        <Card
          variant="basic"
          mediaPosition="top"
          mediaSrc={mediaSrc}
          mediaAlt={mediaAlt}
          showHeader={false}
          hoverable
          className={`kms-asset-card ${video ? "kms-asset-card--video" : "kms-asset-card--document"} overflow-hidden p-0 ${compact ? "kms-asset-card--compact" : ""}`}
        >
          <div className="kms-asset-card-content">
            <h3 className="kms-asset-card-title" title={asset.title}>{highlightedTitle(asset.title, searchQuery)}</h3>
            <div className="kms-asset-card-unit">
              <WorkUnitLogo unit={displayedUnit} className="kms-asset-unit-logo" />
              <WorkUnitLabel name={displayedUnit?.name} alias={displayedUnit?.alias} fallback="Unit Kerja belum diisi" />
            </div>
            <div className="kms-asset-card-meta">
              <span><Eye size={15} aria-hidden="true" />{asset.view_count || 0} dilihat</span>
              <span><Clock3 size={15} aria-hidden="true" />{formatRelativeTime(asset.created_at, { prefix: "Dibuat ", invalid: "Baru ditambahkan", justNow: "Baru ditambahkan" })}</span>
            </div>
          </div>
          {panorama ? <div className="kms-asset-card-type-badge" aria-label={`Tipe aset: ${video ? "Video" : "PDF"}`}><Badge type="soft" variant={video ? "info" : "error"} rounded="sm" size="md" prefixIcon={<TypeIcon size={15} aria-hidden="true" />}>{video ? "Video" : "PDF"}</Badge></div> : <div className={`kms-asset-card-footer ${video ? "kms-asset-card-footer--video" : "kms-asset-card-footer--document"}`} aria-label={`Tipe aset: ${typeLabel}`}><TypeIcon size={16} aria-hidden="true" /><span className="sr-only">{typeLabel}</span></div>}
        </Card>
      </CardContainer>
      {!nonInteractive && onPreview && (
        <Button
          className="kms-asset-card-preview"
          hierarchy="secondary"
          size="sm"
          prefixIcon={<Eye size={16} />}
          onClick={() => onPreview(asset)}
          aria-label={`Preview ${asset.title}`}
        >
          Preview
        </Button>
      )}
    </div>
  );
}
