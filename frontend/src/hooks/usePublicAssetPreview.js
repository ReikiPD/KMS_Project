import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../lib/api";
import { assetRouteReference } from "../lib/routes";

export default function usePublicAssetPreview() {
  const [previewAsset, setPreviewAsset] = useState(null);
  const request = useRef(null);
  const previewTrigger = useRef(null);
  useEffect(() => () => request.current?.abort(), []);
  const closePreview = () => { request.current?.abort(); setPreviewAsset(null); };
  const openAssetPreview = useCallback(async asset => {
    previewTrigger.current = document.activeElement;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setPreviewAsset(asset);
    try {
      const response = await apiFetch(`/api/assets/${encodeURIComponent(assetRouteReference(asset))}`, { signal: controller.signal });
      if (!response.ok) return;
      const detail = await response.json();
      if (!controller.signal.aborted) setPreviewAsset(detail);
    } catch { /* The existing preview displays its own media error/retry state. */ }
  }, []);
  return { previewAsset, previewTrigger, closePreview, openAssetPreview };
}
