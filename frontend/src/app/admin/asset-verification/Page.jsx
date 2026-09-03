import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Alert, Badge, Button, CardPlain, Modal, SelectDropdown, Skeleton, TextArea, TextField, useToast } from "@idds/react";
import { CheckCircle2, Clock3, ExternalLink, FileCheck2, FileText, RotateCcw, Search, Video, XCircle } from "lucide-react";
import AdminPageHeader from "../../../components/AdminPageHeader";
import EmptyState from "../../../components/EmptyState";
import { useAuth } from "../../../contexts/AuthContext";
import useAdminView from "../../../hooks/useAdminView";
import { apiFetch, inputValue, uploadUrl } from "../../../lib/api";
import { hasPermission } from "../../../lib/permissions";
import { publicationStatus, publicationStatusOptions } from "../../../lib/publicationStatus";

const formatDateTime = (value) => value
  ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
  : "-";

const unitLabel = (asset) => [
  asset.parent_work_unit_alias || asset.parent_work_unit_name,
  asset.work_unit_alias || asset.work_unit_name,
].filter(Boolean).filter((value, index, values) => values.indexOf(value) === index).join(" — ") || "Unit kerja belum diisi";

export default function AssetVerificationPage() {
  const [searchParams] = useSearchParams();
  const notificationQuery = searchParams.get("q") || "";
  const { user: authenticatedUser } = useAuth();
  const { accessUser, withEmployeeContext } = useAdminView();
  const user = accessUser || authenticatedUser || {};
  const canDecide = hasPermission(user, "asset_verification", "edit");
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [scope, setScope] = useState(null);
  const [status, setStatus] = useState("pending_review");
  const [query, setQuery] = useState(notificationQuery);
  const [appliedQuery, setAppliedQuery] = useState(notificationQuery);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ currentPage: 1, totalItems: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState("");
  const [decisionError, setDecisionError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ status, page: String(page), limit: "10" });
      if (appliedQuery) params.set("q", appliedQuery);
      const response = await apiFetch(`/api/assets/admin/publication-reviews?${params}`, { auth: true });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || result.error || "Gagal memuat antrean verifikasi");
      setItems(result.data || []);
      setScope(result.scope || null);
      setPagination(result.pagination || { currentPage: page, totalItems: 0, totalPages: 0 });
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [appliedQuery, page, status]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [status]);
  useEffect(() => {
    setQuery(notificationQuery);
    setAppliedQuery(notificationQuery);
    setPage(1);
  }, [notificationQuery]);

  const statusMeta = useMemo(() => publicationStatus({ publication_status: status }), [status]);
  const openReview = (asset) => {
    setSelected(asset);
    setNote(asset.review_note || "");
    setDecisionError("");
  };
  const closeReview = () => {
    if (saving) return;
    setSelected(null);
    setNote("");
    setDecisionError("");
  };
  const decide = async (decision) => {
    const cleanNote = note.trim();
    if (cleanNote.length < 5) {
      setDecisionError("Keterangan keputusan wajib diisi minimal 5 karakter.");
      return;
    }
    setSaving(decision);
    setDecisionError("");
    try {
      const reference = selected.slug || selected.public_id;
      const response = await apiFetch(`/api/assets/admin/publication-reviews/${encodeURIComponent(reference)}`, {
        method: "PATCH",
        auth: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note: cleanNote }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || result.error || "Keputusan belum dapat disimpan");
      toast({ state: "positive", title: "Keputusan tersimpan", description: result.message, duration: 3500 });
      setSelected(null);
      setNote("");
      await load();
    } catch (saveError) {
      setDecisionError(saveError.message);
    } finally {
      setSaving("");
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl p-4 md:p-6 xl:p-8">
      <AdminPageHeader
        eyebrow="Manajemen Aset"
        title="Verifikasi Aset"
        description="Nilai kelayakan publikasi sesuai Unit Kerja Anda dan seluruh unit turunannya."
        breadcrumbs={[{ label: "Dasbor", href: withEmployeeContext("/admin/dashboard") }, { label: "Verifikasi Aset" }]}
      />

      <Alert
        variant="info"
        title={scope?.type === "all" ? "Cakupan seluruh Unit Kerja" : `Cakupan ${scope?.work_unit_name || "Unit Kerja akun"}`}
        message="Batas antrean diperiksa kembali oleh server. Pengaju tidak dapat memverifikasi asetnya sendiri, dan setiap keputusan dicatat pada riwayat audit."
      />

      <CardPlain className="kms-admin-surface mt-5 overflow-hidden">
        <div className="grid gap-3 border-b border-border-subtle p-4 md:grid-cols-[15rem_minmax(0,1fr)_auto] md:items-end md:p-5">
          <SelectDropdown label="Status pengajuan" options={publicationStatusOptions} selected={status} onSelect={setStatus} indicator="check" />
          <TextField label="Cari pengajuan" value={query} onChange={(value) => setQuery(inputValue(value))} placeholder="Judul, pengaju, atau unit kerja" showClearButton />
          <Button hierarchy="secondary" prefixIcon={<Search size={16} />} onClick={() => { setAppliedQuery(query.trim()); setPage(1); }}>Cari</Button>
        </div>

        {error ? <div className="p-5"><Alert variant="critical" title="Antrean tidak dapat dimuat" message={error} /></div> : loading ? (
          <div className="space-y-3 p-5">{[1, 2, 3, 4].map((row) => <Skeleton key={row} height="78px" rounded="lg" />)}</div>
        ) : items.length === 0 ? (
          <EmptyState icon={FileCheck2} title={`Tidak ada aset berstatus ${statusMeta.label.toLowerCase()}`} description="Pengajuan yang sesuai cakupan organisasi dan filter akan tampil di sini." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-primary-50 text-xs uppercase tracking-wide text-content-primary"><tr><th className="px-5 py-4">Aset</th><th className="px-4 py-4">Pengaju</th><th className="px-4 py-4">Unit Kerja</th><th className="px-4 py-4">Status</th><th className="px-4 py-4">Waktu</th><th className="px-5 py-4 text-right">Aksi</th></tr></thead>
              <tbody className="divide-y divide-border-subtle">
                {items.map((asset) => {
                  const meta = publicationStatus(asset);
                  const TypeIcon = asset.asset_type === "video" ? Video : FileText;
                  return <tr key={asset.public_id} className="transition-colors hover:bg-page-secondary"><td className="px-5 py-4"><div className="flex items-start gap-3"><span className="rounded-lg bg-primary-100 p-2 text-content-guide"><TypeIcon size={18} /></span><div className="min-w-0"><p className="max-w-sm truncate font-semibold text-content-primary" title={asset.title}>{asset.title}</p><p className="mt-1 text-xs text-content-secondary">{asset.category_name || "Tanpa kategori"} · Putaran {asset.review_round || 1}</p></div></div></td><td className="px-4 py-4 text-content-secondary">{asset.author_name}</td><td className="px-4 py-4 text-content-secondary">{unitLabel(asset)}</td><td className="px-4 py-4"><Badge type="soft" variant={meta.variant} size="sm">{meta.label}</Badge></td><td className="px-4 py-4 text-xs text-content-secondary"><span className="inline-flex items-center gap-1"><Clock3 size={14} />{formatDateTime(asset.submitted_at || asset.reviewed_at)}</span></td><td className="px-5 py-4 text-right"><Button hierarchy="secondary" size="sm" onClick={() => openReview(asset)}>{status === "pending_review" && canDecide ? "Periksa" : "Lihat keterangan"}</Button></td></tr>;
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && pagination.totalPages > 1 && <div className="flex items-center justify-between gap-3 border-t border-border-subtle px-5 py-4 text-sm text-content-secondary"><span>{pagination.totalItems} pengajuan</span><div className="flex items-center gap-2"><Button hierarchy="tertiary" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Sebelumnya</Button><span>Halaman {page} dari {pagination.totalPages}</span><Button hierarchy="tertiary" size="sm" disabled={page >= pagination.totalPages} onClick={() => setPage((value) => value + 1)}>Berikutnya</Button></div></div>}
      </CardPlain>

      <Modal open={Boolean(selected)} onClose={closeReview} title={selected?.publication_status === "pending_review" ? "Penilaian kelayakan aset" : "Keterangan verifikasi"} size="lg">
        {selected && <div className="space-y-5">
          <div className="rounded-xl border border-border-subtle bg-page-secondary p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-lg font-bold text-content-primary">{selected.title}</p><p className="mt-1 text-sm text-content-secondary">{selected.author_name} · {unitLabel(selected)}</p></div><Badge type="soft" variant={publicationStatus(selected).variant}>{publicationStatus(selected).label}</Badge></div><p className="mt-4 whitespace-pre-line text-sm leading-6 text-content-secondary">{selected.content || "Aset ini belum memiliki deskripsi tambahan."}</p>{selected.file_url && <a href={uploadUrl(selected.file_url)} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-content-guide hover:underline"><ExternalLink size={15} /> Buka materi untuk diperiksa</a>}</div>
          {decisionError && <Alert variant="critical" title="Keputusan belum tersimpan" message={decisionError} />}
          <TextArea label={selected.publication_status === "pending_review" ? "Keterangan verifikator *" : "Keterangan keputusan"} value={note} onChange={(value) => setNote(inputValue(value))} rows={5} maxLength={2000} disabled={selected.publication_status !== "pending_review" || !canDecide} placeholder="Tuliskan alasan keputusan atau bagian yang perlu diperbaiki." />
          {selected.publication_status === "pending_review" && canDecide && <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end"><Button hierarchy="secondary" onClick={closeReview} disabled={Boolean(saving)}>Batal</Button><Button hierarchy="secondary" prefixIcon={<XCircle size={16} />} onClick={() => decide("rejected")} disabled={Boolean(saving)}>{saving === "rejected" ? "Menyimpan…" : "Tolak"}</Button><Button hierarchy="secondary" prefixIcon={<RotateCcw size={16} />} onClick={() => decide("revision_required")} disabled={Boolean(saving)}>{saving === "revision_required" ? "Menyimpan…" : "Minta perbaikan"}</Button><Button hierarchy="primary" prefixIcon={<CheckCircle2 size={16} />} onClick={() => decide("approved")} disabled={Boolean(saving)}>{saving === "approved" ? "Menerbitkan…" : "Setujui & terbitkan"}</Button></div>}
          {selected.publication_status !== "pending_review" && <div className="flex justify-end"><Button hierarchy="secondary" onClick={closeReview}>Tutup</Button></div>}
        </div>}
      </Modal>
    </div>
  );
}
