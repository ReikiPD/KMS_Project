import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Avatar, BasicDropdown } from "@idds/react";
import { BookOpen, LayoutDashboard, LogIn, LogOut, Settings } from "lucide-react";
import { avatarUrl, currentUser } from "../lib/api";
import ThemeToggleButton from "./ThemeToggleButton";

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
          <span className="min-w-0"><span className="kms-on-brand block truncate text-[15px] font-bold tracking-tight">KMS Kemenhub</span><span className="kms-on-brand-muted hidden text-xs sm:block">Pusat Pengetahuan Perhubungan</span></span>
        </button>

        <div className="flex items-center gap-1.5">
          <ThemeToggleButton className="kms-theme-toggle--header" />
          {user ? (
          <BasicDropdown
            placement="bottom-end"
            className="mt-2 w-56"
            trigger={<button type="button" className="kms-public-profile-trigger"><div className="hidden max-w-48 text-right md:flex md:flex-col"><span className="kms-on-brand truncate text-xs font-semibold">{user.full_name}</span><span className="kms-on-brand-muted text-[11px]">{roleLabel}</span></div>{user.role === "admin" ? <span className="kms-brand-avatar flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-bold">AD</span> : <Avatar src={avatarUrl(user.avatar_url) || undefined} alt={user.full_name || roleLabel} initials={initials(user.full_name)} size={32} className="kms-public-profile-avatar" />}</button>}
            content={<div className="overflow-hidden rounded-lg border border-border-subtle bg-page-primary py-1 shadow-lg"><div className="border-b border-border-subtle px-4 py-3"><p className="text-sm font-semibold text-content-primary">{user.full_name || roleLabel}</p><p className="mt-1 text-xs text-content-secondary">{roleLabel}</p></div>{["pegawai", "pimpinan", "admin"].includes(user.role) && <button type="button" onClick={() => navigate("/admin/dashboard")} className="kms-admin-profile-menu-item"><LayoutDashboard size={17} /> Dasbor</button>}{["pegawai", "pimpinan"].includes(user.role) && <button type="button" onClick={() => navigate("/admin/profile")} className="kms-admin-profile-menu-item"><Settings size={17} /> Pengaturan Profil</button>}<div className="my-1 h-px bg-border-subtle" /><button type="button" onClick={handleLogout} className="kms-admin-profile-menu-item kms-admin-profile-menu-item--danger"><LogOut size={17} /> Logout</button></div>}
          />
          ) : (
            <><Link to="/register" className="kms-header-register">Daftar</Link><Link to="/login" className="kms-header-button"><LogIn size={16} />Masuk</Link></>
          )}
        </div>
      </div>
    </header>
  );
}
