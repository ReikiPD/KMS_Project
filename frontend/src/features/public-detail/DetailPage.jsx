import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowRight, BookOpen, Building2, CalendarDays, Clock, Copy, Download, Eye, FileText, ListVideo, LockKeyhole, Maximize2, Minimize2, PlayCircle, RefreshCw, Share2, Tag, UserRound, X } from "lucide-react";
import { Alert, Badge, Breadcrumb, Button, CardPlain, Skeleton, Tooltip, useToast } from "@idds/react";
import CommentsSection from "../../components/CommentsSection";
import RelatedKnowledgeList from "../../components/RelatedKnowledgeList";
import DocumentViewer from "./DocumentViewer";
import FocusModal from "./FocusModal";
import LegacyDetailPage from "./LegacyPage";
import VideoChapters from "../../components/VideoChapters";
import WorkUnitLabel from "../../components/WorkUnitLabel";
import WorkUnitLogo from "../../components/WorkUnitLogo";
import { apiFetch, downloadUrl, uploadUrl } from "../../lib/api";
import { libraryCataloguePath } from "../../lib/catalogueState";
import { publicAssetPath } from "../../lib/routes";
import { formatVideoTimestamp } from "../../lib/video";
import useFileAvailability from "../../hooks/useFileAvailability";
import StatusPage from "../../components/StatusPage";
import "./detail.css";
import PublicRouteArt from "../../components/PublicRouteArt";
import { assetVisualMode } from "../../lib/publicVisuals";

const formatDate = (value) => value
  ? new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" }).format(new Date(value))
  : "-";
const isVideo = (asset) => asset?.asset_type === "video";
const videoMimeType = (fileUrl = "") => ({ mp4: "video/mp4", webm: "video/webm", ogg: "video/ogg" }[fileUrl.split(".").pop()?.toLowerCase()] || undefined);
const numberFormat = new Intl.NumberFormat("id-ID");
const sizeFormat = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });
const WORDS_PER_MINUTE = 200;

const formatFileSize = (bytes) => {
  if (!bytes) return "";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return `${unit ? sizeFormat.format(value) : Math.round(value)} ${units[unit]}`;
};
const downloadLabel = (asset, size) => {
  const extension = String(asset?.file_url || "").split("?")[0].split(".").pop()?.toLowerCase();
  const label = isVideo(asset) ? "Unduh video" : extension === "pdf" ? "Unduh PDF" : "Unduh dokumen";
  const sizeLabel = formatFileSize(size);
  return sizeLabel ? `${label} (${sizeLabel})` : label;
};
// Estimate from the word count of the extracted document text (detail API).
const readingTimeLabel = (words) => {
  const count = Number(words);
  if (!Number.isFinite(count) || count <= 0) return "";
  const minutes = Math.max(1, Math.round(count / WORDS_PER_MINUTE));
  if (minutes < 60) return `± ${minutes} menit baca`;
  const rest = minutes % 60;
  return `± ${Math.floor(minutes / 60)} jam${rest ? ` ${rest} menit` : ""} baca`;
};
// Only a later content edit counts as an update; same-day processing is not shown.
const contentUpdatedAt = (asset) => {
  const created = new Date(asset?.created_at || "");
  const updated = new Date(asset?.content_updated_at || "");
  if (Number.isNaN(created.getTime()) || Number.isNaN(updated.getTime())) return null;
  return updated > created && updated.toDateString() !== created.toDateString() ? asset.content_updated_at : null;
};
const startDownload = (url) => {
  const link = document.createElement("a");
  link.href = url;
  link.download = "";
  link.rel = "noopener";
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  link.remove();
};

// A history navigation remounts this page. Keep the public data for the
// current browser session so Back/Forward does not repeatedly hit the API.
const detailCache = new Map();
const detailRequests = new Map();
const viewedAssetIds = new Set();

const getAssetDetail = (assetId) => {
  const cached = detailCache.get(assetId);
  if (cached) return Promise.resolve(cached);

  const pending = detailRequests.get(assetId);
  if (pending) return pending;

  const request = Promise.all([
    apiFetch(`/api/assets/${assetId}`),
    apiFetch(`/api/assets/${assetId}/related`),
  ])
    .then(async ([assetResponse, relatedResponse]) => {
      const assetData = await assetResponse.json();
      if (!assetResponse.ok) throw Object.assign(new Error(assetData.error || "Aset tidak ditemukan"), { status: assetResponse.status });

      const relatedAssets = relatedResponse.ok ? await relatedResponse.json() : [];
      const detail = { asset: assetData, relatedAssets };
      detailCache.set(assetId, detail);
      return detail;
    })
    .finally(() => detailRequests.delete(assetId));

  detailRequests.set(assetId, request);
  return request;
};

const recordAssetView = (assetId) => {
  if (viewedAssetIds.has(assetId)) return Promise.resolve(null);
  viewedAssetIds.add(assetId);

  return apiFetch(`/api/assets/${assetId}/view`, { method: "POST" })
    .then((response) => response.ok ? response.json() : null)
    .catch(() => null);
};

// Primary download, share and copy-link stay together in the header (one primary action).
function DetailActions({ asset, fileUrl, fileSize, onShare, onCopyLink }) {
  const fileDownloadUrl = downloadUrl(asset?.file_url);
  const downloadAllowed = asset?.allow_download !== false;
  return (
    <div className="kms-detail-v2-actions" role="group" aria-label="Aksi pengetahuan">
      {fileUrl && fileDownloadUrl && downloadAllowed && <Button hierarchy="primary" size="lg" prefixIcon={<Download size={18} aria-hidden="true" />} onClick={() => startDownload(fileDownloadUrl)}>{downloadLabel(asset, fileSize)}</Button>}
      {fileUrl && !downloadAllowed && <p className="kms-detail-v2-locked"><LockKeyhole size={17} aria-hidden="true" />{isVideo(asset) ? "Hanya dapat ditonton." : "Hanya dapat dibaca."} Penerbit membatasi pengunduhan.</p>}
      <Button hierarchy="secondary" size="lg" prefixIcon={<Share2 size={18} aria-hidden="true" />} onClick={onShare}>Bagikan</Button>
      <Tooltip title="Salin tautan" variant="basic" placement="bottom"><Button type="button" hierarchy="tertiary" size="lg" className="kms-detail-v2-icon-button" aria-label="Salin tautan" onClick={onCopyLink}><Copy size={20} aria-hidden="true" /></Button></Tooltip>
    </div>
  );
}

// Description as a 3-line summary; the full text opens in place only when it is longer.
function AssetSummary({ text }) {
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const paragraph = useRef(null);
  useLayoutEffect(() => {
    const node = paragraph.current;
    if (!node || expanded) return undefined;
    const measure = () => setOverflowing(node.scrollHeight > node.clientHeight + 1);
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(node);
    return () => observer?.disconnect();
  }, [text, expanded]);
  return (
    <div className="kms-detail-v2-summary">
      <p ref={paragraph} id="asset-summary" className={`kms-detail-v2-lead ${expanded ? "" : "is-clamped"}`.trim()}>{text}</p>
      {(overflowing || expanded) && <Button type="button" hierarchy="link" size="md" className="kms-detail-v2-summary-toggle" aria-controls="asset-summary" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? "Tampilkan lebih sedikit" : "Baca selengkapnya"}</Button>}
    </div>
  );
}

function DetailHeader({ asset, categoryPath, pages, duration, actions }) {
  const video = isVideo(asset);
  const updatedAt = contentUpdatedAt(asset);
  const extent = video
    ? (duration ? `Durasi ${formatVideoTimestamp(duration)}` : "")
    : [readingTimeLabel(asset.word_count), pages ? `${numberFormat.format(pages)} halaman` : ""].filter(Boolean).join(" · ");
  const category = asset.category?.name && (categoryPath
    ? <Link className="kms-detail-v2-category" to={categoryPath}><Tag size={14} aria-hidden="true" /><span className="sr-only">Kategori: </span>{asset.category.name}</Link>
    : <span className="kms-detail-v2-category"><Tag size={14} aria-hidden="true" /><span className="sr-only">Kategori: </span>{asset.category.name}</span>);
  return (
    <header className="kms-detail-v2-hero" aria-labelledby="asset-title" data-mode={assetVisualMode(asset)}>
      <PublicRouteArt className="kms-detail-v2-routes" mode={assetVisualMode(asset)} />
      <div className="kms-home-container kms-detail-v2-hero-inner">
        <div className="kms-detail-v2-kicker">
          <Badge type="soft" variant="brand" size="sm" prefixIcon={video ? <PlayCircle size={16} /> : <FileText size={16} />}>{video ? "Video pembelajaran" : "Dokumen pengetahuan"}</Badge>
          {category}
        </div>
        <h1 id="asset-title">{asset.title}</h1>
        {asset.content?.trim() && <AssetSummary text={asset.content.trim()} />}
        <ul className="kms-detail-v2-meta">
          {asset.work_unit?.name && <li><WorkUnitLogo unit={asset.work_unit} className="kms-detail-v2-unit-logo" /><span><span className="sr-only">Unit kerja: </span>{asset.work_unit.name}</span></li>}
          {asset.author?.full_name && <li><UserRound size={17} aria-hidden="true" /><span><span className="sr-only">Penerbit: </span>{asset.author.full_name}</span></li>}
          <li><CalendarDays size={17} aria-hidden="true" /><span>Diunggah {formatDate(asset.created_at)}</span></li>
          {updatedAt && <li><RefreshCw size={17} aria-hidden="true" /><span>Diperbarui {formatDate(updatedAt)}</span></li>}
          <li><Eye size={17} aria-hidden="true" /><span>{numberFormat.format(asset.view_count || 0)} kali dilihat</span></li>
          {extent && <li>{video ? <Clock size={17} aria-hidden="true" /> : <BookOpen size={17} aria-hidden="true" />}<span>{extent}</span></li>}
        </ul>
        <DetailActions {...actions} />
      </div>
    </header>
  );
}

function AssetContent({ asset }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <CardPlain className="kms-detail-v2-info">
      <h2><FileText size={20} aria-hidden="true" />Informasi aset</h2>
      <Button type="button" hierarchy="tertiary" size="sm" className="kms-detail-v2-info-toggle" aria-controls="asset-information" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? "Sembunyikan rincian" : "Lihat informasi lengkap"}</Button>
      <dl id="asset-information" className={`kms-detail-v2-metadata ${expanded ? "is-expanded" : ""}`}>
        {asset.category && <div><Tag size={17} aria-hidden="true" /><dt>Kategori</dt><dd>{asset.category.name}</dd></div>}
        {asset.work_unit && <div><Building2 size={17} aria-hidden="true" /><dt>Unit kerja</dt><dd><WorkUnitLabel name={asset.work_unit.name} alias={asset.work_unit.alias} parentName={asset.work_unit.parent_name} parentAlias={asset.work_unit.parent_alias} grandparentName={asset.work_unit.grandparent_name} grandparentAlias={asset.work_unit.grandparent_alias} hierarchy /></dd></div>}
        {asset.author?.full_name && <div><UserRound size={17} aria-hidden="true" /><dt>Penerbit</dt><dd>{asset.author.full_name}</dd></div>}
        <div><Eye size={17} aria-hidden="true" /><dt>Dilihat</dt><dd>{asset.view_count || 0} kali</dd></div>
        <div><CalendarDays size={17} aria-hidden="true" /><dt>Diunggah</dt><dd>{formatDate(asset.created_at)}</dd></div>
        <div>{asset.allow_download === false ? <LockKeyhole size={17} aria-hidden="true" /> : <Download size={17} aria-hidden="true" />}<dt>Akses</dt><dd>{asset.allow_download === false ? "Hanya dibaca" : "Dapat diunduh"}</dd></div>
      </dl>
    </CardPlain>
  );
}

function TimestampPanel({ asset, assetId, isOpen, onToggle, onSelect, sectionRef }) {
  return (
    <section ref={sectionRef} id={`video-chapters-${assetId}`} tabIndex="-1" className="kms-timestamp-card rounded-2xl border border-stroke-secondary p-5 md:p-6" aria-labelledby="video-chapters-heading">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="video-chapters-heading" className="text-xl font-bold text-content-primary">Timestamp video</h2><p className="mt-1 text-sm text-content-secondary">Pilih bagian untuk langsung memutar segmen terkait.</p></div><Button type="button" hierarchy="tertiary" size="sm" aria-label="Tutup timestamp" title="Tutup timestamp" onClick={onToggle}><X size={18} /></Button></div>
      {isOpen && <div className="mt-5"><VideoChapters chapters={asset.video_chapters} onSelect={onSelect} /></div>}
    </section>
  );
}

function RelatedPanel({ assets, headingId }) {
  const navigate = useNavigate();
  return (
    <section className="kms-detail-v2-related" aria-labelledby={headingId}>
      <h2 id={headingId}><BookOpen size={20} aria-hidden="true" />Pengetahuan lainnya</h2>
      <RelatedKnowledgeList assets={assets} />
      <Button hierarchy="link" suffixIcon={<ArrowRight size={16} />} onClick={() => navigate("/library")}>Lihat semua pengetahuan</Button>
    </section>
  );
}

export default function DetailPage() {
  return import.meta.env.VITE_PUBLIC_DETAIL_DESIGN === "classic" ? <LegacyDetailPage /> : <RedesignedDetailPage />;
}

function RedesignedDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const videoRef = useRef(null);
  const chaptersSectionRef = useRef(null);
  const [asset, setAsset] = useState(null);
  const [relatedAssets, setRelatedAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [errorStatus, setErrorStatus] = useState(null);
  const [videoError, setVideoError] = useState(false);
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const [theaterMode, setTheaterMode] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [documentPages, setDocumentPages] = useState(null);
  const [mediaDuration, setMediaDuration] = useState(null);
  const focusVideoRef = useRef(null);
  const videoPosition = useRef(0);
  const fileUrl = uploadUrl(asset?.file_url);
  const fileAvailability = useFileAvailability(fileUrl);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setErrorStatus(null);

    getAssetDetail(id)
      .then(({ asset: assetData, relatedAssets: nextRelatedAssets }) => {
        if (!active) return;
        setAsset(assetData);
        setRelatedAssets(nextRelatedAssets);
        setLoading(false);

        const canonicalPath = publicAssetPath(assetData);
        const canonicalReference = decodeURIComponent(canonicalPath.split("/").pop() || "");
        if (canonicalReference && canonicalReference !== id) {
          detailCache.set(canonicalReference, { asset: assetData, relatedAssets: nextRelatedAssets });
          navigate(canonicalPath, { replace: true });
        }

        const viewReference = assetData.public_id || assetData.slug || id;
        recordAssetView(viewReference).then((viewData) => {
          if (!viewData) return;

          const updatedAsset = { ...assetData, view_count: viewData.view_count };
          [id, canonicalReference].filter(Boolean).forEach((cacheKey) => {
            const cached = detailCache.get(cacheKey);
            if (cached) detailCache.set(cacheKey, { ...cached, asset: updatedAsset });
          });
          if (active) setAsset(updatedAsset);
        });
      })
      .catch((loadError) => {
        if (!active) return;
        setError(loadError.message);
        setErrorStatus(loadError.status || 500);
        setLoading(false);
      });

    return () => { active = false; };
  }, [id, navigate]);

  useEffect(() => {
    setVideoError(false);
    setChaptersOpen(false);
    setTheaterMode(false);
    setFocusMode(false);
    setDocumentPages(null);
    setMediaDuration(null);
  }, [id]);

  const hasChapters = isVideo(asset) && asset?.video_chapters?.length > 0;
  const availableFileUrl = fileAvailability.status === "available" ? fileUrl : null;

  const shareUrl = () => new URL(publicAssetPath(asset), window.location.origin).toString();
  const recordShare = () => apiFetch(`/api/assets/${asset.public_id || asset.slug || id}/share`, { method: "POST", auth: true }).catch(() => {});
  const copyToClipboard = async (text) => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const input = document.createElement("textarea");
    input.value = text;
    input.setAttribute("readonly", "");
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();
    const copied = document.execCommand("copy");
    input.remove();
    if (!copied) throw new Error("Clipboard unavailable");
  };

  const copyAssetLink = async () => {
    try {
      await copyToClipboard(shareUrl());
      recordShare();
      toast({ title: "Tautan berhasil disalin", state: "positive", position: "top-right" });
    } catch {
      toast({ title: "Tautan belum dapat disalin", description: "Silakan salin alamat halaman dari peramban.", state: "destructive", position: "top-right" });
    }
  };

  const copyShareLink = async () => {
    const link = shareUrl();
    try {
      if (navigator.share) {
        await navigator.share({ title: asset.title, text: asset.title, url: link });
        recordShare();
        toast({ title: "Tautan siap dibagikan", state: "positive", position: "top-right" });
        return;
      }
      await copyToClipboard(link);
      recordShare();
      toast({ title: "Tautan berhasil disalin", state: "positive", position: "top-right" });
    } catch (shareError) {
      if (shareError?.name === "AbortError") return;
      try {
        await copyToClipboard(link);
        recordShare();
        toast({ title: "Tautan berhasil disalin", state: "positive", position: "top-right" });
      } catch {
        toast({ title: "Tautan belum dapat dibagikan", description: "Silakan salin alamat halaman dari peramban.", state: "destructive", position: "top-right" });
      }
    }
  };


  const seekToChapter = (time) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = Number(time) || 0;
    videoRef.current.play().catch(() => undefined);
  };
  const openTimestamp = () => {
    setChaptersOpen(true);
    window.requestAnimationFrame(() => {
      const section = chaptersSectionRef.current;
      section?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
      section?.focus({ preventScroll: true });
    });
  };

  const detailActionProps = {
    asset,
    fileUrl: availableFileUrl,
    fileSize: fileAvailability.size,
    onShare: copyShareLink,
    onCopyLink: copyAssetLink,
  };

  if (loading) {
    return <div className="mx-auto max-w-7xl px-4 py-10 md:px-8"><Skeleton height="28px" width="42%" /><Skeleton className="mt-6" height="460px" rounded="lg" /><div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]"><Skeleton height="520px" rounded="lg" /><Skeleton height="420px" rounded="lg" /></div></div>;
  }

  if (error || !asset) {
    const missing = !errorStatus || errorStatus === 404;
    return <StatusPage compact code={missing ? "404" : String(errorStatus)} illustration={missing ? "empty-missing" : undefined} title={missing ? "Pengetahuan tidak ditemukan" : "Pengetahuan belum dapat dimuat"} description={error || "Aset mungkin telah dipindahkan, disembunyikan, atau tidak lagi tersedia."} onBack={() => navigate(-1)} />;
  }

  const closeVideoFocus = () => {
    const video = focusVideoRef.current;
    videoPosition.current = video?.currentTime || videoPosition.current;
    video?.pause();
    if (videoRef.current) videoRef.current.currentTime = videoPosition.current;
    setFocusMode(false);
  };

  // Breadcrumb shows the real location: catalogue, the asset's category, then the asset itself.
  const categoryPath = asset.category?.id != null ? libraryCataloguePath(new URLSearchParams({ categoryId: String(asset.category.id) })) : null;
  const breadcrumbs = [
    { label: "Beranda", href: "/", onClick: () => navigate("/") },
    { label: "Jelajahi", href: "/library", onClick: () => navigate("/library") },
    ...(asset.category?.name ? [categoryPath ? { label: asset.category.name, href: categoryPath, onClick: () => navigate(categoryPath) } : { label: asset.category.name }] : []),
    { label: asset.title },
  ];
  const videoDuration = Number(asset.video_duration_seconds) > 0 ? Number(asset.video_duration_seconds) : mediaDuration;
  const rememberVideoDuration = (event) => {
    const seconds = event.currentTarget.duration;
    if (Number.isFinite(seconds) && seconds > 0) setMediaDuration(Math.round(seconds));
  };

  return <div className="kms-detail-v2">
    <div className="kms-home-container kms-detail-v2-breadcrumb"><Breadcrumb items={breadcrumbs} maxLength={48} /></div>
    <DetailHeader asset={asset} categoryPath={categoryPath} pages={documentPages} duration={videoDuration} actions={detailActionProps} />
    <div className={`kms-home-container kms-detail-v2-grid ${theaterMode ? "is-theater" : ""}`}>
      <div className="kms-detail-v2-main">
      <section className="kms-detail-v2-viewer" aria-label={isVideo(asset) ? "Pemutar video" : "Pembaca dokumen"}>
        {isVideo(asset) && <div className="kms-detail-v2-video-toolbar"><h2><PlayCircle size={19} />Pemutar video</h2><div>
          {hasChapters && <Button hierarchy="tertiary" size="sm" prefixIcon={<ListVideo size={16} />} aria-controls={`video-chapters-${id}`} onClick={openTimestamp}>Timestamp</Button>}
          {availableFileUrl && <><Button hierarchy="tertiary" size="sm" prefixIcon={theaterMode ? <Minimize2 size={16} /> : <Maximize2 size={16} />} aria-pressed={theaterMode} onClick={() => setTheaterMode(value => !value)}>{theaterMode ? "Mode normal" : "Mode teater"}</Button><Button hierarchy="tertiary" size="sm" prefixIcon={<Maximize2 size={16} />} aria-haspopup="dialog" onClick={() => { videoPosition.current = videoRef.current?.currentTime || 0; videoRef.current?.pause(); setFocusMode(true); }}>Mode fokus</Button></>}
        </div></div>}
        {fileAvailability.status === "checking" ? <div className="p-5"><Skeleton height="520px" rounded="lg" /></div> : availableFileUrl ? isVideo(asset) ? (
          <video ref={videoRef} className="aspect-video w-full bg-black" controls controlsList={asset.allow_download === false ? "nodownload" : undefined} playsInline preload="metadata" poster={uploadUrl(asset.thumbnail_url) || undefined} onLoadedMetadata={rememberVideoDuration} onError={() => setVideoError(true)}>
            <source src={availableFileUrl} type={videoMimeType(availableFileUrl)} />Browser Anda belum mendukung pemutaran video.
          </video>
        ) : <DocumentViewer key={id} fileUrl={availableFileUrl} title={asset.title} fileDownloadUrl={asset.allow_download === false ? null : downloadUrl(asset.file_url)} onDocumentLoad={({ pages }) => setDocumentPages(pages)} /> : <div className="kms-detail-v2-file-status"><FileText size={44} aria-hidden="true" /><Alert variant="caution" title="File belum dapat ditampilkan" message={fileAvailability.message || "File utama belum tersedia pada aset ini."} /></div>}
        {isVideo(asset) && availableFileUrl && videoError && <div className="m-4"><Alert variant="caution" title="Video belum dapat diputar" message={asset.allow_download === false ? "Format video ini belum dapat diputar pada perangkat Anda." : "Coba unduh file video untuk memutarnya di perangkat Anda."} /></div>}
      </section>
      <div className="kms-detail-v2-information">
        {hasChapters && chaptersOpen && <TimestampPanel asset={asset} assetId={id} isOpen={chaptersOpen} onToggle={() => setChaptersOpen(false)} onSelect={seekToChapter} sectionRef={chaptersSectionRef} />}
        <AssetContent asset={asset} />
      </div>
      <div className="kms-detail-v2-discussion"><CommentsSection assetId={id} publicVisuals /></div>
      </div>
      <aside className="kms-detail-v2-aside" aria-labelledby="related-heading"><RelatedPanel assets={relatedAssets} headingId="related-heading" /></aside>
    </div>
    {focusMode && isVideo(asset) && availableFileUrl && <FocusModal title={asset.title} onClose={closeVideoFocus}>
      <div className="kms-video-focus"><div className="kms-video-focus-toolbar"><h2>{asset.title}</h2><Button hierarchy="tertiary" prefixIcon={<X size={20} />} onClick={closeVideoFocus} aria-label="Tutup mode fokus">Tutup</Button></div>
        <video ref={focusVideoRef} src={availableFileUrl} controls controlsList={asset.allow_download === false ? "nodownload" : undefined} playsInline preload="metadata" onLoadedMetadata={event => { event.currentTarget.currentTime = videoPosition.current; }} onError={() => setVideoError(true)} />
        {videoError && <Alert variant="caution" message="Video belum dapat diputar pada perangkat Anda." />}
      </div>
    </FocusModal>}
  </div>;
}
