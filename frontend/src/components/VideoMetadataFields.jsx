import { Alert, Button, TextField } from "@idds/react";
import { Clock3, ListVideo, Plus, Trash2 } from "lucide-react";
import { inputValue } from "../lib/api";
import { formatVideoTimestamp, getVideoChapterValidation } from "../lib/video";

const numericValue = (value) => inputValue(value).replace(/\D/g, "");

export default function VideoMetadataFields({ value, onChange }) {
  const chapters = Array.isArray(value.video_chapters) ? value.video_chapters : [];
  const validation = getVideoChapterValidation(value);
  const update = (next) => onChange({ ...value, ...next });
  const updateChapter = (index, patch) => update({
    video_chapters: chapters.map((chapter, chapterIndex) => chapterIndex === index ? { ...chapter, ...patch } : chapter),
  });

  return (
    <section className="rounded-xl border border-border-subtle bg-page-secondary/60 p-4 md:p-5" aria-labelledby="video-metadata-heading">
      <div className="flex items-start gap-3">
        <span className="kms-admin-metric-icon kms-admin-metric-icon--teal"><ListVideo size={18} /></span>
        <div>
          <h3 id="video-metadata-heading" className="font-bold text-content-primary">Informasi video <span className="font-normal text-content-secondary">(opsional)</span></h3>
          <p className="mt-1 text-xs leading-5 text-content-secondary">Tambahkan durasi total dan bab agar pembaca dapat melompat ke bagian penting.</p>
        </div>
      </div>

      <div className="mt-4 max-w-xs">
        <TextField
          label="Durasi video (detik)"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={String(value.video_duration_seconds ?? "")}
          onChange={(next) => update({ video_duration_seconds: numericValue(next) })}
          placeholder="Contoh: 360"
          status={validation.chapterPastDuration || validation.hasInvalidDuration ? "error" : "neutral"}
          statusMessage={validation.message || (validation.hasInvalidDuration ? "Durasi harus berupa angka detik bulat." : undefined)}
          helperText="Opsional. Isi durasi total video."
        />
      </div>

      {validation.chapterPastDuration && <div className="mt-4"><Alert variant="caution" title="Timestamp melewati durasi video" message={`${validation.message} Ubah durasi total atau waktu bab sebelum melanjutkan.`} /></div>}

      <div className="mt-5 border-t border-border-subtle pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-content-primary"><Clock3 size={16} /> Bab / timestamp</p>
            <p className="mt-1 text-xs text-content-secondary">Opsional. Pembaca dapat langsung melompat ke bagian penting.</p>
          </div>
          <Button type="button" hierarchy="secondary" size="sm" onClick={() => update({ video_chapters: [...chapters, { title: "", time: "" }] })} prefixIcon={<Plus size={15} />}>Tambah bab</Button>
        </div>

        {chapters.length > 0 && (
          <div className="mt-4">
            <div className="hidden grid-cols-[9rem_minmax(0,1fr)_2.5rem] gap-3 px-1 pb-2 text-xs font-semibold text-content-secondary sm:grid">
              <span>Waktu (detik)</span>
              <span>Judul bab</span>
              <span className="sr-only">Aksi</span>
            </div>
            <ol className="space-y-3">
              {chapters.map((chapter, index) => {
                const time = String(chapter.time ?? "");
                const exceedsDuration = validation.duration !== null && /^\d+$/.test(time) && Number(time) > validation.duration;

                return (
                  <li key={`${index}-${chapter.time}`} className="grid gap-3 sm:grid-cols-[9rem_minmax(0,1fr)_2.5rem] sm:items-start">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-content-secondary sm:sr-only" htmlFor={`chapter-time-${index}`}>Waktu bab {index + 1} (detik)</label>
                      <input id={`chapter-time-${index}`} type="text" inputMode="numeric" pattern="[0-9]*" value={time} onChange={(event) => updateChapter(index, { time: numericValue(event.target.value) })} placeholder="Contoh: 5" className={`kms-video-chapter-input ${exceedsDuration ? "kms-video-chapter-input--error" : ""}`} />
                      <p className={`mt-1 text-xs ${exceedsDuration ? "text-red-700" : "text-content-secondary"}`}>{time ? `${time} detik · ${formatVideoTimestamp(time)}` : "Masukkan detik"}</p>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-content-secondary sm:sr-only" htmlFor={`chapter-title-${index}`}>Judul bab {index + 1}</label>
                      <input id={`chapter-title-${index}`} type="text" value={chapter.title || ""} onChange={(event) => updateChapter(index, { title: inputValue(event.target.value) })} placeholder="Contoh: Langkah awal" className="kms-video-chapter-input" />
                    </div>
                    <Button type="button" hierarchy="tertiary" size="sm" aria-label={`Hapus bab ${index + 1}`} onClick={() => update({ video_chapters: chapters.filter((_, chapterIndex) => chapterIndex !== index) })}><Trash2 size={16} /></Button>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </div>
    </section>
  );
}
