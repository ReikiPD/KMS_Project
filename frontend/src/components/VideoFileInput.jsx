import { FileVideo, X } from "lucide-react";
import { Button } from "@idds/react";

const VIDEO_EXTENSIONS = ["mp4", "webm", "ogg"];
const VIDEO_MIME_TYPES = ["video/mp4", "video/webm", "video/ogg"];
const MAX_VIDEO_SIZE = 20 * 1024 * 1024;

const formatSize = (bytes) => `${(bytes / 1024 / 1024).toFixed(bytes >= 1024 * 1024 ? 1 : 2)} MB`;

const detectVideoDuration = (file) => new Promise((resolve) => {
  const video = document.createElement("video");
  const objectUrl = URL.createObjectURL(file);
  const cleanup = () => {
    URL.revokeObjectURL(objectUrl);
    video.removeAttribute("src");
    video.load();
  };
  video.preload = "metadata";
  video.onloadedmetadata = () => {
    const duration = Number.isFinite(video.duration) ? Math.max(0, Math.floor(video.duration)) : null;
    cleanup();
    resolve(duration);
  };
  video.onerror = () => { cleanup(); resolve(null); };
  video.src = objectUrl;
});

export default function VideoFileInput({ file, onChange, onRemove, onDurationDetected, label = "Unggah Video Utama" }) {
  const handleChange = (event) => {
    const selected = event.target.files?.[0];
    event.target.value = "";
    if (!selected) return;

    const extension = selected.name.split(".").pop()?.toLowerCase();
    if (!VIDEO_EXTENSIONS.includes(extension)) {
      onChange(null, "Format video harus MP4, WebM, atau OGG.");
      return;
    }
    if (selected.size > MAX_VIDEO_SIZE) {
      onChange(null, "Ukuran video maksimal 20 MB.");
      return;
    }
    if (selected.type && !VIDEO_MIME_TYPES.includes(selected.type)) {
      onChange(null, "Tipe file video tidak sesuai. Gunakan MP4, WebM, atau OGG.");
      return;
    }

    onChange(selected, "");
    detectVideoDuration(selected).then((duration) => {
      if (duration !== null) onDurationDetected?.(duration);
    });
  };

  return (
    <div className="rounded-lg border border-border-subtle bg-page-secondary p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[rgb(21_75_132_/_0.12)] text-[rgb(21,75,132)]"><FileVideo size={19} /></span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-content-primary">{label}</p>
            <p className="text-xs text-content-secondary">MP4, WebM, atau OGG · maksimal 20 MB</p>
          </div>
        </div>
        <label className="inline-flex cursor-pointer items-center rounded-md border border-[rgb(21,75,132)] bg-page-primary px-3 py-1.5 text-sm font-medium text-[rgb(21,75,132)] transition-colors hover:bg-[rgb(21_75_132_/_0.06)] focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[rgb(21,75,132)]">
          Pilih video
          <input className="sr-only" type="file" accept="video/mp4,video/webm,video/ogg,.mp4,.webm,.ogg" onChange={handleChange} />
        </label>
      </div>

      {file && (
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-border-subtle pt-3">
          <p className="min-w-0 truncate text-sm text-content-primary" title={file.name}>{file.name} <span className="text-content-secondary">({formatSize(file.size)})</span></p>
          <Button type="button" hierarchy="tertiary" size="sm" prefixIcon={<X size={15} />} onClick={onRemove}>Hapus</Button>
        </div>
      )}
    </div>
  );
}
