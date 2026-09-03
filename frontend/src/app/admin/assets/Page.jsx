import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Table,
  Button,
  Tooltip,
  Alert,
  Badge,
  Modal,
  Card,
  SelectDropdown,
  useToast,
} from "@idds/react";
import {
  Plus,
  Edit,
  Trash2,
  FileText,
  Video,
  Eye,
  Columns3,
  Rows3,
  Undo2,
  Star,
  MessageSquareText,
  UserRoundCheck,
  Clock3,
} from "lucide-react";
import AdminPageHeader from "../../../components/AdminPageHeader";
import AssetQuickPreview from "../../../components/AssetQuickPreview";
import EmptyState from "../../../components/EmptyState";
import MultipleSearchSelect from "../../../components/MultipleSearchSelect";
import { apiFetch } from "../../../lib/api";
import { useAuth } from "../../../contexts/AuthContext";
import { hasPermission } from "../../../lib/permissions";
import { searchSelectionsToQuery } from "../../../lib/search";
import useAdminView from "../../../hooks/useAdminView";
import { adminAssetEditPath, adminAssetPath, assetRouteReference } from "../../../lib/routes";
import { publicationStatus } from "../../../lib/publicationStatus";

const COLUMN_OPTIONS = [
  { label: "Aset Pengetahuan", value: "title" },
  { label: "Tipe", value: "asset_type" },
  { label: "Status", value: "is_published" },
  { label: "Kualitas", value: "quality" },
  { label: "Tanggal Dibuat", value: "created_at" },
];

const formatReviewDate = (value) => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Waktu keputusan tidak tersedia";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(date);
};

export default function AssetsPage() {
  const { user: authenticatedUser } = useAuth();
  const navigate = useNavigate();
  const { accessUser, employeeId, isActingAsEmployee, isAdminViewingUser, isEmployeeContext, staffMember, withEmployeeContext } = useAdminView();
  const user = accessUser || authenticatedUser || {};
  const selectedAuthorId = isEmployeeContext ? employeeId : "";
  const { toast } = useToast();
  const canCreate = hasPermission(user, "assets", "post");
  const canEdit = hasPermission(user, "assets", "edit");
  const canDelete = hasPermission(user, "assets", "delete");
  const canWrite = canCreate || canEdit || canDelete;
  const canManageFeatured = hasPermission(user, "assets", "edit") && authenticatedUser?.role === "admin" && !isEmployeeContext;
  const [data, setData] = useState([]);
  const [totalItems, setTotalItems] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  // State untuk Controlled Table
  const [searchSelections, setSearchSelections] = useState([]);
  const [fetchParams, setFetchParams] = useState({
    page: 1,
    pageSize: 10,
    sortField: null,
    sortOrder: null,
    searchTerm: "",
  });

  // State untuk Modal Konfirmasi Hapus
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [assetToDelete, setAssetToDelete] = useState(null);
  const [previewAsset, setPreviewAsset] = useState(null);
  const [reviewAsset, setReviewAsset] = useState(null);
  const [undoAsset, setUndoAsset] = useState(null);
  const [undoing, setUndoing] = useState(false);
  const [density, setDensity] = useState("compact");
  const [visibleColumns, setVisibleColumns] = useState(COLUMN_OPTIONS.map((option) => option.value));
  const [featuredSavingId, setFeaturedSavingId] = useState("");
  const undoTimerRef = useRef(null);

  const navigateScoped = useCallback((path) => {
    navigate(withEmployeeContext(path));
  }, [navigate, withEmployeeContext]);

  // Mengambil data dari Backend
  const fetchAssets = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        paginated: "true",
        page: String(fetchParams.page),
        limit: String(fetchParams.pageSize),
      });
      if (selectedAuthorId) params.set("authorId", selectedAuthorId);
      if (fetchParams.searchTerm) params.set("q", fetchParams.searchTerm);
      if (fetchParams.sortField) params.set("sortField", fetchParams.sortField);
      if (fetchParams.sortOrder) params.set("sortOrder", fetchParams.sortOrder);
      const response = await apiFetch(`/api/assets/admin?${params}`, { auth: true });

      if (!response.ok) throw new Error("Gagal mengambil data aset");

      const result = await response.json();
      setData(Array.isArray(result) ? result : (result.data || []));
      setTotalItems(Array.isArray(result) ? result.length : (result.pagination?.totalItems || 0));
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [fetchParams.page, fetchParams.pageSize, fetchParams.searchTerm, fetchParams.sortField, fetchParams.sortOrder, selectedAuthorId]);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  // Menangani Pencarian Klien
  const handleSearch = () => {
    setFetchParams((prev) => ({ ...prev, searchTerm: searchSelectionsToQuery(searchSelections), page: 1 }));
  };

  const handleFetchParamsChange = useCallback((next) => {
    setFetchParams((current) => {
      const normalized = {
        ...current,
        page: next.page || 1,
        pageSize: next.pageSize || current.pageSize,
        sortField: next.sortField || null,
        sortOrder: next.sortOrder || null,
      };
      return normalized.page === current.page
        && normalized.pageSize === current.pageSize
        && normalized.sortField === current.sortField
        && normalized.sortOrder === current.sortOrder
        ? current
        : normalized;
    });
  }, []);

  // --- LOGIKA HAPUS BARU (MENGGUNAKAN MODAL) ---

  // 1. Fungsi yang dipanggil saat tombol tong sampah diklik
  const handleDeleteClick = (asset) => {
    setAssetToDelete(asset);
    setIsDeleteModalOpen(true);
  };

  // 2. Fungsi yang dipanggil saat tombol Konfirmasi di Modal diklik
  const confirmDelete = async () => {
    const assetReference = assetRouteReference(assetToDelete);
    if (!assetReference) return;

    try {
      const response = await apiFetch(`/api/assets/${encodeURIComponent(assetReference)}`, { method: "DELETE", auth: true });

      if (!response.ok) throw new Error("Gagal menghapus aset");

      await fetchAssets();
      setUndoAsset(assetToDelete);
      if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
      undoTimerRef.current = window.setTimeout(() => setUndoAsset(null), 10000);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      // Tutup modal dan bersihkan state ID
      setIsDeleteModalOpen(false);
      setAssetToDelete(null);
    }
  };

  const undoDelete = async () => {
    const assetReference = assetRouteReference(undoAsset);
    if (!assetReference || undoing) return;
    setUndoing(true);
    try {
      const response = await apiFetch(`/api/assets/${encodeURIComponent(assetReference)}/undo-delete`, { method: "PATCH", auth: true });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Aset belum dapat dipulihkan");
      setUndoAsset(null);
      if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
      await fetchAssets();
      toast({ state: "positive", title: "Penghapusan dibatalkan", description: "Aset dipulihkan sebagai draf.", duration: 3000 });
    } catch (undoError) {
      setError(undoError.message);
    } finally {
      setUndoing(false);
    }
  };

  useEffect(() => () => {
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
  }, []);

  const processedData = { paginatedData: data, total: totalItems };

  const toggleFeatured = async (asset) => {
    const reference = assetRouteReference(asset);
    if (!reference || featuredSavingId) return;
    setFeaturedSavingId(String(reference));
    setError("");
    try {
      const response = await apiFetch(`/api/assets/admin/${encodeURIComponent(reference)}/featured`, {
        method: "PATCH",
        auth: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFeatured: !asset.is_featured }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Sorotan belum dapat diperbarui");
      setData((current) => current.map((item) => item.id === asset.id ? { ...item, is_featured: result.asset?.is_featured } : item));
      toast({ state: "positive", title: asset.is_featured ? "Aset dikeluarkan dari sorotan" : "Aset menjadi sorotan", description: result.message, duration: 3000 });
    } catch (featuredError) {
      setError(featuredError.message);
      toast({ state: "negative", title: "Sorotan belum berubah", description: featuredError.message, duration: 4000 });
    } finally {
      setFeaturedSavingId("");
    }
  };

  const searchOptions = useMemo(() => {
    const option = (group, value, description) => value ? { group, label: value, value, description } : null;
    return [
      ...data.map((item) => option("Judul Aset", item.title, item.asset_type === "video" ? "Video pembelajaran" : "Dokumen PDF")),
      ...data.map((item) => option("Kategori", item.category_name, "Kategori topik")),
      ...data.map((item) => option("Unit Kerja", item.work_unit_name, "Pemilik pengetahuan")),
      ...data.map((item) => option("Kontributor", item.author_name, "Pembuat aset")),
      option("Tipe dan Status", "Video", "Tipe aset"),
      option("Tipe dan Status", "PDF", "Tipe aset"),
      option("Tipe dan Status", "Terbit", "Status publikasi"),
      option("Tipe dan Status", "Draf", "Status publikasi"),
    ].filter(Boolean);
  }, [data]);

  // Definisi Kolom Tabel IDDS
  const columns = [
    {
      header: "Aset Pengetahuan",
      accessor: "title",
      sortable: true,
      render: (row) => (
        <div className="flex items-center space-x-3 py-1">
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
              row.asset_type === "video"
                ? "bg-red-50 text-red-500"
                : "bg-blue-50 text-blue-500"
            }`}
          >
            {row.asset_type === "video" ? (
              <Video size={20} />
            ) : (
              <FileText size={20} />
            )}
          </div>
          <div className="flex min-w-0 max-w-[18rem] flex-col">
            <Tooltip className="block min-w-0 w-full" variant="basic" title={row.title} placement="top" showArrow={true}>
              <button type="button" onClick={() => navigateScoped(adminAssetPath(row))} className="block w-full truncate text-left font-semibold text-content-primary hover:text-content-guide hover:underline focus:outline-none focus:ring-2 focus:ring-primary-300">{row.title}</button>
            </Tooltip>
            <span className="text-xs text-content-secondary">
              {row.category_name || "Tanpa Kategori"}{row.author_name ? ` · ${row.author_name}` : ""}
            </span>
          </div>
        </div>
      ),
    },
    {
      header: "Tipe",
      accessor: "asset_type",
      sortable: true,
      render: (row) => (
        <span className="capitalize text-sm text-content-secondary">
          {row.asset_type === "video" ? "Video" : "Dokumen PDF"}
        </span>
      ),
    },
    {
      header: "Status",
      accessor: "is_published",
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-1.5">
          <Badge type="soft" variant={publicationStatus(row).variant} size="sm">
            {publicationStatus(row).label}
          </Badge>
          {row.reviewed_at && row.review_note && row.publication_status !== "pending_review" && (
            <Tooltip variant="basic" title="Lihat keterangan verifikator" placement="top" showArrow={true}>
              <Button size="sm" hierarchy="tertiary" onClick={() => setReviewAsset(row)} aria-label={`Lihat keterangan verifikator untuk ${row.title}`}>
                <MessageSquareText size={16} className="text-content-guide" />
              </Button>
            </Tooltip>
          )}
        </div>
      ),
    },
    {
      header: "Kualitas",
      accessor: "quality",
      sortable: false,
      render: (row) => <Badge type="soft" variant={row.quality?.status === "complete" ? "success" : "warning"} size="sm">{row.quality?.completed || 0}/{row.quality?.total || 6}</Badge>,
    },
    {
      header: "Tanggal Dibuat",
      accessor: "created_at",
      sortable: true,
      render: (row) => {
        const date = new Date(row.created_at);
        return (
          <span className="text-sm text-content-secondary">
            {date.toLocaleDateString("id-ID")}
          </span>
        );
      },
    },
    {
      header: "Aksi",
      accessor: "actions",
      sortable: false,
      render: (row) => (
        <div className="flex items-center gap-2">
          {canManageFeatured && (
            <Tooltip variant="basic" title={!row.is_published ? "Terbitkan aset sebelum menjadikannya sorotan" : row.is_featured ? "Hapus dari Pengetahuan Sorotan" : "Tambahkan ke Pengetahuan Sorotan"} placement="top" showArrow={true}>
              <Button size="sm" hierarchy="tertiary" onClick={() => toggleFeatured(row)} disabled={!row.is_published || Boolean(featuredSavingId)} aria-label={row.is_featured ? `Hapus ${row.title} dari sorotan` : `Jadikan ${row.title} sebagai sorotan`}>
                <Star size={16} className={row.is_featured ? "fill-current text-[#F2B843]" : "text-content-secondary hover:text-[#B77900]"} />
              </Button>
            </Tooltip>
          )}
          <Tooltip variant="basic" title="Preview" placement="top" showArrow={true}>
            <Button size="sm" hierarchy="tertiary" onClick={() => setPreviewAsset(row)} aria-label={`Preview ${row.title}`}>
              <Eye size={16} className="text-content-secondary hover:text-content-guide" />
            </Button>
          </Tooltip>
          {canEdit && row.publication_status !== "pending_review" && <>
          <Tooltip
            variant="basic"
            title="Edit Aset"
            placement="top"
            showArrow={true}
          >
            <Button
              size="sm"
              hierarchy="tertiary"
              onClick={() => navigateScoped(adminAssetEditPath(row))}
            >
              <Edit size={16} className="text-content-secondary hover:text-content-guide" />
            </Button>
          </Tooltip>

          </>}
          {canDelete && <>
          <Tooltip
            variant="basic"
            title="Hapus Aset"
            placement="top"
            showArrow={true}
          >
            <Button
              size="sm"
              hierarchy="tertiary"
              onClick={() => handleDeleteClick(row)}
            >
              <Trash2 size={16} className="text-content-secondary hover:text-status-danger" />
            </Button>
          </Tooltip>
          </>}
        </div>
      ),
    },
  ];
  const displayColumns = columns.filter((column) => {
    if (column.accessor === "actions") return true;
    return visibleColumns.includes(column.accessor);
  });

  return (
    <div className="mx-auto w-full max-w-7xl p-4 md:p-6 xl:p-8">
      <AdminPageHeader eyebrow={isActingAsEmployee ? "Mode kerja Pegawai" : isAdminViewingUser ? "Mode akses akun" : "Manajemen Pengetahuan"} title="Katalog Aset Pengetahuan" description={isEmployeeContext ? `Aset ${staffMember?.full_name || "akun terpilih"}; aksi mengikuti hak akses role akun tersebut.` : user.role === "admin" ? "Kelola aset seluruh Pegawai melalui Manajemen Pegawai atau mode kerja Pegawai." : canWrite ? "Kelola dokumen dan media yang Anda buat, dari draf hingga publikasi." : "Lihat aset pengetahuan sesuai hak akses role Anda."} breadcrumbs={[{ label: "Dasbor", href: withEmployeeContext("/admin/dashboard") }, { label: "Aset Pengetahuan" }]} actions={canCreate ? <Button hierarchy="primary" onClick={() => navigateScoped("/admin/assets/create")} prefixIcon={<Plus size={18} />}>Tambah aset</Button> : null} />

      {error && (
        <div className="mb-4">
          <Alert variant="critical" title="Aset tidak dapat dimuat" message={error} />
        </div>
      )}

      <Card className="kms-admin-surface p-4 md:p-6">
        <div className="mb-6 grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
          <div className="grid max-w-3xl gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <MultipleSearchSelect
            label="Cari aset"
            selected={searchSelections}
            onSelect={(values) => {
              setSearchSelections(values);
              if (!values.length) setFetchParams((prev) => ({ ...prev, searchTerm: "", page: 1 }));
            }}
            options={searchOptions}
            placeholder="Ketik lalu pilih judul, kategori, unit, atau kontributor"
            helperText=""
          />
          <Button hierarchy="secondary" onClick={handleSearch}>
            Cari
          </Button>
          </div>
          <div className="kms-assets-table-controls flex flex-wrap items-end justify-end gap-2">
            <div className="min-w-[12rem]"><SelectDropdown label="Kolom tabel" options={COLUMN_OPTIONS} selected={visibleColumns} onSelect={(values) => setVisibleColumns(values.length ? values : ["title"])} multiple indicator="check" width="100%" /></div>
            <Tooltip variant="basic" title={density === "compact" ? "Gunakan baris nyaman" : "Padatkan baris tabel"} placement="top" showArrow={true}><Button hierarchy="secondary" onClick={() => setDensity((value) => value === "compact" ? "comfortable" : "compact")} prefixIcon={density === "compact" ? <Rows3 size={16} /> : <Columns3 size={16} />}>{density === "compact" ? "Nyaman" : "Ringkas"}</Button></Tooltip>
          </div>
        </div>

        <div className={`kms-admin-table-shell kms-admin-table-shell--page kms-admin-table-shell--${density} kms-assets-table`}>
        {!isLoading && processedData.total === 0 ? <EmptyState title="Belum ada aset yang sesuai" description="Ubah pencarian atau buat aset pengetahuan baru." actionLabel={canCreate ? "Tambah aset" : undefined} onAction={canCreate ? () => navigateScoped("/admin/assets/create") : undefined} /> : <Table
          columns={displayColumns}
          data={processedData.paginatedData}
          total={processedData.total}
          loading={isLoading}
          onFetchParamsChange={handleFetchParamsChange}
          initialPageSize={10}
          pageSizeOptions={[10, 20, 50]}
          initialSortField={null}
          initialSortOrder={null}
          showSearch={false}
          rowKey="id"
          striped
        />}
        </div>
      </Card>

      {undoAsset && <aside className="kms-undo-toast" role="status"><div><strong>Aset dipindahkan ke pemulihan</strong><p>{undoAsset.title}</p></div><Button hierarchy="secondary" size="sm" prefixIcon={<Undo2 size={15} />} onClick={undoDelete} disabled={undoing}>{undoing ? "Memulihkan…" : "Batalkan"}</Button></aside>}

      <AssetQuickPreview asset={previewAsset} open={Boolean(previewAsset)} onClose={() => setPreviewAsset(null)} detailPath={previewAsset ? withEmployeeContext(adminAssetPath(previewAsset)) : undefined} />

      <Modal open={Boolean(reviewAsset)} onClose={() => setReviewAsset(null)} title="Keterangan verifikator" size="md">
        {reviewAsset && <div className="space-y-5">
          <div className="rounded-xl border border-border-subtle bg-page-secondary p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-content-guide">Aset pengetahuan</p>
                <h3 className="mt-1 break-words text-lg font-bold text-content-primary">{reviewAsset.title}</h3>
              </div>
              <Badge type="soft" variant={publicationStatus(reviewAsset).variant} size="sm">{publicationStatus(reviewAsset).label}</Badge>
            </div>
            <div className="mt-4 grid gap-2 text-sm text-content-secondary sm:grid-cols-2">
              <span className="inline-flex items-center gap-2"><UserRoundCheck size={16} className="text-content-guide" />{reviewAsset.reviewer_name || "Verifikator KMS"}</span>
              <span className="inline-flex items-center gap-2"><Clock3 size={16} className="text-content-guide" />{formatReviewDate(reviewAsset.reviewed_at)}</span>
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-content-primary">Catatan keputusan</p>
            <p className="mt-2 whitespace-pre-wrap rounded-xl border border-border-subtle bg-page-primary p-4 text-sm leading-6 text-content-secondary">{reviewAsset.review_note}</p>
          </div>
          <div className="flex justify-end"><Button hierarchy="secondary" onClick={() => setReviewAsset(null)}>Tutup</Button></div>
        </div>}
      </Modal>

      {/* MODAL KONFIRMASI HAPUS */}
      <Modal
        open={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Konfirmasi Hapus Data"
        dialogClassname="ina-modal__dialog--size-md"
      >
        <div>
          <p className="text-content-secondary">
            Aset <strong>{assetToDelete?.title}</strong> akan diarsipkan dan tidak lagi tampil pada katalog publik. Anda dapat membatalkannya selama beberapa detik setelah penghapusan.
          </p>
          <div className="kms-modal-actions mt-8 flex justify-end gap-3">
            <Button
              hierarchy="secondary"
              onClick={() => setIsDeleteModalOpen(false)}
            >
              Batal
            </Button>

            {/* Tombol Confirm diberi styling merah agar sesuai dengan UX tindakan destruktif */}
            <Button
              hierarchy="primary"
              className="kms-text-on-color !bg-red-600 hover:!bg-red-700 !border-red-600 hover:!border-red-700"
              onClick={confirmDelete}
            >
              Ya, Hapus
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
