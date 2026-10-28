import { useEffect, useState } from "react";
import { fetchProtectedAssetBlob } from "../lib/protectedAssetFile";

// Native media/link requests cannot carry the effective account headers.
export default function useProtectedAssetFile(fileName, contextKey, { asBytes = false } = {}) {
  const [file, setFile] = useState(null);
  const key = `${contextKey}:${fileName || ""}:${asBytes ? "bytes" : "url"}`;
  useEffect(() => {
    if (!fileName) return;
    const controller = new AbortController();
    let objectUrl;
    (async () => {
      try {
        const blob = await fetchProtectedAssetBlob(fileName, controller.signal, "File tidak tersedia atau akses Anda telah berubah.");
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        const bytes = asBytes ? new Uint8Array(await blob.arrayBuffer()) : undefined;
        if (controller.signal.aborted) return;
        setFile({ key, url: objectUrl, ...(bytes ? { bytes } : {}), status: "available", message: "" });
      } catch (error) {
        if (!controller.signal.aborted) setFile({ key, status: "error", message: error.message });
      }
    })();
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [asBytes, fileName, key]);
  return file?.key === key ? file : { status: fileName ? "checking" : "idle", message: "" };
}
