import { useEffect, useState } from "react";
import { Alert, Button, Skeleton } from "@idds/react";
import { fetchProtectedAssetBlob } from "../lib/protectedAssetFile";
import PdfDocumentViewer from "./PdfDocumentViewer";

export default function ProtectedAssetMaterial({ asset }) {
  const [material, setMaterial] = useState(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl;
    setMaterial(null); setError("");
    const load = async () => {
      try {
        if (!asset.file_url) throw new Error("File materi belum tersedia.");
        const blob = await fetchProtectedAssetBlob(asset.file_url, controller.signal, "Materi tidak tersedia atau akses Anda telah berubah.");
        if (controller.signal.aborted) return;
        if (asset.asset_type === "video") {
          objectUrl = URL.createObjectURL(blob);
          setMaterial({ url: objectUrl });
        } else {
          const bytes = new Uint8Array(await blob.arrayBuffer());
          if (!controller.signal.aborted) setMaterial({ bytes });
        }
      } catch (loadError) { if (!controller.signal.aborted) setError(loadError.message); }
    };
    load();
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [asset.file_url, asset.asset_type, retry]);
  if (error) return <div className="space-y-3"><Alert variant="caution" title="Materi belum dapat dimuat" message={error} /><Button onClick={() => setRetry((value) => value + 1)}>Coba lagi</Button></div>;
  if (!material) return <div role="status"><Skeleton height="420px" /><p>Memuat materi terlindungi…</p></div>;
  return material.bytes ? <PdfDocumentViewer fileData={material.bytes} title={asset.title} /> : <video className="w-full" controls playsInline src={material.url} controlsList={asset.allow_download === false ? "nodownload" : undefined} />;
}
