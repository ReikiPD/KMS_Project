import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, ChevronRight, ExternalLink, FileText, Home, Image as ImageIcon, Save, Undo2 } from "lucide-react";
import {
  Alert,
  Breadcrumb,
  Button,
  SelectDropdown,
  Skeleton,
  Spinner,
  Stepper,
  TextField,
  Toggle,
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
import SafeFileUpload from "../../../../components/SafeFileUpload";
import VideoMetadataFields from "../../../../components/VideoMetadataFields";
import useDraftAutosave from "../../../../hooks/useDraftAutosave";
import useUnsavedChanges from "../../../../hooks/useUnsavedChanges";
import { apiFetch, apiUpload, inputValue, uploadUrl } from "../../../../lib/api";
import { useAuth } from "../../../../contexts/AuthContext";
import { ASSET_FORM_STEPS, ASSET_STATUS_OPTIONS, ASSET_TYPE_OPTIONS, assetToFormData, buildAssetFormPayload, createAssetFormData, toSelectOptions } from "../../../../lib/assetForm";
import { getAssetQuality } from "../../../../lib/assetQuality";
import { firstInvalidAssetFormStep, validateAssetFormStep } from "../../../../lib/assetFormValidation";
import useAdminView from "../../../../hooks/useAdminView";
import { adminAssetEditPath } from "../../../../lib/routes";
import { hasPermission } from "../../../../lib/permissions";

export default function EditAssetPage() {
  const { user: authenticatedUser } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const user = authenticatedUser || {};
  const isAdmin = user.role === "admin";
  const { accessUser, employeeId, isEmployeeContext, staffMember, withEmployeeContext } = useAdminView();
  const permissionUser = accessUser || authenticatedUser;
  const ownerAccount = isEmployeeContext ? staffMember : authenticatedUser;
  const canViewManagedWorkUnits = hasPermission(permissionUser, "work_units", "view");
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentStep, setCurrentStep] = useState(0);
  const [categories, setCategories] = useState([]);
  const [workUnits, setWorkUnits] = useState([]);
  const [staff, setStaff] = useState([]);
  const [initialData, setInitialData] = useState(null);
  const [formData, setFormData] = useState(() => createAssetFormData());
  const [existingThumbnail, setExistingThumbnail] = useState(null);
  const [existingFile, setExistingFile] = useState(null);
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
      hasThumbnail: Boolean(thumbnailFiles[0] || existingThumbnail),
      hasFile: Boolean(documentFiles[0] || existingFile),
    }),
    [formData, thumbnailFiles, documentFiles, existingThumbnail, existingFile],
  );
  const { status: autosaveStatus, error: autosaveError, lastSavedAt, prepareForSubmit, resumeAutosave, retry: retryAutosave } = useDraftAutosave({
    ready: !fetchLoading,
    draftId: !fetchLoading && formData.is_published === "false" ? id : null,
    formData,
    thumbnailFiles,
    documentFiles,
  });
  const changedFromInitial = Boolean(initialData) && (JSON.stringify(formData) !== JSON.stringify(initialData) || thumbnailFiles.length || documentFiles.length);
  const unsavedChanges = useUnsavedChanges(!saved && !loading && changedFromInitial && !(formData.is_published === "false" && autosaveStatus === "saved"));
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
    const fetchData = async () => {
      try {
        const assetParams = new URLSearchParams();
        if (isEmployeeContext && employeeId) assetParams.set("authorId", employeeId);
        const assetQuery = assetParams.toString();
        const [assetResponse, categoryResponse, workUnitResponse, staffResponse] = await Promise.all([
          apiFetch(`/api/assets/admin/${id}${assetQuery ? `?${assetQuery}` : ""}`, { auth: true }),
          apiFetch("/api/assets/categories"),
          apiFetch(canViewManagedWorkUnits ? "/api/assets/work-units/backoffice" : "/api/assets/work-units", { auth: canViewManagedWorkUnits }),
          isAdmin && !isEmployeeContext ? apiFetch("/api/users/staff", { auth: true, context: false }) : Promise.resolve(null),
        ]);
        if (categoryResponse.ok) setCategories(await categoryResponse.json());
        if (workUnitResponse.ok) {
          const units = await workUnitResponse.json();
          const ownerWorkUnitId = ownerAccount?.work_unit_id;
          if (ownerWorkUnitId && !units.some((unit) => String(unit.id) === String(ownerWorkUnitId))) {
            units.push({
              id: ownerWorkUnitId,
              name: ownerAccount.work_unit_name || ownerAccount.department || "Unit Kerja akun",
              alias: ownerAccount.work_unit_alias || null,
              echelon_level: ownerAccount.work_unit_echelon_level || null,
            });
          }
          setWorkUnits(units);
        } else {
          setError("Daftar Unit Kerja belum dapat dimuat. Muat ulang halaman lalu coba kembali.");
        }
        if (staffResponse?.ok) { const staffData = await staffResponse.json(); setStaff(staffData.data || staffData); }
        if (!assetResponse.ok) throw new Error("Aset tidak ditemukan");

        const asset = await assetResponse.json();
        const formattedData = assetToFormData(asset);
        setFormData(formattedData);
        setInitialData(formattedData);
        setExistingThumbnail(asset.thumbnail_url);
        setExistingFile(asset.file_url);
        const canonicalPath = adminAssetEditPath(asset);
        const canonicalReference = decodeURIComponent(canonicalPath.split("/").pop() || "");
        if (canonicalReference && canonicalReference !== id) {
          navigate(withEmployeeContext(canonicalPath), { replace: true });
        }
      } catch (fetchError) {
        toast({ state: "negative", title: "Error", description: `Gagal memuat data aset: ${fetchError.message}`, duration: 4000 });
        navigate(withEmployeeContext("/admin/assets"));
      } finally {
        setFetchLoading(false);
      }
    };
    fetchData();
  }, [canViewManagedWorkUnits, employeeId, id, isAdmin, isEmployeeContext, navigate, ownerAccount?.department, ownerAccount?.work_unit_alias, ownerAccount?.work_unit_echelon_level, ownerAccount?.work_unit_id, ownerAccount?.work_unit_name, toast, withEmployeeContext]);

  const categoryOptions = toSelectOptions(categories);
  const workUnitOptions = toSelectOptions(workUnits);
  const contributor = staff.find((member) => String(member.id) === String(formData.authorId));
  const breadcrumbItems = [
    { label: "Dasbor", href: withEmployeeContext("/admin/dashboard"), icon: <Home size={16} /> },
    { label: "Daftar Aset", href: withEmployeeContext("/admin/assets") },
    { label: "Edit Aset" },
  ];

  const goToNextStep = () => {
    const errors = validateAssetFormStep({
      step: currentStep,
      formData,
      hasThumbnail: Boolean(thumbnailFiles[0] || existingThumbnail),
      hasFile: Boolean(documentFiles[0] || existingFile),
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
      hasThumbnail: Boolean(thumbnailFiles[0] || existingThumbnail),
      hasFile: Boolean(documentFiles[0] || existingFile),
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
      await prepareForSubmit();
      const submitData = buildAssetFormPayload(formData, thumbnailFiles[0], documentFiles[0]);

      const uploadController = new AbortController();
      uploadAbortRef.current = uploadController;
      const response = await apiUpload(`/api/assets/${id}`, {
        method: "PUT",
        auth: true,
        body: submitData,
        signal: uploadController.signal,
        onProgress: (progress) => setUploadState({ status: "uploading", progress }),
      });
      const data = response.data;
      if (!response.ok) throw new Error(data.detail || data.error || "Gagal memperbarui aset");

      setSaved(true);
      completed = true;
      setUploadState({ status: "complete", progress: 100 });
      toast({ state: "positive", title: "Berhasil", description: data.message || (formData.is_published === "true" ? "Aset berhasil diajukan untuk verifikasi." : "Draf aset berhasil diperbarui."), duration: 3000 });
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

  if (fetchLoading) return <div className="mx-auto w-full max-w-4xl p-4 md:p-8"><Skeleton height="28px" width="34%" /><Skeleton height="64px" rounded="lg" className="mt-6" /><Skeleton height="430px" rounded="lg" className="mt-5" /></div>;

  return (
    <div className="mx-auto w-full max-w-4xl p-4 md:p-8">
      <div className="mb-6"><Breadcrumb items={breadcrumbItems} separator={<ChevronRight size={16} className="text-content-tertiary" />} /></div>
      <div className="mb-8 flex items-center gap-4">
        <Button hierarchy="tertiary" size="sm" onClick={() => unsavedChanges.requestLeave(() => navigate(-1))} aria-label="Kembali"><ArrowLeft size={20} /></Button>
        <div>
          <h1 className="text-2xl font-bold text-content-primary">Edit Aset Pengetahuan</h1>
          <p className="mt-1 text-sm text-content-secondary">{isEmployeeContext ? `Memperbarui aset atas nama ${staffMember?.full_name || "akun terpilih"}.` : "Perbarui aset dengan langkah yang lebih terarah."}</p>
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
              {isAdmin && (
                <div className="md:col-span-2 rounded-lg border border-outline-secondary bg-page-secondary px-4 py-3">
                  <p className="text-sm font-semibold text-content-primary">Pegawai kontributor</p>
                  <p className="mt-1 text-sm text-content-secondary">
                    {isEmployeeContext ? (staffMember?.full_name || "Akun terpilih") : contributor ? `${contributor.full_name}${contributor.department ? ` — ${contributor.department}` : ""}` : "Pegawai tidak aktif"}
                  </p>
                  <p className="mt-1 text-xs text-content-tertiary">Kontributor tidak diubah saat memperbarui aset.</p>
                </div>
              )}
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
              <div className="rounded-lg border border-info-subtle bg-info-subtle p-4 text-sm text-content-secondary"><strong className="text-content-primary">Manajemen file</strong><p className="mt-1">Unggah file baru hanya bila ingin menggantikan file yang tersimpan. Kosongkan area unggah untuk mempertahankan file lama.</p></div>
              <div className="w-full">
                <label className="mb-2 block text-sm font-semibold text-content-primary">Gambar Thumbnail Saat Ini</label>
                {existingThumbnail ? <FilePreview icon={<ImageIcon size={18} />} fileName={existingThumbnail} /> : <p className="mb-4 text-sm italic text-content-secondary">Belum ada gambar thumbnail yang diunggah.</p>}
                <SafeFileUpload title="Ganti gambar thumbnail" description="JPG, PNG, atau WebP · maksimal 2 MB" accept="image/jpeg,image/png,image/webp" allowedExtensions={["jpg", "jpeg", "png", "webp"]} maxSize={2 * 1024 * 1024} file={thumbnailFiles[0]} kind="image" onChange={handleThumbnailChange} onRemove={() => { setThumbnailFiles([]); clearFormFeedback(); }} />
              </div>
              <div className="w-full">
                <label className="mb-2 block text-sm font-semibold text-content-primary">File Utama Saat Ini</label>
                {existingFile ? <FilePreview icon={<FileText size={18} />} fileName={existingFile} /> : <p className="mb-4 text-sm italic text-content-secondary">Belum ada file dokumen/video yang diunggah.</p>}
                {formData.asset_type === "video" ? <VideoFileInput label="Ganti Video Utama (opsional)" file={documentFiles[0]} onChange={handleVideoChange} onDurationDetected={handleVideoDurationDetected} onRemove={() => { setDocumentFiles([]); clearFormFeedback(); }} /> : <SafeFileUpload title="Ganti dokumen utama" description="PDF · maksimal 20 MB" accept="application/pdf" allowedExtensions={["pdf"]} maxSize={20 * 1024 * 1024} file={documentFiles[0]} onChange={handleDocumentChange} onRemove={() => { setDocumentFiles([]); clearFormFeedback(); }} />}
              </div>
              <div className="flex items-center justify-between gap-5 rounded-xl border border-outline-secondary bg-page-secondary p-4">
                <div><p className="text-sm font-semibold text-content-primary">Izinkan file diunduh</p><p className="mt-1 text-xs leading-5 text-content-secondary">Jika dinonaktifkan, materi tetap dapat dilihat di KMS tetapi pengguna tidak dapat mengunduh file.</p></div>
                <Toggle checked={formData.allow_download !== false} onChange={(checked) => updateFormData({ ...formData, allow_download: checked })} aria-label="Izinkan pengguna mengunduh file aset" />
              </div>
              {formData.asset_type === "video" && <VideoMetadataFields value={formData} onChange={updateFormData} />}
            </section>
          )}

          {currentStep === 3 && (
            <section className="flex flex-col gap-5" aria-label="Tinjau aset">
              <AssetPublicationReview isPublished={formData.is_published === "true"} mode="edit" />
              <AssetQualityPanel quality={quality} />
            </section>
          )}

          {formData.is_published === "false" && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-page-secondary px-3 py-2 text-xs text-content-secondary">
              <span className="inline-flex items-center gap-2">{autosaveStatus === "saving" && <Spinner size={14} borderWidth="medium" color="primary" spinnerOnly />}<span>{autosaveStatus === "saving" ? "Menyimpan draf…" : autosaveStatus === "pending" ? "Menunggu perubahan selesai…" : autosaveStatus === "saved" ? `Draf tersimpan${lastSavedAt ? ` pada ${lastSavedAt.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}` : ""}` : autosaveStatus === "failed" ? (autosaveError || "Draf belum tersimpan") : "Perubahan draf akan tersimpan otomatis."}</span></span>
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
                <><Button type="button" hierarchy="tertiary" onClick={handleUndoChanges} disabled={loading}><span className="flex items-center gap-2"><Undo2 size={16} /> Batalkan perubahan</span></Button><Button type="submit" hierarchy="primary" disabled={loading || !formData.title}>{loading ? <span className="flex items-center gap-2"><Spinner size={17} borderWidth="medium" color="inherit" spinnerOnly />Menyimpan...</span> : <span className="flex items-center gap-2"><Save size={18} /> {formData.is_published === "true" ? "Simpan & Ajukan" : "Simpan Draf"}</span>}</Button></>
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
        mode="edit"
      />
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
