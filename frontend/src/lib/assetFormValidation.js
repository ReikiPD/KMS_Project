import { getVideoChapterValidation } from "./video";

const MIN_CONTENT_LENGTH = 20;

export function validateAssetFormStep({
  step,
  formData,
  requireAuthor = false,
  hasThumbnail = false,
  hasFile = false,
}) {
  const errors = [];

  if (step === 0) {
    if (formData.title.trim().length < 3) errors.push("Judul aset wajib diisi minimal 3 karakter.");
    if (requireAuthor && !formData.authorId) errors.push("Pegawai kontributor wajib dipilih.");
    if (!formData.category_id) errors.push("Kategori topik wajib dipilih.");
    if (!formData.work_unit_id) errors.push("Unit kerja pemilik wajib dipilih.");
    if (!formData.asset_type) errors.push("Tipe aset wajib dipilih.");
    if (formData.is_published !== "true" && formData.is_published !== "false") errors.push("Status publikasi wajib dipilih.");
  }

  if (step === 1 && formData.content.trim().length < MIN_CONTENT_LENGTH) {
    errors.push(`Konten pengetahuan wajib diisi minimal ${MIN_CONTENT_LENGTH} karakter.`);
  }

  if (step === 2) {
    if (!hasThumbnail) errors.push("Gambar thumbnail wajib tersedia.");
    if (!hasFile) errors.push(formData.asset_type === "video" ? "Video utama wajib tersedia." : "Dokumen PDF utama wajib tersedia.");
    if (formData.asset_type === "video") {
      const videoValidation = getVideoChapterValidation(formData);
      if (videoValidation.chapterPastDuration) errors.push(videoValidation.message);
    }
  }

  return errors;
}

export function firstInvalidAssetFormStep(options) {
  for (let step = 0; step <= 2; step += 1) {
    const errors = validateAssetFormStep({ ...options, step });
    if (errors.length) return { step, errors };
  }
  return null;
}
