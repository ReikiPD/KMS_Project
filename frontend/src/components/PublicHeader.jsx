import { Link, useNavigate } from "react-router-dom";
import { Avatar, BasicDropdown } from "@idds/react";
import { LayoutDashboard, LogIn, LogOut, Settings } from "lucide-react";
import { avatarUrl } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import AccessibilityMenu from "./AccessibilityMenu";
import { firstAllowedBackofficePath, hasPermission } from "../lib/permissions";

const initials = (name) => {
  if (!name) return "KM";
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0][0]}${parts[1][0]}`.toUpperCase() : parts[0].slice(0, 2).toUpperCase();
};

export default function PublicHeader() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  const roleLabel = user?.role === "pegawai" ? "Pegawai Kemenhub" : user?.role === "pimpinan" ? "Pimpinan Kemenhub" : user?.role === "admin" ? "Administrator KMS" : "Pengguna KMS";
  const canViewProfile = Boolean(user?.id) && hasPermission(user, "profile", "view");
  const backofficePath = firstAllowedBackofficePath(user);
  const canOpenBackoffice = backofficePath.startsWith("/admin/");

  return (
    <header className="kms-header">
      <div className="kms-public-header-inner mx-auto flex min-h-[4.5rem] max-w-7xl items-center justify-between gap-4 px-4 py-3 md:px-8">
        <button type="button" onClick={() => navigate("/")} className="kms-brand-link flex min-w-0 items-center gap-3 text-left" aria-label="Kembali ke beranda KMS Kemenhub">
          <span className="kms-header-mark"><img src="/LOGO_KEMENTERIAN_PERHUBUNGAN_REPUBLIK_INDONESIA.png" alt="" aria-hidden="true" /></span>
          <span className="min-w-0"><span className="kms-on-brand block truncate text-[11px] font-bold tracking-tight sm:text-[15px]">Knowledge Management System</span><span className="kms-on-brand-muted block max-w-[22rem] truncate text-[9px] sm:text-xs">Kementerian Perhubungan</span></span>
        </button>

        <div className="kms-public-header-actions flex items-center gap-1.5">
          <AccessibilityMenu className="kms-theme-toggle--header" />
          {user ? (
          <BasicDropdown
            placement="bottom-end"
            className="kms-profile-dropdown"
            trigger={<button type="button" className="kms-public-profile-trigger"><div className="hidden max-w-48 text-right md:flex md:flex-col"><span className="kms-on-brand truncate text-xs font-semibold">{user.full_name}</span><span className="kms-on-brand-muted text-[11px]">{roleLabel}</span></div>{user.role === "admin" ? <span className="kms-brand-avatar flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-bold">AD</span> : <Avatar src={avatarUrl(user.avatar_url) || undefined} alt={user.full_name || roleLabel} initials={initials(user.full_name)} size={32} className="kms-public-profile-avatar" />}</button>}
            content={<div className="overflow-hidden rounded-lg border border-border-subtle bg-page-primary py-1 shadow-lg"><div className="border-b border-border-subtle px-4 py-3"><p className="text-sm font-semibold text-content-primary">{user.full_name || roleLabel}</p><p className="mt-1 text-xs text-content-secondary">{roleLabel}</p></div>{canOpenBackoffice && <button type="button" onClick={() => navigate(backofficePath)} className="kms-admin-profile-menu-item"><LayoutDashboard size={17} /> Ruang kedinasan</button>}{canViewProfile && <button type="button" onClick={() => navigate("/admin/profile")} className="kms-admin-profile-menu-item"><Settings size={17} /> Pengaturan Profil</button>}<div className="my-1 h-px bg-border-subtle" /><button type="button" onClick={handleLogout} className="kms-admin-profile-menu-item kms-admin-profile-menu-item--danger"><LogOut size={17} /> Logout</button></div>}
          />
          ) : (
            <Link to="/login" className="kms-header-button" aria-label="Masuk"><LogIn size={16} /><span className="hidden sm:inline">Masuk</span></Link>
          )}
        </div>
      </div>
    </header>
  );
}
