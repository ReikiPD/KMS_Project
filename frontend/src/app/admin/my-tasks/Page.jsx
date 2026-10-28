import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Alert, Badge, Button, Modal, Skeleton, TextField } from "@idds/react";
import { ArrowRight, Bell, CheckCheck, CircleCheck, ClipboardCheck, Clock3, FilePenLine, FileText, ListTodo, MessageSquareText, Plus, RefreshCw, Search, Video } from "lucide-react";
import AdminPageHeader from "../../../components/AdminPageHeader";
import EmptyState from "../../../components/EmptyState";
import useAdminView from "../../../hooks/useAdminView";
import { useAuth } from "../../../contexts/AuthContext";
import { apiFetch, inputValue } from "../../../lib/api";
import { adminAssetEditPath, adminAssetPath, publicAssetPath } from "../../../lib/routes";
import { formatIndonesianDate, formatRelativeTime } from "../../../lib/dateTime";
import { publicationStatus } from "../../../lib/publicationStatus";

const TABS = [
  { key: "actionable", label: "Perlu tindakan", icon: ListTodo },
  { key: "drafts", label: "Draf", icon: FilePenLine, capability: "assets" },
  { key: "pending", label: "Menunggu verifikasi", icon: Clock3, capability: "assets" },
  { key: "reviews", label: "Antrean verifikasi", icon: ClipboardCheck, capability: "reviews" },
  { key: "decisions", label: "Hasil verifikasi", icon: CircleCheck, capability: "assets" },
  { key: "notifications", label: "Belum dibaca", icon: Bell, capability: "notifications" },
];
const NOTIFICATION_LABELS = {
  asset_submitted: "Pengajuan baru untuk diverifikasi",
  asset_assigned: "Pengajuan ditugaskan kepada Anda",
  asset_approved: "Aset disetujui dan diterbitkan",
  asset_revision: "Verifikator meminta perbaikan",
  asset_rejected: "Pengajuan publikasi ditolak",
  comment: "Komentar baru", reply: "Balasan komentar baru", share: "Aset dibagikan",
};
const TASK_HINTS = {
  draft: "Lengkapi draf, lalu ajukan untuk verifikasi.",
  revision_required: "Baca catatan verifikator, perbaiki aset, lalu ajukan kembali.",
  pending_review: "Pengajuan sudah terkirim. Menunggu keputusan verifikator.",
  approved: "Verifikasi selesai. Keterangan keputusan dapat dibaca di sini.",
  rejected: "Baca alasan penolakan sebelum menyiapkan pengajuan berikutnya.",
  review_queue: "Pengajuan ini berada dalam cakupan verifikasi Anda.",
};

export default function MyTasksPage() {
  const { user } = useAuth();
  const { accessUser, isEmployeeContext, withEmployeeContext } = useAdminView();
  const subject = accessUser || user;
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((item) => item.key === params.get("tab")) ? params.get("tab") : "actionable";
  const page = Math.max(1, Number.parseInt(params.get("page"), 10) || 1);
  const query = params.get("q") || "";
  const [search, setSearch] = useState(query);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [note, setNote] = useState(null);
  const [readingId, setReadingId] = useState(null);
  const [revision, setRevision] = useState(0);
  const [loadedAt, setLoadedAt] = useState(null);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => { setSearch(query); }, [query]);
  useEffect(() => {
    setNote(null);
    setActionError("");
    setReadingId(null);
  }, [subject?.id, isEmployeeContext]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setResult(null);
    const load = async () => {
      try {
        const request = new URLSearchParams({ tab, page: String(page), limit: "8" });
        if (query) request.set("q", query);
        const response = await apiFetch(`/api/users/my-tasks?${request}`, { auth: true, signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || data.error || "Tugas belum dapat dimuat");
        if (!controller.signal.aborted) { setResult(data); setLoadedAt(new Date()); }
      } catch (loadError) {
        if (!controller.signal.aborted) setError(loadError.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    load();
    return () => controller.abort();
  }, [tab, page, query, subject, isEmployeeContext, revision]);

  useEffect(() => {
    const onFocus = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const changeFilter = (nextTab, nextQuery = query, nextPage = 1) => {
    setParams({ tab: nextTab, ...(nextQuery ? { q: nextQuery } : {}), ...(nextPage > 1 ? { page: String(nextPage) } : {}) });
    setActionError("");
  };
  const capabilities = result?.capabilities || {};
  const counts = result?.counts || {};
  const visibleTabs = TABS.filter((item) => !item.capability || capabilities[item.capability]);
  const activeTab = TABS.find((item) => item.key === tab);
  const openAsset = (task, edit = false) => navigate(withEmployeeContext(edit ? adminAssetEditPath(task) : adminAssetPath(task)));
  const openReview = (task) => navigate(withEmployeeContext(`/admin/asset-verification/${encodeURIComponent(task.public_id || task.slug)}`), { state: { reviewOrigin: true } });
  const readNotification = async (task, open = false) => {
    setReadingId(task.notification_id);
    setActionError("");
    try {
      const response = await apiFetch(`/api/users/notifications/${task.notification_id}/read`, { method: "PATCH", auth: true });
      if (!response.ok) throw new Error("Notifikasi belum berhasil ditandai dibaca. Silakan coba lagi.");
      window.dispatchEvent(new Event("kms-notifications-updated"));
      if (open) {
        if (["asset_submitted", "asset_assigned"].includes(task.notification_type) && capabilities.reviews) openReview(task);
        else if (capabilities.assets && (task.notification_type?.startsWith("asset_") || task.author_id === subject?.id)) openAsset(task);
        else if (!task.notification_type?.startsWith("asset_")) navigate(publicAssetPath(task));
        else refresh();
      } else refresh();
    } catch (readError) { setActionError(readError.message); }
    finally { setReadingId(null); }
  };
  const metrics = [
    { key: "actionable", title: "Perlu tindakan", hint: "Pekerjaan yang dapat Anda lanjutkan", icon: ListTodo, tone: "amber" },
    ...(capabilities.assets ? [{ key: "pending", title: "Menunggu verifikasi", hint: "Pengajuan yang belum diputuskan", icon: Clock3, tone: "blue" }] : []),
    ...(capabilities.reviews ? [{ key: "reviews", title: "Antrean verifikasi", hint: capabilities.decide ? "Pengajuan dalam cakupan Anda" : "Antrean dalam akses baca Anda", icon: ClipboardCheck, tone: "teal" }] : []),
    ...(capabilities.notifications ? [{ key: "notifications", title: "Belum dibaca", hint: "Kabar terbaru untuk akun Anda", icon: Bell, tone: "blue" }] : []),
  ];

  return <div className="kms-tasks mx-auto w-full max-w-7xl p-4 md:p-6 xl:p-8">
    <AdminPageHeader compact eyebrow="Ruang kerja" title="Tugas Saya"
      description={result?.scope.type === "all" ? "Pantau pekerjaan dan pengajuan seluruh akun yang dapat Anda kelola." : isEmployeeContext ? `Pekerjaan ${subject?.full_name || "akun terpilih"}, sesuai akses yang diberikan.` : "Lanjutkan pekerjaan, pantau pengajuan, dan baca respons terbaru Anda."}
      breadcrumbs={[{ label: "Tugas Saya" }]}
      actions={<div className="flex flex-wrap gap-2"><Button hierarchy="secondary" prefixIcon={<RefreshCw size={16} />} onClick={refresh} disabled={loading}>Muat ulang</Button>{capabilities.create && <Button hierarchy="primary" prefixIcon={<Plus size={16} />} onClick={() => navigate(withEmployeeContext("/admin/assets/create"))}>Tambah aset</Button>}</div>} />

    {error ? <div className="space-y-4"><Alert variant="critical" title="Tugas belum dapat dimuat" message={error} /><Button hierarchy="secondary" onClick={refresh}>Coba lagi</Button></div> : <>
      {capabilities.reviewScopeMissing && <div className="mb-4"><Alert variant="caution" title="Unit kerja belum ditetapkan" message="Minta administrator menetapkan unit kerja akun Anda agar antrean verifikasi dapat ditampilkan." /></div>}
      {isEmployeeContext && capabilities.reviews && <p className="mb-4 text-sm text-content-secondary">{capabilities.decide ? "Keputusan verifikasi mengikuti izin EDIT Verifikasi Aset pada role akun yang sedang diakses." : "Antrean verifikasi hanya dapat dilihat karena role akun ini tidak memiliki izin EDIT Verifikasi Aset."}</p>}
      <div className="kms-tasks-metrics" aria-label="Ringkasan tugas">
        {loading ? [1, 2, 3].map((item) => <Skeleton key={item} height="140px" rounded="lg" />) : metrics.map(({ key, title, hint, icon: Icon, tone }) => <button type="button" key={key}
          onClick={() => changeFilter(key, "")}
          className={`kms-task-metric kms-task-metric--${tone} ${tab === key ? "is-active" : ""}`} aria-pressed={tab === key}>
          <span className="flex items-center justify-between gap-3"><span className="text-sm font-semibold">{title}</span><span className="kms-task-metric-icon"><Icon size={20} /></span></span>
          <strong className="mt-2 block text-3xl font-bold tabular-nums">{counts[key] || 0}</strong>
          <span className="mt-2 block text-sm text-content-secondary">{hint}</span>
        </button>)}
      </div>

      <section className="kms-tasks-list mt-5" aria-label="Daftar pekerjaan" aria-busy={loading}>
        <div className="border-b border-border-subtle p-4 md:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-bold text-content-primary">{activeTab.label}</h2><p className="mt-1 text-sm text-content-secondary">{tab === "actionable" ? "Revisi didahulukan, disusul antrean verifikasi dan draf." : tab === "decisions" ? "Keputusan terakhir pada setiap aset yang telah ditinjau." : "Pilih aset atau notifikasi untuk melanjutkan."}</p></div>{loadedAt && !loading && <span className="text-sm text-content-secondary">Diperbarui {loadedAt.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</span>}</div>
          <div className="mt-4 flex flex-wrap gap-2" aria-label="Filter tugas">
            {visibleTabs.map(({ key, label, icon: Icon }) => <button type="button" key={key} className={`kms-task-filter ${tab === key ? "is-active" : ""}`} onClick={() => changeFilter(key)} aria-pressed={tab === key}><Icon size={15} /><span>{label}</span><span className="kms-task-filter-count">{counts[key] || 0}</span></button>)}
          </div>
          <form className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={(event) => { event.preventDefault(); changeFilter(tab, search.trim()); }}>
            <div className="min-w-0 flex-1"><TextField label="Cari dalam daftar ini" value={search} onChange={(value) => setSearch(inputValue(value))} placeholder="Judul aset, pengaju, atau unit kerja" showClearButton /></div>
            <Button type="submit" hierarchy="secondary" prefixIcon={<Search size={16} />} disabled={loading}>Cari</Button>
            {query && <Button hierarchy="tertiary" onClick={() => changeFilter(tab, "")}>Hapus pencarian</Button>}
          </form>
        </div>
        {actionError && <div className="p-4"><Alert variant="critical" title="Tindakan belum selesai" message={actionError} /></div>}
        {loading ? <div className="space-y-4 p-5">{[1, 2, 3].map((item) => <Skeleton key={item} height="112px" rounded="lg" />)}</div> : result?.data.length ? <ul className="divide-y divide-border-subtle">
          {result.data.map((task) => {
            const isNotification = task.kind === "notification";
            const isQueue = task.kind === "review_queue";
            const status = publicationStatus({ publication_status: task.kind });
            const Icon = isNotification ? Bell : isQueue ? ClipboardCheck : task.asset_type === "video" ? Video : FileText;
            const editable = capabilities.editAssets && ["draft", "revision_required", "rejected"].includes(task.kind);
            const canOpenNotification = ["asset_submitted", "asset_assigned"].includes(task.notification_type) ? capabilities.reviews : !task.notification_type?.startsWith("asset_") || capabilities.assets;
            return <li key={task.task_key} className={`kms-task-row ${task.kind === "revision_required" ? "kms-task-row--revision" : ""}`}>
              <span className="kms-task-row-icon" aria-hidden="true"><Icon size={21} /></span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><Badge type="soft" size="sm" variant={isQueue || isNotification ? "info" : status.variant}>{isQueue ? "Perlu diverifikasi" : isNotification ? "Belum dibaca" : status.label}</Badge><span className="text-sm text-content-secondary" title={formatIndonesianDate(task.event_at)}>{formatRelativeTime(task.event_at)}</span></div>
                <h3 className="mt-2 break-words text-base font-bold text-content-primary">{task.title}</h3>
                <p className="mt-1 text-sm leading-6 text-content-secondary">{isNotification ? `${task.actor_name} · ${NOTIFICATION_LABELS[task.notification_type] || "Aktivitas aset"}` : TASK_HINTS[task.kind]}</p>
                {!isNotification && <p className="mt-1 text-sm text-content-secondary">{task.author_name} · {task.work_unit_name}</p>}
                {task.review_note && <p className="kms-task-note mt-3 line-clamp-2 text-sm leading-6">{task.review_note}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  {isNotification ? <>{canOpenNotification && <Button size="sm" hierarchy="secondary" suffixIcon={<ArrowRight size={15} />} disabled={readingId === task.notification_id} onClick={() => readNotification(task, true)}>Buka</Button>}<Button size="sm" hierarchy="tertiary" prefixIcon={<CheckCheck size={15} />} disabled={readingId === task.notification_id} onClick={() => readNotification(task)}>Tandai dibaca</Button></> : <>
                    {isQueue ? <Button size="sm" hierarchy={capabilities.decide ? "primary" : "secondary"} suffixIcon={<ArrowRight size={15} />} onClick={() => openReview(task)}>{capabilities.decide ? "Periksa pengajuan" : "Lihat antrean"}</Button> : <Button size="sm" hierarchy={editable ? "primary" : "secondary"} suffixIcon={<ArrowRight size={15} />} onClick={() => openAsset(task, editable)}>{editable ? task.kind === "draft" ? "Lanjutkan draf" : "Perbaiki aset" : "Lihat aset"}</Button>}
                    {task.review_note && <Button size="sm" hierarchy="secondary" prefixIcon={<MessageSquareText size={15} />} onClick={() => setNote(task)}>Keterangan verifikator</Button>}
                  </>}
                </div>
              </div>
            </li>;
          })}
        </ul> : <EmptyState icon={tab === "actionable" ? CircleCheck : activeTab.icon} title={query ? "Tidak ada hasil yang cocok" : tab === "actionable" ? "Tidak ada pekerjaan yang perlu ditindaklanjuti" : "Belum ada data pada daftar ini"} description={query ? "Coba kata lain atau hapus pencarian." : tab === "actionable" ? "Pengajuan yang sedang menunggu dan hasil verifikasi tetap dapat dilihat melalui filter di atas." : "Data akan muncul ketika ada aktivitas yang sesuai dengan akses akun Anda."} />}
        {!loading && result?.pagination.totalItems > 0 && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle p-4 text-sm text-content-secondary"><span>{result.pagination.totalItems} item · Halaman {result.pagination.currentPage} dari {result.pagination.totalPages}</span><div className="flex gap-2"><Button size="sm" hierarchy="secondary" disabled={result.pagination.currentPage <= 1} onClick={() => changeFilter(tab, query, result.pagination.currentPage - 1)}>Sebelumnya</Button><Button size="sm" hierarchy="secondary" disabled={result.pagination.currentPage >= result.pagination.totalPages} onClick={() => changeFilter(tab, query, result.pagination.currentPage + 1)}>Berikutnya</Button></div></div>}
      </section>
    </>}
    <Modal open={Boolean(note)} onClose={() => setNote(null)} title="Keterangan verifikator" size="md">
      {note && <div className="space-y-4"><Badge type="soft" variant={publicationStatus({ publication_status: note.kind }).variant}>{publicationStatus({ publication_status: note.kind }).label}</Badge><h3 className="break-words text-lg font-bold text-content-primary">{note.title}</h3><p className="text-sm text-content-secondary">{note.reviewer_name} · {formatIndonesianDate(note.reviewed_at)}</p><p className="kms-task-note whitespace-pre-wrap text-base leading-7">{note.review_note}</p><div className="flex justify-end"><Button hierarchy="secondary" onClick={() => setNote(null)}>Tutup</Button></div></div>}
    </Modal>
  </div>;
}
