import { useState, useEffect } from 'react';
import { Button, TextField, Alert } from '@idds/react';
import { Building2, Plus, Trash2, LayoutList } from 'lucide-react';

export default function WorkUnitPage() {
  const [workUnits, setWorkUnits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [name, setName] = useState('');

  const fetchWorkUnits = async () => {
    try {
      const res = await fetch('http://localhost:3000/api/assets/work-units');
      if (res.ok) {
        const data = await res.json();
        setWorkUnits(data);
      }
    } catch (err) {
      console.error('Gagal mengambil data unit kerja', err);
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
    setError('');
    setSuccess('');

    try {
      const token = localStorage.getItem('kms_token');
      const response = await fetch('http://localhost:3000/api/assets/work-units', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ name }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Gagal menambahkan unit kerja');

      setSuccess('Unit kerja berhasil ditambahkan!');
      setName('');
      fetchWorkUnits();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Yakin ingin menghapus unit kerja ini?')) return;

    try {
      const token = localStorage.getItem('kms_token');
      const response = await fetch(`http://localhost:3000/api/work-units/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) throw new Error('Gagal menghapus unit kerja');
      fetchWorkUnits();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto w-full">
      <div className="flex items-center gap-3 mb-8">
        <div className="p-3 bg-amber-50 text-amber-600 rounded-lg">
          <Building2 size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Unit Kerja</h1>
          <p className="text-sm text-slate-500 mt-1">Kelola data unit kerja di lingkungan instansi.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Kolom Kiri: Form Tambah */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Plus size={18} className="text-blue-600" /> Tambah Unit Kerja
            </h2>
            
            {error && <div className="mb-4"><Alert variant="danger" message={error} /></div>}
            {success && <div className="mb-4"><Alert variant="success" message={success} /></div>}

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <TextField
                label="Nama Unit Kerja"
                value={name}
                onChange={(val) => setName(typeof val === 'string' ? val : val?.target?.value || '')}
                placeholder="Misal: BKT Pusat"
                required
              />

              <Button type="submit" hierarchy="primary" disabled={loading || !name} className="mt-2">
                {loading ? 'Menyimpan...' : 'Simpan Unit Kerja'}
              </Button>
            </form>
          </div>
        </div>

        {/* Kolom Kanan: Daftar Unit Kerja */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <LayoutList size={18} className="text-blue-600" /> Daftar Unit Kerja
            </h2>

            {fetchLoading ? (
              <div className="text-center py-10 text-slate-500">Memuat data...</div>
            ) : workUnits.length === 0 ? (
              <div className="text-center py-10 border-2 border-dashed border-slate-200 rounded-lg text-slate-500">
                Belum ada unit kerja yang ditambahkan.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-600">
                  <thead className="text-xs text-slate-700 uppercase bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Nama Unit Kerja</th>
                      <th className="px-4 py-3 font-semibold text-right w-24">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workUnits.map((wu) => (
                      <tr key={wu.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-800">{wu.name}</td>
                        <td className="px-4 py-3 text-right">
                          <button 
                            onClick={() => handleDelete(wu.id)}
                            className="p-1.5 text-red-500 hover:bg-red-50 rounded-md transition-colors"
                            title="Hapus Unit Kerja"
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