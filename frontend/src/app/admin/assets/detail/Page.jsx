import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Alert, Badge, Button, CardPlain, CircleProgressBar, Divider, Skeleton } from "@idds/react";
import { Building2, Clock3, Download, Eye, FileText, ListVideo, Pencil, PlayCircle, TriangleAlert, UserRound } from "lucide-react";
import AdminPageHeader from "../../../../components/AdminPageHeader";
import CommentsSection from "../../../../components/CommentsSection";
import VideoChapters from "../../../../components/VideoChapters";
import WorkUnitLabel from "../../../../components/WorkUnitLabel";
import documentFallback from "../../../../assets/knowledge/document-fallback.png";
import videoFallback from "../../../../assets/knowledge/video-fallback.png";
import { apiFetch, currentUser, uploadUrl } from "../../../../lib/api";
import useAdminView from "../../../../hooks/useAdminView";

const isVideo = (asset) => asset?.asset_type === "video";
const videoMimeType = (fileUrl = "") => ({ mp4: "video/mp4", webm: "video/webm", ogg: "video/ogg" }[fileUrl.split(".").pop()?.toLowerCase()] || undefined);
const formatDate = (value) => value ? new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" }).format(new Date(value)) : "-";
const formatDuration = (value) => { const seconds = Number(value); if (!Number.isFinite(seconds)) return null; const hours = Math.floor(seconds / 3600); const minutes = Math.floor((seconds % 3600) / 60); const remaining = seconds % 60; return [hours, minutes, remaining].filter((part, index) => index || part > 0).map((part) => String(part).padStart(2, "0")).join(":"); };

export default function AdminAssetDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const user = currentUser() || {};
  const userRole = user.role;
  const canWrite = ["pegawai", "admin"].includes(userRole);
  const { isActingAsEmployee, staffMember, withEmployeeContext } = useAdminView();
  const [asset, setAsset] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [videoError, setVideoError] = useState(false);
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const videoRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        setLoading(true);
        const authorId = searchParams.get("authorId");
        const params = new URLSearchParams();
        if (authorId) params.set("authorId", authorId);
        if (userRole === "admin" && searchParams.get("recovery") === "1") params.set("includeDeleted", "true");
        const query = params.toString();
        const response = await apiFetch(`/api/assets/admin/${id}/detail${query ? `?${query}` : ""}`, { auth: true, signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Gagal memuat detail aset");
        if (!controller.signal.aborted) setAsset(data);
      } catch (loadError) {
        if (loadError.name !== "AbortError") setError(loadError.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    load();
    return () => controller.abort();
  }, [id, searchParams, userRole]);

  useEffect(() => { setVideoError(false); setChaptersOpen(false); }, [id]);

  if (loading) return <div className="mx-auto w-full max-w-7xl p-4 md:p-6 xl:p-8"><Skeleton height="36px" width="40%" /><div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]"><Skeleton height="520px" rounded="lg" /><Skeleton height="360px" rounded="lg" /></div></div>;
  if (error || !asset) return <div className="mx-auto w-full max-w-3xl p-4 md:p-6 xl:p-8"><Alert variant="critical" title="Detail aset tidak tersedia" message={error || "Aset tidak ditemukan"} /><Button className="mt-4" hierarchy="secondary" onClick={() => navigate(withEmployeeContext("/admin/assets"))}>Kembali ke aset</Button></div>;

  const fileUrl = uploadUrl(asset.file_url);
  const isDeleted = Boolean(asset.deleted_at);
  const visual = uploadUrl(asset.thumbnail_url) || (isVideo(asset) ? videoFallback : documentFallback);
  const quality = asset.quality || { completed: 0, total: 0, status: "needs_attention", checks: [] };
  const qualityProgress = quality.total > 0 ? Math.round((quality.completed / quality.total) * 100) : 0;
  const seekToChapter = (time) => { if (!videoRef.current) return; videoRef.current.currentTime = Number(time) || 0; videoRef.current.play().catch(() => undefined); };

  return <div className="mx-auto w-full max-w-7xl p-4 md:p-6 xl:p-8">
    <AdminPageHeader
      compact
      eyebrow={isDeleted ? "Pemulihan Aset" : (isActingAsEmployee ? "Mode kerja Pegawai" : "Manajemen Pengetahuan")}
      title="Detail Aset"
      description={isDeleted
        ? "Pratinjau aset terhapus tanpa menambah jumlah kunjungan publik."
        : (isActingAsEmployee
          ? `Pratinjau aset atas nama ${staffMember?.full_name || "Pegawai terpilih"}.`
          : "Pratinjau aset tanpa menambah jumlah kunjungan publik.")}
      breadcrumbs={[
        { label: "Dasbor", href: withEmployeeContext("/admin/dashboard") },
        { label: isDeleted ? "Pemulihan Aset" : "Aset Pengetahuan", href: isDeleted ? "/admin/assets/recovery" : withEmployeeContext("/admin/assets") },
        { label: asset.title },
      ]}
      actions={(
        <>
          {isDeleted && <Button hierarchy="secondary" onClick={() => navigate("/admin/assets/recovery")}>Kembali ke pemulihan</Button>}
          {canWrite && !isDeleted && <Button hierarchy="secondary" onClick={() => navigate(withEmployeeContext(`/admin/assets/edit/${asset.id}`))} prefixIcon={<Pencil size={16} />}>Edit aset</Button>}
          {asset.is_published && !isDeleted && <Button hierarchy="primary" onClick={() => window.open(`/detail/${asset.id}`, "_blank", "noreferrer")}>Lihat publik</Button>}
        </>
      )}
    />
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
      <article className="min-w-0">
        <CardPlain className="kms-admin-surface overflow-hidden">
          <div className="grid gap-0 md:grid-cols-[minmax(0,1fr)_15rem]">
            <div className="p-5 md:p-6"><div className="flex flex-wrap gap-2">{isDeleted && <Badge type="soft" variant="neutral">Terhapus</Badge>}<Badge type="soft" variant={asset.is_published ? "success" : "warning"}>{asset.is_published ? (isDeleted ? "Terbit sebelum dihapus" : "Terbit") : "Draf"}</Badge><Badge type="soft" variant="info" prefixIcon={isVideo(asset) ? <PlayCircle size={14} /> : <FileText size={14} />}>{isVideo(asset) ? "Video" : "Dokumen"}</Badge></div><h1 className="mt-4 text-2xl font-bold leading-tight text-content-primary md:text-3xl">{asset.title}</h1><div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-content-secondary"><div className="inline-flex items-center gap-1"><Building2 size={14} /><WorkUnitLabel name={asset.work_unit?.name} fallback="Unit kerja belum diisi" /></div><span className="inline-flex items-center gap-1"><Eye size={14} />{asset.view_count || 0} dilihat publik</span></div></div><img className="h-full min-h-44 w-full object-cover" src={visual} alt={`Thumbnail ${asset.title}`} /></div>
          <Divider light />
          <div className="kms-viewer-toolbar"><div className="flex items-center gap-2"><span className="kms-viewer-toolbar-icon">{isVideo(asset) ? <PlayCircle size={18} /> : <FileText size={18} />}</span><div><p className="text-sm font-semibold text-content-primary">{isVideo(asset) ? "Pemutar video" : "Pratinjau dokumen"}</p><p className="text-xs text-content-secondary">{fileUrl ? "Pratinjau file tersimpan." : "File utama belum tersedia."}</p></div></div><div className="flex items-center gap-2">{isVideo(asset) && fileUrl && asset.video_chapters?.length > 0 && <Button type="button" hierarchy="tertiary" size="sm" prefixIcon={<ListVideo size={15} />} aria-expanded={chaptersOpen} aria-controls={`admin-video-chapters-${id}`} onClick={() => setChaptersOpen((current) => !current)}>Bab video ({asset.video_chapters.length})</Button>}{fileUrl && <a href={fileUrl} target="_blank" rel="noreferrer"><Button hierarchy="tertiary" size="sm" prefixIcon={<Download size={15} />}>Buka file</Button></a>}</div></div>
          {fileUrl ? (isVideo(asset) ? <video ref={videoRef} className="aspect-video w-full bg-black" controls playsInline preload="metadata" poster={uploadUrl(asset.thumbnail_url) || undefined} onError={() => setVideoError(true)}><source src={fileUrl} type={videoMimeType(fileUrl)} />Browser Anda belum mendukung pemutaran video.</video> : <iframe title={`Pratinjau ${asset.title}`} src={`${fileUrl}#view=FitH`} className="h-[65vh] min-h-[420px] w-full" />) : <div className="flex min-h-56 flex-col items-center justify-center px-6 text-center text-content-secondary"><FileText size={38} /><p className="mt-3 text-sm">File utama belum diunggah.</p></div>}
          {videoError && <div className="m-4"><Alert variant="caution" title="Video belum dapat diputar" message="Gunakan tombol Buka file untuk memutar atau mengunduh video." /></div>}
          {isVideo(asset) && fileUrl && chaptersOpen && <div id={`admin-video-chapters-${id}`} className="border-t border-border-subtle bg-page-secondary/45 p-4 md:p-5"><div className="mb-3 flex items-center gap-2"><ListVideo size={17} className="text-content-guide" /><div><h2 className="text-sm font-bold text-content-primary">Bab video</h2><p className="text-xs text-content-secondary">Pilih timestamp untuk melompat ke bagian tersebut.</p></div></div><VideoChapters chapters={asset.video_chapters} onSelect={seekToChapter} /></div>}
        </CardPlain>
        {isVideo(asset) && asset.video_duration_seconds !== null && asset.video_duration_seconds !== undefined && <CardPlain className="kms-admin-surface mt-5 p-5 md:p-6"><div className="flex items-center gap-3"><span className="kms-admin-metric-icon kms-admin-metric-icon--teal"><ListVideo size={18} /></span><div><h2 className="font-bold text-content-primary">Informasi video</h2><p className="mt-1 text-xs text-content-secondary">Durasi video yang tersedia untuk penonton.</p></div></div><p className="mt-4 inline-flex items-center gap-2 text-sm text-content-secondary"><Clock3 size={16} /> Durasi {formatDuration(asset.video_duration_seconds)}</p></CardPlain>}
        <CardPlain className="kms-admin-surface mt-5 p-5 md:p-6"><h2 className="text-lg font-bold text-content-primary">Tentang pengetahuan ini</h2>{asset.content ? <p className="mt-4 whitespace-pre-line text-sm leading-7 text-content-primary">{asset.content}</p> : <p className="mt-3 text-sm text-content-secondary">Belum ada isi tambahan.</p>}</CardPlain>
        {asset.is_published && !isDeleted && <CommentsSection assetId={asset.id} canModerate={userRole === "admin" || (userRole === "pegawai" && asset.author?.id === user.id)} />}
      </article>
      <aside className="space-y-5 lg:sticky lg:top-5">
        <CardPlain className="kms-admin-surface p-5"><div className="flex items-center gap-3"><span role="progressbar" aria-label="Kelengkapan kualitas aset" aria-valuemin="0" aria-valuemax="100" aria-valuenow={qualityProgress} className="shrink-0"><CircleProgressBar progress={qualityProgress} diameter={46} strokeWidth={5} variant={quality.status === "complete" ? "positive" : "warning"} /></span><div><h2 className="font-bold text-content-primary">Kualitas aset</h2><p className="mt-1 text-xs text-content-secondary">{quality.completed}/{quality.total} elemen siap · {qualityProgress}% lengkap</p></div></div><div className="mt-4 space-y-2">{quality.checks.map((check) => <div key={check.key} className="flex items-center justify-between gap-2 text-sm"><span className="text-content-secondary">{check.label}</span><span className={check.complete ? "text-emerald-700" : "text-amber-700"}>{check.complete ? "Lengkap" : "Perlu diisi"}</span></div>)}</div>{quality.status !== "complete" && <div className="mt-4 flex gap-2 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-900"><TriangleAlert size={16} className="mt-0.5 shrink-0" />Lengkapi elemen yang belum tersedia agar aset lebih mudah ditemukan dan dipahami.</div>}</CardPlain>
        <CardPlain className="kms-admin-surface p-5"><h2 className="font-bold text-content-primary">Informasi aset</h2><dl className="mt-3 divide-y divide-border-subtle text-sm"><div className="py-3"><dt className="text-content-secondary">Kategori</dt><dd className="mt-1 font-semibold text-content-primary">{asset.category?.name || "Belum dikategorikan"}</dd></div><div className="py-3"><dt className="text-content-secondary">Kontributor</dt><dd className="mt-1 flex items-center gap-1 font-semibold text-content-primary"><UserRound size={14} />{asset.author?.full_name || "Kemenhub"}</dd></div><div className="py-3"><dt className="text-content-secondary">Dibuat</dt><dd className="mt-1 font-semibold text-content-primary">{formatDate(asset.created_at)}</dd></div></dl></CardPlain>
      </aside>
    </div>
  </div>;
}
