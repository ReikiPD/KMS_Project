import { useState, useEffect, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Table, Button, Tooltip, TextField, Alert, Modal } from "@idds/react";
import {
  Home,
  ChevronRight,
  Plus,
  Edit,
  Trash2,
  FileText,
  Video,
} from "lucide-react";

export default function AssetsPage() {
  const navigate = useNavigate();
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

  // Mengambil data dari Backend
  const fetchAssets = async () => {
    setIsLoading(true);
    setError("");
    try {
      const token = localStorage.getItem("kms_token");
      const response = await fetch("http://localhost:3000/api/assets/admin", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error("Gagal mengambil data aset");

      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAssets();
  }, []);

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
      const token = localStorage.getItem("kms_token");
      const response = await fetch(
        `http://localhost:3000/api/assets/${assetToDelete}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        },
      );

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
          <div className="flex flex-col">
            <span className="font-semibold text-slate-800 line-clamp-1">
              {row.title}
            </span>
            <span className="text-xs text-slate-500">
              {row.category_name || "Tanpa Kategori"}
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
              onClick={() => navigate(`/admin/assets/edit/${row.id}`)}
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

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto w-full">
      <nav className="flex items-center text-sm text-slate-500 mb-6">
        <Link
          to="/admin/dashboard"
          className="flex items-center hover:text-blue-600 transition-colors"
        >
          <Home size={16} className="mr-1.5" /> Dasbor
        </Link>
        <ChevronRight size={16} className="mx-2 text-slate-400" />
        <span className="font-medium text-slate-800">Daftar Aset</span>
      </nav>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            Katalog Aset Pengetahuan
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Kelola seluruh dokumen dan media yang telah Anda buat.
          </p>
        </div>
        <Button
          hierarchy="primary"
          onClick={() => navigate("/admin/assets/create")}
        >
          <Plus size={18} className="mr-2" /> Tambah Aset
        </Button>
      </div>

      {error && (
        <div className="mb-4">
          <Alert variant="danger" message={error} />
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
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
          columns={columns}
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
      </div>

      {/* MODAL KONFIRMASI HAPUS */}
      <Modal
        open={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Konfirmasi Hapus Data"
        dialogClassname="ina-modal__dialog--size-md"
      >
        <div>
          <p className="text-slate-700">
            Apakah Anda yakin ingin menghapus aset pengetahuan ini secara
            permanen? Tindakan ini tidak dapat dibatalkan.
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
