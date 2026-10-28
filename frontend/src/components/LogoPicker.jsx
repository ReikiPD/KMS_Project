import { useEffect, useId, useState } from "react";
import { Button } from "@idds/react";
import { ImagePlus, Trash2 } from "lucide-react";
import { uploadUrl } from "../lib/api";

export default function LogoPicker({ file, existing, removed, onChange, onRemove, disabled, label = "Logo / lambang (opsional)" }) {
  const id = useId();
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!file) { setPreview(""); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const source = preview || (!removed && uploadUrl(existing));
  const selectFile = event => {
    const selected = event.target.files?.[0];
    event.target.value = "";
    if (!selected) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(selected.type)) {
      setError("Pilih logo berformat PNG, JPG, atau WebP."); return;
    }
    if (selected.size > 2 * 1024 * 1024) { setError("Ukuran logo maksimal 2 MB."); return; }
    setError("");
    onChange(selected);
  };
  return <fieldset className="kms-logo-picker" disabled={disabled}>
    <legend>{label}</legend>
    <div className="kms-logo-picker-body">
      <span className="kms-logo-picker-preview" aria-hidden="true">
        {source ? <img src={source} alt="" /> : <ImagePlus size={28} />}
      </span>
      <div className="kms-logo-picker-content">
        <p id={`${id}-help`}>PNG, JPG, atau WebP · maksimal 2 MB. Logo ditampilkan utuh tanpa dipotong.</p>
        <input id={id} className="kms-logo-picker-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={selectFile} aria-label={label} aria-describedby={`${id}-help${error ? ` ${id}-error` : ""}`} aria-invalid={Boolean(error)} />
        <div className="kms-logo-picker-actions">
          <label htmlFor={id} className={`kms-logo-picker-trigger ${disabled ? "is-disabled" : ""}`}>{source ? "Ganti logo" : "Pilih logo"}</label>
          {source && <Button type="button" size="sm" hierarchy="tertiary" prefixIcon={<Trash2 size={16} />} onClick={() => { setError(""); onRemove(); }} disabled={disabled}>Hapus logo</Button>}
        </div>
        {file && <p className="kms-logo-picker-filename">{file.name}</p>}
        {removed && <p>Logo unggahan akan dihapus setelah disimpan. Ikon bawaan tetap tersedia.</p>}
        {error && <p id={`${id}-error`} className="kms-logo-picker-error" role="alert">{error}</p>}
      </div>
    </div>
  </fieldset>;
}
