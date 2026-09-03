import { AlertCircle, FileImage, FileText, Upload, X } from "lucide-react";
import { Button } from "@idds/react";
import { useId, useState } from "react";

const formatSize = (bytes) => {
  if (!Number.isFinite(bytes)) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

export default function SafeFileUpload({
  title,
  description,
  accept,
  allowedExtensions = [],
  maxSize,
  file,
  kind = "document",
  onChange,
  onRemove,
}) {
  const inputId = useId();
  const [validationMessage, setValidationMessage] = useState("");
  const Icon = kind === "image" ? FileImage : FileText;

  const selectFile = (event) => {
    const selected = event.target.files?.[0];
    event.target.value = "";
    if (!selected) return;

    const extension = selected.name.split(".").pop()?.toLocaleLowerCase("id-ID") || "";
    const normalizedExtensions = allowedExtensions.map((value) => String(value).toLocaleLowerCase("id-ID"));
    let message = "";
    if (normalizedExtensions.length && !normalizedExtensions.includes(extension)) {
      message = `Format file harus ${normalizedExtensions.map((value) => value.toUpperCase()).join(", ")}.`;
    } else if (Number.isFinite(maxSize) && selected.size > maxSize) {
      message = `Ukuran file maksimal ${formatSize(maxSize)}.`;
    } else if (selected.type && accept) {
      const acceptedTypes = accept.split(",").map((value) => value.trim()).filter((value) => value && !value.startsWith("."));
      if (acceptedTypes.length && !acceptedTypes.includes(selected.type)) {
        message = "Tipe file tidak sesuai dengan format yang diizinkan.";
      }
    }

    setValidationMessage(message);
    if (message) {
      onChange?.(null, { error: message });
      return;
    }
    onChange?.(selected, null);
  };

  const removeFile = () => {
    setValidationMessage("");
    onRemove?.();
  };

  return <div className={`rounded-xl border p-4 transition-colors ${validationMessage ? "border-status-danger bg-page-primary" : "border-border-subtle bg-page-secondary"}`}>
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-100 text-content-guide" aria-hidden="true"><Icon size={20} /></span>
        <div className="min-w-0"><label htmlFor={inputId} className="block text-sm font-semibold text-content-primary">{title}</label><p className="mt-1 text-xs leading-5 text-content-secondary">{description}</p></div>
      </div>
      <label htmlFor={inputId} className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-interactive-primary bg-page-primary px-4 py-2 text-sm font-semibold text-content-action transition-colors hover:bg-primary-100 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-interactive-primary">
        <Upload size={16} />Pilih file
        <input id={inputId} className="sr-only" type="file" accept={accept} onChange={selectFile} />
      </label>
    </div>
    {validationMessage && <div className="mt-3 flex items-start gap-2 rounded-lg bg-status-danger-subtle px-3 py-2 text-xs leading-5 text-status-danger"><AlertCircle size={16} className="mt-0.5 shrink-0" /><span>{validationMessage} Silakan pilih file lain.</span></div>}
    {file && <div className="mt-3 flex items-center justify-between gap-3 border-t border-border-subtle pt-3"><p className="min-w-0 truncate text-sm text-content-primary" title={file.name}><strong>{file.name}</strong> <span className="text-content-secondary">({formatSize(file.size)})</span></p><Button type="button" hierarchy="tertiary" size="sm" prefixIcon={<X size={15} />} onClick={removeFile}>Hapus</Button></div>}
  </div>;
}
