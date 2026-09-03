import { useEffect, useRef, useState } from "react";
import { Button, Spinner } from "@idds/react";
import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const MIN_SCALE = 0.6;
const MAX_SCALE = 2;
const SCALE_STEP = 0.2;

export default function PdfDocumentViewer({ fileUrl, title, compact = false }) {
  const canvasRef = useRef(null);
  const renderTaskRef = useRef(null);
  const [documentProxy, setDocumentProxy] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!fileUrl) return undefined;

    const loadingTask = getDocument({ url: fileUrl, withCredentials: true });
    let active = true;
    setDocumentProxy(null);
    setStatus("loading");
    setError("");
    setPageNumber(1);
    setScale(1);

    loadingTask.promise
      .then((pdf) => {
        if (!active) {
          pdf.destroy();
          return;
        }
        setDocumentProxy(pdf);
        setStatus("ready");
      })
      .catch((loadError) => {
        if (!active) return;
        setStatus("error");
        setError(loadError?.message || "Dokumen PDF tidak dapat dibaca.");
      });

    return () => {
      active = false;
      renderTaskRef.current?.cancel();
      loadingTask.destroy();
    };
  }, [fileUrl]);

  useEffect(() => {
    if (!documentProxy || !canvasRef.current) return undefined;

    let active = true;
    const renderPage = async () => {
      try {
        setStatus("rendering");
        const page = await documentProxy.getPage(pageNumber);
        if (!active) return;

        const viewport = page.getViewport({ scale });
        const outputScale = Math.min(window.devicePixelRatio || 1, 2);
        const canvas = canvasRef.current;
        const context = canvas.getContext("2d", { alpha: false });
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        renderTaskRef.current?.cancel();
        const renderTask = page.render({
          canvasContext: context,
          viewport,
          transform: outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0],
        });
        renderTaskRef.current = renderTask;
        await renderTask.promise;
        if (active) setStatus("ready");
      } catch (renderError) {
        if (!active || renderError?.name === "RenderingCancelledException") return;
        setStatus("error");
        setError(renderError?.message || "Halaman PDF tidak dapat dirender.");
      }
    };

    renderPage();
    return () => {
      active = false;
      renderTaskRef.current?.cancel();
    };
  }, [documentProxy, pageNumber, scale]);

  if (status === "error") {
    return (
      <div className="flex min-h-72 items-center justify-center px-6 py-8 text-center text-sm text-content-secondary" role="alert">
        <p>Pratinjau PDF gagal dimuat. {error}</p>
      </div>
    );
  }

  const pageCount = documentProxy?.numPages || 0;
  const busy = ["loading", "rendering"].includes(status);

  return (
    <div className="kms-pdf-viewer" aria-busy={busy} aria-label={`Pembaca ${title}`}>
      <div className="kms-pdf-viewer-toolbar flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-2">
          <Button hierarchy="tertiary" size="sm" aria-label="Halaman sebelumnya" disabled={!documentProxy || pageNumber <= 1 || busy} onClick={() => setPageNumber((page) => page - 1)}><ChevronLeft size={17} /></Button>
          <span className="min-w-24 text-center text-sm text-content-secondary">Halaman {pageCount ? pageNumber : "-"} dari {pageCount || "-"}</span>
          <Button hierarchy="tertiary" size="sm" aria-label="Halaman berikutnya" disabled={!documentProxy || pageNumber >= pageCount || busy} onClick={() => setPageNumber((page) => page + 1)}><ChevronRight size={17} /></Button>
        </div>
        <div className="flex items-center gap-2">
          <Button hierarchy="tertiary" size="sm" aria-label="Perkecil dokumen" disabled={!documentProxy || scale <= MIN_SCALE || busy} onClick={() => setScale((value) => Math.max(MIN_SCALE, Number((value - SCALE_STEP).toFixed(1))))}><Minus size={16} /></Button>
          <span className="min-w-12 text-center text-sm text-content-secondary">{Math.round(scale * 100)}%</span>
          <Button hierarchy="tertiary" size="sm" aria-label="Perbesar dokumen" disabled={!documentProxy || scale >= MAX_SCALE || busy} onClick={() => setScale((value) => Math.min(MAX_SCALE, Number((value + SCALE_STEP).toFixed(1))))}><Plus size={16} /></Button>
        </div>
      </div>
      <div className={`kms-pdf-viewer-stage relative flex ${compact ? "min-h-80 max-h-[52vh]" : "min-h-[520px] max-h-[72vh]"} justify-center overflow-auto p-4 md:p-6`}>
        {busy && <div className="kms-pdf-viewer-loading absolute inset-0 z-10 flex items-center justify-center"><Spinner size={36} title="Memuat dokumen PDF" spinnerOnly /></div>}
        <canvas ref={canvasRef} className="h-fit max-w-none bg-white shadow-md" />
      </div>
    </div>
  );
}
