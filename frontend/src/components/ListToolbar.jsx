export default function ListToolbar({ children, className = "", label = "Pencarian dan pengaturan daftar" }) {
  return <div className={`kms-list-toolbar ${className}`} role="group" aria-label={label}>{children}</div>;
}
