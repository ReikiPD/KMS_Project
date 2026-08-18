import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Avatar, BasicDropdown } from "@idds/react";
import { BookOpen, LayoutDashboard, LogIn, LogOut, Settings } from "lucide-react";
import { avatarUrl, currentUser } from "../lib/api";

const initials = (name) => {
  if (!name) return "KM";
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0][0]}${parts[1][0]}`.toUpperCase() : parts[0].slice(0, 2).toUpperCase();
};

export default function PublicHeader() {
  const navigate = useNavigate();
  const [user, setUser] = useState(currentUser());

  useEffect(() => {
    const syncUser = () => setUser(currentUser());
    window.addEventListener("kms-user-updated", syncUser);
    return () => window.removeEventListener("kms-user-updated", syncUser);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("kms_token");
    localStorage.removeItem("kms_user");
    setUser(null);
    navigate("/");
  };

  const roleLabel = user?.role === "pegawai" ? "Pegawai Kemenhub" : user?.role === "pimpinan" ? "Pimpinan Kemenhub" : user?.role === "admin" ? "Administrator KMS" : "Pengguna KMS";

  return (
    <header className="kms-header">
      <div className="mx-auto flex min-h-[4.5rem] max-w-7xl items-center justify-between gap-4 px-4 py-3 md:px-8">
        <button type="button" onClick={() => navigate("/")} className="kms-brand-link flex min-w-0 items-center gap-3 text-left" aria-label="Kembali ke beranda KMS Kemenhub">
          <span className="kms-header-mark"><BookOpen size={22} aria-hidden="true" /></span>
          <span className="min-w-0"><span className="block truncate text-[15px] font-bold tracking-tight text-white">KMS Kemenhub</span><span className="hidden text-xs text-white/70 sm:block">Pusat Pengetahuan Perhubungan</span></span>
        </button>

        {user ? (
          <BasicDropdown
            placement="bottom-end"
            className="mt-2 w-56"
            trigger={<button type="button" className="kms-public-profile-trigger"><div className="hidden max-w-48 text-right md:flex md:flex-col"><span className="truncate text-xs font-semibold text-white">{user.full_name}</span><span className="text-[11px] text-white/70">{roleLabel}</span></div>{user.role === "admin" ? <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-[10px] font-bold text-white">AD</span> : <Avatar src={avatarUrl(user.avatar_url) || undefined} alt={user.full_name || roleLabel} initials={initials(user.full_name)} size={32} className="kms-public-profile-avatar" />}</button>}
            content={<div className="overflow-hidden rounded-lg border border-border-subtle bg-page-primary py-1 shadow-lg"><div className="border-b border-border-subtle px-4 py-3"><p className="text-sm font-semibold text-content-primary">{user.full_name || roleLabel}</p><p className="mt-1 text-xs text-content-secondary">{roleLabel}</p></div>{["pegawai", "pimpinan", "admin"].includes(user.role) && <button type="button" onClick={() => navigate("/admin/dashboard")} className="kms-admin-profile-menu-item"><LayoutDashboard size={17} /> Dasbor</button>}{["pegawai", "pimpinan"].includes(user.role) && <button type="button" onClick={() => navigate("/admin/profile")} className="kms-admin-profile-menu-item"><Settings size={17} /> Pengaturan Profil</button>}<div className="my-1 h-px bg-border-subtle" /><button type="button" onClick={handleLogout} className="kms-admin-profile-menu-item kms-admin-profile-menu-item--danger"><LogOut size={17} /> Logout</button></div>}
          />
        ) : (
          <div className="flex items-center gap-1.5"><Link to="/register" className="kms-header-register">Daftar</Link><Link to="/login" className="kms-header-button"><LogIn size={16} />Masuk</Link></div>
        )}
      </div>
    </header>
  );
}
