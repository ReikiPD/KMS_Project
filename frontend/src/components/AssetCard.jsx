import { Building2, Clock3, Eye, FileText, PlayCircle } from "lucide-react";
import { Button, Card } from "@idds/react";
import { Link } from "react-router-dom";
import documentFallback from "../assets/knowledge/document-fallback.png";
import videoFallback from "../assets/knowledge/video-fallback.png";
import WorkUnitLabel from "./WorkUnitLabel";
import { uploadUrl } from "../lib/api";
import { formatRelativeTime } from "../lib/dateTime";
import { publicAssetPath } from "../lib/routes";

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

export default function AssetCard({ asset, compact = false, searchQuery = "", onPreview }) {
  const video = isVideo(asset);
  const typeLabel = video ? "Video" : "Dokumen";
  const TypeIcon = video ? PlayCircle : FileText;
  const fallbackImage = video ? videoFallback : documentFallback;
  const mediaSrc = uploadUrl(asset.thumbnail_url) || fallbackImage;
  const mediaAlt = asset.thumbnail_url ? `Thumbnail ${asset.title}` : `Ilustrasi ${typeLabel.toLowerCase()} bertema transportasi`;
  const directUnit = asset.work_unit;
  const echelonOneUnit = Number(directUnit?.echelon_level) === 3 && directUnit?.grandparent_name
    ? { name: directUnit.grandparent_name, alias: directUnit.grandparent_alias }
    : Number(directUnit?.echelon_level) === 2 && directUnit?.parent_name
      ? { name: directUnit.parent_name, alias: directUnit.parent_alias }
      : directUnit;

  return (
    <div className="kms-asset-card-shell">
      <Link to={publicAssetPath(asset)} className="kms-asset-card-link block rounded-xl focus:outline-none">
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
            <h3 className="kms-asset-card-title">{highlightedTitle(asset.title, searchQuery)}</h3>
            <p className="kms-asset-card-unit"><Building2 size={15} aria-hidden="true" /><WorkUnitLabel name={echelonOneUnit?.name} alias={echelonOneUnit?.alias} fallback="Unit Kerja belum diisi" /></p>
            <div className="kms-asset-card-meta">
              <span><Eye size={15} aria-hidden="true" />{asset.view_count || 0} dilihat</span>
              <span><Clock3 size={15} aria-hidden="true" />{formatRelativeTime(asset.created_at, { prefix: "Dibuat ", invalid: "Baru ditambahkan", justNow: "Baru ditambahkan" })}</span>
            </div>
          </div>
          <div className={`kms-asset-card-footer ${video ? "kms-asset-card-footer--video" : "kms-asset-card-footer--document"}`} aria-label={`Tipe aset: ${typeLabel}`}><TypeIcon size={16} aria-hidden="true" /><span className="sr-only">{typeLabel}</span></div>
        </Card>
      </Link>
      {onPreview && (
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
