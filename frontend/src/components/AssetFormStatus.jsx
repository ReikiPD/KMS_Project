import { Alert, Button, CircleProgressBar, Modal, ProgressBar, Spinner } from "@idds/react";
import { CircleCheck, RefreshCw, UploadCloud, X } from "lucide-react";

export function AssetQualityPanel({ quality }) {
  const missingItems = quality.checks.filter(([, complete]) => !complete).map(([label]) => label);
  const progress = quality.total > 0 ? Math.round((quality.completed / quality.total) * 100) : 0;
  return (
    <section className={`rounded-lg border p-4 ${quality.complete ? "border-emerald-200 bg-emerald-50/60" : "border-amber-200 bg-amber-50/60"}`} aria-label="Status kualitas aset">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            role="progressbar"
            aria-label="Kelengkapan kualitas aset"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow={progress}
            className="shrink-0"
          >
            <CircleProgressBar
              progress={progress}
              diameter={42}
              strokeWidth={5}
              variant={quality.complete ? "positive" : "warning"}
            />
          </span>
          <div>
            <h2 className="text-sm font-bold text-content-primary">Kualitas aset</h2>
            <p className="mt-0.5 text-xs text-content-secondary">{quality.completed}/{quality.total} elemen siap · {progress}% lengkap</p>
          </div>
        </div>
      </div>
      {missingItems.length > 0 && <p className="mt-3 text-xs leading-5 text-content-secondary">Perlu diisi: {missingItems.join(", ")}.</p>}
    </section>
  );
}

export function AssetPublicationReview({ isPublished, mode = "create" }) {
  return isPublished ? (
    <Alert
      variant="caution"
      title="Periksa kembali sebelum diajukan"
      message={`Pastikan judul, kategori, unit kerja, isi, thumbnail, dan file utama sudah benar. Setelah ${mode === "edit" ? "perubahan diajukan" : "pengajuan dikirim"}, aset menunggu keputusan verifikator dan belum tampil di publik.`}
    />
  ) : (
    <Alert
      variant="info"
      title="Aset akan disimpan sebagai draf"
      message="Draf belum dapat dilihat publik. Anda masih dapat melengkapi atau memperbaikinya sebelum diajukan kepada verifikator."
    />
  );
}

export function AssetPublishConfirmationModal({ open, onClose, onConfirm, loading = false, quality, mode = "create" }) {
  const missingItems = quality?.checks?.filter(([, complete]) => !complete).map(([label]) => label) || [];
  return (
    <Modal open={open} onClose={loading ? undefined : onClose} title="Ajukan aset untuk diverifikasi?" size="sm">
      <div className="space-y-5">
        <Alert
          variant="caution"
          title="Periksa kembali data aset"
          message={`Pastikan judul, kategori, unit kerja, isi, thumbnail, dan file utama sudah benar. Setelah ${mode === "edit" ? "perubahan diajukan" : "pengajuan dikirim"}, verifikator dalam cakupan Unit Kerja akan menilai kelayakannya.`}
        />
        {missingItems.length > 0 && (
          <p className="rounded-lg bg-page-secondary px-4 py-3 text-sm text-content-secondary">
            Bagian yang masih perlu diperiksa: <strong className="text-content-primary">{missingItems.join(", ")}</strong>.
          </p>
        )}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button type="button" hierarchy="secondary" onClick={onClose} disabled={loading}>Periksa lagi</Button>
          <Button type="button" hierarchy="primary" onClick={onConfirm} disabled={loading} prefixIcon={loading ? <Spinner size={18} borderWidth="medium" color="inherit" spinnerOnly /> : undefined}>{loading ? "Mengajukan..." : "Ya, ajukan"}</Button>
        </div>
      </div>
    </Modal>
  );
}

export function UnsavedChangesModal({ open, onStay, onLeave }) {
  return (
    <Modal open={open} onClose={onStay} title="Keluar dari formulir?" size="sm">
      <div className="space-y-5">
        <Alert
          variant="caution"
          title="Perubahan terakhir belum tersimpan"
          message="Jika Anda keluar sekarang, perubahan yang belum selesai dapat hilang. Tetap di formulir untuk melanjutkan pengisian."
        />
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button type="button" hierarchy="secondary" onClick={onStay}>Tetap di formulir</Button>
          <Button type="button" hierarchy="primary" onClick={onLeave}>Keluar tanpa menyimpan</Button>
        </div>
      </div>
    </Modal>
  );
}

export function UploadProgressPanel({ status = "idle", progress = 0, onCancel, onRetry }) {
  if (status === "idle") return null;
  const safeProgress = Math.min(100, Math.max(0, Math.round(progress || 0)));
  const uploading = status === "uploading";
  const failed = status === "failed";

  return (
    <section className={`kms-upload-progress kms-upload-progress--${status}`} aria-live="polite">
      <div className="kms-upload-progress-heading">
        <span aria-hidden="true">{uploading ? <Spinner size={18} borderWidth="medium" color="primary" spinnerOnly /> : status === "complete" ? <CircleCheck size={18} /> : <UploadCloud size={18} />}</span>
        <div className="min-w-0 flex-1">
          <p>{uploading ? "Mengunggah aset" : failed ? "Unggahan belum berhasil" : "Unggahan selesai"}</p>
          <small>{uploading ? `${safeProgress}% terkirim. Jangan tutup halaman ini.` : failed ? "Periksa koneksi lalu coba kembali." : "File telah diterima oleh server."}</small>
        </div>
        {uploading && onCancel && <Button type="button" hierarchy="tertiary" size="sm" onClick={onCancel} prefixIcon={<X size={15} />}>Batalkan</Button>}
        {failed && onRetry && <Button type="button" hierarchy="secondary" size="sm" onClick={onRetry} prefixIcon={<RefreshCw size={15} />}>Coba lagi</Button>}
      </div>
      <ProgressBar
        visible
        progress={safeProgress}
        duration={240}
        variant={failed ? "error" : status === "complete" ? "success" : "primary"}
        height="md"
        shimmer={uploading}
        className="mt-3"
      />
    </section>
  );
}
