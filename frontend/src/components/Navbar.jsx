import { useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Avatar, BasicDropdown, Button, Modal } from "@idds/react";
import { ArrowLeftFromLine, Bell, BellOff, BookOpenCheck, LogIn, LogOut, Menu, MessageCircle, PanelLeft, PanelLeftClose, Reply, Settings, Share2, UserRoundCheck } from "lucide-react";
import { SidebarContext } from "../contexts/SidebarContext";
import { apiFetch, avatarUrl, currentUser } from "../lib/api";
import { formatRelativeTime } from "../lib/dateTime";
import useAdminView from "../hooks/useAdminView";
import ThemeToggleButton from "./ThemeToggleButton";

const getInitials = (name) => {
  if (!name) return "KM";
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0][0]}${parts[1][0]}`.toUpperCase() : parts[0].slice(0, 2).toUpperCase();
};

const notificationMeta = {
  comment: { icon: MessageCircle, text: "mengomentari" },
  reply: { icon: Reply, text: "membalas komentar pada" },
  share: { icon: Share2, text: "membagikan" },
};

export default function Navbar() {
  const { isSidebarOpen, toggleSidebar, toggleMobileSidebar } = useContext(SidebarContext);
  const navigate = useNavigate();
  const { isActingAsEmployee, isAdminViewingUser, isLeaderViewingEmployee, isEmployeeContext, staffMember, staffLoading, exitEmployeeContext } = useAdminView();
  const [user, setUser] = useState(currentUser());
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsError, setNotificationsError] = useState("");
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  useEffect(() => {
    const syncUser = () => setUser(currentUser());
    window.addEventListener("kms-user-updated", syncUser);
    return () => window.removeEventListener("kms-user-updated", syncUser);
  }, []);

  useEffect(() => {
    if (user?.role !== "pegawai") return undefined;
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
  }, [user]);

  const handleLogout = () => {
    localStorage.removeItem("kms_token");
    localStorage.removeItem("kms_user");
    setUser(null);
    navigate("/login");
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
    if (notification.asset_id) navigate(`/detail/${notification.asset_id}`);
  };

  return (
    <nav className="kms-admin-topbar flex h-16 shrink-0 items-center justify-between px-4 md:px-6" aria-label="Navigasi ruang pegawai">
      <div className="flex min-w-0 items-center gap-3">
        <button type="button" onClick={toggleMobileSidebar} className="kms-admin-topbar-action -ml-2 md:hidden" aria-label="Buka menu navigasi"><Menu size={20} /></button>
        <div className="kms-on-brand flex min-w-0 items-center gap-2.5">
          <button type="button" onClick={() => navigate("/")} className="kms-admin-brand-link flex min-w-0 items-center gap-2.5 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-white/80" aria-label="Kembali ke beranda KMS Kemenhub">
            <span className="kms-admin-topbar-mark" aria-hidden="true"><BookOpenCheck size={19} /></span>
            <span className="hidden text-sm font-bold tracking-tight sm:inline">KMS Kemenhub</span>
          </button>
          <Button hierarchy="tertiary" size="sm" className="kms-admin-topbar-action hidden md:inline-flex" onClick={toggleSidebar} aria-label={isSidebarOpen ? "Ringkas sidebar" : "Perluas sidebar"}>
            {isSidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeft size={18} />}
          </Button>
          <span className="kms-topbar-separator hidden h-5 w-px sm:block" aria-hidden="true" />
          <span className="kms-on-brand-muted truncate text-xs font-semibold sm:text-sm">{isActingAsEmployee ? "Mode Pegawai" : isAdminViewingUser ? "Pantau Akun" : isLeaderViewingEmployee ? "Pantau Pegawai" : user?.role === "admin" ? "Ruang Admin" : user?.role === "pimpinan" ? "Ruang Pimpinan" : "Ruang Pegawai"}</span>
          {isEmployeeContext && <button type="button" onClick={exitEmployeeContext} className="kms-admin-employee-pill hidden max-w-72 items-center gap-1.5 truncate rounded-full px-2.5 py-1 text-left text-xs font-semibold md:inline-flex" title={isActingAsEmployee || isAdminViewingUser ? "Kembali ke Ruang Admin" : "Kembali ke Dashboard Pimpinan"}><UserRoundCheck size={14} /><span className="truncate">{isActingAsEmployee ? "Sebagai" : "Melihat"} {staffLoading ? "akun" : staffMember?.full_name || "akun"}</span><ArrowLeftFromLine size={14} /></button>}
        </div>
      </div>

      {user ? (
        <div className="flex items-center gap-1.5">
          <ThemeToggleButton className="kms-theme-toggle--header" />
          {user.role === "pegawai" && <><button type="button" onClick={() => handleNotificationOpenChange(true)} className="kms-admin-notification-trigger" aria-haspopup="dialog" aria-expanded={isNotificationsOpen} aria-label={unreadCount ? `${unreadCount} notifikasi belum dibaca` : "Notifikasi"}><Bell size={18} />{unreadCount > 0 && <span className="kms-admin-notification-badge">{unreadCount > 9 ? "9+" : unreadCount}</span>}</button>
          <Modal open={isNotificationsOpen} onClose={() => handleNotificationOpenChange(false)} title="Notifikasi" size="md" paddingBody="0" closeOnBackdrop closeLabel="Tutup notifikasi">
            <div className="overflow-hidden bg-page-primary">
              <p className="border-b border-border-subtle px-5 py-3 text-sm text-content-secondary">Aktivitas terbaru pada knowledge Anda.</p>
              {notificationsError ? <p className="px-5 py-7 text-sm text-content-secondary">Notifikasi belum dapat dimuat. Silakan coba lagi.</p> : notifications.length === 0 ? (
                <div className="flex flex-col items-center px-5 py-10 text-center"><BellOff size={28} className="text-content-tertiary" /><p className="mt-3 text-sm font-semibold text-content-primary">Belum ada notifikasi</p><p className="mt-1 text-xs text-content-secondary">Komentar, balasan, dan share akan muncul di sini.</p></div>
              ) : (
                <ul className="kms-admin-notification-list kms-admin-notification-modal-list">
                  {notifications.map((notification) => {
                    const meta = notificationMeta[notification.type] || notificationMeta.comment;
                    const Icon = meta.icon;
                    return <li key={notification.id}><button type="button" onClick={() => openNotification(notification)} className={`kms-admin-notification-item ${notification.is_read ? "" : "kms-admin-notification-item--unread"}`}>
                      <span className="kms-admin-notification-icon"><Icon size={16} /></span>
                      <span className="min-w-0 flex-1 text-left"><span className="block text-sm leading-5 text-content-primary"><strong>{notification.actor_name || "Seseorang"}</strong> {meta.text} <strong className="font-semibold">{notification.asset_title || "pengetahuan Anda"}</strong>.</span><span className="mt-1 block text-xs text-content-secondary">{formatRelativeTime(notification.created_at)}</span></span>
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
              className="mt-2 w-56"
              content={<div className="overflow-hidden rounded-lg border border-border-subtle bg-page-primary py-1 shadow-lg">{["pegawai", "pimpinan"].includes(user.role) && <><button type="button" onClick={() => navigate("/admin/profile")} className="kms-admin-profile-menu-item"><Settings size={17} /> Pengaturan Profil</button><div className="my-1 h-px bg-border-subtle" /></>}<button type="button" onClick={handleLogout} className="kms-admin-profile-menu-item kms-admin-profile-menu-item--danger"><LogOut size={17} /> Logout</button></div>}
            />
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1.5"><ThemeToggleButton className="kms-theme-toggle--header" /><Button hierarchy="secondary" size="sm" onClick={() => navigate("/login")}><LogIn size={16} className="mr-2" /> Login</Button></div>
      )}
    </nav>
  );
}
