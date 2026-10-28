import { Badge, Button, Modal } from "@idds/react";
import { useEffect, useRef } from "react";
import { ArrowRight, Eye, FileText, PlayCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { uploadUrl } from "../lib/api";
import { publicAssetPath } from "../lib/routes";
import PdfDocumentViewer from "./PdfDocumentViewer";
import ProtectedAssetMaterial from "./ProtectedAssetMaterial";

export default function AssetQuickPreview({ asset, open, onClose, detailPath, restoreFocusRef }) {
  const navigate = useNavigate();
  const returnFocus = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (open) return;
    // Capture before the modal's own effect moves focus to its close button.
    const remember = event => {
      if (!event.target.closest?.(".kms-quick-preview-dialog")) returnFocus.current = event.target;
    };
    document.addEventListener("focusin", remember);
    return () => document.removeEventListener("focusin", remember);
  }, [open]);
  const previewIdentity = open && asset ? asset.id || asset.public_id || asset.slug : null;
  useEffect(() => {
    if (!open || !previewIdentity) return;
    const trigger = restoreFocusRef?.current || returnFocus.current || document.activeElement;
    const scrollTop = window.scrollY;
    const originalLocation = window.location.href;
    const main = document.getElementById("kms-main-content");
    const mainScroll = main?.scrollTop;
    const keydown = (event) => {
      const dialog = document.querySelector(".kms-quick-preview-dialog");
      if (!dialog) return;
      if (event.key === "Escape") {
        event.preventDefault(); event.stopImmediatePropagation(); closeRef.current?.();
        return;
      }
      if (event.key === "Tab") {
        const focusable = [...dialog.querySelectorAll('button, a[href], input, select, textarea, video[controls], [tabindex="0"]')].filter((node) => !node.disabled && node.getClientRects().length);
        const first = focusable[0], last = focusable.at(-1);
        if (!dialog.contains(document.activeElement) || (event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
          event.preventDefault(); event.stopImmediatePropagation(); (event.shiftKey ? last : first)?.focus();
        }
      }
    };
    document.addEventListener("keydown", keydown, true);
    return () => {
      document.removeEventListener("keydown", keydown, true);
      requestAnimationFrame(() => {
        if (window.location.href !== originalLocation) return;
        if (trigger?.isConnected) {
          // The public Preview button is hidden outside hover/focus-within.
          // Focus the card first so its trigger becomes focusable again.
          trigger.closest(".kms-asset-card-shell")?.querySelector("a")?.focus({ preventScroll: true });
          trigger.focus({ preventScroll: true });
          requestAnimationFrame(() => {
            if (window.location.href === originalLocation && trigger.isConnected) trigger.focus({ preventScroll: true });
          });
        }
        window.scrollTo({ top: scrollTop, behavior: "auto" });
        if (main?.isConnected) main.scrollTop = mainScroll;
      });
    };
  }, [open, previewIdentity, restoreFocusRef]);
  if (!asset || !open) return null;
  const video = asset.asset_type === "video";
  const fileUrl = uploadUrl(asset.file_url);
  const openDetail = () => {
    onClose?.();
    navigate(detailPath || publicAssetPath(asset));
  };

  return (
    <Modal open={open} onClose={onClose} title="Preview pengetahuan" size="lg" dialogClassname="kms-quick-preview-dialog">
      <div className="kms-quick-preview">
        <div className="kms-quick-preview-media">
          {detailPath && fileUrl ? <ProtectedAssetMaterial asset={asset} /> : fileUrl ? (
            video
              ? <video controls playsInline controlsList={asset.allow_download === false ? "nodownload" : undefined} preload="metadata" poster={uploadUrl(asset.thumbnail_url) || undefined}><source src={fileUrl} /></video>
              : <PdfDocumentViewer fileUrl={fileUrl} title={asset.title} compact initialFit="page" />
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
