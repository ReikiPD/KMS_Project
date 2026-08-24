import { ArrowLeft, BookOpenCheck } from "lucide-react";
import { Link } from "react-router-dom";
import transportHero from "../assets/knowledge/transport-hero.png";
import ThemeToggleButton from "./ThemeToggleButton";

export default function AuthLayout({ children, eyebrow, title, description, formFooter }) {
  return (
    <main className="kms-auth-page">
      <div className="kms-auth-shell">
        <section className="kms-auth-showcase" aria-labelledby="kms-auth-showcase-title">
          <img className="kms-auth-showcase-image" src={transportHero} alt="Ilustrasi layanan transportasi Indonesia" decoding="async" />
          <div className="kms-auth-showcase-overlay" />
          <div className="kms-auth-showcase-content">
            <Link to="/" className="kms-auth-brand rounded-md outline-none focus-visible:ring-2 focus-visible:ring-white/80" aria-label="Kembali ke beranda KMS Kemenhub"><span className="kms-auth-brand-mark"><BookOpenCheck size={21} /></span><span><strong>KMS Kemenhub</strong><small>Pusat Pengetahuan Perhubungan</small></span></Link>
            <div className="kms-auth-showcase-copy">
              <p className="kms-auth-showcase-eyebrow">RUANG PENGETAHUAN TERHUBUNG</p>
              <h2 id="kms-auth-showcase-title">Pengetahuan yang menggerakkan layanan transportasi.</h2>
              <p>Temukan referensi, praktik baik, dan pembelajaran dari ekosistem Kementerian Perhubungan.</p>
            </div>
          </div>
        </section>

        <section className="kms-auth-form-panel">
          <div className="kms-auth-form-inner">
            <div className="kms-auth-form-toolbar">
              <Link to="/" className="kms-login-back"><ArrowLeft size={16} aria-hidden="true" />Kembali ke beranda</Link>
              <ThemeToggleButton placement="left" />
            </div>
            <div className="kms-auth-form-heading">
              <p className="kms-login-eyebrow">{eyebrow}</p>
              <h1>{title}</h1>
              <p>{description}</p>
            </div>
            {children}
            {formFooter && <div className="kms-auth-form-footer">{formFooter}</div>}
          </div>
        </section>
      </div>
    </main>
  );
}
