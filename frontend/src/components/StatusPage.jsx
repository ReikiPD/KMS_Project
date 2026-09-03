import { Button } from "@idds/react";
import { ArrowLeft, Home, SearchX } from "lucide-react";
import { Link } from "react-router-dom";

export default function StatusPage({ code = "404", title = "Halaman tidak ditemukan", description = "Alamat yang Anda buka tidak tersedia atau sudah dipindahkan.", compact = false, onBack }) {
  return <section className={`kms-status-page ${compact ? "kms-status-page--compact" : ""}`} aria-labelledby="status-page-title">
    <div className="kms-status-page-visual" aria-hidden="true"><SearchX size={34} /><span>{code}</span></div>
    <h1 id="status-page-title">{title}</h1>
    <p>{description}</p>
    <div className="mt-6 flex flex-wrap justify-center gap-3">
      {onBack && <Button hierarchy="secondary" prefixIcon={<ArrowLeft size={16} />} onClick={onBack}>Kembali</Button>}
      <Link to="/"><Button hierarchy="primary" prefixIcon={<Home size={16} />}>Ke beranda</Button></Link>
    </div>
  </section>;
}
