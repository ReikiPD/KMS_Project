import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, ChevronRight, ExternalLink, FileText, Home, Image as ImageIcon, Save, Undo2 } from "lucide-react";
import {
  Alert,
  Breadcrumb,
  Button,
  SelectDropdown,
  SingleFileUpload,
  Stepper,
  TextField,
  useToast,
} from "@idds/react";
import AssetQualityPanel from "../../../../components/AssetQualityPanel";
import VideoFileInput from "../../../../components/VideoFileInput";
import VideoMetadataFields from "../../../../components/VideoMetadataFields";
import { getVideoChapterValidation } from "../../../../lib/video";
import useDraftAutosave from "../../../../hooks/useDraftAutosave";
import { apiFetch, currentUser, inputValue, uploadUrl } from "../../../../lib/api";
import { getAssetQuality } from "../../../../lib/assetQuality";
import useAdminView from "../../../../hooks/useAdminView";

const FORM_STEPS = [
  { label: "Informasi" },
  { label: "Konten" },
  { label: "Media" },
  { label: "Tinjau & simpan" },
];

export default function EditAssetPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const user = currentUser() || {};
  const isAdmin = user.role === "admin";
  const { isActingAsEmployee, staffMember, withEmployeeContext } = useAdminView();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentStep, setCurrentStep] = useState(0);
  const [categories, setCategories] = useState([]);
  const [workUnits, setWorkUnits] = useState([]);
  const [staff, setStaff] = useState([]);
  const [initialData, setInitialData] = useState(null);
  const [formData, setFormData] = useState({
    title: "",
    asset_type: "document",
    content: "",
    category_id: null,
    work_unit_id: null,
    is_published: "false",
    video_duration_seconds: "",
    video_chapters: [],
    authorId: "",
  });
  const [existingThumbnail, setExistingThumbnail] = useState(null);
  const [existingFile, setExistingFile] = useState(null);
  const [thumbnailFiles, setThumbnailFiles] = useState([]);
  const [documentFiles, setDocumentFiles] = useState([]);

  const quality = useMemo(
    () => getAssetQuality({
      formData,
      hasThumbnail: Boolean(thumbnailFiles[0] || existingThumbnail),
      hasFile: Boolean(documentFiles[0] || existingFile),
    }),
    [formData, thumbnailFiles, documentFiles, existingThumbnail, existingFile],
  );
  const { status: autosaveStatus, lastSavedAt, retry: retryAutosave } = useDraftAutosave({
    ready: !fetchLoading,
    draftId: !fetchLoading && formData.is_published === "false" ? id : null,
    formData,
    thumbnailFiles,
    documentFiles,
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [assetResponse, categoryResponse, workUnitResponse, staffResponse] = await Promise.all([
          apiFetch(`/api/assets/admin/${id}${searchParams.get("authorId") ? `?authorId=${searchParams.get("authorId")}` : ""}`, { auth: true }),
          apiFetch("/api/assets/categories"),
          apiFetch("/api/assets/work-units"),
          isAdmin ? apiFetch("/api/users/staff", { auth: true }) : Promise.resolve(null),
        ]);
        if (categoryResponse.ok) setCategories(await categoryResponse.json());
        if (workUnitResponse.ok) setWorkUnits(await workUnitResponse.json());
        if (staffResponse?.ok) { const staffData = await staffResponse.json(); setStaff(staffData.data || staffData); }
        if (!assetResponse.ok) throw new Error("Aset tidak ditemukan");

        const asset = await assetResponse.json();
        const formattedData = {
          title: asset.title || "",
          asset_type: asset.asset_type || "document",
          content: asset.content || "",
          category_id: asset.category_id ? asset.category_id.toString() : null,
          work_unit_id: asset.work_unit_id ? asset.work_unit_id.toString() : null,
          is_published: asset.is_published ? "true" : "false",
          video_duration_seconds: asset.video_duration_seconds ?? "",
          video_chapters: Array.isArray(asset.video_chapters) ? asset.video_chapters : [],
          authorId: asset.author_id ? String(asset.author_id) : "",
        };
        setFormData(formattedData);
        setInitialData(formattedData);
        setExistingThumbnail(asset.thumbnail_url);
        setExistingFile(asset.file_url);
      } catch (fetchError) {
        toast({ state: "negative", title: "Error", description: `Gagal memuat data aset: ${fetchError.message}`, duration: 4000 });
        navigate(withEmployeeContext("/admin/assets"));
      } finally {
        setFetchLoading(false);
      }
    };
    fetchData();
  }, [id, navigate, toast, isAdmin, searchParams, withEmployeeContext]);

  const categoryOptions = categories.map((category) => ({ label: category.name, value: category.id.toString() }));
  const workUnitOptions = workUnits.map((unit) => ({ label: unit.name, value: unit.id.toString() }));
  const contributor = staff.find((member) => String(member.id) === String(formData.authorId));
  const typeOptions = [
    { label: "Dokumen / Pedoman (PDF)", value: "document" },
    { label: "Video / Media", value: "video" },
  ];
  const statusOptions = [
    { label: "Simpan sebagai Draf", value: "false" },
    { label: "Publikasikan Langsung", value: "true" },
  ];
  const breadcrumbItems = [
    { label: "Dasbor", href: withEmployeeContext("/admin/dashboard"), icon: <Home size={16} /> },
    { label: "Daftar Aset", href: withEmployeeContext("/admin/assets") },
    { label: "Edit Aset" },
  ];

  const goToNextStep = () => {
    if (currentStep === 0 && !formData.title.trim()) {
      setError("Isi judul aset terlebih dahulu sebelum melanjutkan.");
      return;
    }
    if (currentStep === 2 && formData.asset_type === "video") {
      const validation = getVideoChapterValidation(formData);
      if (validation.chapterPastDuration) {
        setError(`${validation.message} Perbaiki pada bagian Bab / timestamp sebelum melanjutkan.`);
        return;
      }
    }
    setError("");
    setCurrentStep((step) => Math.min(step + 1, FORM_STEPS.length - 1));
  };

  const handleUndoChanges = () => {
    if (!initialData) return;
    setFormData(initialData);
    setThumbnailFiles([]);
    setDocumentFiles([]);
    setError("");
    toast({ state: "positive", title: "Perubahan dibatalkan", description: "Formulir dikembalikan ke data awal.", duration: 2500 });
  };
  const handleThumbnailChange = (newFile, validationError) => {
    setThumbnailFiles(newFile ? [newFile] : []);
    setError(validationError ? `Error Thumbnail: ${validationError.error}` : "");
  };
  const handleDocumentChange = (newFile, validationError) => {
    setDocumentFiles(newFile ? [newFile] : []);
    setError(validationError ? `Error Dokumen: ${validationError.error}` : "");
  };
  const handleVideoChange = (file, message) => {
    setDocumentFiles(file ? [file] : []);
    setError(message || "");
  };
  const handleVideoDurationDetected = (duration) => setFormData((current) => ({ ...current, video_duration_seconds: String(duration) }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (formData.asset_type === "video") {
      const validation = getVideoChapterValidation(formData);
      if (validation.chapterPastDuration) {
        setCurrentStep(2);
        setError(`${validation.message} Perbaiki pada bagian Bab / timestamp sebelum menyimpan.`);
        return;
      }
    }
    if (formData.is_published === "true" && !quality.complete && !window.confirm("Kualitas aset belum lengkap. Publikasikan tetap?")) return;

    setLoading(true);
    setError("");
    const slug = formData.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "");
    try {
      const submitData = new FormData();
      submitData.append("title", formData.title);
      submitData.append("slug", slug);
      submitData.append("asset_type", formData.asset_type);
      if (formData.authorId) submitData.append("authorId", formData.authorId);
      submitData.append("content", formData.content);
      if (formData.video_duration_seconds !== "") submitData.append("video_duration_seconds", formData.video_duration_seconds);
      submitData.append("video_chapters", JSON.stringify(formData.video_chapters || []));
      submitData.append("is_published", formData.is_published);
      if (formData.category_id) submitData.append("category_id", formData.category_id);
      if (formData.work_unit_id) submitData.append("work_unit_id", formData.work_unit_id);
      if (thumbnailFiles[0]) submitData.append("thumbnail", thumbnailFiles[0]);
      if (documentFiles[0]) submitData.append("file", documentFiles[0]);

      const response = await apiFetch(`/api/assets/${id}`, {
        method: "PUT",
        auth: true,
        body: submitData,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || data.error || "Gagal memperbarui aset");

      toast({ state: "positive", title: "Berhasil", description: "Aset pengetahuan berhasil diperbarui.", duration: 3000 });
      setTimeout(() => navigate(withEmployeeContext("/admin/assets")), 1500);
    } catch (submitError) {
      toast({ state: "negative", title: "Gagal Menyimpan", description: submitError.message, duration: 4000 });
    } finally {
      setLoading(false);
    }
  };

  if (fetchLoading) return <div className="p-10 text-center text-content-secondary animate-pulse">Memuat data aset...</div>;

  return (
    <div className="mx-auto w-full max-w-4xl p-4 md:p-8">
      <div className="mb-6"><Breadcrumb items={breadcrumbItems} separator={<ChevronRight size={16} className="text-slate-400" />} /></div>
      <div className="mb-8 flex items-center gap-4">
        <Button hierarchy="tertiary" size="sm" onClick={() => navigate(-1)} aria-label="Kembali"><ArrowLeft size={20} /></Button>
        <div>
          <h1 className="text-2xl font-bold text-content-primary">Edit Aset Pengetahuan</h1>
          <p className="mt-1 text-sm text-content-secondary">{isActingAsEmployee ? `Memperbarui aset atas nama ${staffMember?.full_name || "Pegawai terpilih"}.` : "Perbarui aset dengan langkah yang lebih terarah."}</p>
        </div>
      </div>
      {error && <div className="mb-6"><Alert variant="danger" message={error} /></div>}

      <div className="kms-admin-form-surface p-6 md:p-8">
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <div className="border-b border-outline-secondary pb-5">
            <Stepper
              steps={FORM_STEPS}
              currentStep={currentStep}
              orientation="horizontal"
              className="kms-asset-stepper"
              onStepClick={(step) => { if (step <= currentStep) setCurrentStep(step); }}
            />
            <p className="mt-3 text-sm text-content-secondary" aria-live="polite">Langkah {currentStep + 1} dari {FORM_STEPS.length}: {FORM_STEPS[currentStep].label}</p>
          </div>

          {currentStep === 0 && (
            <section className="grid grid-cols-1 gap-5 md:grid-cols-2" aria-label="Informasi aset">
              <div className="md:col-span-2"><TextField label="Judul Aset" value={formData.title} onChange={(value) => setFormData({ ...formData, title: inputValue(value) })} placeholder="Masukkan judul dokumen atau video..." showClearButton /></div>
              {isAdmin && (
                <div className="md:col-span-2 rounded-lg border border-outline-secondary bg-page-secondary px-4 py-3">
                  <p className="text-sm font-semibold text-content-primary">Pegawai kontributor</p>
                  <p className="mt-1 text-sm text-content-secondary">
                    {isActingAsEmployee ? (staffMember?.full_name || "Pegawai terpilih") : contributor ? `${contributor.full_name}${contributor.department ? ` — ${contributor.department}` : ""}` : "Pegawai tidak aktif"}
                  </p>
                  <p className="mt-1 text-xs text-content-tertiary">Kontributor tidak diubah saat memperbarui aset.</p>
                </div>
              )}
              <SelectDropdown options={categoryOptions} selected={formData.category_id} onSelect={(value) => setFormData({ ...formData, category_id: value })} label="Kategori Topik" placeholder="Pilih Kategori" indicator="check" />
              <SelectDropdown options={workUnitOptions} selected={formData.work_unit_id} onSelect={(value) => setFormData({ ...formData, work_unit_id: value })} label="Unit Kerja Pemilik" placeholder="Pilih Unit Kerja" indicator="check" />
              <SelectDropdown options={typeOptions} selected={formData.asset_type} onSelect={(value) => setFormData({ ...formData, asset_type: value })} label="Tipe Aset" placeholder="Pilih Tipe Aset" indicator="check" />
              <SelectDropdown options={statusOptions} selected={formData.is_published} onSelect={(value) => setFormData({ ...formData, is_published: value })} label="Status Publikasi" placeholder="Pilih Status" indicator="check" />
            </section>
          )}

          {currentStep === 1 && (
            <section className="flex flex-col gap-5" aria-label="Konten aset">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="asset-content" className="text-sm font-semibold text-content-primary">Konten Lengkap / Detail Tambahan</label>
                <textarea id="asset-content" value={formData.content} onChange={(event) => setFormData({ ...formData, content: event.target.value })} placeholder="Tuliskan detail tambahan di sini..." className="min-h-[180px] w-full resize-y rounded-lg border border-outline-secondary bg-page-primary p-3 text-sm text-content-primary outline-none transition-all focus:border-interactive-primary focus:ring-1 focus:ring-interactive-primary" />
              </div>
            </section>
          )}

          {currentStep === 2 && (
            <section className="flex flex-col gap-6" aria-label="Media aset">
              <div className="rounded-lg border border-info-subtle bg-info-subtle p-4 text-sm text-content-secondary"><strong className="text-content-primary">Manajemen file</strong><p className="mt-1">Unggah file baru hanya bila ingin menggantikan file yang tersimpan. Kosongkan area unggah untuk mempertahankan file lama.</p></div>
              <div className="w-full">
                <label className="mb-2 block text-sm font-semibold text-content-primary">Gambar Thumbnail Saat Ini</label>
                {existingThumbnail ? <FilePreview icon={<ImageIcon size={18} />} fileName={existingThumbnail} /> : <p className="mb-4 text-sm italic text-content-secondary">Belum ada gambar thumbnail yang diunggah.</p>}
                <SingleFileUpload title="Ganti gambar thumbnail" description="JPG, PNG, atau WebP · maksimal 2 MB" accept="image/jpeg,image/png,image/webp" allowedExtensions={["jpg", "jpeg", "png", "webp"]} maxSize={2 * 1024 * 1024} onChange={handleThumbnailChange} onRemove={() => setThumbnailFiles([])} />
              </div>
              <div className="w-full">
                <label className="mb-2 block text-sm font-semibold text-content-primary">File Utama Saat Ini</label>
                {existingFile ? <FilePreview icon={<FileText size={18} />} fileName={existingFile} /> : <p className="mb-4 text-sm italic text-content-secondary">Belum ada file dokumen/video yang diunggah.</p>}
                {formData.asset_type === "video" ? <VideoFileInput label="Ganti Video Utama (opsional)" file={documentFiles[0]} onChange={handleVideoChange} onDurationDetected={handleVideoDurationDetected} onRemove={() => setDocumentFiles([])} /> : <SingleFileUpload title="Ganti dokumen utama" description="PDF · maksimal 20 MB" accept="application/pdf" allowedExtensions={["pdf"]} maxSize={20 * 1024 * 1024} onChange={handleDocumentChange} onRemove={() => setDocumentFiles([])} />}
              </div>
              {formData.asset_type === "video" && <VideoMetadataFields value={formData} onChange={setFormData} />}
            </section>
          )}

          {currentStep === 3 && (
            <section className="flex flex-col gap-5" aria-label="Tinjau aset">
              <div className="rounded-lg bg-page-secondary p-4 text-sm text-content-secondary"><p className="font-semibold text-content-primary">Siap diperbarui</p><p className="mt-1">Tinjau kelengkapan aset sebelum {formData.is_published === "true" ? "menerbitkan perubahan" : "menyimpannya sebagai draf"}.</p></div>
              <AssetQualityPanel quality={quality} />
            </section>
          )}

          {formData.is_published === "false" && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-page-secondary px-3 py-2 text-xs text-content-secondary">
              <span>{autosaveStatus === "saving" ? "Menyimpan draf…" : autosaveStatus === "saved" ? `Draf tersimpan${lastSavedAt ? ` pada ${lastSavedAt.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}` : ""}` : autosaveStatus === "failed" ? "Draf belum tersimpan" : "Perubahan draf akan tersimpan otomatis."}</span>
              {autosaveStatus === "failed" && <Button hierarchy="tertiary" size="sm" type="button" onClick={retryAutosave}>Coba lagi</Button>}
            </div>
          )}

          <div className="flex flex-col-reverse justify-between gap-3 border-t border-outline-secondary pt-5 sm:flex-row sm:items-center">
            <Button type="button" hierarchy="secondary" onClick={() => navigate(withEmployeeContext("/admin/assets"))} disabled={loading}>Batal</Button>
            <div className="flex flex-wrap justify-end gap-3">
              {currentStep > 0 && <Button type="button" hierarchy="secondary" onClick={() => setCurrentStep((step) => step - 1)} disabled={loading}>Kembali</Button>}
              {currentStep < FORM_STEPS.length - 1 ? (
                <Button type="button" hierarchy="primary" onClick={goToNextStep} disabled={loading}><span className="flex items-center gap-2">Lanjutkan <ArrowRight size={18} /></span></Button>
              ) : (
                <><Button type="button" hierarchy="tertiary" onClick={handleUndoChanges} disabled={loading}><span className="flex items-center gap-2"><Undo2 size={16} /> Batalkan perubahan</span></Button><Button type="submit" hierarchy="primary" disabled={loading || !formData.title}>{loading ? "Menyimpan..." : <span className="flex items-center gap-2"><Save size={18} /> Perbarui Aset</span>}</Button></>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function FilePreview({ icon, fileName }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-outline-secondary bg-page-secondary p-3">
      <div className="flex min-w-0 items-center gap-3"><div className="shrink-0 rounded bg-page-primary p-2 text-content-secondary">{icon}</div><span className="truncate text-sm font-medium text-content-primary">{fileName}</span></div>
      <a href={uploadUrl(fileName)} target="_blank" rel="noreferrer" className="flex shrink-0 items-center gap-1 text-sm font-medium text-interactive-primary hover:underline">Lihat <ExternalLink size={14} /></a>
    </div>
  );
}
