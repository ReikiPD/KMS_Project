import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, ChevronRight, Home, Save } from "lucide-react";
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
import { apiFetch, currentUser, inputValue } from "../../../../lib/api";
import { getAssetQuality } from "../../../../lib/assetQuality";
import useAdminView from "../../../../hooks/useAdminView";

const FORM_STEPS = [
  { label: "Informasi" },
  { label: "Konten" },
  { label: "Media" },
  { label: "Tinjau & simpan" },
];

export default function CreateAssetPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const user = currentUser() || {};
  const isAdmin = user.role === "admin";
  const { isActingAsEmployee, staffMember, withEmployeeContext } = useAdminView();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [currentStep, setCurrentStep] = useState(0);
  const [categories, setCategories] = useState([]);
  const [workUnits, setWorkUnits] = useState([]);
  const [staff, setStaff] = useState([]);
  const [formData, setFormData] = useState({
    title: "",
    asset_type: "document",
    content: "",
    category_id: null,
    work_unit_id: null,
    is_published: "false",
    video_duration_seconds: "",
    video_chapters: [],
    authorId: isAdmin ? (searchParams.get("authorId") || "") : "",
  });
  const [thumbnailFiles, setThumbnailFiles] = useState([]);
  const [documentFiles, setDocumentFiles] = useState([]);
  const [autoDraftId, setAutoDraftId] = useState(null);

  const quality = useMemo(
    () => getAssetQuality({
      formData,
      hasThumbnail: Boolean(thumbnailFiles[0]),
      hasFile: Boolean(documentFiles[0]),
    }),
    [formData, thumbnailFiles, documentFiles],
  );
  const { draftId, status: autosaveStatus, lastSavedAt, retry: retryAutosave } = useDraftAutosave({
    ready: !isAdmin || Boolean(formData.authorId),
    formData,
    thumbnailFiles,
    documentFiles,
    draftId: autoDraftId,
    onSaved: (asset) => setAutoDraftId(asset.id),
  });

  useEffect(() => {
    const fetchMasterData = async () => {
      try {
        const [categoryResponse, workUnitResponse, staffResponse] = await Promise.all([
          apiFetch("/api/assets/categories"),
          apiFetch("/api/assets/work-units"),
          isAdmin ? apiFetch("/api/users/staff", { auth: true }) : Promise.resolve(null),
        ]);
        if (categoryResponse.ok) setCategories(await categoryResponse.json());
        if (workUnitResponse.ok) setWorkUnits(await workUnitResponse.json());
        if (staffResponse?.ok) { const staffData = await staffResponse.json(); setStaff(staffData.data || staffData); }
      } catch (fetchError) {
        console.error("Gagal mengambil data master", fetchError);
      }
    };
    fetchMasterData();
  }, [isAdmin]);

  const categoryOptions = categories.map((category) => ({ label: category.name, value: category.id.toString() }));
  const workUnitOptions = workUnits.map((unit) => ({ label: unit.name, value: unit.id.toString() }));
  const staffOptions = staff
    .filter((member) => member.role === "pegawai")
    .map((member) => ({ label: `${member.full_name}${member.department ? ` — ${member.department}` : ""}`, value: String(member.id) }));
  const typeOptions = [
    { label: "Dokumen / Pedoman (PDF)", value: "document" },
    { label: "Video / Media", value: "video" },
  ];
  const statusOptions = [
    { label: "Simpan sebagai Draf", value: "false" },
    { label: "Publikasikan Langsung", value: "true" },
  ];
  const breadcrumbItems = [
    { label: "Dashboard", href: withEmployeeContext("/admin/dashboard"), icon: <Home size={16} /> },
    { label: "Daftar Aset", href: withEmployeeContext("/admin/assets") },
    { label: "Tambah Aset Baru" },
  ];

  const goToNextStep = () => {
    if (currentStep === 0 && (!formData.title.trim() || (isAdmin && !formData.authorId))) {
      setError(isAdmin && !formData.authorId ? "Pilih pegawai kontributor terlebih dahulu." : "Isi judul aset terlebih dahulu sebelum melanjutkan.");
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

      const response = await apiFetch(
        draftId ? `/api/assets/${draftId}` : "/api/assets",
        {
          method: draftId ? "PUT" : "POST",
          auth: true,
          body: submitData,
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || data.error || "Gagal menyimpan aset");

      toast({ state: "positive", title: "Berhasil", description: "Aset pengetahuan berhasil ditambahkan ke sistem.", duration: 3000 });
      setTimeout(() => navigate(withEmployeeContext("/admin/assets")), 1500);
    } catch (submitError) {
      toast({ state: "negative", title: "Gagal Menyimpan", description: submitError.message, duration: 4000 });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl p-4 md:p-8">
      <div className="mb-6"><Breadcrumb items={breadcrumbItems} separator={<ChevronRight size={16} className="text-slate-400" />} /></div>
      <div className="mb-8 flex items-center gap-4">
        <Button hierarchy="tertiary" size="sm" onClick={() => navigate(-1)} aria-label="Kembali"><ArrowLeft size={20} /></Button>
        <div>
          <h1 className="text-2xl font-bold text-content-primary">Tambah Aset Baru</h1>
          <p className="mt-1 text-sm text-content-secondary">{isActingAsEmployee ? `Tambahkan pengetahuan atas nama ${staffMember?.full_name || "Pegawai terpilih"}.` : "Tambahkan pengetahuan melalui langkah yang lebih ringkas."}</p>
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
              {isAdmin && (isActingAsEmployee ? <div className="md:col-span-2 rounded-lg border border-outline-secondary bg-page-secondary px-4 py-3"><p className="text-sm font-semibold text-content-primary">Pegawai kontributor</p><p className="mt-1 text-sm text-content-secondary">{staffMember?.full_name || "Pegawai terpilih"}</p><p className="mt-1 text-xs text-content-tertiary">Kontributor dikunci selama mode kerja Pegawai aktif.</p></div> : <div className="md:col-span-2"><SelectDropdown options={staffOptions} selected={formData.authorId} onSelect={(value) => setFormData({ ...formData, authorId: value })} label="Pegawai kontributor" placeholder="Pilih Pegawai" indicator="check" /></div>)}
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
              <div className="w-full">
                <SingleFileUpload title="Unggah gambar thumbnail" description="JPG, PNG, atau WebP · maksimal 2 MB" accept="image/jpeg,image/png,image/webp" allowedExtensions={["jpg", "jpeg", "png", "webp"]} maxSize={2 * 1024 * 1024} onChange={handleThumbnailChange} onRemove={() => setThumbnailFiles([])} />
                <p className="mt-2 text-xs text-content-secondary">Gambar sampul membantu aset lebih mudah dikenali.</p>
              </div>
              <div className="w-full">
                {formData.asset_type === "video" ? <VideoFileInput file={documentFiles[0]} onChange={handleVideoChange} onDurationDetected={handleVideoDurationDetected} onRemove={() => setDocumentFiles([])} /> : <SingleFileUpload title="Unggah dokumen utama" description="PDF · maksimal 20 MB" accept="application/pdf" allowedExtensions={["pdf"]} maxSize={20 * 1024 * 1024} onChange={handleDocumentChange} onRemove={() => setDocumentFiles([])} />}
                <p className="mt-2 text-xs text-content-secondary">Dokumen menerima PDF; video menerima MP4, WebM, atau OGG.</p>
              </div>
              {formData.asset_type === "video" && <VideoMetadataFields value={formData} onChange={setFormData} />}
            </section>
          )}

          {currentStep === 3 && (
            <section className="flex flex-col gap-5" aria-label="Tinjau aset">
              <div className="rounded-lg bg-page-secondary p-4 text-sm text-content-secondary"><p className="font-semibold text-content-primary">Siap disimpan</p><p className="mt-1">Tinjau kelengkapan aset sebelum {formData.is_published === "true" ? "menerbitkannya" : "menyimpannya sebagai draf"}.</p></div>
              <AssetQualityPanel quality={quality} />
            </section>
          )}

          {formData.is_published === "false" && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-page-secondary px-3 py-2 text-xs text-content-secondary">
              <span>{autosaveStatus === "saving" ? "Menyimpan draf…" : autosaveStatus === "saved" ? `Draf tersimpan${lastSavedAt ? ` pada ${lastSavedAt.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}` : ""}` : autosaveStatus === "failed" ? "Draf belum tersimpan" : "Draf akan tersimpan otomatis setelah judul diisi."}</span>
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
                <Button type="submit" hierarchy="primary" disabled={loading || !formData.title}>{loading ? "Menyimpan..." : <span className="flex items-center gap-2"><Save size={18} /> Simpan Aset</span>}</Button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
