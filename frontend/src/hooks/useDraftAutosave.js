import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE_URL, authHeaders } from "../lib/api";

const fingerprintFor = (formData, thumbnailFiles, documentFiles) => JSON.stringify({
  formData: { ...formData, is_published: "false" },
  thumbnail: thumbnailFiles[0] ? [thumbnailFiles[0].name, thumbnailFiles[0].size, thumbnailFiles[0].lastModified] : null,
  document: documentFiles[0] ? [documentFiles[0].name, documentFiles[0].size, documentFiles[0].lastModified] : null,
});

export default function useDraftAutosave({ ready = true, draftId: suppliedDraftId = null, formData, thumbnailFiles, documentFiles, onSaved }) {
  const [draftId, setDraftId] = useState(suppliedDraftId);
  const [status, setStatus] = useState("idle");
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [retryKey, setRetryKey] = useState(0);
  const previousFingerprint = useRef(null);
  const saving = useRef(false);

  useEffect(() => { setDraftId(suppliedDraftId || null); previousFingerprint.current = null; }, [suppliedDraftId]);

  const save = useCallback(async (fingerprint) => {
    if (saving.current || !formData.title?.trim()) return;
    saving.current = true; setStatus("saving");
    const payload = new FormData();
    payload.append("title", formData.title.trim());
    payload.append("asset_type", formData.asset_type || "document");
    payload.append("content", formData.content || "");
    if (formData.video_duration_seconds !== "" && formData.video_duration_seconds !== null && formData.video_duration_seconds !== undefined) payload.append("video_duration_seconds", formData.video_duration_seconds);
    payload.append("video_chapters", JSON.stringify(formData.video_chapters || []));
    if (formData.category_id) payload.append("category_id", formData.category_id);
    if (formData.work_unit_id) payload.append("work_unit_id", formData.work_unit_id);
    if (formData.authorId) payload.append("authorId", formData.authorId);
    if (thumbnailFiles[0]) payload.append("thumbnail", thumbnailFiles[0]);
    if (documentFiles[0]) payload.append("file", documentFiles[0]);
    try {
      const endpoint = draftId ? `${API_BASE_URL}/api/assets/${draftId}/draft` : `${API_BASE_URL}/api/assets/drafts`;
      const response = await fetch(endpoint, { method: draftId ? "PATCH" : "POST", headers: authHeaders(), body: payload });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Draf tidak dapat disimpan");
      const nextId = result.id;
      if (nextId && nextId !== draftId) setDraftId(nextId);
      previousFingerprint.current = fingerprint;
      setLastSavedAt(new Date()); setStatus("saved");
      onSaved?.(result);
    } catch {
      setStatus("failed");
    } finally { saving.current = false; }
  }, [documentFiles, draftId, formData, onSaved, thumbnailFiles]);

  const fingerprint = fingerprintFor(formData, thumbnailFiles, documentFiles);
  useEffect(() => {
    if (!ready || formData.is_published === "true") return undefined;
    if (previousFingerprint.current === null) { previousFingerprint.current = fingerprint; return undefined; }
    if (previousFingerprint.current === fingerprint) return undefined;
    const timer = window.setTimeout(() => save(fingerprint), 1200);
    return () => window.clearTimeout(timer);
  }, [ready, fingerprint, retryKey, formData.is_published, save]);

  return { draftId, status, lastSavedAt, retry: () => setRetryKey((value) => value + 1) };
}
