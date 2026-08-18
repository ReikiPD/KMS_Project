import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Alert, Badge, Button, CardPlain, InputSearch, Modal, Pagination, Skeleton, Tooltip, useToast } from "@idds/react";
import { ArchiveRestore, FileText, PlayCircle, RotateCcw, Search } from "lucide-react";
import AdminPageHeader from "../../../../components/AdminPageHeader";
import { apiFetch, inputValue } from "../../../../lib/api";

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
  const [queryInput, setQueryInput] = useState(activeQuery);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [restoring, setRestoring] = useState(false);

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
  useEffect(() => { setQueryInput(activeQuery); }, [activeQuery]);

  const submitSearch = (event) => {
    event.preventDefault();
    updateParams({ q: queryInput.trim(), page: 1 });
  };

  const restoreSelectedAsset = async () => {
    if (!selectedAsset) return;
    setRestoring(true);
    setError("");
    try {
      const response = await apiFetch(`/api/assets/admin/recovery/${selectedAsset.id}`, { auth: true, method: "PATCH" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Gagal memulihkan aset");
      toast({ state: "positive", title: "Aset berhasil dipulihkan", description: result.asset?.title || selectedAsset.title, position: "top-right" });
      setSelectedAsset(null);
      if (assets.length === 1 && page > 1) updateParams({ page: page - 1 });
      else await loadDeletedAssets();
    } catch (restoreError) {
      setError(restoreError.message);
      toast({ state: "destructive", title: "Aset belum dapat dipulihkan", description: restoreError.message, position: "top-right" });
    } finally {
      setRestoring(false);
    }
  };

  const firstVisibleItem = pagination.totalItems > 0 ? (page - 1) * limit + 1 : 0;
  const lastVisibleItem = Math.min(page * limit, pagination.totalItems);

  return (
    <div className="mx-auto w-full max-w-7xl p-4 md:p-6 xl:p-8">
      <AdminPageHeader
        eyebrow="Administrasi aset"
        title="Pemulihan Aset"
        description="Tinjau dan pulihkan aset yang sebelumnya dihapus. Fitur ini hanya tersedia untuk Admin."
        breadcrumbs={[{ label: "Dasbor", href: "/admin/dashboard" }, { label: "Aset Pengetahuan", href: "/admin/assets" }, { label: "Pemulihan Aset" }]}
      />

      {error && <div className="mb-4"><Alert variant="critical" title="Pemulihan aset" message={error} /></div>}

      <CardPlain className="kms-admin-surface overflow-hidden">
        <div className="flex items-center gap-3 border-b border-border-subtle px-5 py-4">
          <span className="rounded-lg bg-primary-100 p-2 text-content-guide"><ArchiveRestore size={19} /></span>
          <div>
            <h2 className="font-bold text-content-primary">Aset yang telah dihapus</h2>
            <p className="text-sm text-content-secondary">Klik judul untuk melihat pratinjau. Aset yang dipulihkan selalu kembali sebagai draf.</p>
          </div>
        </div>

        <div className="border-b border-border-subtle bg-page-secondary/40 px-5 py-4">
          <form className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end" onSubmit={submitSearch}>
            <InputSearch
              label="Cari aset terhapus"
              value={queryInput}
              onChange={(value) => {
                const nextValue = inputValue(value);
                setQueryInput(nextValue);
                if (!nextValue && activeQuery) updateParams({ q: "", page: 1 });
              }}
              placeholder="Judul, kontributor, kategori, atau unit kerja"
            />
            <Button type="submit" hierarchy="secondary" prefixIcon={<Search size={16} />} className="w-full sm:w-auto">Cari</Button>
          </form>
        </div>

        {loading ? (
          <div className="space-y-3 p-5">{[1, 2, 3, 4].map((item) => <Skeleton key={item} height="62px" rounded="md" />)}</div>
        ) : assets.length ? (
          <div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-left text-sm">
                <thead className="bg-page-secondary text-xs uppercase tracking-wide text-content-secondary">
                  <tr><th className="px-5 py-3">Aset</th><th className="px-4 py-3">Kontributor</th><th className="px-4 py-3">Kategori / Unit Kerja</th><th className="px-4 py-3">Dihapus pada</th><th className="px-4 py-3">Status sebelumnya</th><th className="px-5 py-3 text-right">Aksi</th></tr>
                </thead>
                <tbody>
                  {assets.map((asset) => {
                    const AssetIcon = asset.asset_type === "video" ? PlayCircle : FileText;
                    return (
                      <tr key={asset.id} className="border-t border-border-subtle align-top transition-colors hover:bg-primary-50/40">
                        <td className="px-5 py-4"><div className="flex items-start gap-3"><span className="rounded-lg bg-primary-100 p-2 text-content-guide"><AssetIcon size={17} /></span><div><button type="button" onClick={() => navigate(`/admin/assets/${asset.id}?recovery=1`)} className="-m-1 line-clamp-2 cursor-pointer rounded-md px-1 py-1 text-left font-semibold text-content-primary transition-colors duration-150 hover:bg-primary-100 hover:text-content-guide hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300">{asset.title}</button><p className="mt-1 text-xs text-content-secondary">{asset.asset_type === "video" ? "Video" : "Dokumen"} · ID #{asset.id}</p></div></div></td>
                        <td className="px-4 py-4 text-content-secondary">{asset.author_name}</td>
                        <td className="px-4 py-4"><p className="text-content-primary">{asset.category_name || "Tanpa kategori"}</p><p className="mt-1 text-xs text-content-secondary">{asset.work_unit_name || "Tanpa Unit Kerja"}</p></td>
                        <td className="px-4 py-4 text-content-secondary">
                          <Tooltip variant="basic" title={`Dihapus ${deletedTimeAgo(asset.deleted_at)}`} placement="top" showArrow={true}>
                            <span className="inline-flex cursor-help rounded-sm underline decoration-dotted underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300" tabIndex={0}>
                              <time dateTime={asset.deleted_at}>{dateFormatter.format(new Date(asset.deleted_at))}</time>
                            </span>
                          </Tooltip>
                        </td>
                        <td className="px-4 py-4"><Badge type="soft" variant={asset.is_published ? "success" : "neutral"}>{asset.is_published ? "Terbit" : "Draf"}</Badge></td>
                        <td className="px-5 py-4 text-right"><Button hierarchy="secondary" size="sm" prefixIcon={<RotateCcw size={15} />} onClick={() => setSelectedAsset(asset)}>Pulihkan</Button></td>
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

      <Modal open={Boolean(selectedAsset)} onClose={() => !restoring && setSelectedAsset(null)} title="Pulihkan aset" size="sm">
        <div className="space-y-5">
          <div className="rounded-lg bg-page-secondary p-4"><p className="text-sm text-content-secondary">Aset akan dikembalikan ke daftar Aset Pengetahuan dengan status draf agar dapat ditinjau sebelum diterbitkan kembali.</p><p className="mt-2 font-bold text-content-primary">{selectedAsset?.title}</p></div>
          <div className="flex justify-end gap-2"><Button hierarchy="secondary" onClick={() => setSelectedAsset(null)} disabled={restoring}>Batal</Button><Button hierarchy="primary" prefixIcon={<RotateCcw size={16} />} onClick={restoreSelectedAsset} disabled={restoring}>{restoring ? "Memulihkan..." : "Pulihkan aset"}</Button></div>
        </div>
      </Modal>
    </div>
  );
}
