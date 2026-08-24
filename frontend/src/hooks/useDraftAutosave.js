import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../lib/api";

const fileFingerprint = (file) => file ? `${file.name}:${file.size}:${file.lastModified}` : null;

const fingerprintFor = (formData, thumbnailFiles, documentFiles) => JSON.stringify({
  formData: { ...formData, is_published: "false" },
  thumbnail: fileFingerprint(thumbnailFiles[0]),
  document: fileFingerprint(documentFiles[0]),
});

const draftIdentityFor = (formData) => JSON.stringify([
  formData.title?.trim().toLocaleLowerCase() || "",
  formData.authorId || "self",
]);

export default function useDraftAutosave({ ready = true, draftId: suppliedDraftId = null, formData, thumbnailFiles, documentFiles, onSaved }) {
  const [draftId, setDraftId] = useState(suppliedDraftId);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [retryKey, setRetryKey] = useState(0);
  const previousFingerprint = useRef(null);
  const failedFingerprint = useRef(null);
  const blockedConflictIdentity = useRef(null);
  const draftIdRef = useRef(suppliedDraftId || null);
  const pendingSaveRef = useRef(null);
  const timerRef = useRef(null);
  const submittingRef = useRef(false);
  const latestDataRef = useRef({ formData, thumbnailFiles, documentFiles });
  const onSavedRef = useRef(onSaved);
  const uploadedFilesRef = useRef({ thumbnail: null, document: null });

  latestDataRef.current = { formData, thumbnailFiles, documentFiles };
  onSavedRef.current = onSaved;

  useEffect(() => {
    const nextDraftId = suppliedDraftId || null;
    if (nextDraftId === draftIdRef.current) return;
    draftIdRef.current = nextDraftId;
    setDraftId(nextDraftId);
    previousFingerprint.current = null;
    failedFingerprint.current = null;
    blockedConflictIdentity.current = null;
    setError("");
  }, [suppliedDraftId]);

  const save = useCallback(async (fingerprint, force = false) => {
    if (pendingSaveRef.current) {
      try { await pendingSaveRef.current; } catch { /* Status kegagalan ditangani oleh request pemilik. */ }
    }
    const currentData = latestDataRef.current;
    if (
      submittingRef.current
      || !currentData.formData.title?.trim()
      || previousFingerprint.current === fingerprint
      || (!force && failedFingerprint.current === fingerprint)
      || (!force && blockedConflictIdentity.current === draftIdentityFor(currentData.formData))
      || fingerprintFor(currentData.formData, currentData.thumbnailFiles, currentData.documentFiles) !== fingerprint
    ) return draftIdRef.current;

    const request = (async () => {
      setStatus("saving");
      setError("");
      const payload = new FormData();
      const currentForm = currentData.formData;
      const thumbnail = currentData.thumbnailFiles[0];
      const document = currentData.documentFiles[0];
      const thumbnailKey = fileFingerprint(thumbnail);
      const documentKey = fileFingerprint(document);
      payload.append("title", currentForm.title.trim());
      payload.append("asset_type", currentForm.asset_type || "document");
      payload.append("content", currentForm.content || "");
      if (currentForm.video_duration_seconds !== "" && currentForm.video_duration_seconds !== null && currentForm.video_duration_seconds !== undefined) payload.append("video_duration_seconds", currentForm.video_duration_seconds);
      payload.append("video_chapters", JSON.stringify(currentForm.video_chapters || []));
      if (currentForm.category_id) payload.append("category_id", currentForm.category_id);
      if (currentForm.work_unit_id) payload.append("work_unit_id", currentForm.work_unit_id);
      if (currentForm.authorId) payload.append("authorId", currentForm.authorId);
      if (thumbnail && uploadedFilesRef.current.thumbnail !== thumbnailKey) payload.append("thumbnail", thumbnail);
      if (document && uploadedFilesRef.current.document !== documentKey) payload.append("file", document);

      const currentDraftId = draftIdRef.current;
      const endpoint = currentDraftId ? `/api/assets/${currentDraftId}/draft` : "/api/assets/drafts";
      const response = await apiFetch(endpoint, { method: currentDraftId ? "PATCH" : "POST", auth: true, body: payload });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const requestError = new Error(result.detail || result.error || "Draf tidak dapat disimpan");
        requestError.status = response.status;
        throw requestError;
      }

      const nextId = result.id || currentDraftId;
      if (nextId && nextId !== draftIdRef.current) {
        draftIdRef.current = nextId;
        setDraftId(nextId);
      }
      previousFingerprint.current = fingerprint;
      failedFingerprint.current = null;
      blockedConflictIdentity.current = null;
      uploadedFilesRef.current = { thumbnail: thumbnailKey, document: documentKey };
      setLastSavedAt(new Date());
      setStatus("saved");
      setError("");
      onSavedRef.current?.(result);
      return nextId;
    })();

    pendingSaveRef.current = request;
    try {
      return await request;
    } catch (saveError) {
      if (latestDataRef.current.formData.is_published === "true") {
        failedFingerprint.current = null;
        blockedConflictIdentity.current = null;
        setStatus("idle");
        setError("");
        return draftIdRef.current;
      }
      failedFingerprint.current = fingerprint;
      if (saveError.status === 409) blockedConflictIdentity.current = draftIdentityFor(currentData.formData);
      setStatus("failed");
      setError(saveError.message || "Draf tidak dapat disimpan");
      return draftIdRef.current;
    } finally {
      if (pendingSaveRef.current === request) pendingSaveRef.current = null;
    }
  }, []);

  const fingerprint = fingerprintFor(formData, thumbnailFiles, documentFiles);
  const draftIdentity = draftIdentityFor(formData);

  useEffect(() => {
    const fingerprintChanged = failedFingerprint.current && failedFingerprint.current !== fingerprint;
    const conflictIdentityChanged = blockedConflictIdentity.current && blockedConflictIdentity.current !== draftIdentity;
    if (!fingerprintChanged && !conflictIdentityChanged) return;
    failedFingerprint.current = null;
    if (conflictIdentityChanged) blockedConflictIdentity.current = null;
    setStatus("idle");
    setError("");
  }, [draftIdentity, fingerprint]);

  useEffect(() => {
    if (formData.is_published !== "true") return;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    failedFingerprint.current = null;
    blockedConflictIdentity.current = null;
    setStatus("idle");
    setError("");
  }, [formData.is_published]);

  useEffect(() => {
    if (!ready || submittingRef.current || formData.is_published === "true") return undefined;
    if (previousFingerprint.current === null) { previousFingerprint.current = fingerprint; return undefined; }
    if (
      previousFingerprint.current === fingerprint
      || failedFingerprint.current === fingerprint
      || blockedConflictIdentity.current === draftIdentity
    ) return undefined;
    setStatus((current) => current === "saving" ? current : "pending");
    setError("");
    timerRef.current = window.setTimeout(() => save(fingerprint), 1200);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [ready, fingerprint, draftIdentity, retryKey, formData.is_published, save]);

  const prepareForSubmit = useCallback(async () => {
    submittingRef.current = true;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    if (pendingSaveRef.current) {
      try { await pendingSaveRef.current; } catch { /* Submit akhir akan menampilkan respons API yang relevan. */ }
    }
    return draftIdRef.current;
  }, []);

  const resumeAutosave = useCallback(() => {
    submittingRef.current = false;
    failedFingerprint.current = null;
    blockedConflictIdentity.current = null;
    setRetryKey((value) => value + 1);
  }, []);

  const retry = useCallback(() => {
    failedFingerprint.current = null;
    blockedConflictIdentity.current = null;
    setRetryKey((value) => value + 1);
  }, []);

  return {
    draftId,
    status,
    error,
    lastSavedAt,
    prepareForSubmit,
    resumeAutosave,
    retry,
  };
}
