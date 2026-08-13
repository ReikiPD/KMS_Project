import { useState, useEffect } from 'react';
import { PlusCircle, FolderKanban, Tags, Building2, Activity, FileText, Video, ExternalLink } from 'lucide-react';
import { Button } from '@idds/react';
import { Link } from 'react-router-dom';

const DashboardPage = () => {
  const user = JSON.parse(localStorage.getItem('kms_user') || '{}');
  
  // State untuk menyimpan data aset terbaru
  const [recentAssets, setRecentAssets] = useState([]);
  const [loading, setLoading] = useState(true);

  // Mengambil data aset terbaru saat dasbor dimuat
  useEffect(() => {
    const fetchRecentAssets = async () => {
      try {
        const token = localStorage.getItem('kms_token');
        const response = await fetch('http://localhost:3000/api/assets/admin', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
          const data = await response.json(); 
          setRecentAssets(data);
        }
      } catch (error) {
        console.error('Gagal memuat aset terbaru', error);
      } finally {
        setLoading(false);
      }
    };

    fetchRecentAssets();
  }, []);

  const QuickActionCard = ({ title, description, icon: Icon, colorClass, linkTo }) => (
    <Link 
      to={linkTo}
      className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 hover:border-blue-400 hover:shadow-md transition-all duration-300 flex flex-col text-left group"
    >
      <div className={`p-3 rounded-lg w-12 h-12 flex items-center justify-center mb-4 ${colorClass}`}>
        <Icon className="w-6 h-6" />
      </div>
      <h3 className="text-lg font-bold text-slate-800 group-hover:text-blue-600 transition">
        {title}
      </h3>
      <p className="text-sm text-slate-500 mt-2 flex-1">
        {description}
      </p>
      <div className="mt-4 flex items-center text-sm font-medium text-blue-600">
        <PlusCircle className="w-4 h-4 mr-1" /> Tambah Baru
      </div>
    </Link>
  );

  // Format tanggal menjadi format lokal Indonesia
  const formatDate = (dateString) => {
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return new Date(dateString).toLocaleDateString('id-ID', options);
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto w-full">
      <header className="mb-10">
        <h1 className="text-3xl font-bold text-slate-800">
          Panel Kontrol Pegawai
        </h1>
        <p className="text-slate-500 mt-2">
          Selamat bekerja, <span className="font-semibold text-slate-700">{user.full_name}</span>. Kelola basis pengetahuan Kemenhub dari sini.
        </p>
      </header>

      <div className="mb-12">
        <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center">
          <Activity className="w-5 h-5 mr-2 text-blue-600" /> Operasi Sistem
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <QuickActionCard 
            title="Aset Pengetahuan" 
            description="Unggah dokumen regulasi, artikel kebijakan, atau pedoman teknis baru."
            icon={FolderKanban}
            colorClass="bg-blue-50 text-blue-600"
            linkTo="/admin/assets/create"
          />
          <QuickActionCard 
            title="Kategori Topik" 
            description="Buat klasifikasi baru untuk mengelompokkan berbagai jenis dokumen."
            icon={Tags}
            colorClass="bg-green-50 text-green-600" 
            linkTo="/admin/categories"
          />
          <QuickActionCard 
            title="Unit Kerja" 
            description="Tambahkan atau perbarui data unit kerja operasional di lingkungan instansi."
            icon={Building2}
            colorClass="bg-amber-50 text-amber-600"
            linkTo="/admin/work-units"
          />
        </div>
      </div>

      {/* Area Monitoring Aktivitas Dinamis */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="flex justify-between items-center p-6 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-800">Aset Terbaru Anda</h2>
          
          <Button variant="secondary" size="small" onClick={() => {/* Akan diarahkan ke /admin/assets nanti */}}>
            Lihat Semua
          </Button>
        </div>
        
        {loading ? (
          <div className="p-10 text-center text-slate-500">Memuat data...</div>
        ) : recentAssets.length === 0 ? (
          <div className="p-10 text-center">
            <div className="border-2 border-dashed border-slate-200 rounded-lg p-10 bg-slate-50/50">
              <FolderKanban className="w-12 h-12 mx-auto text-slate-300 mb-3" />
              <p className="text-slate-700 font-medium">Belum ada data yang ditampilkan.</p>
              <p className="text-sm text-slate-500 mt-1">Silakan buat aset baru menggunakan menu di atas.</p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {recentAssets.map((asset) => (
              <div key={asset.id} className="p-4 md:p-6 hover:bg-slate-50 transition-colors flex items-center justify-between">
                <div className="flex items-start gap-4">
                  {/* Ikon Dinamis berdasarkan tipe aset */}
                  <div className={`p-3 rounded-lg mt-1 shrink-0 ${
                    asset.asset_type === 'video' ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-500'
                  }`}>
                    {asset.asset_type === 'video' ? <Video size={20} /> : <FileText size={20} />}
                  </div>
                  
                  <div>
                    <h3 className="font-semibold text-slate-800 line-clamp-1">{asset.title}</h3>
                    <div className="flex flex-wrap items-center gap-3 mt-1 text-xs md:text-sm text-slate-500">
                      <span>{formatDate(asset.created_at)}</span>
                      <span className="hidden md:inline">•</span>
                      <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-600">
                        {asset.category_name || 'Tanpa Kategori'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Status Publikasi */}
                <div className="shrink-0 flex items-center gap-4">
                  <span className={`hidden md:inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                    asset.is_published 
                      ? 'bg-emerald-100 text-emerald-700' 
                      : 'bg-amber-100 text-amber-700'
                  }`}>
                    {asset.is_published ? 'Dipublikasikan' : 'Draf'}
                  </span>
                  
                  <button className="text-slate-400 hover:text-blue-600 p-2 transition-colors">
                    <ExternalLink size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
};

export default DashboardPage;