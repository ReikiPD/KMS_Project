import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Avatar, BasicDropdown, Button, Drawer } from "@idds/react";
import { LayoutDashboard, LogIn, LogOut, Menu, Settings } from "lucide-react";
import KmsPublicBrand from "./KmsPublicBrand";
import usePublicOverlayFocus from "../hooks/usePublicOverlayFocus";
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
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const header = useRef(null);
  const menuTrigger = useRef(null);
  const { user, logout } = useAuth();
  usePublicOverlayFocus(menuOpen, ".kms-public-menu-panel", () => setMenuOpen(false), menuTrigger);

  useLayoutEffect(() => {
    const node = header.current;
    const shell = node?.closest(".kms-public");
    if (!shell) return undefined;
    const property = "--kms-public-header-height";
    const previous = shell.style.getPropertyValue(property);
    const measure = () => shell.style.setProperty(property, `${node.getBoundingClientRect().height}px`);
    measure();
    // Keep the hero fitted when text size, account controls, or viewport changes.
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(node);
    if (!observer) window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      if (!observer) window.removeEventListener("resize", measure);
      if (previous) shell.style.setProperty(property, previous);
      else shell.style.removeProperty(property);
    };
  }, []);

  useEffect(() => {
    setMenuOpen(false);
    if (location.pathname !== "/" || !["#unit-kerja", "#pengumuman"].includes(location.hash)) return;
    // Lazy home content may mount after the shared header.
    let timer;
    let attempts = 0;
    const reveal = () => {
      const section = document.getElementById(location.hash.slice(1));
      if (!section && attempts++ < 30) { timer = setTimeout(reveal, 100); return; }
      section?.focus({ preventScroll: true });
      section?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    };
    timer = setTimeout(reveal, 0);
    return () => clearTimeout(timer);
  }, [location.key, location.pathname, location.hash]);

  const navigation = <>{[{ to: "/", label: "Beranda" }, { to: "/library", label: "Jelajahi" }, { to: "/#unit-kerja", label: "Unit kerja" }, { to: "/#pengumuman", label: "Pengumuman" }].map(item => <Link key={item.to} to={item.to} aria-current={`${location.pathname}${location.hash}` === item.to ? "page" : undefined} onClick={() => setMenuOpen(false)}>{item.label}</Link>)}</>;

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  const roleLabel = user?.role === "pegawai" ? "Pegawai Kemenhub" : user?.role === "pimpinan" ? "Pimpinan Kemenhub" : user?.role === "admin" ? "Administrator KMS" : "Pengguna KMS";
  const canViewProfile = Boolean(user?.id) && hasPermission(user, "profile", "view");
  const backofficePath = firstAllowedBackofficePath(user);
  const canOpenBackoffice = backofficePath.startsWith("/admin/");

  return (
    <header ref={header} className="kms-header kms-public-header-redesign">
      <div className="kms-public-header-inner mx-auto flex min-h-[4.5rem] max-w-7xl items-center justify-between gap-4 px-4 py-3 md:px-8">
        <Link to="/" className="kms-brand-link" aria-label="Kembali ke beranda KMS Kemenhub"><KmsPublicBrand compact inverse /></Link>
        <nav className="kms-public-desktop-nav" aria-label="Navigasi utama">{navigation}</nav>

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
            <Button hierarchy="primary" onClick={() => navigate("/login")} prefixIcon={<LogIn size={16} />} aria-label="Masuk"><span className="kms-public-login-label">Masuk</span></Button>
          )}
          <Button ref={menuTrigger} hierarchy="secondary" className="kms-public-menu-trigger" aria-label="Buka navigasi utama" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><Menu size={21} /></Button>
        </div>
      </div>
      <Drawer isOpen={menuOpen} onClose={() => setMenuOpen(false)} title="Menu KMS Kemenhub" width="sm" panelClassName="kms-public-menu-panel"><nav className="kms-public-mobile-nav" aria-label="Navigasi utama perangkat kecil">{navigation}</nav></Drawer>
    </header>
  );
}
