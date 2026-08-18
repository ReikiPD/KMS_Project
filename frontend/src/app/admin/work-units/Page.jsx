import { useState, useEffect } from "react";
import {
  Button,
  TextField,
  Alert,
  Card,
  useToast,
  Modal,
  Tooltip,
} from "@idds/react";
import {
  Plus,
  Trash2,
  LayoutList,
} from "lucide-react";
import AdminPageHeader from "../../../components/AdminPageHeader";
import { apiFetch } from "../../../lib/api";

export default function WorkUnitPage() {
  const { toast } = useToast();

  const [workUnits, setWorkUnits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [error, setError] = useState("");

  const [name, setName] = useState("");

  // State untuk Modal Hapus
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);

  const fetchWorkUnits = async () => {
    try {
      const res = await apiFetch("/api/assets/work-units");
      if (res.ok) {
        const data = await res.json();
        setWorkUnits(data);
      }
    } catch (err) {
      console.error("Gagal mengambil data unit kerja", err);
    } finally {
      setFetchLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkUnits();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await apiFetch(
        "/api/assets/work-units",
        {
          method: "POST",
          auth: true,
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name }),
        },
      );

      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Gagal menambahkan unit kerja");

      toast({
        state: "positive",
        title: "Berhasil",
        description: "Unit kerja baru berhasil ditambahkan.",
        duration: 3000,
      });

      setName("");
      fetchWorkUnits();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (id) => {
    setItemToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;

    try {
      const response = await apiFetch(
        `/api/assets/work-units/${itemToDelete}`,
        {
          method: "DELETE",
          auth: true,
        },
      );

      if (!response.ok) throw new Error("Gagal menghapus unit kerja");

      toast({
        state: "positive",
        title: "Terhapus",
        description: "Unit kerja berhasil dihapus dari sistem.",
        duration: 3000,
      });

      fetchWorkUnits();
    } catch (err) {
      toast({
        state: "negative",
        title: "Gagal",
        description: err.message,
        duration: 4000,
      });
    } finally {
      setIsDeleteModalOpen(false);
      setItemToDelete(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl p-4 md:p-6 xl:p-8">
      <AdminPageHeader eyebrow="Manajemen Pengetahuan" title="Unit Kerja" description="Kelola unit kerja yang menjadi konteks setiap pengetahuan KMS." breadcrumbs={[{ label: "Dasbor", href: "/admin/dashboard" }, { label: "Unit Kerja" }]} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1">
          <Card className="p-6">
            <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Plus size={18} className="text-blue-600" /> Tambah Unit Kerja
            </h2>

            {error && (
              <div className="mb-4">
                <Alert variant="critical" title="Unit kerja belum tersimpan" message={error} />
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <TextField
                label="Nama Unit Kerja"
                value={name}
                onChange={(val) =>
                  setName(
                    typeof val === "string" ? val : val?.target?.value || "",
                  )
                }
                placeholder="Misal: BKT Pusat"
                required
              />

              <Button
                type="submit"
                hierarchy="primary"
                disabled={loading || !name}
                className="mt-2"
              >
                {loading ? "Menyimpan..." : "Simpan Unit Kerja"}
              </Button>
            </form>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card className="p-6">
            <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <LayoutList size={18} className="text-blue-600" /> Daftar Unit
              Kerja
            </h2>

            {fetchLoading ? (
              <div className="text-center py-10 text-slate-500">
                Memuat data...
              </div>
            ) : workUnits.length === 0 ? (
              <div className="text-center py-10 border-2 border-dashed border-slate-200 rounded-lg text-slate-500">
                Belum ada unit kerja yang ditambahkan.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-600">
                  <thead className="text-xs text-slate-700 uppercase bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 font-semibold">
                        Nama Unit Kerja
                      </th>
                      <th className="px-4 py-3 font-semibold text-right w-24">
                        Aksi
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {workUnits.map((wu) => (
                      <tr
                        key={wu.id}
                        className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                      >
                        <td className="px-4 py-3 font-medium text-slate-800">
                          {wu.name}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Tooltip
                            variant="basic"
                            title="Hapus Unit Kerja"
                            placement="top"
                            showArrow={true}
                          >
                            <Button
                              size="sm"
                              hierarchy="tertiary"
                              onClick={() => handleDeleteClick(wu.id)}
                            >
                              <Trash2
                                size={16}
                                className="text-slate-500 hover:text-red-600"
                              />
                            </Button>
                          </Tooltip>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Modal Konfirmasi Hapus Unit Kerja */}
      <Modal
        open={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Konfirmasi Hapus Data"
        dialogClassname="ina-modal__dialog--size-md"
      >
        <div>
          <p className="text-slate-700">
            Apakah Anda yakin ingin menghapus unit kerja ini secara permanen?
          </p>
          <div className="flex gap-3 mt-8 justify-end">
            <Button
              hierarchy="secondary"
              onClick={() => setIsDeleteModalOpen(false)}
            >
              Batal
            </Button>
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
