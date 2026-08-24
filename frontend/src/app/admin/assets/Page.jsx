import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
} from "lucide-react";
import AdminPageHeader from "../../../components/AdminPageHeader";
import AssetQuickPreview from "../../../components/AssetQuickPreview";
import EmptyState from "../../../components/EmptyState";
import MultipleSearchSelect from "../../../components/MultipleSearchSelect";
import { apiFetch, currentUser } from "../../../lib/api";
import { searchSelectionsToQuery } from "../../../lib/search";
import useAdminView from "../../../hooks/useAdminView";

const COLUMN_OPTIONS = [
  { label: "Aset Pengetahuan", value: "title" },
  { label: "Tipe", value: "asset_type" },
  { label: "Status", value: "is_published" },
  { label: "Kualitas", value: "quality" },
  { label: "Tanggal Dibuat", value: "created_at" },
];

export default function AssetsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const user = currentUser() || {};
  const selectedAuthorId = searchParams.get("authorId") || "";
  const { isActingAsEmployee, isAdminViewingUser, staffMember, withEmployeeContext } = useAdminView();
  const { toast } = useToast();
  const canWrite = ["pegawai", "admin"].includes(user.role) && !isAdminViewingUser;
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
  const [undoAsset, setUndoAsset] = useState(null);
  const [undoing, setUndoing] = useState(false);
  const [density, setDensity] = useState("compact");
  const [visibleColumns, setVisibleColumns] = useState(COLUMN_OPTIONS.map((option) => option.value));
  const undoTimerRef = useRef(null);

  const navigateScoped = useCallback((path) => {
    const target = new URL(path, window.location.origin);
    if (selectedAuthorId) target.searchParams.set("authorId", selectedAuthorId);
    navigate(withEmployeeContext(`${target.pathname}${target.search}`));
  }, [navigate, selectedAuthorId, withEmployeeContext]);

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
    if (!assetToDelete?.id) return;

    try {
      const response = await apiFetch(`/api/assets/${assetToDelete.id}`, { method: "DELETE", auth: true });

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
    if (!undoAsset?.id || undoing) return;
    setUndoing(true);
    try {
      const response = await apiFetch(`/api/assets/${undoAsset.id}/undo-delete`, { method: "PATCH", auth: true });
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
          <div className="flex min-w-0 flex-col">
            <Tooltip variant="basic" title={row.title} placement="top" showArrow={true}>
              <button type="button" onClick={() => navigateScoped(`/admin/assets/${row.id}`)} className="line-clamp-1 text-left font-semibold text-content-primary hover:text-content-guide hover:underline focus:outline-none focus:ring-2 focus:ring-primary-300">
                {row.title}
              </button>
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
        <span
          className={`px-2.5 py-1 rounded-full text-xs font-medium ${
            row.is_published
              ? "bg-emerald-100 text-emerald-700"
              : "bg-amber-100 text-amber-700"
          }`}
        >
          {row.is_published ? "Dipublikasikan" : "Draf"}
        </span>
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
          <Tooltip variant="basic" title="Pratinjau cepat" placement="top" showArrow={true}>
            <Button size="sm" hierarchy="tertiary" onClick={() => setPreviewAsset(row)} aria-label={`Pratinjau cepat ${row.title}`}>
              <Eye size={16} className="text-content-secondary hover:text-content-guide" />
            </Button>
          </Tooltip>
          {canWrite && <>
          <Tooltip
            variant="basic"
            title="Edit Aset"
            placement="top"
            showArrow={true}
          >
            <Button
              size="sm"
              hierarchy="tertiary"
              onClick={() => navigateScoped(`/admin/assets/edit/${row.id}`)}
            >
              <Edit size={16} className="text-content-secondary hover:text-content-guide" />
            </Button>
          </Tooltip>

          {/* Mengubah onClick menjadi handleDeleteClick(row.id) */}
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
      <AdminPageHeader eyebrow={isActingAsEmployee ? "Mode kerja Pegawai" : isAdminViewingUser ? "Mode pantau akun" : "Manajemen Pengetahuan"} title="Katalog Aset Pengetahuan" description={isActingAsEmployee ? `Anda mengelola aset atas nama ${staffMember?.full_name || "Pegawai terpilih"}.` : isAdminViewingUser ? `Admin sedang melihat aset ${staffMember?.full_name || "akun terpilih"} dalam mode baca.` : selectedAuthorId ? "Aset pegawai yang dipilih. Pimpinan hanya memiliki akses baca." : user.role === "admin" ? "Kelola aset seluruh Pegawai melalui Manajemen Pegawai atau mode kerja Pegawai." : canWrite ? "Kelola dokumen dan media yang Anda buat, dari draf hingga publikasi." : "Lihat aset pengetahuan seluruh pegawai dalam mode baca."} breadcrumbs={[{ label: "Dasbor", href: withEmployeeContext("/admin/dashboard") }, { label: "Aset Pengetahuan" }]} actions={canWrite ? <Button hierarchy="primary" onClick={() => navigateScoped("/admin/assets/create")} prefixIcon={<Plus size={18} />}>Tambah aset</Button> : null} />

      {error && (
        <div className="mb-4">
          <Alert variant="critical" title="Aset tidak dapat dimuat" message={error} />
        </div>
      )}

      <Card className="p-6">
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
          <div className="flex flex-wrap items-end justify-end gap-2">
            <div className="min-w-[12rem]"><SelectDropdown label="Kolom tabel" options={COLUMN_OPTIONS} selected={visibleColumns} onSelect={(values) => setVisibleColumns(values.length ? values : ["title"])} multiple indicator="check" width="100%" /></div>
            <Tooltip variant="basic" title={density === "compact" ? "Gunakan baris nyaman" : "Padatkan baris tabel"} placement="top" showArrow={true}><Button hierarchy="secondary" onClick={() => setDensity((value) => value === "compact" ? "comfortable" : "compact")} prefixIcon={density === "compact" ? <Rows3 size={16} /> : <Columns3 size={16} />}>{density === "compact" ? "Nyaman" : "Ringkas"}</Button></Tooltip>
          </div>
        </div>

        <div className={`kms-admin-table-shell kms-admin-table-shell--page kms-admin-table-shell--${density}`}>
        {!isLoading && processedData.total === 0 ? <EmptyState title="Belum ada aset yang sesuai" description="Ubah pencarian atau buat aset pengetahuan baru." actionLabel={canWrite ? "Tambah aset" : undefined} onAction={canWrite ? () => navigateScoped("/admin/assets/create") : undefined} /> : <Table
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

      <AssetQuickPreview asset={previewAsset} open={Boolean(previewAsset)} onClose={() => setPreviewAsset(null)} detailPath={previewAsset ? withEmployeeContext(`/admin/assets/${previewAsset.id}`) : undefined} />

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
          <div className="flex gap-3 mt-8 justify-end">
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
