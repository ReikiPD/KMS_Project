import { useEffect, useRef, useState } from "react";
import { Alert, Button, Modal, SelectDropdown, Skeleton, Tooltip, useToast } from "@idds/react";
import { ArrowDown, ArrowUp, Tags, X } from "lucide-react";
import { apiFetch } from "../lib/api";
import usePublicOverlayFocus from "../hooks/usePublicOverlayFocus";
import "../styles/featured-settings.css";

const settingsUrl = "/api/assets/admin/recommended-topics";
const MAX_TOPICS = 8;
const request = async (url, options = {}) => {
  const response = await apiFetch(url, { auth: true, cache: "no-store", ...options });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Pengaturan topik belum dapat diproses.");
  return result;
};

function TopicSettingsDialog({ trigger, onClose }) {
  const [categoryIds, setCategoryIds] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const mounted = useRef(true);
  const { toast } = useToast();
  const close = () => { if (!saving) onClose(); };
  usePublicOverlayFocus(true, ".kms-homepage-topics-modal", close, trigger);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setLoadError("");
    Promise.all([request(settingsUrl, { signal: controller.signal }), request("/api/assets/categories", { signal: controller.signal })])
      .then(([settings, options]) => {
        if (controller.signal.aborted) return;
        if (!Array.isArray(settings.categoryIds) || !Array.isArray(options)) throw new Error("Pengaturan topik belum dapat dimuat.");
        setCategoryIds(settings.categoryIds);
        setCategories(options);
      })
      .catch(error => { if (!controller.signal.aborted) setLoadError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);
  const byId = new Map(categories.map(category => [category.id, category]));
  const unavailable = (categoryIds || []).some(id => !byId.has(id));
  const validation = categoryIds?.length > MAX_TOPICS ? `Pilih maksimal ${MAX_TOPICS} topik.` : unavailable ? "Sebagian kategori tidak lagi tersedia. Hapus atau ganti topik tersebut." : "";
  const change = ids => { setSaveError(""); setCategoryIds(ids); };
  const reorder = (index, delta) => {
    const next = [...categoryIds];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    change(next);
  };
  const save = async () => {
    if (!categoryIds || validation || saving) return;
    setSaving(true); setSaveError("");
    try {
      await request(settingsUrl, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ categoryIds }) });
      if (!mounted.current) return;
      toast({ state: "positive", title: "Rekomendasi topik tersimpan", description: "Pilihan dan urutan topik di beranda sudah diperbarui.", duration: 3500 });
      onClose();
    } catch (error) { if (mounted.current) setSaveError(error.message); }
    finally { if (mounted.current) setSaving(false); }
  };
  const options = [...categories.map(category => ({ label: category.name, value: String(category.id) })), ...(categoryIds || []).filter(id => !byId.has(id)).map(id => ({ label: "Kategori tidak lagi tersedia", value: String(id) }))];
  return <Modal open title="Atur Rekomendasi Topik" size="lg" dialogClassname="kms-homepage-topics-modal" onClose={close}>
    <div className="kms-featured-settings" aria-busy={loading || saving}>
      {loading ? <Skeleton height="8rem" /> : loadError ? <><Alert variant="critical" message={loadError} /><Button hierarchy="secondary" onClick={() => setAttempt(value => value + 1)}>Muat ulang topik</Button></> : <>
        <p>Pilih hingga {MAX_TOPICS} kategori untuk bagian Telusuri topik. Atur urutannya di bawah; perubahan baru tampil di beranda setelah disimpan.</p>
        <SelectDropdown label="Kategori rekomendasi" options={options} selected={(categoryIds || []).map(String)} onSelect={values => change((Array.isArray(values) ? values : []).map(Number))} multiple searchable disabled={saving} width="100%" placeholder="Pilih kategori topik" indicator="check" />
        {validation && <Alert variant="caution" message={validation} />}
        <section aria-label="Urutan rekomendasi topik" className="kms-homepage-topics-list">
          <h3>Urutan di beranda</h3>
          {categoryIds?.length ? categoryIds.map((id, index) => {
            const name = byId.get(id)?.name || "Kategori tidak lagi tersedia";
            return <div key={id} className="kms-homepage-topic-row"><span aria-hidden="true">{index + 1}.</span><strong>{name}</strong><div className="kms-homepage-topic-order">
              <Tooltip title="Naikkan urutan" variant="basic" placement="bottom"><Button hierarchy="secondary" disabled={saving || index === 0} aria-label={`Naikkan topik ${name}`} onClick={() => reorder(index, -1)}><ArrowUp size={18} /></Button></Tooltip>
              <Tooltip title="Turunkan urutan" variant="basic" placement="bottom"><Button hierarchy="secondary" disabled={saving || index === categoryIds.length - 1} aria-label={`Turunkan topik ${name}`} onClick={() => reorder(index, 1)}><ArrowDown size={18} /></Button></Tooltip>
              <Tooltip title="Hapus dari rekomendasi" variant="basic" placement="bottom"><Button hierarchy="secondary" disabled={saving} aria-label={`Hapus topik ${name}`} onClick={() => change(categoryIds.filter(value => value !== id))}><X size={18} /></Button></Tooltip>
            </div></div>;
          }) : <p>Tidak ada topik dipilih. Bagian Telusuri topik akan disembunyikan; tautan Jelajahi semua pengetahuan tetap tersedia.</p>}
        </section>
        <Button hierarchy="tertiary" disabled={saving || !categoryIds?.length} onClick={() => change([])}>Kosongkan pilihan</Button>
        {saveError && <Alert variant="critical" message={saveError} />}
      </>}
      <div className="kms-modal-actions"><Button hierarchy="secondary" disabled={saving} onClick={close}>Batal</Button><Button hierarchy="primary" disabled={loading || saving || !categoryIds || Boolean(loadError) || Boolean(validation)} onClick={save}>{saving ? "Menyimpan…" : saveError ? "Coba simpan topik lagi" : "Simpan topik"}</Button></div>
    </div>
  </Modal>;
}

export default function HomepageTopicsControl() {
  const [open, setOpen] = useState(false);
  const trigger = useRef(null);
  return <><Button ref={trigger} hierarchy="secondary" prefixIcon={<Tags size={18} />} onClick={() => setOpen(true)}>Atur Rekomendasi Topik</Button>{open && <TopicSettingsDialog trigger={trigger} onClose={() => setOpen(false)} />}</>;
}
