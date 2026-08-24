import { useContext } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeftFromLine,
  ArchiveRestore,
  Bell,
  Building2,
  FolderKanban,
  LayoutDashboard,
  ShieldCheck,
  Tags,
  Users,
} from "lucide-react";
import { Tooltip } from "@idds/react";
import { SidebarContext } from "../contexts/SidebarContext";
import { currentUser } from "../lib/api";
import useAdminView from "../hooks/useAdminView";

const menuByRole = {
  pegawai: [
    { path: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { path: "/admin/assets", label: "Aset Pengetahuan", icon: FolderKanban },
    { path: "/admin/activity", label: "Pusat Aktivitas", icon: Bell },
  ],
  pimpinan: [
    { path: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { path: "/admin/assets", label: "Aset Pengetahuan", icon: FolderKanban },
    { path: "/admin/staff", label: "Manajemen Pegawai", icon: Users },
  ],
  admin: [
    { path: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { path: "/admin/assets", label: "Aset Pengetahuan", icon: FolderKanban },
    { path: "/admin/assets/recovery", label: "Pemulihan Aset", icon: ArchiveRestore },
    { path: "/admin/staff", label: "Manajemen Pegawai", icon: Users },
    { path: "/admin/categories", label: "Kategori Topik", icon: Tags },
    { path: "/admin/work-units", label: "Unit Kerja", icon: Building2 },
  ],
};

const employeeModeMenu = menuByRole.pegawai.filter((item) => item.path !== "/admin/activity");

function CollapsedSidebarTooltip({ collapsed, title, children }) {
  if (!collapsed) return children;
  return <Tooltip variant="basic" title={title} placement="right" showArrow={true}>{children}</Tooltip>;
}

export default function Sidebar() {
  const { isSidebarOpen, isMobileSidebarOpen, toggleMobileSidebar } = useContext(SidebarContext);
  const { isActingAsEmployee, isAdminViewingUser, isEmployeeContext, staffMember, staffLoading, withEmployeeContext, exitEmployeeContext } = useAdminView();
  const location = useLocation();
  const navigate = useNavigate();
  const user = currentUser();
  const menuItems = isActingAsEmployee ? employeeModeMenu : (menuByRole[user?.role] || []);
  const collapsed = !isSidebarOpen;

  const isActive = (path) => {
    if (path === "/admin/assets/recovery") return location.pathname === path;
    if (path === "/admin/assets") return location.pathname === path || (location.pathname.startsWith("/admin/assets/") && !location.pathname.startsWith("/admin/assets/recovery"));
    return location.pathname === path;
  };
  const handleNavigation = (path) => {
    navigate(withEmployeeContext(path));
    if (isMobileSidebarOpen) toggleMobileSidebar();
  };
  const leaveEmployeeMode = () => {
    exitEmployeeContext();
    if (isMobileSidebarOpen) toggleMobileSidebar();
  };

  return (
    <>
      {isMobileSidebarOpen && <button type="button" className="fixed inset-0 z-40 bg-black/45 md:hidden" aria-label="Tutup menu navigasi" onClick={toggleMobileSidebar} />}

      <aside className={`kms-admin-sidebar fixed bottom-0 left-0 top-0 z-50 flex h-screen flex-col border-r border-border-subtle transition-all duration-300 ease-in-out md:static md:h-full ${collapsed ? "w-20" : "w-64"} ${isMobileSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}>
        <div className="flex flex-1 flex-col overflow-y-auto overflow-x-hidden px-3 py-5">
          {isEmployeeContext && !collapsed && (
            <div className="kms-admin-employee-context mb-4 rounded-lg px-3 py-3">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em]"><ShieldCheck size={14} /> {isActingAsEmployee || isAdminViewingUser ? "Mode Admin" : "Mode Pimpinan"}</p>
              <p className="mt-1 line-clamp-2 text-sm font-semibold">{staffLoading ? "Memuat akun…" : staffMember?.full_name || "Akun terpilih"}</p>
              <p className="mt-1 text-xs">{isActingAsEmployee ? "Bekerja atas nama Pegawai" : "Melihat dalam mode baca"}</p>
            </div>
          )}
          <p className={`px-3 text-[11px] font-bold uppercase tracking-[0.12em] text-content-tertiary ${collapsed ? "sr-only" : ""}`}>{isActingAsEmployee ? "Menu Pegawai" : "Menu utama"}</p>
          <nav className="mt-3 flex flex-col gap-1.5" aria-label="Menu utama backoffice">
            {menuItems.map(({ path, label, icon: Icon }) => (
              <CollapsedSidebarTooltip key={path} collapsed={collapsed} title={label}>
                <button
                  type="button"
                  onClick={() => handleNavigation(path)}
                  className={`kms-admin-nav-item ${isActive(path) ? "kms-admin-nav-item--active" : ""} ${collapsed ? "justify-center" : "justify-start"}`}
                  aria-current={isActive(path) ? "page" : undefined}
                >
                  <Icon size={19} className="shrink-0" />
                  {!collapsed && <span className="ml-3 truncate">{label}</span>}
                </button>
              </CollapsedSidebarTooltip>
            ))}
          </nav>
        </div>
        {isEmployeeContext && (
          <div className="border-t border-border-subtle p-3">
            <CollapsedSidebarTooltip collapsed={collapsed} title={isActingAsEmployee || isAdminViewingUser ? "Kembali ke Ruang Admin" : "Kembali ke Dashboard Pimpinan"}>
              <button type="button" onClick={leaveEmployeeMode} className={`kms-admin-nav-item w-full ${collapsed ? "justify-center" : "justify-start"}`}>
                <ArrowLeftFromLine size={19} className="shrink-0" />
                {!collapsed && <span className="ml-3">{isActingAsEmployee || isAdminViewingUser ? "Kembali ke Admin" : "Kembali ke Pimpinan"}</span>}
              </button>
            </CollapsedSidebarTooltip>
          </div>
        )}
      </aside>
    </>
  );
}
