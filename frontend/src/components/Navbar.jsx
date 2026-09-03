import { useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Avatar, BasicDropdown, Button, Modal } from "@idds/react";
import { ArrowLeftFromLine, Bell, BellOff, CircleCheck, ClipboardCheck, LogOut, MessageCircle, PanelLeft, PanelLeftClose, Reply, RotateCcw, Settings, Share2, UserRoundCheck, XCircle } from "lucide-react";
import { SidebarContext } from "../contexts/SidebarContext";
import { apiFetch, avatarUrl } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { formatRelativeTime } from "../lib/dateTime";
import useAdminView from "../hooks/useAdminView";
import AccessibilityMenu from "./AccessibilityMenu";
import { adminAssetPath, publicAssetPath } from "../lib/routes";
import { hasPermission } from "../lib/permissions";

const getInitials = (name) => {
  if (!name) return "KM";
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0][0]}${parts[1][0]}`.toUpperCase() : parts[0].slice(0, 2).toUpperCase();
};

const notificationMeta = {
  comment: { icon: MessageCircle, text: "mengomentari", actorFallback: "Seseorang" },
  reply: { icon: Reply, text: "membalas komentar pada", actorFallback: "Seseorang" },
  share: { icon: Share2, text: "membagikan", actorFallback: "Seseorang" },
  asset_submitted: { icon: ClipboardCheck, text: "mengajukan untuk diverifikasi", actorFallback: "Pegawai" },
  asset_approved: { icon: CircleCheck, text: "menyetujui dan menerbitkan", actorFallback: "Verifikator KMS" },
  asset_revision: { icon: RotateCcw, text: "meminta perbaikan pada", actorFallback: "Verifikator KMS" },
  asset_rejected: { icon: XCircle, text: "menolak publikasi", actorFallback: "Verifikator KMS" },
};

export default function Navbar() {
  const { isSidebarOpen, toggleSidebar, toggleMobileSidebar } = useContext(SidebarContext);
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { accessUser, isNestedScopedContext, isEmployeeContext, staffMember, staffLoading, exitEmployeeContext } = useAdminView();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsError, setNotificationsError] = useState("");
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const hasStoredProfile = Boolean(user?.id);
  const permissionUser = accessUser || user;
  const canViewProfile = !isEmployeeContext && hasStoredProfile && hasPermission(permissionUser, "profile", "view");
  const canViewNotifications = !isEmployeeContext && hasStoredProfile;
  const handleBrandClick = () => {
    if (window.matchMedia("(max-width: 767px)").matches) toggleMobileSidebar();
    else navigate("/");
  };

  useEffect(() => {
    if (!canViewNotifications) return undefined;
    let active = true;
    const loadNotifications = async () => {
      try {
        const response = await apiFetch("/api/users/notifications?limit=12", { auth: true });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Gagal memuat notifikasi");
        if (!active) return;
        setNotifications(data.data || []);
        setUnreadCount(data.unreadCount || 0);
        setNotificationsError("");
      } catch (error) {
        if (active) setNotificationsError(error.message);
      }
    };
    loadNotifications();
    const interval = window.setInterval(loadNotifications, 60000);
    window.addEventListener("focus", loadNotifications);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", loadNotifications);
    };
  }, [canViewNotifications]);

  const handleLogout = async () => {
    await logout();
    navigate("/login/pegawai");
  };

  const markAllRead = async () => {
    const unreadIds = new Set(notifications.filter((item) => !item.is_read).map((item) => item.id));
    const previousUnreadCount = unreadCount;
    if (unreadIds.size === 0) return;

    // The badge should disappear as soon as the bell is opened, while the
    // server update keeps the state consistent across future visits.
    setNotifications((items) => items.map((item) => ({ ...item, is_read: true })));
    setUnreadCount(0);
    try {
      const response = await apiFetch("/api/users/notifications/read-all", { method: "PATCH", auth: true });
      if (!response.ok) throw new Error("Gagal menandai notifikasi");
    } catch (error) {
      setNotifications((items) => items.map((item) => unreadIds.has(item.id) ? { ...item, is_read: false } : item));
      setUnreadCount(previousUnreadCount);
      setNotificationsError(error.message);
    }
  };

  const handleNotificationOpenChange = (open) => {
    setIsNotificationsOpen(open);
    if (open && unreadCount > 0) markAllRead();
  };

  const openNotification = async (notification) => {
    if (!notification.is_read) {
      try {
        await apiFetch(`/api/users/notifications/${notification.id}/read`, { method: "PATCH", auth: true });
        setNotifications((items) => items.map((item) => item.id === notification.id ? { ...item, is_read: true } : item));
        setUnreadCount((count) => Math.max(0, count - 1));
      } catch {
        // Navigation remains available even when the status update cannot be saved.
      }
    }
    setIsNotificationsOpen(false);
    if (notification.type === "asset_submitted") {
      const params = new URLSearchParams();
      if (notification.asset_title) params.set("q", notification.asset_title);
      navigate(`/admin/asset-verification${params.size ? `?${params}` : ""}`);
      return;
    }
    if (notification.asset_public_id || notification.asset_slug || notification.asset_id) {
      const route = notification.type?.startsWith("asset_") ? adminAssetPath : publicAssetPath;
      navigate(route({
        public_id: notification.asset_public_id,
        slug: notification.asset_slug,
        id: notification.asset_id,
      }));
    }
  };

  return (
    <nav className="kms-admin-topbar flex h-16 shrink-0 items-center justify-between px-4 md:px-6" aria-label="Navigasi ruang pegawai">
      <div className="kms-admin-topbar-primary flex min-w-0 items-center gap-3">
        <div className="kms-admin-topbar-identity kms-on-brand flex min-w-0 items-center gap-2.5">
          <button type="button" onClick={handleBrandClick} className="kms-admin-brand-link flex min-w-0 items-center gap-2.5 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-white/80" aria-label="Buka navigasi pada ponsel atau kembali ke beranda">
            <span className="kms-admin-topbar-mark" aria-hidden="true"><img src="/LOGO_KEMENTERIAN_PERHUBUNGAN_REPUBLIK_INDONESIA.png" alt="" /></span>
            <span className="hidden min-w-0 leading-tight sm:block"><span className="block truncate text-xs font-bold tracking-tight">Knowledge Management System</span><span className="kms-on-brand-muted block truncate text-[10px]">Kementerian Perhubungan</span></span>
          </button>
          <Button hierarchy="tertiary" size="sm" className="kms-admin-topbar-action hidden md:inline-flex" onClick={toggleSidebar} aria-label={isSidebarOpen ? "Ringkas sidebar" : "Perluas sidebar"}>
            {isSidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeft size={18} />}
          </Button>
          <span className="kms-topbar-separator hidden h-5 w-px sm:block" aria-hidden="true" />
          <span className="kms-admin-context-label kms-on-brand-muted truncate text-xs font-semibold sm:text-sm">{isEmployeeContext ? "Mode Akses Akun" : user?.role === "admin" ? "Ruang Admin" : `Ruang ${user?.role?.replaceAll("_", " ") || "Pegawai"}`}</span>
          {isEmployeeContext && <button type="button" onClick={exitEmployeeContext} className="kms-admin-employee-pill hidden max-w-72 items-center gap-1.5 truncate rounded-full px-2.5 py-1 text-left text-xs font-semibold md:inline-flex" title={isNestedScopedContext ? "Kembali ke akun sebelumnya" : user?.role === "admin" ? "Kembali ke Ruang Admin" : "Kembali ke akun utama"}><UserRoundCheck size={14} /><span className="truncate">Akses sebagai {staffLoading ? "akun" : staffMember?.full_name || "akun"}</span><ArrowLeftFromLine size={14} /></button>}
        </div>
      </div>

      {user ? (
        <div className="kms-admin-topbar-secondary flex items-center gap-1.5">
          <AccessibilityMenu className="kms-theme-toggle--header" />
          {canViewNotifications && <><button type="button" onClick={() => handleNotificationOpenChange(true)} className="kms-admin-notification-trigger" aria-haspopup="dialog" aria-expanded={isNotificationsOpen} aria-label={unreadCount ? `${unreadCount} notifikasi belum dibaca` : "Notifikasi"}><Bell size={18} />{unreadCount > 0 && <span className="kms-admin-notification-badge">{unreadCount > 9 ? "9+" : unreadCount}</span>}</button>
          <Modal open={isNotificationsOpen} onClose={() => handleNotificationOpenChange(false)} title="Notifikasi" size="md" paddingBody="0" closeOnBackdrop closeLabel="Tutup notifikasi">
            <div className="overflow-hidden bg-page-primary">
              <p className="border-b border-border-subtle px-5 py-3 text-sm text-content-secondary">Aktivitas dan proses verifikasi aset terbaru.</p>
              {notificationsError ? <p className="px-5 py-7 text-sm text-content-secondary">Notifikasi belum dapat dimuat. Silakan coba lagi.</p> : notifications.length === 0 ? (
                <div className="flex flex-col items-center px-5 py-10 text-center"><BellOff size={28} className="text-content-tertiary" /><p className="mt-3 text-sm font-semibold text-content-primary">Belum ada notifikasi</p><p className="mt-1 text-xs text-content-secondary">Pengajuan, hasil verifikasi, komentar, balasan, dan share akan muncul di sini.</p></div>
              ) : (
                <ul className="kms-admin-notification-list kms-admin-notification-modal-list">
                  {notifications.map((notification) => {
                    const meta = notificationMeta[notification.type] || notificationMeta.comment;
                    const Icon = meta.icon;
                    return <li key={notification.id}><button type="button" onClick={() => openNotification(notification)} className={`kms-admin-notification-item ${notification.is_read ? "" : "kms-admin-notification-item--unread"}`}>
                      <span className="kms-admin-notification-icon"><Icon size={16} /></span>
                      <span className="min-w-0 flex-1 text-left"><span className="block text-sm leading-5 text-content-primary"><strong>{notification.actor_name || meta.actorFallback}</strong> {meta.text} <strong className="font-semibold">{notification.asset_title || "pengetahuan Anda"}</strong>.</span><span className="mt-1 block text-xs text-content-secondary">{formatRelativeTime(notification.created_at)}</span></span>
                      {!notification.is_read && <span className="kms-admin-unread-dot" aria-label="Belum dibaca" />}
                    </button></li>;
                  })}
                </ul>
              )}
            </div>
          </Modal></>}
          <div className="pl-1">
            <BasicDropdown
              placement="bottom-end"
              trigger={<button type="button" className="kms-admin-profile-trigger"><div className="hidden max-w-48 md:flex md:flex-col md:items-end"><span className="kms-on-brand truncate text-xs font-semibold">{user.full_name}</span><span className="kms-on-brand-muted text-[11px] capitalize">{user.role}</span></div>{user.role === "admin" ? <span className="kms-brand-avatar flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold">AD</span> : <Avatar src={avatarUrl(user.avatar_url) || undefined} alt={user.full_name} size="sm" initials={getInitials(user.full_name)} />}</button>}
              className="kms-profile-dropdown"
              content={<div className="overflow-hidden rounded-lg border border-border-subtle bg-page-primary py-1 shadow-lg">{canViewProfile && <><button type="button" onClick={() => navigate("/admin/profile")} className="kms-admin-profile-menu-item"><Settings size={17} /> Pengaturan Profil</button><div className="my-1 h-px bg-border-subtle" /></>}<button type="button" onClick={handleLogout} className="kms-admin-profile-menu-item kms-admin-profile-menu-item--danger"><LogOut size={17} /> Logout</button></div>}
            />
          </div>
        </div>
      ) : null}
    </nav>
  );
}
