import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Table,
  Button,
  Tooltip,
  TextField,
  Alert,
  Badge,
  Modal,
  Card,
} from "@idds/react";
import {
  Plus,
  Edit,
  Trash2,
  FileText,
  Video,
} from "lucide-react";
import AdminPageHeader from "../../../components/AdminPageHeader";
import { apiFetch, currentUser } from "../../../lib/api";
import useAdminView from "../../../hooks/useAdminView";

export default function AssetsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const user = currentUser() || {};
  const selectedAuthorId = searchParams.get("authorId") || "";
  const { isActingAsEmployee, isAdminViewingUser, staffMember, withEmployeeContext } = useAdminView();
  const canWrite = ["pegawai", "admin"].includes(user.role) && !isAdminViewingUser;
  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  // State untuk Controlled Table
  const [searchTerm, setSearchTerm] = useState("");
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
      const response = await apiFetch(`/api/assets/admin${selectedAuthorId ? `?authorId=${selectedAuthorId}` : ""}`, { auth: true });

      if (!response.ok) throw new Error("Gagal mengambil data aset");

      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [selectedAuthorId]);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  // Menangani Pencarian Klien
  const handleSearch = () => {
    setFetchParams((prev) => ({ ...prev, searchTerm: searchTerm, page: 1 }));
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleSearch();
  };

  // --- LOGIKA HAPUS BARU (MENGGUNAKAN MODAL) ---

  // 1. Fungsi yang dipanggil saat tombol tong sampah diklik
  const handleDeleteClick = (id) => {
    setAssetToDelete(id);
    setIsDeleteModalOpen(true);
  };

  // 2. Fungsi yang dipanggil saat tombol Konfirmasi di Modal diklik
  const confirmDelete = async () => {
    if (!assetToDelete) return;

    try {
      const response = await apiFetch(`/api/assets/${assetToDelete}`, { method: "DELETE", auth: true });

      if (!response.ok) throw new Error("Gagal menghapus aset");

      fetchAssets(); // Refresh tabel setelah hapus berhasil
      setError(""); // Hapus error jika sebelumnya ada
    } catch (err) {
      setError(err.message);
    } finally {
      // Tutup modal dan bersihkan state ID
      setIsDeleteModalOpen(false);
      setAssetToDelete(null);
    }
  };

  // Filter & Pagination di sisi Klien
  const processedData = useMemo(() => {
    let filtered = [...data];

    // Pencarian
    if (fetchParams.searchTerm) {
      const lowercasedTerm = fetchParams.searchTerm.toLowerCase();
      filtered = filtered.filter(
        (item) =>
          item.title.toLowerCase().includes(lowercasedTerm) ||
          (item.category_name &&
            item.category_name.toLowerCase().includes(lowercasedTerm)),
      );
    }

    // Sorting
    if (fetchParams.sortField) {
      filtered.sort((a, b) => {
        const fieldA = a[fetchParams.sortField];
        const fieldB = b[fetchParams.sortField];
        let comparison = 0;
        if (fieldA > fieldB) comparison = 1;
        else if (fieldA < fieldB) comparison = -1;
        return fetchParams.sortOrder === "desc" ? comparison * -1 : comparison;
      });
    }

    // Pagination
    const startIndex = (fetchParams.page - 1) * fetchParams.pageSize;
    const paginated = filtered.slice(
      startIndex,
      startIndex + fetchParams.pageSize,
    );

    return { paginatedData: paginated, total: filtered.length };
  }, [data, fetchParams]);

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
            <button type="button" onClick={() => navigateScoped(`/admin/assets/${row.id}`)} className="line-clamp-1 text-left font-semibold text-slate-800 hover:text-content-guide hover:underline focus:outline-none focus:ring-2 focus:ring-primary-300">
              {row.title}
            </button>
            <span className="text-xs text-slate-500">
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
        <span className="capitalize text-sm text-slate-600">
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
          <span className="text-sm text-slate-600">
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
              <Edit size={16} className="text-slate-500 hover:text-blue-600" />
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
              onClick={() => handleDeleteClick(row.id)}
            >
              <Trash2 size={16} className="text-slate-500 hover:text-red-600" />
            </Button>
          </Tooltip>
        </div>
      ),
    },
  ];
  const displayColumns = canWrite ? columns : columns.filter((column) => column.accessor !== "actions");

  return (
    <div className="mx-auto w-full max-w-7xl p-4 md:p-6 xl:p-8">
      <AdminPageHeader eyebrow={isActingAsEmployee ? "Mode kerja Pegawai" : isAdminViewingUser ? "Mode pantau akun" : "Manajemen Pengetahuan"} title="Katalog Aset Pengetahuan" description={isActingAsEmployee ? `Anda mengelola aset atas nama ${staffMember?.full_name || "Pegawai terpilih"}.` : isAdminViewingUser ? `Admin sedang melihat aset ${staffMember?.full_name || "akun terpilih"} dalam mode baca.` : selectedAuthorId ? "Aset pegawai yang dipilih. Pimpinan hanya memiliki akses baca." : user.role === "admin" ? "Kelola aset seluruh Pegawai melalui Manajemen Pegawai atau mode kerja Pegawai." : canWrite ? "Kelola dokumen dan media yang Anda buat, dari draf hingga publikasi." : "Lihat aset pengetahuan seluruh pegawai dalam mode baca."} breadcrumbs={[{ label: "Dasbor", href: withEmployeeContext("/admin/dashboard") }, { label: "Aset Pengetahuan" }]} actions={canWrite ? <Button hierarchy="primary" onClick={() => navigateScoped("/admin/assets/create")} prefixIcon={<Plus size={18} />}>Tambah aset</Button> : null} />

      {error && (
        <div className="mb-4">
          <Alert variant="critical" title="Aset tidak dapat dimuat" message={error} />
        </div>
      )}

      <Card className="p-6">
        <div className="flex items-center gap-2 mb-6 max-w-md">
          <div className="flex-1">
            <TextField
              value={searchTerm}
              onChange={(val) =>
                setSearchTerm(
                  typeof val === "string" ? val : val?.target?.value || "",
                )
              }
              placeholder="Cari berdasarkan judul atau kategori..."
              showClearButton
              onClear={() => {
                setSearchTerm("");
                setFetchParams((prev) => ({
                  ...prev,
                  searchTerm: "",
                  page: 1,
                }));
              }}
              onKeyDown={handleKeyDown}
            />
          </div>
          <Button hierarchy="secondary" onClick={handleSearch}>
            Cari
          </Button>
        </div>

        <Table
          columns={displayColumns}
          data={processedData.paginatedData}
          total={processedData.total}
          loading={isLoading}
          onFetchParamsChange={setFetchParams}
          initialPageSize={10}
          pageSizeOptions={[10, 20, 50]}
          initialSortField={null}
          initialSortOrder={null}
          showSearch={false}
          rowKey="id"
          striped
        />
      </Card>

      {/* MODAL KONFIRMASI HAPUS */}
      <Modal
        open={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Konfirmasi Hapus Data"
        dialogClassname="ina-modal__dialog--size-md"
      >
        <div>
          <p className="text-slate-700">
            Aset akan diarsipkan dan tidak lagi tampil pada katalog publik.
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
              className="!bg-red-600 hover:!bg-red-700 !border-red-600 hover:!border-red-700 text-white"
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
