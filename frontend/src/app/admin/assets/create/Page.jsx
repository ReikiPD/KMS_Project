import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, ChevronRight, Home, Save } from "lucide-react";
import {
  Alert,
  Breadcrumb,
  Button,
  SelectDropdown,
  SingleFileUpload,
  Spinner,
  Stepper,
  TextField,
  useToast,
} from "@idds/react";
import {
  AssetPublicationReview,
  AssetPublishConfirmationModal,
  AssetQualityPanel,
  UnsavedChangesModal,
  UploadProgressPanel,
} from "../../../../components/AssetFormStatus";
import VideoFileInput from "../../../../components/VideoFileInput";
import VideoMetadataFields from "../../../../components/VideoMetadataFields";
import useDraftAutosave from "../../../../hooks/useDraftAutosave";
import useUnsavedChanges from "../../../../hooks/useUnsavedChanges";
import { apiFetch, apiUpload, currentUser, inputValue } from "../../../../lib/api";
import { ASSET_FORM_STEPS, ASSET_STATUS_OPTIONS, ASSET_TYPE_OPTIONS, buildAssetFormPayload, createAssetFormData, staffToSelectOptions, toSelectOptions } from "../../../../lib/assetForm";
import { getAssetQuality } from "../../../../lib/assetQuality";
import { firstInvalidAssetFormStep, validateAssetFormStep } from "../../../../lib/assetFormValidation";
import useAdminView from "../../../../hooks/useAdminView";

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
  const [formData, setFormData] = useState(() => createAssetFormData(isAdmin ? (searchParams.get("authorId") || "") : ""));
  const [thumbnailFiles, setThumbnailFiles] = useState([]);
  const [documentFiles, setDocumentFiles] = useState([]);
  const [uploadState, setUploadState] = useState({ status: "idle", progress: 0 });
  const [saved, setSaved] = useState(false);
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const formRef = useRef(null);
  const uploadAbortRef = useRef(null);
  const lastFeedbackRef = useRef("");
  const submitLockRef = useRef(false);

  const quality = useMemo(
    () => getAssetQuality({
      formData,
      hasThumbnail: Boolean(thumbnailFiles[0]),
      hasFile: Boolean(documentFiles[0]),
    }),
    [formData, thumbnailFiles, documentFiles],
  );
  const { status: autosaveStatus, error: autosaveError, lastSavedAt, prepareForSubmit, resumeAutosave, retry: retryAutosave } = useDraftAutosave({
    ready: (
      currentStep > 0
      && formData.title.trim().length >= 3
      && Boolean(formData.category_id)
      && Boolean(formData.work_unit_id)
      && (!isAdmin || Boolean(formData.authorId))
    ),
    formData,
    thumbnailFiles,
    documentFiles,
  });
  const hasInput = Boolean(formData.title.trim() || formData.content.trim() || formData.category_id || formData.work_unit_id || thumbnailFiles.length || documentFiles.length);
  const hasUnsavedChanges = formData.is_published === "true" || autosaveStatus !== "saved";
  const unsavedChanges = useUnsavedChanges(!saved && !loading && hasInput && hasUnsavedChanges);
  const feedbackMessage = error || (autosaveStatus === "failed" ? autosaveError : "");

  useEffect(() => {
    if (!feedbackMessage) {
      lastFeedbackRef.current = "";
      return;
    }
    if (lastFeedbackRef.current === feedbackMessage) return;
    lastFeedbackRef.current = feedbackMessage;
    toast({
      state: "negative",
      title: error ? "Periksa formulir" : "Draf belum tersimpan",
      description: feedbackMessage,
      duration: 4000,
    });
  }, [autosaveStatus, error, feedbackMessage, toast]);

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

  const categoryOptions = toSelectOptions(categories);
  const workUnitOptions = toSelectOptions(workUnits);
  const staffOptions = staffToSelectOptions(staff);
  const breadcrumbItems = [
    { label: "Dashboard", href: withEmployeeContext("/admin/dashboard"), icon: <Home size={16} /> },
    { label: "Daftar Aset", href: withEmployeeContext("/admin/assets") },
    { label: "Tambah Aset Baru" },
  ];

  const goToNextStep = () => {
    const errors = validateAssetFormStep({
      step: currentStep,
      formData,
      requireAuthor: isAdmin,
      hasThumbnail: Boolean(thumbnailFiles[0]),
      hasFile: Boolean(documentFiles[0]),
    });
    if (errors.length) {
      setError(errors.join(" "));
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setError("");
    setCurrentStep((step) => Math.min(step + 1, ASSET_FORM_STEPS.length - 1));
  };

  const clearFormFeedback = () => {
    setError("");
    lastFeedbackRef.current = "";
  };
  const updateFormData = (nextValue) => {
    clearFormFeedback();
    setFormData(nextValue);
  };

  const handleThumbnailChange = (newFile, validationError) => {
    setThumbnailFiles(newFile ? [newFile] : []);
    if (validationError) setError(`Error Thumbnail: ${validationError.error}`);
    else clearFormFeedback();
  };
  const handleDocumentChange = (newFile, validationError) => {
    setDocumentFiles(newFile ? [newFile] : []);
    if (validationError) setError(`Error Dokumen: ${validationError.error}`);
    else clearFormFeedback();
  };
  const handleVideoChange = (file, message) => {
    setDocumentFiles(file ? [file] : []);
    if (message) setError(message);
    else clearFormFeedback();
  };
  const handleVideoDurationDetected = (duration) => updateFormData((current) => ({ ...current, video_duration_seconds: String(duration) }));

  const validateBeforeSubmit = () => {
    const invalid = firstInvalidAssetFormStep({
      formData,
      requireAuthor: isAdmin,
      hasThumbnail: Boolean(thumbnailFiles[0]),
      hasFile: Boolean(documentFiles[0]),
    });
    if (invalid) {
      setCurrentStep(invalid.step);
      setError(invalid.errors.join(" "));
      window.scrollTo({ top: 0, behavior: "smooth" });
      return false;
    }
    return true;
  };

  const performSubmit = async () => {
    if (submitLockRef.current) return;
    submitLockRef.current = true;

    setLoading(true);
    setUploadState({ status: "uploading", progress: 0 });
    setError("");
    let completed = false;
    try {
      const persistedDraftId = await prepareForSubmit();
      const submitData = buildAssetFormPayload(formData, thumbnailFiles[0], documentFiles[0]);

      const uploadController = new AbortController();
      uploadAbortRef.current = uploadController;
      const response = await apiUpload(
        persistedDraftId ? `/api/assets/${persistedDraftId}` : "/api/assets",
        {
          method: persistedDraftId ? "PUT" : "POST",
          auth: true,
          body: submitData,
          signal: uploadController.signal,
          onProgress: (progress) => setUploadState({ status: "uploading", progress }),
        },
      );
      const data = response.data;
      if (!response.ok) throw new Error(data.detail || data.error || "Gagal menyimpan aset");

      setSaved(true);
      completed = true;
      setUploadState({ status: "complete", progress: 100 });
      toast({ state: "positive", title: "Berhasil", description: "Aset pengetahuan berhasil ditambahkan ke sistem.", duration: 3000 });
      setTimeout(() => navigate(withEmployeeContext("/admin/assets")), 1500);
    } catch (submitError) {
      resumeAutosave();
      setUploadState({ status: "failed", progress: 0 });
      const message = submitError.name === "AbortError" ? "Unggahan dibatalkan. Anda dapat mencobanya kembali." : submitError.message;
      toast({ state: "negative", title: "Gagal Menyimpan", description: message, duration: 4000 });
    } finally {
      uploadAbortRef.current = null;
      setLoading(false);
      if (!completed) submitLockRef.current = false;
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (submitLockRef.current || !validateBeforeSubmit()) return;
    if (formData.is_published === "true") {
      setPublishConfirmOpen(true);
      return;
    }
    performSubmit();
  };

  const confirmPublication = () => {
    if (submitLockRef.current) return;
    setPublishConfirmOpen(false);
    performSubmit();
  };

  return (
    <div className="mx-auto w-full max-w-4xl p-4 md:p-8">
      <div className="mb-6"><Breadcrumb items={breadcrumbItems} separator={<ChevronRight size={16} className="text-content-tertiary" />} /></div>
      <div className="mb-8 flex items-center gap-4">
        <Button hierarchy="tertiary" size="sm" onClick={() => unsavedChanges.requestLeave(() => navigate(-1))} aria-label="Kembali"><ArrowLeft size={20} /></Button>
        <div>
          <h1 className="text-2xl font-bold text-content-primary">Tambah Aset Baru</h1>
          <p className="mt-1 text-sm text-content-secondary">{isActingAsEmployee ? `Tambahkan pengetahuan atas nama ${staffMember?.full_name || "Pegawai terpilih"}.` : "Tambahkan pengetahuan melalui langkah yang lebih ringkas."}</p>
        </div>
      </div>
      {error && <div className="mb-6"><Alert variant="critical" title="Lengkapi formulir" message={error} /></div>}

      <div className="kms-admin-form-surface p-6 md:p-8">
        <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-6">
          <div className="border-b border-outline-secondary pb-5">
            <Stepper
              steps={ASSET_FORM_STEPS}
              currentStep={currentStep}
              orientation="horizontal"
              className="kms-asset-stepper"
              onStepClick={(step) => { if (step <= currentStep) setCurrentStep(step); }}
            />
            <p className="mt-3 text-sm text-content-secondary" aria-live="polite">Langkah {currentStep + 1} dari {ASSET_FORM_STEPS.length}: {ASSET_FORM_STEPS[currentStep].label}</p>
          </div>

          {currentStep === 0 && (
            <section className="grid grid-cols-1 gap-5 md:grid-cols-2" aria-label="Informasi aset">
              <div className="md:col-span-2"><TextField label="Judul Aset *" value={formData.title} onChange={(value) => updateFormData({ ...formData, title: inputValue(value) })} placeholder="Masukkan judul dokumen atau video..." showClearButton /></div>
              {isAdmin && (isActingAsEmployee ? <div className="md:col-span-2 rounded-lg border border-outline-secondary bg-page-secondary px-4 py-3"><p className="text-sm font-semibold text-content-primary">Pegawai kontributor</p><p className="mt-1 text-sm text-content-secondary">{staffMember?.full_name || "Pegawai terpilih"}</p><p className="mt-1 text-xs text-content-tertiary">Kontributor dikunci selama mode kerja Pegawai aktif.</p></div> : <div className="md:col-span-2"><SelectDropdown options={staffOptions} selected={formData.authorId} onSelect={(value) => updateFormData({ ...formData, authorId: value })} label="Pegawai kontributor" placeholder="Pilih Pegawai" indicator="check" /></div>)}
              <SelectDropdown options={categoryOptions} selected={formData.category_id} onSelect={(value) => updateFormData({ ...formData, category_id: value })} label="Kategori Topik *" placeholder="Pilih Kategori" indicator="check" />
              <SelectDropdown options={workUnitOptions} selected={formData.work_unit_id} onSelect={(value) => updateFormData({ ...formData, work_unit_id: value })} label="Unit Kerja Pemilik *" placeholder="Pilih Unit Kerja" indicator="check" />
              <SelectDropdown options={ASSET_TYPE_OPTIONS} selected={formData.asset_type} onSelect={(value) => updateFormData({ ...formData, asset_type: value })} label="Tipe Aset *" placeholder="Pilih Tipe Aset" indicator="check" />
              <SelectDropdown options={ASSET_STATUS_OPTIONS} selected={formData.is_published} onSelect={(value) => updateFormData({ ...formData, is_published: value })} label="Status Publikasi *" placeholder="Pilih Status" indicator="check" />
            </section>
          )}

          {currentStep === 1 && (
            <section className="flex flex-col gap-5" aria-label="Konten aset">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="asset-content" className="text-sm font-semibold text-content-primary">Konten Lengkap / Detail Tambahan *</label>
                <textarea id="asset-content" value={formData.content} onChange={(event) => updateFormData({ ...formData, content: event.target.value })} placeholder="Tuliskan detail tambahan di sini..." className="min-h-[180px] w-full resize-y rounded-lg border border-outline-secondary bg-page-primary p-3 text-sm text-content-primary outline-none transition-all focus:border-interactive-primary focus:ring-1 focus:ring-interactive-primary" />
              </div>
            </section>
          )}

          {currentStep === 2 && (
            <section className="flex flex-col gap-6" aria-label="Media aset">
              <div className="w-full">
                <SingleFileUpload title="Unggah gambar thumbnail *" description="JPG, PNG, atau WebP · maksimal 2 MB" accept="image/jpeg,image/png,image/webp" allowedExtensions={["jpg", "jpeg", "png", "webp"]} maxSize={2 * 1024 * 1024} onChange={handleThumbnailChange} onRemove={() => { setThumbnailFiles([]); clearFormFeedback(); }} />
                <p className="mt-2 text-xs text-content-secondary">Gambar sampul membantu aset lebih mudah dikenali.</p>
              </div>
              <div className="w-full">
                {formData.asset_type === "video" ? <VideoFileInput label="Unggah Video Utama *" file={documentFiles[0]} onChange={handleVideoChange} onDurationDetected={handleVideoDurationDetected} onRemove={() => { setDocumentFiles([]); clearFormFeedback(); }} /> : <SingleFileUpload title="Unggah dokumen utama *" description="PDF · maksimal 20 MB" accept="application/pdf" allowedExtensions={["pdf"]} maxSize={20 * 1024 * 1024} onChange={handleDocumentChange} onRemove={() => { setDocumentFiles([]); clearFormFeedback(); }} />}
                <p className="mt-2 text-xs text-content-secondary">Dokumen menerima PDF; video menerima MP4, WebM, atau OGG.</p>
              </div>
              {formData.asset_type === "video" && <VideoMetadataFields value={formData} onChange={updateFormData} />}
            </section>
          )}

          {currentStep === 3 && (
            <section className="flex flex-col gap-5" aria-label="Tinjau aset">
              <AssetPublicationReview isPublished={formData.is_published === "true"} />
              <AssetQualityPanel quality={quality} />
            </section>
          )}

          {formData.is_published === "false" && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-page-secondary px-3 py-2 text-xs text-content-secondary">
              <span className="inline-flex items-center gap-2">{autosaveStatus === "saving" && <Spinner size={14} borderWidth="medium" color="primary" spinnerOnly />}<span>{autosaveStatus === "saving" ? "Menyimpan draf…" : autosaveStatus === "pending" ? "Menunggu perubahan selesai…" : autosaveStatus === "saved" ? `Draf tersimpan${lastSavedAt ? ` pada ${lastSavedAt.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}` : ""}` : autosaveStatus === "failed" ? (autosaveError || "Draf belum tersimpan") : "Draf akan tersimpan otomatis setelah judul diisi."}</span></span>
              {autosaveStatus === "failed" && <Button hierarchy="tertiary" size="sm" type="button" onClick={retryAutosave}>Coba lagi</Button>}
            </div>
          )}

          <UploadProgressPanel status={uploadState.status} progress={uploadState.progress} onCancel={() => uploadAbortRef.current?.abort()} onRetry={() => formRef.current?.requestSubmit()} />

          <div className="kms-form-action-bar flex flex-col-reverse justify-between gap-3 border-t border-outline-secondary pt-5 sm:flex-row sm:items-center">
            <Button type="button" hierarchy="secondary" onClick={() => unsavedChanges.requestLeave(() => navigate(withEmployeeContext("/admin/assets")))} disabled={loading}>Batal</Button>
            <div className="flex flex-wrap justify-end gap-3">
              {currentStep > 0 && <Button type="button" hierarchy="secondary" onClick={() => setCurrentStep((step) => step - 1)} disabled={loading}>Kembali</Button>}
              {currentStep < ASSET_FORM_STEPS.length - 1 ? (
                <Button type="button" hierarchy="primary" onClick={goToNextStep} disabled={loading}><span className="flex items-center gap-2">Lanjutkan <ArrowRight size={18} /></span></Button>
              ) : (
                <Button type="submit" hierarchy="primary" disabled={loading || !formData.title}>{loading ? <span className="flex items-center gap-2"><Spinner size={17} borderWidth="medium" color="inherit" spinnerOnly />Menyimpan...</span> : <span className="flex items-center gap-2"><Save size={18} /> {formData.is_published === "true" ? "Publikasikan Aset" : "Simpan Draf"}</span>}</Button>
              )}
            </div>
          </div>
        </form>
      </div>
      <UnsavedChangesModal open={unsavedChanges.open} onStay={unsavedChanges.stay} onLeave={unsavedChanges.leave} />
      <AssetPublishConfirmationModal
        open={publishConfirmOpen}
        onClose={() => setPublishConfirmOpen(false)}
        onConfirm={confirmPublication}
        loading={loading}
        quality={quality}
      />
    </div>
  );
}
