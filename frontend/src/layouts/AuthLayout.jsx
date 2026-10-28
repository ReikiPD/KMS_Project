import { ArrowLeft, BookOpen, LockKeyhole, MessagesSquare, PlayCircle } from "lucide-react";
import { Link } from "react-router-dom";
import transportPanorama from "../assets/home-panorama/transport-panorama.webp?url&no-inline";
import AccessibilityMenu from "../components/AccessibilityMenu";
import KmsPublicBrand from "../components/KmsPublicBrand";
import PublicRouteArt from "../components/PublicRouteArt";

export default function AuthLayout({ children, eyebrow, title, description, formFooter }) {
  return (
    <main id="kms-main-content" className="kms-public kms-auth-page">
      <div className="kms-auth-shell">
        <section className="kms-auth-showcase" aria-labelledby="kms-auth-showcase-title">
          <img className="kms-auth-showcase-image" src={transportPanorama} alt="" aria-hidden="true" decoding="async" fetchPriority="high" />
          <PublicRouteArt variant="baseline" />
          <div className="kms-auth-showcase-content">
            <Link to="/" className="kms-auth-brand" aria-label="Kembali ke beranda KMS Kemenhub"><KmsPublicBrand compact inverse /></Link>
            <div className="kms-auth-showcase-copy">
              <p className="kms-auth-showcase-eyebrow">TERHUBUNG DALAM PENGETAHUAN</p>
              <h2 id="kms-auth-showcase-title">Pengetahuan bergerak.<br />Layanan meningkat.</h2>
              <p>Satu ruang untuk berbagi referensi, pengalaman, dan pembelajaran transportasi Indonesia.</p>
            </div>
            <ul className="kms-auth-showcase-topics" aria-label="Ruang pengetahuan KMS">
              <li><BookOpen size={16} aria-hidden="true" />Referensi</li>
              <li><PlayCircle size={16} aria-hidden="true" />Pembelajaran</li>
              <li><MessagesSquare size={16} aria-hidden="true" />Kolaborasi</li>
            </ul>
          </div>
        </section>

        <section className="kms-auth-form-panel" aria-labelledby="kms-auth-title">
          <div className="kms-auth-form-inner">
            <div className="kms-auth-form-toolbar">
              <Link to="/" className="kms-login-back"><ArrowLeft size={16} aria-hidden="true" />Kembali ke beranda</Link>
              <AccessibilityMenu placement="bottom-end" />
            </div>
            <Link to="/" className="kms-auth-mobile-brand" aria-label="Kembali ke beranda KMS Kemenhub"><KmsPublicBrand compact /></Link>
            <div className="kms-auth-form-heading">
              <span className="kms-auth-entry-icon" aria-hidden="true"><LockKeyhole size={23} /></span>
              <p className="kms-login-eyebrow">{eyebrow}</p>
              <h1 id="kms-auth-title">{title}</h1>
              <p>{description}</p>
            </div>
            {children}
            {formFooter && <div className="kms-auth-form-footer">{formFooter}</div>}
            <p className="kms-auth-institution">Kementerian Perhubungan Republik Indonesia</p>
          </div>
        </section>
      </div>
    </main>
  );
}
