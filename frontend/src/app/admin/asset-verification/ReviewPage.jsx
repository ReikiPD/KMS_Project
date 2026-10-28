import WorkspaceTabs from "../../../components/WorkspaceTabs";
import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Alert, Button, Skeleton } from "@idds/react";
import { ArrowLeft, FileSearch, Info, ShieldCheck } from "lucide-react";
import AdminPageHeader from "../../../components/AdminPageHeader";
import AssetReviewDialog from "../../../components/AssetReviewDialog";
import ProtectedAssetMaterial from "../../../components/ProtectedAssetMaterial";
import useAdminView from "../../../hooks/useAdminView";
import { useAuth } from "../../../contexts/AuthContext";
import { apiFetch } from "../../../lib/api";
import "../../../styles/review-governance.css";

export default function ReviewPage() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { accessUser } = useAdminView();
  const { user } = useAuth();
  const [asset, setAsset] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("material");
  const subject = accessUser || user;
  useEffect(() => {
    const controller = new AbortController();
    setAsset(null); setError("");
    (async () => {
      try {
        const response = await apiFetch(`/api/assets/admin/publication-reviews/${encodeURIComponent(id)}/context`, { auth: true, signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.detail || result.error || "Pengajuan tidak tersedia.");
        if (!controller.signal.aborted) setAsset(result.asset);
      } catch (loadError) { if (!controller.signal.aborted) setError(loadError.message); }
    })();
    return () => controller.abort();
  }, [id, subject?.id]);
  const back = () => {
    if (location.state?.reviewOrigin) navigate(-1);
    else navigate("/admin/asset-verification");
  };
  return <div className="mx-auto w-full max-w-[1600px] p-4 md:p-6 xl:p-8">
    <AdminPageHeader eyebrow="Verifikasi Aset" title={asset?.title || "Pemeriksaan pengajuan"} description={asset ? `${asset.author_name || "Pengaju"} · ${asset.work_unit_name || "Unit kerja"}` : "Materi dan penilaian pengajuan dalam satu halaman."} actions={<Button hierarchy="secondary" prefixIcon={<ArrowLeft size={16} />} onClick={back}>Kembali ke antrean</Button>} />
    {error ? <Alert variant="critical" title="Pengajuan tidak dapat dibuka" message={error} /> : !asset ? <Skeleton height="500px" /> : <>
      <WorkspaceTabs className="kms-review-mobile-tabs" label="Bagian pemeriksaan" value={tab} onChange={setTab} items={[["material", "Materi"], ["assessment", "Penilaian"]]} />
      <div className="kms-review-workspace">
        <section data-active={tab === "material"} aria-label="Materi pengajuan">
          <div className="kms-review-material-panel">
            <header className="kms-review-panel-heading"><span><FileSearch size={21} aria-hidden="true" /></span><div><h2>Materi pengajuan</h2><p>Periksa isi berkas sebelum memberikan keputusan.</p></div></header>
            <ProtectedAssetMaterial asset={asset} />
          </div>
          <div className="kms-review-information"><h2><Info size={18} aria-hidden="true" />Informasi aset</h2><p className="mt-2 whitespace-pre-line">{asset.content}</p><p className="mt-3 text-sm text-content-secondary">{asset.category_name || "Tanpa kategori"} · Putaran {asset.review_round || 1}</p></div>
        </section>
        <section className="kms-review-assessment-panel" data-active={tab === "assessment"} aria-label="Penilaian pengajuan">
          <header className="kms-review-panel-heading"><span><ShieldCheck size={21} aria-hidden="true" /></span><div><h2>Penilaian kelayakan</h2><p>Lengkapi pemeriksaan dan sampaikan catatan yang jelas.</p></div></header>
          <AssetReviewDialog key={id} embedded asset={asset} user={subject} onClose={back} onSaved={() => window.dispatchEvent(new Event("kms-review-updated"))} />
        </section>
      </div>
    </>}
  </div>;
}
