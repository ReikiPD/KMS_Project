import { Badge, Button, Modal } from "@idds/react";
import { ArrowRight, Eye, FileText, PlayCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { uploadUrl } from "../lib/api";

export default function AssetQuickPreview({ asset, open, onClose, detailPath }) {
  const navigate = useNavigate();
  if (!asset) return null;
  const video = asset.asset_type === "video";
  const fileUrl = uploadUrl(asset.file_url);
  const openDetail = () => {
    onClose?.();
    navigate(detailPath || `/detail/${asset.id}`);
  };

  return (
    <Modal open={open} onClose={onClose} title="Pratinjau pengetahuan" size="lg">
      <div className="kms-quick-preview">
        <div className="kms-quick-preview-media">
          {fileUrl ? (
            video
              ? <video controls playsInline preload="metadata" poster={uploadUrl(asset.thumbnail_url) || undefined}><source src={fileUrl} /></video>
              : <iframe title={`Pratinjau ${asset.title}`} src={`${fileUrl}#view=FitH`} />
          ) : (
            <div className="kms-quick-preview-empty">{video ? <PlayCircle size={42} /> : <FileText size={42} />}<span>File utama belum tersedia</span></div>
          )}
        </div>
        <div className="kms-quick-preview-copy">
          <Badge type="soft" variant={video ? "info" : "brand"} size="sm">{video ? "Video" : "Dokumen PDF"}</Badge>
          <h2>{asset.title}</h2>
          <p>{asset.content || "Buka detail untuk membaca informasi lengkap dan mengikuti diskusi pengetahuan."}</p>
          <div className="kms-quick-preview-meta"><span><Eye size={15} /> {asset.view_count || 0} dilihat</span><span>{asset.work_unit?.name || asset.category?.name || "KMS Kemenhub"}</span></div>
          <Button hierarchy="primary" onClick={openDetail} suffixIcon={<ArrowRight size={16} />}>Buka detail lengkap</Button>
        </div>
      </div>
    </Modal>
  );
}
