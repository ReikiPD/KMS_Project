import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Alert, Badge, Button, CardPlain, Modal, Pagination, Skeleton, Tooltip, useToast } from "@idds/react";
import { ArchiveRestore, FileText, PlayCircle, RotateCcw, Search, Trash2 } from "lucide-react";
import AdminPageHeader from "../../../../components/AdminPageHeader";
import MultipleSearchSelect from "../../../../components/MultipleSearchSelect";
import WorkUnitLabel from "../../../../components/WorkUnitLabel";
import { apiFetch } from "../../../../lib/api";
import { queryToSearchSelections, searchSelectionsToQuery } from "../../../../lib/search";
import { adminAssetPath } from "../../../../lib/routes";
import { useAuth } from "../../../../contexts/AuthContext";
import useAdminView from "../../../../hooks/useAdminView";
import { hasPermission } from "../../../../lib/permissions";

const PAGE_SIZE_OPTIONS = [10, 20, 50];
const dateFormatter = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
const relativeTimeFormatter = new Intl.RelativeTimeFormat("id-ID", { numeric: "always" });

const deletedTimeAgo = (value) => {
  const deletedAt = new Date(value);
  if (Number.isNaN(deletedAt.getTime())) return "waktu tidak diketahui";

  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - deletedAt.getTime()) / 1000));
  if (elapsedSeconds < 60) return "kurang dari 1 menit yang lalu";

  const intervals = [
    { unit: "year", seconds: 365 * 24 * 60 * 60 },
    { unit: "month", seconds: 30 * 24 * 60 * 60 },
    { unit: "week", seconds: 7 * 24 * 60 * 60 },
    { unit: "day", seconds: 24 * 60 * 60 },
    { unit: "hour", seconds: 60 * 60 },
    { unit: "minute", seconds: 60 },
  ];
  const interval = intervals.find((item) => elapsedSeconds >= item.seconds);
  const amount = Math.floor(elapsedSeconds / interval.seconds);
  return relativeTimeFormatter.format(-amount, interval.unit);
};

export default function AssetRecoveryPage() {
  const { user: authenticatedUser } = useAuth();
  const { accessUser } = useAdminView();
  const user = accessUser || authenticatedUser;
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeQuery = searchParams.get("q")?.trim() || "";
  const parsedPage = Number.parseInt(searchParams.get("page"), 10);
  const parsedLimit = Number.parseInt(searchParams.get("limit"), 10);
  const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const limit = PAGE_SIZE_OPTIONS.includes(parsedLimit) ? parsedLimit : PAGE_SIZE_OPTIONS[0];

  const [assets, setAssets] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit, totalItems: 0, totalPages: 0 });
  const [searchSelections, setSearchSelections] = useState(() => queryToSearchSelections(activeQuery));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedAssets, setSelectedAssets] = useState(() => new Map());
  const [pendingAction, setPendingAction] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const canRestore = hasPermission(user, "asset_recovery", "edit");
  const canDeletePermanently = hasPermission(user, "asset_recovery", "delete");

  const updateParams = useCallback((updates) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      Object.entries(updates).forEach(([key, value]) => {
        const isDefaultPage = key === "page" && Number(value) === 1;
        const isDefaultLimit = key === "limit" && Number(value) === PAGE_SIZE_OPTIONS[0];
        if (value === "" || value === null || value === undefined || isDefaultPage || isDefaultLimit) next.delete(key);
        else next.set(key, String(value));
      });
      return next;
    });
  }, [setSearchParams]);

  const loadDeletedAssets = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (activeQuery) params.set("q", activeQuery);
      const response = await apiFetch(`/api/assets/admin/recovery?${params.toString()}`, { auth: true });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Gagal memuat aset terhapus");
      const nextAssets = Array.isArray(result.data) ? result.data : [];
      const nextPagination = result.pagination || { page, limit, totalItems: nextAssets.length, totalPages: nextAssets.length ? 1 : 0 };
      if (nextPagination.totalPages > 0 && page > nextPagination.totalPages) {
        updateParams({ page: nextPagination.totalPages });
        return;
      }
      setAssets(nextAssets);
      setPagination(nextPagination);
    } catch (loadError) {
      setAssets([]);
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [activeQuery, limit, page, updateParams]);

  useEffect(() => { loadDeletedAssets(); }, [loadDeletedAssets]);
  useEffect(() => { setSearchSelections(queryToSearchSelections(activeQuery)); }, [activeQuery]);
  useEffect(() => { setSelectedAssets(new Map()); }, [activeQuery, limit, page]);

  const submitSearch = (event) => {
    event.preventDefault();
    updateParams({ q: searchSelectionsToQuery(searchSelections), page: 1 });
  };

  const toggleAssetSelection = (asset) => {
    setSelectedAssets((current) => {
      const next = new Map(current);
      if (next.has(asset.id)) next.delete(asset.id);
      else next.set(asset.id, asset);
      return next;
    });
  };

  const visibleSelectedCount = assets.filter((asset) => selectedAssets.has(asset.id)).length;
  const allVisibleSelected = assets.length > 0 && visibleSelectedCount === assets.length;
  const someVisibleSelected = visibleSelectedCount > 0 && !allVisibleSelected;

  const toggleAllVisible = () => {
    setSelectedAssets((current) => {
      const next = new Map(current);
      if (allVisibleSelected) assets.forEach((asset) => next.delete(asset.id));
      else assets.forEach((asset) => next.set(asset.id, asset));
      return next;
    });
  };

  const openAction = (type, actionAssets) => {
    if (!actionAssets.length) return;
    if (type === "restore" && !canRestore) return;
    if (type === "delete" && !canDeletePermanently) return;
    setDeleteConfirmation("");
    setPendingAction({ type, assets: actionAssets });
  };

  const closeAction = () => {
    if (actionLoading) return;
    setPendingAction(null);
    setDeleteConfirmation("");
  };

  const executePendingAction = async () => {
    if (!pendingAction?.assets.length) return;
    if (pendingAction.type === "delete" && deleteConfirmation !== "HAPUS PERMANEN") return;
    setActionLoading(true);
    setError("");
    try {
      const isDelete = pendingAction.type === "delete";
      const response = await apiFetch("/api/assets/admin/recovery", {
        auth: true,
        method: isDelete ? "DELETE" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: pendingAction.assets.map((asset) => asset.id),
          ...(isDelete ? { confirmation: deleteConfirmation } : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || (isDelete ? "Gagal menghapus aset permanen" : "Gagal memulihkan aset"));
      toast({
        state: "positive",
        title: isDelete ? "Aset dihapus permanen" : "Aset berhasil dipulihkan",
        description: result.message,
        position: "top-right",
      });
      const processedCount = pendingAction.assets.length;
      setPendingAction(null);
      setDeleteConfirmation("");
      setSelectedAssets(new Map());
      if (assets.length <= processedCount && page > 1) updateParams({ page: page - 1 });
      else await loadDeletedAssets();
    } catch (actionError) {
      setError(actionError.message);
      toast({ state: "destructive", title: "Tindakan belum berhasil", description: actionError.message, position: "top-right" });
    } finally {
      setActionLoading(false);
    }
  };

  const firstVisibleItem = pagination.totalItems > 0 ? (page - 1) * limit + 1 : 0;
  const lastVisibleItem = Math.min(page * limit, pagination.totalItems);

  return (
    <div className="mx-auto w-full max-w-7xl p-4 md:p-6 xl:p-8">
      <AdminPageHeader
        eyebrow="Administrasi aset"
        title="Pemulihan Aset"
        description="Pulihkan aset sebagai draf atau hapus permanen sesuai hak akses role. Aset yang melewati satu bulan sejak dihapus akan dibersihkan otomatis."
        breadcrumbs={[{ label: "Dasbor", href: "/admin/dashboard" }, { label: "Aset Pengetahuan", href: "/admin/assets" }, { label: "Pemulihan Aset" }]}
      />

      {error && <div className="mb-4"><Alert variant="critical" title="Pemulihan aset" message={error} /></div>}

      <CardPlain className="kms-admin-surface overflow-hidden">
        <div className="flex items-center gap-3 border-b border-border-subtle px-5 py-4">
          <span className="rounded-lg bg-primary-100 p-2 text-content-guide"><ArchiveRestore size={19} /></span>
          <div>
            <h2 className="font-bold text-content-primary">Aset yang telah dihapus</h2>
            <p className="text-sm text-content-secondary">Pilih satu atau beberapa aset. Pemulihan selalu mengembalikan aset sebagai draf.</p>
          </div>
        </div>

        <div className="border-b border-border-subtle bg-page-secondary/40 px-5 py-4">
          <form className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end" onSubmit={submitSearch}>
            <MultipleSearchSelect
              label="Cari aset terhapus"
              selected={searchSelections}
              onSelect={(values) => {
                setSearchSelections(values);
                if (!values.length && activeQuery) updateParams({ q: "", page: 1 });
              }}
              options={[
                ...assets.map((asset) => ({ group: "Judul Aset", label: asset.title, value: asset.title, description: "Aset yang telah dihapus" })),
                ...assets.map((asset) => ({ group: "Kontributor", label: asset.author_name, value: asset.author_name, description: "Pembuat aset" })),
                ...assets.map((asset) => ({ group: "Kategori", label: asset.category_name, value: asset.category_name, description: "Kategori topik" })),
                ...assets.map((asset) => ({ group: "Unit Kerja", label: asset.work_unit_name, value: asset.work_unit_name, description: "Pemilik pengetahuan" })),
              ].filter((option) => option.value)}
              placeholder="Ketik lalu pilih judul, kontributor, kategori, atau unit"
              helperText=""
            />
            <Button type="submit" hierarchy="secondary" prefixIcon={<Search size={16} />} className="w-full sm:w-auto">Cari</Button>
          </form>
        </div>

        {!loading && assets.length > 0 && (
          <div className="flex flex-col gap-3 border-b border-border-subtle px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <SelectionCheckbox
                checked={allVisibleSelected}
                indeterminate={someVisibleSelected}
                onChange={toggleAllVisible}
                label="Pilih semua aset pada halaman ini"
              />
              <p className="text-sm font-medium text-content-primary">Pilih semua{selectedAssets.size ? <span className="ml-2 font-normal text-content-secondary">({selectedAssets.size} dipilih)</span> : null}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {canRestore && <Button hierarchy="secondary" size="sm" prefixIcon={<RotateCcw size={15} />} disabled={!selectedAssets.size} onClick={() => openAction("restore", [...selectedAssets.values()])}>Pulihkan terpilih</Button>}
              {canDeletePermanently && <Button hierarchy="secondary" size="sm" prefixIcon={<Trash2 size={15} />} disabled={!selectedAssets.size} onClick={() => openAction("delete", [...selectedAssets.values()])}>Hapus permanen</Button>}
            </div>
          </div>
        )}

        {loading ? (
          <div className="space-y-3 p-5">{[1, 2, 3, 4].map((item) => <Skeleton key={item} height="62px" rounded="md" />)}</div>
        ) : assets.length ? (
          <div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-left text-sm">
                <thead className="bg-page-secondary text-xs uppercase tracking-wide text-content-secondary">
                  <tr><th className="w-12 px-5 py-3" aria-label="Pilihan aset" /><th className="px-3 py-3">Aset</th><th className="px-4 py-3">Kontributor</th><th className="px-4 py-3">Kategori / Unit Kerja</th><th className="px-4 py-3">Dihapus pada</th><th className="px-4 py-3">Status sebelumnya</th><th className="px-5 py-3 text-right">Aksi</th></tr>
                </thead>
                <tbody>
                  {assets.map((asset) => {
                    const AssetIcon = asset.asset_type === "video" ? PlayCircle : FileText;
                    return (
                      <tr key={asset.id} className={`border-t border-border-subtle align-top transition-colors hover:bg-primary-50/40 ${selectedAssets.has(asset.id) ? "bg-primary-50/60" : ""}`}>
                        <td className="px-5 py-4"><SelectionCheckbox checked={selectedAssets.has(asset.id)} onChange={() => toggleAssetSelection(asset)} label={`Pilih ${asset.title}`} /></td>
                        <td className="px-3 py-4"><div className="flex items-start gap-3"><span className="rounded-lg bg-primary-100 p-2 text-content-guide"><AssetIcon size={17} /></span><div><button type="button" onClick={() => navigate(`${adminAssetPath(asset)}?recovery=1`)} className="-m-1 line-clamp-2 cursor-pointer rounded-md px-1 py-1 text-left font-semibold text-content-primary transition-colors duration-150 hover:bg-primary-100 hover:text-content-guide hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300">{asset.title}</button><p className="mt-1 text-xs text-content-secondary">{asset.asset_type === "video" ? "Video" : "Dokumen"}</p></div></div></td>
                        <td className="px-4 py-4 text-content-secondary">{asset.author_name}</td>
                        <td className="px-4 py-4"><p className="text-content-primary">{asset.category_name || "Tanpa kategori"}</p><div className="mt-1 text-xs text-content-secondary"><WorkUnitLabel name={asset.work_unit_name} fallback="Tanpa Unit Kerja" /></div></td>
                        <td className="px-4 py-4 text-content-secondary">
                          <Tooltip variant="basic" title={`Dihapus ${deletedTimeAgo(asset.deleted_at)}`} placement="top" showArrow={true}>
                            <span className="inline-flex cursor-help rounded-sm underline decoration-dotted underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300" tabIndex={0}>
                              <time dateTime={asset.deleted_at}>{dateFormatter.format(new Date(asset.deleted_at))}</time>
                            </span>
                          </Tooltip>
                        </td>
                        <td className="px-4 py-4"><Badge type="soft" variant={asset.is_published ? "success" : "neutral"}>{asset.is_published ? "Terbit" : "Draf"}</Badge></td>
                        <td className="px-5 py-4"><div className="flex justify-end gap-2">{canRestore && <Tooltip variant="basic" title="Pulihkan sebagai draf" placement="top" showArrow={true}><Button hierarchy="secondary" size="sm" prefixIcon={<RotateCcw size={15} />} onClick={() => openAction("restore", [asset])}>Pulihkan</Button></Tooltip>}{canDeletePermanently && <Tooltip variant="basic" title="Hapus aset dan file secara permanen" placement="top" showArrow={true}><Button hierarchy="tertiary" size="sm" onClick={() => openAction("delete", [asset])} aria-label={`Hapus permanen ${asset.title}`}><Trash2 size={16} /></Button></Tooltip>}</div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="space-y-3 border-t border-border-subtle px-5 py-4">
              <p className="text-sm text-content-secondary">Menampilkan {firstVisibleItem}–{lastVisibleItem} dari {pagination.totalItems} aset terhapus</p>
              {pagination.totalPages > 0 && (
                <Pagination
                  currentPage={page}
                  totalPages={pagination.totalPages}
                  pageSize={limit}
                  pageSizeOptions={PAGE_SIZE_OPTIONS}
                  onPageChange={(value) => updateParams({ page: value })}
                  onPageSizeChange={(value) => updateParams({ limit: value, page: 1 })}
                  fullWidth
                />
              )}
            </div>
          </div>
        ) : (
          <div className="flex min-h-64 flex-col items-center justify-center px-6 py-12 text-center"><ArchiveRestore size={38} className="text-content-tertiary" /><h3 className="mt-4 font-bold text-content-primary">{activeQuery ? "Aset tidak ditemukan" : "Tempat sampah masih kosong"}</h3><p className="mt-2 max-w-md text-sm text-content-secondary">{activeQuery ? `Tidak ada aset terhapus yang cocok dengan “${activeQuery}”.` : "Aset yang dihapus akan tersedia di halaman ini untuk dipulihkan oleh Admin."}</p></div>
        )}
      </CardPlain>

      <Modal
        open={Boolean(pendingAction)}
        onClose={closeAction}
        title={pendingAction?.type === "delete" ? "Hapus aset secara permanen?" : "Pulihkan aset terpilih?"}
        size="sm"
      >
        <div className="space-y-5">
          {pendingAction?.type === "delete" ? (
            <Alert
              variant="critical"
              title="Tindakan ini tidak dapat dibatalkan"
              message="Data aset, komentar, statistik, thumbnail, dan file utama akan dihapus permanen. Jejak audit Admin tetap disimpan untuk kebutuhan keamanan."
            />
          ) : (
            <Alert
              variant="info"
              title="Aset akan kembali sebagai draf"
              message="Aset terpilih dapat ditinjau dan diperbaiki sebelum diterbitkan kembali."
            />
          )}

          <div className="rounded-lg bg-page-secondary p-4">
            <p className="text-sm font-semibold text-content-primary">{pendingAction?.assets.length || 0} aset dipilih</p>
            <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-sm text-content-secondary">
              {pendingAction?.assets.slice(0, 8).map((asset) => <li key={asset.id} className="truncate">• {asset.title}</li>)}
              {(pendingAction?.assets.length || 0) > 8 && <li>• dan {(pendingAction?.assets.length || 0) - 8} aset lainnya</li>}
            </ul>
          </div>

          {pendingAction?.type === "delete" && (
            <div>
              <label htmlFor="permanent-delete-confirmation" className="text-sm font-semibold text-content-primary">Ketik HAPUS PERMANEN untuk melanjutkan</label>
              <input
                id="permanent-delete-confirmation"
                value={deleteConfirmation}
                onChange={(event) => setDeleteConfirmation(event.target.value)}
                autoComplete="off"
                className="mt-2 w-full rounded-lg border border-outline-secondary bg-page-primary px-3 py-2.5 text-sm text-content-primary outline-none transition focus:border-interactive-primary focus:ring-1 focus:ring-interactive-primary"
                placeholder="HAPUS PERMANEN"
              />
            </div>
          )}

          <div className="kms-modal-actions flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button hierarchy="secondary" onClick={closeAction} disabled={actionLoading}>Batal</Button>
            <Button
              hierarchy="primary"
              prefixIcon={pendingAction?.type === "delete" ? <Trash2 size={16} /> : <RotateCcw size={16} />}
              onClick={executePendingAction}
              disabled={actionLoading || (pendingAction?.type === "delete" && deleteConfirmation !== "HAPUS PERMANEN")}
            >
              {actionLoading ? "Memproses..." : pendingAction?.type === "delete" ? "Hapus permanen" : "Pulihkan sebagai draf"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function SelectionCheckbox({ checked, indeterminate = false, onChange, label }) {
  const inputRef = useRef(null);
  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <input
      ref={inputRef}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      aria-label={label}
      className="h-4 w-4 cursor-pointer rounded border-outline-secondary accent-[var(--kms-blue)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300"
    />
  );
}
