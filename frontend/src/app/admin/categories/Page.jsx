import { useState, useEffect } from 'react';
import { Button, TextField, Alert, Card, useToast, Modal, Tooltip } from '@idds/react';
import { Plus, Trash2, LayoutList } from 'lucide-react';
import AdminPageHeader from '../../../components/AdminPageHeader';
import { apiFetch } from '../../../lib/api';

export default function CategoryPage() {
  const { toast } = useToast();

  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [error, setError] = useState('');

  // Form State
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  // State untuk Modal Hapus
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);

  const fetchCategories = async () => {
    try {
      const res = await apiFetch('/api/assets/categories');
      if (res.ok) {
        const data = await res.json();
        setCategories(data);
      }
    } catch (err) {
      console.error('Gagal mengambil data kategori', err);
    } finally {
      setFetchLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

    try {
      const response = await apiFetch('/api/assets/categories', {
        method: 'POST',
        auth: true,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, slug, description }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Gagal menambahkan kategori');

      toast({
        state: 'positive',
        title: 'Berhasil',
        description: 'Kategori baru berhasil ditambahkan.',
        duration: 3000,
      });

      setName('');
      setDescription('');
      fetchCategories();
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
      const response = await apiFetch(`/api/assets/categories/${itemToDelete}`, {
        method: 'DELETE',
        auth: true,
      });

      if (!response.ok) throw new Error('Gagal menghapus kategori');
      
      toast({
        state: 'positive',
        title: 'Terhapus',
        description: 'Kategori berhasil dihapus dari sistem.',
        duration: 3000,
      });
      
      fetchCategories();
    } catch (err) {
      toast({
        state: 'negative',
        title: 'Gagal',
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
      <AdminPageHeader eyebrow="Manajemen Pengetahuan" title="Kategori Topik" description="Kelola klasifikasi agar katalog KMS mudah dieksplorasi." breadcrumbs={[{ label: 'Dasbor', href: '/admin/dashboard' }, { label: 'Kategori Topik' }]} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1">
          <Card className="p-6">
            <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Plus size={18} className="text-blue-600" /> Tambah Baru
            </h2>
            
            {error && <div className="mb-4"><Alert variant="critical" title="Kategori belum tersimpan" message={error} /></div>}

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <TextField
                label="Nama Kategori"
                value={name}
                onChange={(val) => setName(typeof val === 'string' ? val : val?.target?.value || '')}
                placeholder="Misal: Regulasi IT"
                required
              />
              
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-slate-800">Deskripsi Singkat</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Penjelasan kategori..."
                  className="w-full min-h-[100px] p-3 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-sm text-slate-700 resize-none"
                />
              </div>

              <Button type="submit" hierarchy="primary" disabled={loading || !name} className="mt-2">
                {loading ? 'Menyimpan...' : 'Simpan Kategori'}
              </Button>
            </form>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card className="p-6">
            <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <LayoutList size={18} className="text-blue-600" /> Daftar Kategori Tersedia
            </h2>

            {fetchLoading ? (
              <div className="text-center py-10 text-slate-500">Memuat data...</div>
            ) : categories.length === 0 ? (
              <div className="text-center py-10 border-2 border-dashed border-slate-200 rounded-lg text-slate-500">
                Belum ada kategori yang ditambahkan.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-600">
                  <thead className="text-xs text-slate-700 uppercase bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Nama Kategori</th>
                      <th className="px-4 py-3 font-semibold">Deskripsi</th>
                      <th className="px-4 py-3 font-semibold text-right w-24">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map((cat) => (
                      <tr key={cat.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-800">{cat.name}</td>
                        <td className="px-4 py-3">{cat.description || '-'}</td>
                        <td className="px-4 py-3 text-right">
                          <Tooltip variant="basic" title="Hapus Kategori" placement="top" showArrow={true}>
                            <Button size="sm" hierarchy="tertiary" onClick={() => handleDeleteClick(cat.id)}>
                              <Trash2 size={16} className="text-slate-500 hover:text-red-600" />
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

      {/* Modal Konfirmasi Hapus Kategori */}
      <Modal
        open={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Konfirmasi Hapus Data"
        dialogClassname="ina-modal__dialog--size-md"
      >
        <div>
          <p className="text-slate-700">
            Apakah Anda yakin ingin menghapus kategori ini? 
          </p>
          <div className="flex gap-3 mt-8 justify-end">
            <Button hierarchy="secondary" onClick={() => setIsDeleteModalOpen(false)}>
              Batal
            </Button>
            <Button hierarchy="primary" className="!bg-red-600 hover:!bg-red-700 !border-red-600 hover:!border-red-700 text-white" onClick={confirmDelete}>
              Ya, Hapus
            </Button>
          </div>
        </div>
      </Modal>

    </div>
  );
}
