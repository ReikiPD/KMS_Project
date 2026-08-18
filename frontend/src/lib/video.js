export const formatVideoTimestamp = (value) => {
  const seconds = Math.max(0, Number(value) || 0);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;

  return [hours, minutes, remaining]
    .filter((part, index) => index || part > 0)
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
};

const toWholeSeconds = (value) => {
  const text = String(value ?? "").trim();
  return /^\d+$/.test(text) ? Number(text) : null;
};

export const getVideoChapterValidation = ({ video_duration_seconds: durationValue, video_chapters: chapters = [] } = {}) => {
  const hasDuration = String(durationValue ?? "").trim() !== "";
  const duration = toWholeSeconds(durationValue);
  const chapterPastDuration = duration === null
    ? null
    : (Array.isArray(chapters) ? chapters : []).find((chapter) => {
      const time = toWholeSeconds(chapter?.time);
      return time !== null && time > duration;
    }) || null;

  return {
    duration,
    hasInvalidDuration: hasDuration && duration === null,
    chapterPastDuration,
    message: chapterPastDuration
      ? `Bab "${chapterPastDuration.title || "tanpa judul"}" pada ${chapterPastDuration.time} detik melewati durasi video ${duration} detik.`
      : "",
  };
};
