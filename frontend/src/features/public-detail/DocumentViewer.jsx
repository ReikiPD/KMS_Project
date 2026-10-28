import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Alert, Button, SelectDropdown, Spinner, TextField, Tooltip } from "@idds/react";
import { ChevronLeft, ChevronRight, Download, FileText, Maximize2, Minus, Plus, X } from "lucide-react";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import FocusModal from "./FocusModal";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
const clampScale = value => Math.min(3, Math.max(0.15, value));
const FIT_OPTIONS = [{ value: "page", label: "Pas halaman" }, { value: "width", label: "Pas lebar" }];

function IconButton({ label, children, ...props }) {
  return <Tooltip title={label} placement="bottom"><Button type="button" hierarchy="tertiary" size="sm" aria-label={label} {...props}>{children}</Button></Tooltip>;
}

/** Only nearby pages have canvases. Off-screen pages retain cheap placeholders. */
function PdfPage({ pdf, number, scale, root, defaultSize }) {
  const element = useRef(null);
  const canvas = useRef(null);
  const [nearby, setNearby] = useState(false);
  const [size, setSize] = useState(defaultSize);
  const [status, setStatus] = useState("loading");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!root) return undefined;
    const observer = new IntersectionObserver(([entry]) => setNearby(entry.isIntersecting), { root, rootMargin: "75% 0px" });
    observer.observe(element.current);
    return () => observer.disconnect();
  }, [root]);

  useEffect(() => {
    if (!nearby) return undefined;
    let active = true;
    let renderTask;
    const render = async () => {
      try {
        setStatus("loading");
        const page = await pdf.getPage(number);
        if (!active) return;
        const base = page.getViewport({ scale: 1 });
        setSize({ width: base.width, height: base.height });
        const viewport = page.getViewport({ scale });
        // Bound bitmap memory independently of visual zoom and screen density.
        const density = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(8_000_000 / (viewport.width * viewport.height)));
        const node = canvas.current;
        node.width = Math.max(1, Math.floor(viewport.width * density));
        node.height = Math.max(1, Math.floor(viewport.height * density));
        renderTask = page.render({ canvasContext: node.getContext("2d", { alpha: false }), viewport, transform: [density, 0, 0, density, 0, 0] });
        await renderTask.promise;
        if (active) setStatus("ready");
      } catch (error) {
        if (active && error?.name !== "RenderingCancelledException") setStatus("error");
      }
    };
    void render();
    return () => { active = false; renderTask?.cancel(); };
  }, [nearby, pdf, number, scale, attempt]);

  return <div ref={element} className="kms-doc-sheet" data-pdf-page={number} style={{ width: size.width * scale, height: size.height * scale }} aria-label={`Halaman ${number}`}>
    {nearby && <>
      <canvas ref={canvas} role="img" aria-label={`Halaman ${number} dokumen PDF`} />
      {status === "loading" && <div className="kms-doc-page-status" role="status"><Spinner size={24} title={`Memuat halaman ${number}`} spinnerOnly /></div>}
      {status === "error" && <div className="kms-doc-page-status" role="alert"><p>Halaman {number} gagal dimuat.</p><Button onClick={() => setAttempt(value => value + 1)} hierarchy="secondary">Coba lagi</Button></div>}
    </>}
  </div>;
}

function PdfSurface({ pdf, defaultSize, title, focus, suspended = false, onFocus, onClose, focusTriggerRef, fileDownloadUrl, position, reportPosition, loadError, retry }) {
  const [stage, setStage] = useState(null);
  const [view, setView] = useState({ mode: "page", scale: 1 });
  const [pageNumber, setPageNumber] = useState(position.current.page);
  const [pageInput, setPageInput] = useState(String(position.current.page));
  const anchor = useRef({ ...position.current });
  const scrollReady = useRef(false);
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const count = pdf?.numPages || 0;
  const scale = !bounds.width || !defaultSize ? 1 : view.mode === "custom" ? view.scale : Math.max(.001, Math.min(3,
    (bounds.width - 32) / defaultSize.width,
    view.mode === "page" ? (bounds.height - 32) / defaultSize.height : Infinity,
  ));

  useLayoutEffect(() => {
    if (!stage) return undefined;
    const observer = new ResizeObserver(() => {
      anchor.current = { ...position.current };
      setBounds({ width: stage.clientWidth, height: stage.clientHeight });
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, [stage, position]);

  const scrollToPosition = useCallback(({ page, fraction = 0 }) => {
    const sheet = stage?.querySelector(`[data-pdf-page="${page}"]`);
    if (!sheet) return;
    const top = sheet.getBoundingClientRect().top - stage.getBoundingClientRect().top + stage.scrollTop;
    stage.scrollTo({ top: Math.max(0, top - 16 + sheet.clientHeight * fraction), left: 0, behavior: "instant" });
  }, [stage]);

  useLayoutEffect(() => {
    anchor.current = { ...position.current };
  }, [suspended, position]);
  useLayoutEffect(() => {
    scrollReady.current = false;
    if (suspended || !pdf || !bounds.width) return undefined;
    scrollToPosition(anchor.current);
    const frame = requestAnimationFrame(() => { scrollReady.current = true; });
    return () => { cancelAnimationFrame(frame); scrollReady.current = false; };
  }, [pdf, scale, bounds.width, bounds.height, scrollToPosition, suspended]);

  useEffect(() => {
    if (!stage || !pdf || suspended) return undefined;
    let frame;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!scrollReady.current) return;
        const stageTop = stage.getBoundingClientRect().top + 20;
        const sheets = [...stage.querySelectorAll("[data-pdf-page]")];
        const current = sheets.find(node => node.getBoundingClientRect().bottom > stageTop) || sheets.at(-1);
        if (!current) return;
        const page = Number(current.dataset.pdfPage);
        const fraction = Math.max(0, (stageTop - current.getBoundingClientRect().top) / current.clientHeight);
        reportPosition({ page, fraction });
        setPageNumber(page);
      });
    };
    stage.addEventListener("scroll", onScroll, { passive: true });
    return () => { cancelAnimationFrame(frame); stage.removeEventListener("scroll", onScroll); };
  }, [stage, pdf, reportPosition, suspended]);
  useEffect(() => setPageInput(String(pageNumber)), [pageNumber]);

  const navigatePage = next => {
    const page = Math.min(count, Math.max(1, Math.trunc(Number(next)) || pageNumber));
    setPageNumber(page); setPageInput(String(page));
    anchor.current = { page, fraction: 0 };
    reportPosition({ page, fraction: 0 });
    scrollToPosition({ page });
  };
  const updateView = next => { anchor.current = { ...position.current }; setView(next); };
  const busy = !pdf && !loadError;
  return <div className={`kms-pdf-viewer kms-doc-reader ${focus ? "kms-doc-reader--focus" : ""}`} aria-label={`Pembaca ${title}`} aria-busy={busy}>
    <div className="kms-doc-toolbar">
      <div className="kms-doc-name"><FileText size={20} aria-hidden="true" /><span title={title}>{focus ? title : "Pratinjau dokumen"}</span></div>
      <div className="kms-doc-navigation" role="group" aria-label="Halaman dokumen">
        <IconButton label="Halaman sebelumnya" disabled={!pdf || pageNumber <= 1} onClick={() => navigatePage(pageNumber - 1)}><ChevronLeft size={18} /></IconButton>
        <form onSubmit={event => { event.preventDefault(); navigatePage(pageInput); }} className="kms-doc-page-number">
          <TextField aria-label="Nomor halaman" type="text" inputMode="numeric" value={pageInput} onChange={setPageInput} onBlur={() => pdf && navigatePage(pageInput)} disabled={!pdf} showClearButton={false} size="sm" />
          <span aria-live="polite">/ {count || "–"}</span>
        </form>
        <IconButton label="Halaman berikutnya" disabled={!pdf || pageNumber >= count} onClick={() => navigatePage(pageNumber + 1)}><ChevronRight size={18} /></IconButton>
      </div>
      <div className="kms-doc-zoom" role="group" aria-label="Ukuran dokumen">
        <IconButton label="Perkecil dokumen" disabled={!pdf || scale <= .15} onClick={() => updateView({ mode: "custom", scale: clampScale(scale - .2) })}><Minus size={17} /></IconButton>
        <output aria-label="Persentase zoom">{Math.round(scale * 100)}%</output>
        <IconButton label="Perbesar dokumen" disabled={!pdf || scale >= 3} onClick={() => updateView({ mode: "custom", scale: clampScale(scale + .2) })}><Plus size={17} /></IconButton>
      </div>
      <div className="kms-doc-fit"><SelectDropdown label={<span className="sr-only">Sesuaikan tampilan dokumen</span>} options={FIT_OPTIONS} selected={view.mode === "custom" ? null : view.mode} placeholder="Sesuaikan" onSelect={mode => updateView({ mode, scale })} searchable={false} showPreviewValue={false} mandatorySelected disabled={!pdf} size="sm" width="100%" /></div>
      {focus && <div className="kms-doc-mobile-fit"><IconButton label={view.mode === "width" ? "Pas halaman" : "Pas lebar"} disabled={!pdf} onClick={() => updateView({ mode: view.mode === "width" ? "page" : "width", scale })}><Maximize2 size={18} /></IconButton></div>}
      <div className="kms-doc-actions">
        {focus ? <>
          {fileDownloadUrl && <a className="kms-doc-download" href={fileDownloadUrl} download aria-label="Unduh dokumen"><Download size={18} /><span>Unduh</span></a>}
          <IconButton label="Tutup mode fokus" onClick={onClose}><X size={22} /></IconButton>
        </> : <Button ref={focusTriggerRef} type="button" hierarchy="tertiary" size="sm" prefixIcon={<Maximize2 size={17} />} onClick={onFocus} aria-haspopup="dialog">Mode fokus</Button>}
      </div>
    </div>
    <div ref={setStage} className="kms-doc-stage" tabIndex={0} aria-label="Area baca dokumen, gulir untuk berpindah halaman">
      {suspended ? null : loadError ? <div className="kms-doc-status" role="alert"><Alert variant="caution" title="Pratinjau PDF gagal dimuat" message={loadError} /><Button hierarchy="secondary" onClick={retry}>Coba lagi</Button></div> : busy ? <div className="kms-doc-status" role="status"><Spinner size={36} title="Memuat dokumen PDF" /></div> : <div className="kms-doc-pages">
        {Array.from({ length: count }, (_, index) => <PdfPage key={index + 1} pdf={pdf} number={index + 1} scale={scale} defaultSize={defaultSize} root={stage} />)}
      </div>}
    </div>
  </div>;
}

/** Separate public reader: existing private/admin PDF previews remain unchanged. */
export default function DocumentViewer({ fileUrl, title, fileDownloadUrl, onDocumentLoad }) {
  const [documentState, setDocumentState] = useState(null);
  const [focus, setFocus] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const focusTriggerRef = useRef(null);
  const position = useRef({ page: 1, fraction: 0 });
  const reportPosition = useCallback(value => { position.current = value; }, []);
  // Lets the detail header show the page count without loading the PDF a second time.
  const documentLoadRef = useRef(onDocumentLoad);
  useEffect(() => { documentLoadRef.current = onDocumentLoad; });
  useEffect(() => {
    let active = true;
    setDocumentState(null);
    position.current = { page: 1, fraction: 0 };
    // Direct URL from the existing public media endpoint; never a blob: fetch.
    const task = getDocument({ url: fileUrl, withCredentials: true });
    const timeout = setTimeout(() => {
      if (!active) return;
      active = false;
      setDocumentState({ error: "Batas waktu pemuatan habis. Periksa koneksi lalu coba lagi." });
      void task.destroy().catch(() => {});
    }, 30000);
    task.promise.then(async pdf => {
      const page = await pdf.getPage(1);
      if (!active) return;
      const viewport = page.getViewport({ scale: 1 });
      setDocumentState({ pdf, size: { width: viewport.width, height: viewport.height } });
      documentLoadRef.current?.({ pages: pdf.numPages });
    }).catch(error => { if (active) setDocumentState({ error: error?.message || "Dokumen PDF tidak dapat dibaca." }); }).finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); void task.destroy().catch(() => {}); };
  }, [fileUrl, attempt]);

  const props = { pdf: documentState?.pdf, defaultSize: documentState?.size, loadError: documentState?.error, retry: () => setAttempt(value => value + 1), title, fileDownloadUrl, position, reportPosition, focusTriggerRef };
  return <>
    <div className={focus ? "kms-doc-inline-suspended" : undefined}><PdfSurface {...props} suspended={focus} onFocus={() => setFocus(true)} /></div>
    {focus && <FocusModal title={title} restoreFocusRef={focusTriggerRef} onClose={() => setFocus(false)}><PdfSurface {...props} focus onClose={() => setFocus(false)} /></FocusModal>}
  </>;
}
