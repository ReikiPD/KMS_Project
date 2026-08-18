import { formatVideoTimestamp } from "../lib/video";

export default function VideoChapters({ chapters = [], onSelect }) {
  if (!chapters.length) return null;

  return (
    <ol className="divide-y divide-border-subtle rounded-xl border border-border-subtle">
      {chapters.map((chapter, index) => (
        <li key={`${chapter.time}-${index}`}>
          <button
            type="button"
            onClick={() => onSelect(chapter.time)}
            className="flex min-h-11 w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-page-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--kms-blue-600)]"
          >
            <span className="min-w-0 truncate text-sm font-semibold text-content-primary">{chapter.title}</span>
            <span className="shrink-0 text-xs font-bold text-content-guide">{formatVideoTimestamp(chapter.time)}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}
