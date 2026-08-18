import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Building2, CalendarDays, Download, Eye, FileText, ListVideo, Maximize2, Minimize2, PlayCircle, Share2, UserRound, X } from "lucide-react";
import { Alert, Badge, Breadcrumb, Button, Skeleton, useToast } from "@idds/react";
import CommentsSection from "../../components/CommentsSection";
import RelatedKnowledgeList from "../../components/RelatedKnowledgeList";
import VideoChapters from "../../components/VideoChapters";
import { API_BASE_URL, authHeaders, uploadUrl } from "../../lib/api";

const formatDate = (value) => value
  ? new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" }).format(new Date(value))
  : "-";
const isVideo = (asset) => asset?.asset_type === "video";
const videoMimeType = (fileUrl = "") => ({ mp4: "video/mp4", webm: "video/webm", ogg: "video/ogg" }[fileUrl.split(".").pop()?.toLowerCase()] || undefined);

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
    fetch(`${API_BASE_URL}/api/assets/${assetId}`),
    fetch(`${API_BASE_URL}/api/assets/${assetId}/related`),
  ])
    .then(async ([assetResponse, relatedResponse]) => {
      const assetData = await assetResponse.json();
      if (!assetResponse.ok) throw new Error(assetData.error || "Aset tidak ditemukan");

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

  return fetch(`${API_BASE_URL}/api/assets/${assetId}/view`, { method: "POST" })
    .then((response) => response.ok ? response.json() : null)
    .catch(() => null);
};

function DetailActions({ asset, fileUrl, onShare }) {
  return (
    <section className="kms-detail-actions rounded-2xl border border-stroke-secondary bg-page-primary p-5 md:p-6" aria-label="Aksi pengetahuan">
      <div className="flex flex-wrap gap-3">
        <Button hierarchy="primary" size="md" prefixIcon={<Share2 size={16} />} onClick={onShare}>Bagikan</Button>
        {fileUrl && <a href={fileUrl} target="_blank" rel="noreferrer"><Button hierarchy="secondary" size="md" prefixIcon={<Download size={16} />}>{isVideo(asset) ? "Buka / unduh video" : "Buka dokumen"}</Button></a>}
      </div>
    </section>
  );
}

function AssetContent({ asset }) {
  return (
    <section className="kms-detail-content-card rounded-2xl border border-stroke-secondary bg-page-primary p-6 md:p-8" aria-label="Tentang pengetahuan ini">
      {asset.content ? <div className="whitespace-pre-line text-base leading-8 text-content-primary">{asset.content}</div> : <p className="text-sm text-content-secondary">Belum ada isi tambahan untuk pengetahuan ini.</p>}
      <dl className="mt-7 grid gap-x-6 gap-y-3 border-t border-stroke-secondary pt-5 text-sm text-content-secondary sm:grid-cols-2">
        {asset.work_unit && <div className="flex items-center gap-2"><Building2 size={16} aria-hidden="true" /><dt className="sr-only">Unit kerja</dt><dd>{asset.work_unit.name}</dd></div>}
        {asset.author?.full_name && <div className="flex items-center gap-2"><UserRound size={16} aria-hidden="true" /><dt className="sr-only">Penerbit</dt><dd>{asset.author.full_name}</dd></div>}
        <div className="flex items-center gap-2"><Eye size={16} aria-hidden="true" /><dt className="sr-only">Jumlah dilihat</dt><dd>{asset.view_count || 0} kali dilihat</dd></div>
        <div className="flex items-center gap-2"><CalendarDays size={16} aria-hidden="true" /><dt className="sr-only">Tanggal terbit</dt><dd>{formatDate(asset.created_at)}</dd></div>
      </dl>
    </section>
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

function RelatedPanel({ assets, headingId, compact = false }) {
  return (
    <section aria-labelledby={headingId}>
      <div className="mb-4"><p className="kms-section-eyebrow">Lanjutkan eksplorasi</p><h2 id={headingId} className="mt-1 text-lg font-bold text-content-primary">Pengetahuan lainnya</h2><p className="mt-1 text-sm text-content-secondary">Topik serupa dan pengetahuan terbaru.</p></div>
      <RelatedKnowledgeList assets={assets} className={compact ? "md:grid md:grid-cols-2 md:gap-3" : ""} />
    </section>
  );
}

export default function DetailPage() {
  const { id } = useParams();
  const { toast } = useToast();
  const videoRef = useRef(null);
  const chaptersSectionRef = useRef(null);
  const [asset, setAsset] = useState(null);
  const [relatedAssets, setRelatedAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [videoError, setVideoError] = useState(false);
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const [theaterMode, setTheaterMode] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    getAssetDetail(id)
      .then(({ asset: assetData, relatedAssets: nextRelatedAssets }) => {
        if (!active) return;
        setAsset(assetData);
        setRelatedAssets(nextRelatedAssets);
        setLoading(false);

        recordAssetView(id).then((viewData) => {
          if (!viewData) return;

          const updatedAsset = { ...assetData, view_count: viewData.view_count };
          const cached = detailCache.get(id);
          if (cached) detailCache.set(id, { ...cached, asset: updatedAsset });
          if (active) setAsset(updatedAsset);
        });
      })
      .catch((loadError) => {
        if (!active) return;
        setError(loadError.message);
        setLoading(false);
      });

    return () => { active = false; };
  }, [id]);

  useEffect(() => {
    setVideoError(false);
    setChaptersOpen(false);
    setTheaterMode(false);
  }, [id]);


  const breadcrumbs = [
    { label: "Beranda", href: "/" },
    { label: "Daftar Pengetahuan", href: "/" },
    { label: asset?.title || "Detail Pengetahuan" },
  ];
  const fileUrl = uploadUrl(asset?.file_url);
  const contentTypeLabel = isVideo(asset) ? "Video pembelajaran" : "Dokumen pengetahuan";
  const hasChapters = isVideo(asset) && asset?.video_chapters?.length > 0;

  const copyShareLink = async () => {
    const shareUrl = new URL(`/detail/${id}`, window.location.origin).toString();
    const recordShare = () => fetch(`${API_BASE_URL}/api/assets/${id}/share`, { method: "POST", headers: authHeaders() }).catch(() => {});
    const copyToClipboard = async () => {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        return;
      }
      const input = document.createElement("textarea");
      input.value = shareUrl;
      input.setAttribute("readonly", "");
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    };

    try {
      if (navigator.share) {
        await navigator.share({ title: asset.title, text: asset.title, url: shareUrl });
        recordShare();
        toast({ title: "Tautan siap dibagikan", state: "positive", position: "top-right" });
        return;
      }
      await copyToClipboard();
      recordShare();
      toast({ title: "Tautan berhasil disalin", state: "positive", position: "top-right" });
    } catch (shareError) {
      if (shareError?.name === "AbortError") return;
      try {
        await copyToClipboard();
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
      section?.scrollIntoView({ behavior: "smooth", block: "start" });
      section?.focus({ preventScroll: true });
    });
  };

  const detailActionProps = {
    asset,
    fileUrl,
    onShare: copyShareLink,
  };

  if (loading) {
    return <div className="mx-auto max-w-7xl px-4 py-10 md:px-8"><Skeleton height="28px" width="42%" /><Skeleton className="mt-6" height="460px" rounded="lg" /><div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]"><Skeleton height="520px" rounded="lg" /><Skeleton height="420px" rounded="lg" /></div></div>;
  }

  if (error || !asset) {
    return <div className="mx-auto max-w-3xl px-4 py-16 md:px-8"><Alert variant="danger" message={error || "Aset tidak ditemukan"} /><Link className="mt-5 inline-block text-sm font-semibold text-content-guide" to="/">Kembali ke beranda</Link></div>;
  }

  return (
    <>
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-8 md:py-10">
        <Breadcrumb items={breadcrumbs} className="mb-6" />

        <header className="kms-detail-heading border-b border-stroke-secondary pb-6" aria-labelledby="asset-title">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={`kms-detail-type-badge ${isVideo(asset) ? "kms-detail-type-badge--video" : ""}`} type="soft" variant="brand" size="md" prefixIcon={isVideo(asset) ? <PlayCircle size={16} /> : <FileText size={16} />}>{contentTypeLabel}</Badge>
            {asset.category && <Badge type="soft" variant="neutral" size="sm">{asset.category.name}</Badge>}
          </div>
          <h1 id="asset-title" className="mt-4 max-w-5xl break-words text-3xl font-bold leading-tight text-content-primary md:text-4xl">{asset.title}</h1>
        </header>

        <div className={`kms-detail-layout mt-8 grid gap-8 ${theaterMode ? "kms-detail-layout--theater" : "lg:grid-cols-[minmax(0,1fr)_20rem]"}`}>
          <article className="min-w-0">
            <section className="kms-viewer-card overflow-hidden rounded-2xl border border-stroke-primary bg-page-primary" aria-label={isVideo(asset) ? "Pemutar video" : "Pembaca dokumen"}>
              <div className="kms-viewer-toolbar">
                <div className="flex items-center gap-2"><span className="kms-viewer-toolbar-icon">{isVideo(asset) ? <PlayCircle size={18} /> : <FileText size={18} />}</span><div><p className="text-sm font-semibold text-content-primary">{isVideo(asset) ? "Pemutar video" : "Pratinjau dokumen"}</p><p className="text-xs text-content-secondary">{fileUrl ? "Gunakan kontrol untuk melihat materi." : "File utama belum tersedia."}</p></div></div>
                <div className="flex flex-wrap items-center gap-2">
                  {hasChapters && <Button type="button" hierarchy="tertiary" size="sm" prefixIcon={<ListVideo size={15} />} aria-controls={`video-chapters-${id}`} onClick={openTimestamp}>Timestamp</Button>}
                  {isVideo(asset) && fileUrl && <Button type="button" hierarchy="tertiary" size="sm" prefixIcon={theaterMode ? <Minimize2 size={15} /> : <Maximize2 size={15} />} aria-pressed={theaterMode} onClick={() => setTheaterMode((current) => !current)}>{theaterMode ? "Mode normal" : "Mode teater"}</Button>}
                </div>
              </div>
              {fileUrl ? (
                isVideo(asset) ? (
                  <video ref={videoRef} className="aspect-video w-full bg-black" controls playsInline preload="metadata" poster={uploadUrl(asset.thumbnail_url) || undefined} onError={() => setVideoError(true)}>
                    <source src={fileUrl} type={videoMimeType(fileUrl)} />
                    Browser Anda belum mendukung pemutaran video.
                  </video>
                ) : (
                  <iframe title={`Pembaca ${asset.title}`} src={`${fileUrl}#view=FitH`} className="h-[68vh] min-h-[520px] w-full" />
                )
              ) : (
                <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center text-content-secondary">
                  {isVideo(asset) ? <PlayCircle className="text-content-guide" size={48} /> : <FileText className="text-content-guide" size={48} />}
                  <p className="mt-4 max-w-sm text-sm">File utama belum tersedia. Silakan baca ringkasan pengetahuan di bawah atau kembali lagi nanti.</p>
                </div>
              )}
              {isVideo(asset) && fileUrl && videoError && <div className="m-4"><Alert variant="caution" title="Video belum dapat diputar" message="Coba buka atau unduh file video untuk memutarnya di perangkat Anda." /></div>}
            </section>

            {theaterMode ? (
              <section className="kms-theater-information-grid mt-6" aria-label="Informasi pengetahuan">
                <div className="min-w-0 space-y-6">
                  <DetailActions {...detailActionProps} />
                  {hasChapters && <TimestampPanel asset={asset} assetId={id} isOpen={chaptersOpen} onToggle={() => setChaptersOpen((current) => !current)} onSelect={seekToChapter} sectionRef={chaptersSectionRef} />}
                  <AssetContent asset={asset} />
                  <CommentsSection assetId={id} />
                </div>
                <aside className="kms-detail-aside kms-theater-aside" aria-labelledby="theater-related-heading">
                  <RelatedPanel assets={relatedAssets} headingId="theater-related-heading" />
                </aside>
              </section>
            ) : (
              <>
                <div className="mt-6"><DetailActions {...detailActionProps} /></div>
                <div className="mt-6"><AssetContent asset={asset} /></div>
                <CommentsSection assetId={id} />
              </>
            )}
          </article>

          {!theaterMode && <aside className="kms-detail-aside" aria-labelledby="related-heading"><div className="space-y-6">{hasChapters && chaptersOpen && <TimestampPanel asset={asset} assetId={id} isOpen={chaptersOpen} onToggle={() => setChaptersOpen(false)} onSelect={seekToChapter} sectionRef={chaptersSectionRef} />}<RelatedPanel assets={relatedAssets} headingId="related-heading" /></div></aside>}
        </div>
      </div>

    </>
  );
}
