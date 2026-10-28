import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button, Modal, Spinner } from "@idds/react";
import AssetCard from "./AssetCard";

const PdfDocumentViewer = lazy(() => import("./PdfDocumentViewer"));
const Loading = () => <div className="kms-upload-preview-status" role="status"><Spinner size={32} title="Menyiapkan preview" /></div>;

// Mounted only while open. Local file data never passes through the public API.
export default function AssetUploadPreview({ file, kind, asset, onClose }) {
  const [attempt, setAttempt] = useState(0);
  const [source, setSource] = useState(null);
  const [mediaStatus, setMediaStatus] = useState("loading");
  const dialogRef = useRef(null);
  const videoRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useLayoutEffect(() => {
    const trigger = document.activeElement;
    const handleKey = event => {
      const dialog = dialogRef.current?.closest('[role="dialog"]');
      if (!dialog) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeRef.current();
      } else if (event.key === "Tab") {
        const nodes = [...dialog.querySelectorAll('button, a[href], input, video[controls], [tabindex="0"]')]
          .filter(node => !node.disabled && node.getClientRects().length);
        const first = nodes[0], last = nodes.at(-1);
        if (first && (!dialog.contains(document.activeElement) || (event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last))) {
          event.preventDefault();
          event.stopImmediatePropagation();
          (event.shiftKey ? last : first).focus();
        }
      }
    };
    document.addEventListener("keydown", handleKey, true);
    return () => {
      document.removeEventListener("keydown", handleKey, true);
      requestAnimationFrame(() => { if (trigger?.isConnected) trigger.focus({ preventScroll: true }); });
    };
  }, []);

  useEffect(() => {
    let active = true;
    let url;
    setSource(null);
    setMediaStatus("loading");
    const prepare = async () => {
      try {
        const data = kind === "document" ? new Uint8Array(await file.arrayBuffer()) : (url = URL.createObjectURL(file));
        if (active) setSource({ file, kind, data });
      } catch {
        if (active) setSource({ file, kind, error: "File belum dapat dibaca. Coba lagi atau pilih file lain." });
      }
    };
    prepare();
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file, kind, attempt]);

  const ready = source?.file === file && source?.kind === kind;
  const value = ready ? source.data : null;
  const error = ready ? source.error : null;
  useEffect(() => {
    const video = videoRef.current;
    return () => {
      if (video) { video.pause(); video.removeAttribute("src"); video.load(); }
    };
  }, [value]);
  useEffect(() => {
    if (!value || kind === "document" || mediaStatus !== "loading") return;
    const timer = window.setTimeout(() => setMediaStatus("error"), 30000);
    return () => window.clearTimeout(timer);
  }, [value, kind, mediaStatus]);

  return <Modal open onClose={onClose} title={kind === "thumbnail" ? "Preview kartu beranda" : "Preview aset"} size={kind === "thumbnail" ? "md" : "lg"} dialogClassname="kms-upload-preview-dialog">
    <div ref={dialogRef}>
      {kind === "thumbnail" && <p className="text-sm text-content-secondary">Simulasi tampilan kartu di beranda. Jumlah tayangan dan waktu merupakan contoh; aset belum diterbitkan.</p>}
      <p className="mt-2 break-words text-sm text-content-secondary">{file.name}</p>
      {error || mediaStatus === "error" ? <div className="kms-upload-preview-status" role="alert">{error || "Preview file gagal dimuat. Coba lagi atau pilih file lain."}</div> : !value ? <Loading /> : kind === "thumbnail" ? (
        <div className="kms-public kms-upload-card-example" onLoadCapture={event => { if (event.target.tagName === "IMG") setMediaStatus("ready"); }} onErrorCapture={() => setMediaStatus("error")}>
          <AssetCard asset={asset} variant="panorama" nonInteractive thumbnailSrc={value} />
        </div>
      ) : kind === "video" ? <>
        {mediaStatus === "loading" && <Loading />}
        <video ref={videoRef} className="kms-upload-preview-video" src={value} controls playsInline preload="metadata" aria-label={`Preview ${asset.title}`} onLoadedMetadata={() => setMediaStatus("ready")} onError={() => setMediaStatus("error")} />
      </> : <Suspense fallback={<Loading />}><PdfDocumentViewer key={attempt} fileData={value} title={asset.title} compact /></Suspense>}
      <div className="mt-4 flex flex-wrap justify-end gap-3">
        <Button type="button" hierarchy="secondary" onClick={() => setAttempt(current => current + 1)}>Coba lagi</Button>
        <Button type="button" hierarchy="primary" onClick={onClose}>Tutup preview</Button>
      </div>
    </div>
  </Modal>;
}
