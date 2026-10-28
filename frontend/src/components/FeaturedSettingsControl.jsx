import { useEffect, useRef, useState } from "react";
import { Alert, Button, Modal, Pagination, SelectDropdown, Skeleton, TextField, Toggle, useToast } from "@idds/react";
import { RefreshCw, Settings2 } from "lucide-react";
import { apiFetch, inputValue, uploadUrl } from "../lib/api";
import { PublicImage } from "./PublicVisual";
import AssetCard from "./AssetCard";
import usePublicOverlayFocus from "../hooks/usePublicOverlayFocus";
import "../styles/featured-settings.css";

const methods = [{ value: "manual", label: "Pilihan manual" }, { value: "popular", label: "Paling sering dilihat" }, { value: "latest", label: "Paling terkini" }];
const settingsUrl = "/api/assets/admin/featured-settings";
const draftError = slots => {
  const ids = slots.filter(slot => slot.mode === "manual" && !slot.hidden).map(slot => slot.assetId);
  if (ids.some(id => !id)) return "Pilih aset untuk setiap kartu dengan metode Pilihan manual.";
  if (new Set(ids).size !== ids.length) return "Pilihan manual tidak boleh menggunakan aset yang sama pada dua posisi.";
  return "";
};
const requestJson = async (url, options) => {
  const response = await apiFetch(url, { auth: true, cache: "no-store", ...options });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Pengaturan sorotan belum dapat diproses.");
  return result;
};

function ManualAssetPicker({ position, selected, disabled, onSelect }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState({ loading: true, data: [], pages: 1, error: "" });
  useEffect(() => {
    const controller = new AbortController();
    setResult({ loading: true, data: [], pages: 1, error: "" });
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: query.trim(), page: String(page), limit: "6", sort: "terbaru" });
        const response = await requestJson(`/api/assets/homepage?${params}`, { signal: controller.signal });
        if (!Array.isArray(response.data)) throw new Error("Daftar aset belum dapat dimuat.");
        if (!controller.signal.aborted) setResult({ loading: false, data: response.data, pages: response.pagination?.totalPages || 1, error: "" });
      } catch (error) { if (!controller.signal.aborted) setResult({ loading: false, data: [], pages: 1, error: error.message }); }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, page, attempt]);
  return <div className="kms-featured-picker">
    <TextField label={`Cari aset publik untuk Kartu ${position}`} value={query} onChange={value => { setQuery(inputValue(value)); setPage(1); }} disabled={disabled} placeholder="Cari judul, unit kerja, atau kategori" />
    <div className="kms-featured-picker-results" aria-busy={result.loading}>
      {result.loading ? <Skeleton height="4rem" /> : result.error ? <><Alert variant="critical" message={result.error} /><Button hierarchy="secondary" disabled={disabled} onClick={() => setAttempt(value => value + 1)}>Coba lagi</Button></> : result.data.length ? result.data.map(asset => <Button key={asset.public_id} hierarchy="secondary" className="kms-featured-picker-asset" disabled={disabled} aria-pressed={selected === asset.public_id} aria-label={`Pilih ${asset.title} untuk Kartu ${position}`} onClick={() => onSelect(asset)}>
        <PublicImage sources={[uploadUrl(asset.thumbnail_url)]} fallback={asset.asset_type === "video" ? "thumbnail-video" : "thumbnail-document"} alt="" />
        <span><strong>{asset.title}</strong><small>{asset.work_unit?.alias || asset.work_unit?.name || "Unit Kerja belum diisi"} · {asset.asset_type === "video" ? "Video" : "Dokumen"}</small></span>
      </Button>) : <p>Tidak ada aset publik yang sesuai pencarian.</p>}
    </div>
    {result.pages > 1 && <Pagination currentPage={page} totalPages={result.pages} pageSize={6} pageSizeOptions={[6]} onPageChange={value => !disabled && setPage(value)} />}
  </div>;
}

function FeaturedSettingsDialog({ onClose, trigger }) {
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [reload, setReload] = useState(0);
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const [preview, setPreview] = useState({ loading: false, data: [], error: "" });
  const [selectedAssets, setSelectedAssets] = useState({});
  const mounted = useRef(true);
  const { toast } = useToast();
  const close = () => { if (!saving) onClose(); };
  usePublicOverlayFocus(true, ".kms-featured-settings-modal", close, trigger);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setLoadError("");
    requestJson(settingsUrl, { signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return;
      if (typeof result.featuredEnabled !== "boolean" || !Array.isArray(result.slots) || result.slots.length !== 3) throw new Error("Pengaturan sorotan belum dapat dimuat.");
      setDraft({ featuredEnabled: result.featuredEnabled, slots: result.slots });
      setSelectedAssets(Object.fromEntries((result.preview || []).filter(slot => slot.asset && !slot.unavailable).map(slot => [slot.asset.public_id, slot.asset])));
    }).catch(error => { if (!controller.signal.aborted) setLoadError(error.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [reload]);
  const slots = draft?.slots;
  const validation = slots ? draftError(slots) : "";
  useEffect(() => {
    if (!slots || validation) { setPreview({ loading: false, data: [], error: "" }); return undefined; }
    const controller = new AbortController();
    setPreview({ loading: true, data: [], error: "" });
    const timer = setTimeout(() => {
      requestJson(`${settingsUrl}/preview`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slots }), signal: controller.signal })
        .then(result => {
          if (controller.signal.aborted) return;
          setPreview({ loading: false, data: result.preview, error: "" });
          setSelectedAssets(current => ({ ...current, ...Object.fromEntries((result.preview || []).filter(slot => slot.asset && !slot.unavailable).map(slot => [slot.asset.public_id, slot.asset])) }));
        })
        .catch(error => { if (!controller.signal.aborted) setPreview({ loading: false, data: [], error: error.message }); });
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [slots, validation, previewAttempt]);
  const changeSlot = (index, slot) => {
    setSaveError("");
    setDraft(current => ({ ...current, slots: current.slots.map((value, position) => position === index ? slot : value) }));
  };
  const save = async () => {
    if (!draft || validation || saving) return;
    setSaving(true); setSaveError("");
    try {
      await requestJson(settingsUrl, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
      if (!mounted.current) return;
      toast({ state: "positive", title: "Pengaturan sorotan tersimpan", description: "Pilihan dan tampilan kartu sudah diperbarui.", duration: 3500 });
      onClose();
    } catch (error) { if (mounted.current) setSaveError(error.message); }
    finally { if (mounted.current) setSaving(false); }
  };
  return <Modal open onClose={close} title="Atur Pengetahuan Sorotan" size="lg" dialogClassname="kms-featured-settings-modal">
    <div className="kms-featured-settings" aria-busy={saving || loading}>
      {loading ? <Skeleton height="8rem" /> : loadError ? <><Alert variant="critical" message={loadError} /><Button hierarchy="secondary" onClick={() => setReload(value => value + 1)} prefixIcon={<RefreshCw size={16} />}>Muat ulang</Button></> : draft && <>
        <SelectDropdown label="Tampilan sorotan di beranda" options={[{ value: "shown", label: "Tampilkan" }, { value: "hidden", label: "Sembunyikan" }]} selected={draft.featuredEnabled ? "shown" : "hidden"} onSelect={value => setDraft(current => ({ ...current, featuredEnabled: value === "shown" }))} disabled={saving} searchable={false} mandatorySelected width="100%" />
        <p>Atur setiap posisi secara terpisah. Pilihan otomatis diperbarui saat beranda dimuat dan tidak mengulang aset yang sudah dipilih.</p>
        {slots.map((slot, index) => <fieldset key={index} disabled={saving} className="kms-featured-slot"><legend>Kartu {index + 1}</legend>
          <div className="kms-featured-slot-visibility"><span>Tampilkan Kartu {index + 1}</span><Toggle checked={!slot.hidden} disabled={saving} aria-label={`Tampilkan Kartu ${index + 1}`} onChange={checked => changeSlot(index, { ...slot, hidden: !checked })} /></div>
          <SelectDropdown label={`Metode Kartu ${index + 1}`} options={methods} selected={slot.mode} onSelect={mode => changeSlot(index, mode === "manual" ? { mode, assetId: "" } : { mode })} disabled={saving || slot.hidden} searchable={false} mandatorySelected width="100%" />
          {slot.hidden && <p>Kartu ini disembunyikan. Metode dan pilihan aset tetap disimpan untuk ditampilkan kembali.</p>}
          {slot.mode === "manual" && !slot.hidden && <>
            {slot.assetId && <p className="kms-featured-selection">Pilihan tersimpan: {selectedAssets[slot.assetId]?.title || "Aset sebelumnya; lihat status pada pratinjau di bawah."}</p>}
            <ManualAssetPicker position={index + 1} selected={slot.assetId} disabled={saving} onSelect={asset => { setSelectedAssets(current => ({ ...current, [asset.public_id]: asset })); changeSlot(index, { mode: "manual", assetId: asset.public_id }); }} />
          </>}
        </fieldset>)}
        {validation && <Alert variant="caution" message={validation} />}
        <section aria-label="Pratinjau susunan sorotan" className="kms-featured-preview"><h3>Pratinjau susunan kartu</h3><p>Simulasi draf, bukan perubahan beranda. Tidak menambah jumlah tayangan.{!draft.featuredEnabled && " Bagian sorotan akan disembunyikan; konfigurasi kartu tetap tersimpan."}</p>
          {validation ? <p className="kms-featured-preview-placeholder">Lengkapi pilihan kartu yang ditampilkan tanpa aset manual yang sama untuk melihat pratinjau.</p> : preview.loading ? <Skeleton height="10rem" /> : preview.error ? <><Alert variant="critical" message={preview.error} /><Button hierarchy="secondary" disabled={saving} onClick={() => setPreviewAttempt(value => value + 1)}>Coba lagi pratinjau</Button></> : <div className="kms-public kms-featured-preview-grid">{preview.data.map(result => <div key={result.position}><h4>Kartu {result.position}</h4>{result.unavailable && <Alert variant="caution" message="Pilihan manual tidak tersedia untuk publik. Posisi ini sementara memakai aset terbaru yang belum digunakan." />}{result.hidden ? <p className="kms-featured-preview-placeholder">Kartu ini tidak ditampilkan di beranda.</p> : result.asset ? <AssetCard asset={result.asset} variant="panorama" nonInteractive /> : <p>Belum ada aset publik lain yang tersedia.</p>}</div>)}</div>}
        </section>
        {saveError && <Alert variant="critical" message={saveError} />}
      </>}
      <div className="kms-modal-actions"><Button hierarchy="secondary" onClick={close} disabled={saving}>Batal</Button><Button hierarchy="primary" onClick={save} disabled={saving || loading || Boolean(loadError) || !draft || Boolean(validation)}>{saving ? "Menyimpan…" : saveError ? "Coba simpan lagi" : "Simpan"}</Button></div>
    </div>
  </Modal>;
}

export default function FeaturedSettingsControl() {
  const [open, setOpen] = useState(false);
  const trigger = useRef(null);
  return <><Button ref={trigger} hierarchy="secondary" prefixIcon={<Settings2 size={18} />} onClick={() => setOpen(true)}>Atur Pengetahuan Sorotan</Button>{open && <FeaturedSettingsDialog trigger={trigger} onClose={() => setOpen(false)} />}</>;
}
