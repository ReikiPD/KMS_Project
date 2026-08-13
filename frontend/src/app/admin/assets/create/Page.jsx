import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { Button, TextField, SelectDropdown, FileUpload, Alert } from '@idds/react';

export default function CreateAssetPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [categories, setCategories] = useState([]);
  const [workUnits, setWorkUnits] = useState([]);

  // State Form Teks
  const [formData, setFormData] = useState({
    title: '',
    asset_type: 'document', // Default diubah ke document/video
    summary: '',
    content: '',
    category_id: null,
    work_unit_id: null,
    is_published: 'false',
  });
  
  // State File Dipisah
  const [thumbnailFiles, setThumbnailFiles] = useState([]);
  const [documentFiles, setDocumentFiles] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [catRes, wuRes] = await Promise.all([
          fetch('http://localhost:3000/api/assets/categories'),
          fetch('http://localhost:3000/api/assets/work-units')
        ]);
        
        if (catRes.ok) setCategories(await catRes.json());
        if (wuRes.ok) setWorkUnits(await wuRes.json());
      } catch (err) {
        console.error('Gagal mengambil data master', err);
      }
    };
    fetchData();
  }, []);

  const categoryOptions = categories.map(c => ({ label: c.name, value: c.id.toString() }));
  const workUnitOptions = workUnits.map(w => ({ label: w.name, value: w.id.toString() }));
  const typeOptions = [
    { label: 'Dokumen / Pedoman (PDF)', value: 'document' },
    { label: 'Video / Media', value: 'video' }
  ];
  const statusOptions = [
    { label: 'Simpan sebagai Draf', value: 'false' },
    { label: 'Publikasikan Langsung', value: 'true' }
  ];

  // Penanganan Thumbnail
  const handleThumbnailChange = (newFiles, validationErrors) => {
    setThumbnailFiles(newFiles);
    if (validationErrors?.length > 0) {
      setError(`Error Thumbnail: ${validationErrors[0].message}`);
    } else {
      setError('');
    }
  };
  const handleRemoveThumbnail = (file, index) => {
    setThumbnailFiles(thumbnailFiles.filter((_, i) => i !== index));
  };

  // Penanganan File Utama (Dokumen/Video)
  const handleDocumentChange = (newFiles, validationErrors) => {
    setDocumentFiles(newFiles);
    if (validationErrors?.length > 0) {
      setError(`Error Dokumen: ${validationErrors[0].message}`);
    } else {
      setError('');
    }
  };
  const handleRemoveDocument = (file, index) => {
    setDocumentFiles(documentFiles.filter((_, i) => i !== index));
  };

  // Submit Form
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    const slug = formData.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

    try {
      const token = localStorage.getItem('kms_token');
      const submitData = new FormData();
      
      submitData.append('title', formData.title);
      submitData.append('slug', slug);
      submitData.append('asset_type', formData.asset_type);
      submitData.append('summary', formData.summary);
      submitData.append('content', formData.content);
      submitData.append('is_published', formData.is_published);
      
      if (formData.category_id) submitData.append('category_id', formData.category_id);
      if (formData.work_unit_id) submitData.append('work_unit_id', formData.work_unit_id);
      
      // Lampirkan kedua file secara terpisah
      if (thumbnailFiles.length > 0) {
        submitData.append('thumbnail', thumbnailFiles[0]);
      }
      if (documentFiles.length > 0) {
        submitData.append('file', documentFiles[0]); 
      }

      const response = await fetch('http://localhost:3000/api/assets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: submitData,
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.error || 'Gagal menyimpan aset');

      setSuccess('Aset pengetahuan berhasil ditambahkan!');
      
      setTimeout(() => {
        navigate('/admin/dashboard');
      }, 2000);

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto w-full">
      
      <div className="flex items-center gap-4 mb-8">
        <Button hierarchy="tertiary" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft size={20} />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-content-primary">Tambah Aset Baru</h1>
          <p className="text-sm text-content-secondary mt-1">
            Unggah dokumen regulasi atau video panduan ke dalam sistem.
          </p>
        </div>
      </div>

      {error && <div className="mb-6"><Alert variant="danger" message={error} /></div>}
      {success && <div className="mb-6"><Alert variant="success" message={success} /></div>}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 md:p-8">
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="col-span-1 md:col-span-2">
              <TextField
                label="Judul Aset"
                value={formData.title}
                onChange={(val) => setFormData({ ...formData, title: typeof val === 'string' ? val : val?.target?.value || '' })}
                placeholder="Masukkan judul dokumen atau video..."
                showClearButton
              />
            </div>

            <div>
              <SelectDropdown
                options={categoryOptions}
                selected={formData.category_id}
                onSelect={(val) => setFormData({ ...formData, category_id: val })}
                label="Kategori Topik"
                placeholder="Pilih Kategori"
                indicator="check"
              />
            </div>

            <div>
              <SelectDropdown
                options={workUnitOptions}
                selected={formData.work_unit_id}
                onSelect={(val) => setFormData({ ...formData, work_unit_id: val })}
                label="Unit Kerja Pemilik"
                placeholder="Pilih Unit Kerja"
                indicator="check"
              />
            </div>

            <div>
              <SelectDropdown
                options={typeOptions}
                selected={formData.asset_type}
                onSelect={(val) => setFormData({ ...formData, asset_type: val })}
                label="Tipe Aset"
                placeholder="Pilih Tipe Aset"
                indicator="check"
              />
            </div>

            <div>
              <SelectDropdown
                options={statusOptions}
                selected={formData.is_published}
                onSelect={(val) => setFormData({ ...formData, is_published: val })}
                label="Status Publikasi"
                placeholder="Pilih Status"
                indicator="check"
              />
            </div>
          </div>

          <hr className="border-slate-200 my-2" />

          <div>
            <TextField
              label="Ringkasan Singkat"
              value={formData.summary}
              onChange={(val) => setFormData({ ...formData, summary: typeof val === 'string' ? val : val?.target?.value || '' })}
              placeholder="Tuliskan deskripsi atau ringkasan singkat mengenai aset ini..."
              showClearButton
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-content-primary">Konten Lengkap / Detail Tambahan</label>
            <textarea
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              placeholder="Tuliskan detail tambahan di sini..."
              className="w-full min-h-[150px] p-3 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all resize-y text-sm text-slate-700"
            />
          </div>

<hr className="border-slate-200 my-2" />

          {/* UBAH BAGIAN INI: Ganti grid menjadi flex-col agar tersusun atas-bawah */}
          <div className="flex flex-col gap-6 mb-2">
            
            {/* Upload Thumbnail */}
            <div className="w-full">
              <FileUpload
                label="Unggah Gambar Thumbnail (Max 2MB)"
                maxSize={2 * 1024 * 1024}
                onChange={handleThumbnailChange}
                onRemove={handleRemoveThumbnail}
              />
              <p className="text-xs text-slate-500 mt-2">
                *Wajib gambar sampul (JPG, PNG).
              </p>
            </div>

            {/* Upload File Utama (PDF/Video) */}
            <div className="w-full">
              <FileUpload
                label="Unggah File Utama (Max 20MB)"
                maxSize={20 * 1024 * 1024}
                onChange={handleDocumentChange}
                onRemove={handleRemoveDocument}
              />
              <p className="text-xs text-slate-500 mt-2">
                *Sesuai tipe aset (PDF, DOCX, MP4).
              </p>
            </div>

          </div>

          <div className="flex justify-end gap-3 mt-4">
            <Button 
              type="button" 
              hierarchy="secondary" 
              onClick={() => navigate('/admin/dashboard')}
              disabled={loading}
            >
              Batal
            </Button>
            <Button 
              type="submit" 
              hierarchy="primary"
              disabled={loading || !formData.title}
            >
              {loading ? 'Menyimpan...' : (
                <span className="flex items-center gap-2">
                  <Save size={18} /> Simpan Aset
                </span>
              )}
            </Button>
          </div>

        </form>
      </div>
    </div>
  );
}