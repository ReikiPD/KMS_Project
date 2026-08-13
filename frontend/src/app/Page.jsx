import { useState, useEffect } from "react";
import {
  FileText,
  File,
  Video,
  ChevronLeft,
  ChevronRight,
  Building2,
} from "lucide-react";

const Page = () => {
  const [assets, setAssets] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchAssets = async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `http://localhost:3000/api/assets/homepage?page=${currentPage}&limit=6`,
        );
        if (!response.ok) throw new Error("Gagal mengambil data dari server");

        const result = await response.json();
        setAssets(result.data);
        setPagination(result.pagination);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchAssets();
  }, [currentPage]);

  const renderAssetIcon = (type) => {
    switch (type) {
      case "pdf":
        return <File className="w-4 h-4 mr-1" />;
      case "video":
        return <Video className="w-4 h-4 mr-1" />;
      default:
        return <FileText className="w-4 h-4 mr-1" />;
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <header className="mb-10 text-center md:text-left">
        <h1 className="text-3xl font-bold text-slate-800">
          Aset Pengetahuan Terbaru
        </h1>
        <p className="text-slate-500 mt-2">
          Jelajahi regulasi, SOP, dan literatur Kementerian Perhubungan
        </p>
      </header>

      {loading && (
        <p className="text-center text-blue-600 animate-pulse mt-10">
          Memuat data pengetahuan...
        </p>
      )}
      {error && (
        <p className="text-center text-red-500 bg-red-100 p-4 rounded-lg mt-10">
          Error: {error}
        </p>
      )}

      {!loading && !error && assets.length === 0 && (
        <p className="text-center text-slate-500 mt-10">
          Belum ada aset pengetahuan yang dipublikasikan.
        </p>
      )}

      {/* Grid Kartu Aset */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {assets.map((asset) => (
          <article
            key={asset.id}
            className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-shadow duration-300 flex flex-col"
          >
            <div className="h-48 bg-slate-100 relative group cursor-pointer">
              {asset.thumbnail_url ? (
                <img
                  src={asset.thumbnail_url}
                  alt={asset.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="flex flex-col items-center justify-center w-full h-full text-slate-400">
                  {renderAssetIcon(asset.asset_type)}
                  <span className="text-sm mt-2">Pratinjau tidak tersedia</span>
                </div>
              )}

              {/* Badge Kategori (Kiri Atas) */}
              <span className="absolute top-3 left-3 bg-blue-600 text-white text-xs font-semibold px-2 py-1 rounded-md shadow">
                {asset.category?.name || "Umum"}
              </span>

              {/* Badge Tipe File (Kanan Atas) */}
              <span className="absolute top-3 right-3 bg-slate-900/80 backdrop-blur-sm text-white text-xs font-semibold px-2 py-1 rounded-md flex items-center shadow">
                {renderAssetIcon(asset.asset_type)}
                <span className="uppercase">{asset.asset_type}</span>
              </span>

              {/* Badge Unit Kerja (Kiri Bawah) */}
              {asset.work_unit && (
                <span className="absolute bottom-3 left-3 bg-yellow-500 text-slate-900 text-xs font-semibold px-2 py-1 rounded-md flex items-center shadow">
                  <Building2 className="w-3 h-3 mr-1" />
                  {asset.work_unit.name}
                </span>
              )}
            </div>

            <div className="p-5 flex-1 flex flex-col">
              <h2 className="text-lg font-bold mb-2 leading-tight text-slate-800 hover:text-blue-600 cursor-pointer transition line-clamp-2">
                {asset.title}
              </h2>
              <p className="text-slate-600 text-sm mb-4 line-clamp-3 flex-1">
                {asset.summary}
              </p>

              <div className="mt-auto pt-4 border-t border-slate-100 flex justify-between items-center text-xs text-slate-500">
                <span className="truncate pr-2 font-medium text-slate-700">
                  {asset.author?.full_name || "Anonim"}
                </span>
                <span>
                  {new Date(asset.created_at).toLocaleDateString("id-ID", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </div>
            </div>
          </article>
        ))}
      </div>

      {/* Komponen Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex justify-center items-center mt-12 space-x-4">
          <button
            onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
            disabled={pagination.currentPage === 1}
            className="p-2 rounded-md bg-white border border-slate-300 text-slate-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <span className="text-slate-600 font-medium">
            Halaman {pagination.currentPage} dari {pagination.totalPages}
          </span>

          <button
            onClick={() =>
              setCurrentPage((prev) =>
                Math.min(prev + 1, pagination.totalPages),
              )
            }
            disabled={pagination.currentPage === pagination.totalPages}
            className="p-2 rounded-md bg-white border border-slate-300 text-slate-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
};

export default Page;
