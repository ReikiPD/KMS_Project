import { useState, useEffect } from 'react';
import { Button, TextField, Alert } from '@idds/react';
import { Tags, Plus, Trash2, LayoutList } from 'lucide-react';

export default function CategoryPage() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form State
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const fetchCategories = async () => {
    try {
      const res = await fetch('http://localhost:3000/api/assets/categories');
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
    setSuccess('');

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

    try {
      const token = localStorage.getItem('kms_token');
      const response = await fetch('http://localhost:3000/api/assets/categories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ name, slug, description }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Gagal menambahkan kategori');

      setSuccess('Kategori berhasil ditambahkan!');
      setName('');
      setDescription('');
      fetchCategories(); // Refresh daftar
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Yakin ingin menghapus kategori ini?')) return;

    try {
      const token = localStorage.getItem('kms_token');
      const response = await fetch(`http://localhost:3000/api/categories/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) throw new Error('Gagal menghapus kategori');
      fetchCategories();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto w-full">
      <div className="flex items-center gap-3 mb-8">
        <div className="p-3 bg-green-50 text-green-600 rounded-lg">
          <Tags size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Kategori Topik</h1>
          <p className="text-sm text-slate-500 mt-1">Kelola klasifikasi dokumen dan aset pengetahuan.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Kolom Kiri: Form Tambah Kategori */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Plus size={18} className="text-blue-600" /> Tambah Baru
            </h2>
            
            {error && <div className="mb-4"><Alert variant="danger" message={error} /></div>}
            {success && <div className="mb-4"><Alert variant="success" message={success} /></div>}

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
          </div>
        </div>

        {/* Kolom Kanan: Daftar Kategori */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
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
                      <th className="px-4 py-3 font-semibold text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map((cat) => (
                      <tr key={cat.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-800">{cat.name}</td>
                        <td className="px-4 py-3">{cat.description || '-'}</td>
                        <td className="px-4 py-3 text-right">
                          <button 
                            onClick={() => handleDelete(cat.id)}
                            className="p-1.5 text-red-500 hover:bg-red-50 rounded-md transition-colors"
                            title="Hapus Kategori"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}