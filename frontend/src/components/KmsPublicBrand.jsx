/** Official emblem is preserved; the four routes are decorative SVG geometry. */
export default function KmsPublicBrand({ compact = false, inverse = false }) {
  return <span className={`kms-public-brand ${inverse ? "kms-public-brand--inverse" : ""}`}>
    <span className="kms-public-brand-mark" aria-hidden="true">
      <svg viewBox="0 0 100 100" focusable="false">
        <circle cx="50" cy="50" r="39" fill="white" />
        <g fill="none" strokeWidth="7">
          <path d="M 54 7 A 43 43 0 0 1 93 46" stroke="#eb5c24" />
          <path d="M 93 54 A 43 43 0 0 1 54 93" stroke="#38a1db" />
          <path d="M 46 93 A 43 43 0 0 1 7 54" stroke="#914fba" />
          <path d="M 7 46 A 43 43 0 0 1 46 7" stroke="#0876b9" />
        </g>
      </svg>
      <img src="/LOGO_KEMENTERIAN_PERHUBUNGAN_REPUBLIK_INDONESIA.png" alt="" />
    </span>
    <span className="kms-public-brand-copy"><strong>{compact ? "KMS Kemenhub" : <>KMS<span>Kemenhub</span></>}</strong><small>Knowledge Management System</small></span>
  </span>;
}
