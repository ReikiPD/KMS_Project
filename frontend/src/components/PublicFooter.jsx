import { BookOpen, ExternalLink, Mail, MapPin, Phone } from "lucide-react";
import { Link } from "react-router-dom";

const officialLinks = [
  { label: "Portal Kemenhub", href: "https://dephub.go.id/" },
  { label: "PPID Kemenhub", href: "https://ppid.dephub.go.id/" },
  { label: "JDIH Kemenhub", href: "https://jdih.kemenhub.go.id/" },
  { label: "LAPOR!", href: "https://www.lapor.go.id/" },
];

export default function PublicFooter() {
  return (
    <footer className="kms-footer mt-auto" aria-label="Informasi Kementerian Perhubungan">
      <div className="mx-auto grid max-w-7xl gap-9 px-4 py-12 md:grid-cols-[minmax(0,1.3fr)_minmax(240px,0.8fr)_minmax(240px,0.8fr)] md:px-8">
        <div>
          <Link to="/" className="kms-footer-brand flex w-fit items-center gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-white/80" aria-label="Kembali ke beranda KMS Kemenhub">
            <span className="kms-footer-mark"><BookOpen size={22} aria-hidden="true" /></span>
            <div><p className="font-bold text-white">KMS Kemenhub</p><p className="text-xs text-white/70">Pusat Pengetahuan Perhubungan</p></div>
          </Link>
          <p className="mt-4 max-w-md text-sm leading-6 text-white/75">Ruang berbagi pengetahuan untuk mendukung transportasi Indonesia yang terhubung, aman, dan berkelanjutan.</p>
        </div>

        <div>
          <h2 className="kms-footer-heading">Kementerian Perhubungan</h2>
          <ul className="mt-4 space-y-3 text-sm text-white/75">
            <li className="flex gap-2"><MapPin className="mt-0.5 shrink-0 text-kms-gold" size={16} /><span>Jl. Medan Merdeka Barat No. 8, Jakarta 10110</span></li>
            <li className="flex items-center gap-2"><Phone className="shrink-0 text-kms-gold" size={16} /><a className="kms-footer-link" href="tel:151">Contact Center 151</a></li>
            <li className="flex items-center gap-2"><Mail className="shrink-0 text-kms-gold" size={16} /><a className="kms-footer-link" href="mailto:info151@dephub.go.id">info151@dephub.go.id</a></li>
          </ul>
        </div>

        <div>
          <h2 className="kms-footer-heading">Tautan resmi</h2>
          <ul className="mt-4 space-y-3 text-sm">
            {officialLinks.map((link) => <li key={link.href}><a className="kms-footer-link inline-flex items-center gap-1.5" href={link.href} target="_blank" rel="noreferrer">{link.label}<ExternalLink size={14} /></a></li>)}
          </ul>
        </div>
      </div>
      <div className="border-t border-white/15">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-4 text-xs text-white/60 sm:flex-row sm:items-center sm:justify-between md:px-8">
          <p>© {new Date().getFullYear()} Kementerian Perhubungan Republik Indonesia.</p>
          <p>KMS Kemenhub · Berbagi pengetahuan untuk konektivitas Indonesia.</p>
        </div>
      </div>
    </footer>
  );
}
