import { useContext, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeftFromLine,
  ArchiveRestore,
  Bell,
  Building2,
  ChevronDown,
  FolderKanban,
  FileCheck2,
  LayoutDashboard,
  Megaphone,
  ShieldCheck,
  Tags,
  Users,
} from "lucide-react";
import { Tooltip } from "@idds/react";
import { SidebarContext } from "../contexts/SidebarContext";
import { useAuth } from "../contexts/AuthContext";
import useAdminView from "../hooks/useAdminView";
import { hasPermission } from "../lib/permissions";

const dashboardItem = { path: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard, resource: "dashboard" };
const menuGroups = [
  {
    key: "assets",
    label: "Manajemen Aset",
    icon: FolderKanban,
    items: [
      { path: "/admin/assets", label: "Aset Pengetahuan", icon: FolderKanban, resource: "assets" },
      { path: "/admin/assets/recovery", label: "Pemulihan Aset", icon: ArchiveRestore, resource: "asset_recovery" },
      { path: "/admin/asset-verification", label: "Verifikasi Aset", icon: FileCheck2, resource: "asset_verification" },
      { path: "/admin/announcements", label: "Pengumuman", icon: Megaphone, resource: "announcements" },
    ],
  },
  {
    key: "staff",
    label: "Manajemen Pegawai",
    icon: Users,
    items: [
      { path: "/admin/staff", label: "Daftar Staff", icon: Users, resource: "staff_management" },
      { path: "/admin/role-permissions", label: "Hak Akses Role", icon: ShieldCheck, resource: "role_permissions" },
      { path: "/admin/activity", label: "Pusat Aktivitas", icon: Bell, resource: "activity" },
    ],
  },
  {
    key: "master-data",
    label: "Data Referensi",
    icon: Building2,
    items: [
      { path: "/admin/work-units", label: "Unit Kerja", icon: Building2, resource: "work_units" },
      { path: "/admin/categories", label: "Kategori Topik", icon: Tags, resource: "categories" },
    ],
  },
];

function CollapsedSidebarTooltip({ collapsed, title, children }) {
  if (!collapsed) return children;
  return <Tooltip variant="basic" title={title} placement="right" showArrow={true}>{children}</Tooltip>;
}

export default function Sidebar() {
  const { user } = useAuth();
  const { isSidebarOpen, isMobileSidebarOpen, toggleSidebar, toggleMobileSidebar } = useContext(SidebarContext);
  const { accessUser, isNestedScopedContext, isEmployeeContext, staffMember, staffLoading, withEmployeeContext, exitEmployeeContext } = useAdminView();
  const location = useLocation();
  const navigate = useNavigate();
  const permissionUser = accessUser || user;
  const collapsed = !isSidebarOpen;
  const visibleDashboard = hasPermission(permissionUser, dashboardItem.resource, "view") ? dashboardItem : null;
  const analyticsResource = [1, 2, 3]
    .map((level) => `analytics_echelon_${level}`)
    .find((resource) => hasPermission(permissionUser, resource, "view")) || "";
  const ownAnalyticsItem = useMemo(() => (
    permissionUser?.work_unit_public_id && hasPermission(permissionUser, analyticsResource, "view")
      ? { path: "/admin/work-units/analytics", label: "Analitik Unit Saya", icon: Building2, resource: analyticsResource }
      : null
  ), [analyticsResource, permissionUser]);
  const visibleGroups = useMemo(() => menuGroups.map((group) => ({
    ...group,
    items: [
      ...group.items.filter((item) => hasPermission(permissionUser, item.resource, "view")),
      ...(group.key === "master-data" && ownAnalyticsItem ? [ownAnalyticsItem] : []),
    ],
  })).filter((group) => group.items.length), [ownAnalyticsItem, permissionUser]);
  const activeGroupKey = visibleGroups.find((group) => group.items.some((item) => {
    if (item.path === "/admin/assets/recovery") return location.pathname === item.path;
    if (item.path === "/admin/asset-verification") return location.pathname === item.path;
    if (item.path === "/admin/assets") return location.pathname === item.path || (location.pathname.startsWith("/admin/assets/") && !location.pathname.startsWith("/admin/assets/recovery"));
    if (item.path === "/admin/work-units/analytics") return /^\/admin\/work-units\/(?:[^/]+\/)?analytics$/.test(location.pathname);
    return location.pathname === item.path;
  }))?.key;
  const [openGroups, setOpenGroups] = useState(() => new Set());

  useEffect(() => {
    if (!activeGroupKey) return;
    setOpenGroups((current) => current.has(activeGroupKey) ? current : new Set([...current, activeGroupKey]));
  }, [activeGroupKey]);

  const isActive = (path) => {
    if (path === "/admin/assets/recovery") return location.pathname === path;
    if (path === "/admin/asset-verification") return location.pathname === path;
    if (path === "/admin/assets") return location.pathname === path || (location.pathname.startsWith("/admin/assets/") && !location.pathname.startsWith("/admin/assets/recovery"));
    if (path === "/admin/work-units/analytics") return /^\/admin\/work-units\/(?:[^/]+\/)?analytics$/.test(location.pathname);
    return location.pathname === path;
  };
  const handleNavigation = (path) => {
    navigate(withEmployeeContext(path));
    if (isMobileSidebarOpen) toggleMobileSidebar();
  };
  const toggleGroup = (groupKey) => {
    if (collapsed) toggleSidebar();
    setOpenGroups((current) => {
      const next = new Set(current);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
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
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em]"><ShieldCheck size={14} /> {user?.role === "admin" ? "Mode Admin" : "Mode akses akun"}</p>
              <p className="mt-1 line-clamp-2 text-sm font-semibold">{staffLoading ? "Memuat akun…" : staffMember?.full_name || "Akun terpilih"}</p>
              <p className="mt-1 text-xs">Akses sebagai role {staffMember?.role ? staffMember.role.replaceAll("_", " ") : "akun"}</p>
            </div>
          )}
          <p className={`px-3 text-[11px] font-bold uppercase tracking-[0.12em] text-content-tertiary ${collapsed ? "sr-only" : ""}`}>{isEmployeeContext ? `Menu ${staffMember?.role?.replaceAll("_", " ") || "akun"}` : "Menu utama"}</p>
          <nav className="mt-3 flex flex-col gap-1.5" aria-label="Menu utama backoffice">
            {visibleDashboard && (
              <CollapsedSidebarTooltip collapsed={collapsed} title={visibleDashboard.label}>
                <button
                  type="button"
                  onClick={() => handleNavigation(visibleDashboard.path)}
                  className={`kms-admin-nav-item ${isActive(visibleDashboard.path) ? "kms-admin-nav-item--active" : ""} ${collapsed ? "justify-center" : "justify-start"}`}
                  aria-current={isActive(visibleDashboard.path) ? "page" : undefined}
                >
                  <LayoutDashboard size={19} className="shrink-0" />
                  {!collapsed && <span className="ml-3 truncate">{visibleDashboard.label}</span>}
                </button>
              </CollapsedSidebarTooltip>
            )}
            {visibleGroups.map((group) => {
              const GroupIcon = group.icon;
              const expanded = openGroups.has(group.key) && !collapsed;
              const groupActive = group.key === activeGroupKey;
              return (
                <div key={group.key} className="min-w-0">
                  <CollapsedSidebarTooltip collapsed={collapsed} title={group.label}>
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.key)}
                      className={`kms-admin-nav-item w-full ${groupActive ? "kms-admin-nav-item--parent-active" : ""} ${collapsed ? "justify-center" : "justify-start"}`}
                      aria-expanded={expanded}
                      aria-controls={`sidebar-group-${group.key}`}
                    >
                      <GroupIcon size={19} className="shrink-0" />
                      {!collapsed && <><span className="ml-3 min-w-0 flex-1 truncate text-left">{group.label}</span><ChevronDown size={16} className={`shrink-0 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} /></>}
                    </button>
                  </CollapsedSidebarTooltip>
                  {expanded && (
                    <div id={`sidebar-group-${group.key}`} className="mt-1 flex flex-col gap-1 pl-4">
                      {group.items.map(({ path, label, icon: Icon }) => (
                        <button
                          key={path}
                          type="button"
                          onClick={() => handleNavigation(path)}
                          className={`kms-admin-nav-item kms-admin-nav-item--child ${isActive(path) ? "kms-admin-nav-item--active" : ""}`}
                          aria-current={isActive(path) ? "page" : undefined}
                        >
                          <Icon size={17} className="shrink-0" />
                          <span className="ml-3 truncate">{label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </div>
        {isEmployeeContext && (
          <div className="border-t border-border-subtle p-3">
            <CollapsedSidebarTooltip collapsed={collapsed} title={isNestedScopedContext ? "Kembali ke akun sebelumnya" : user?.role === "admin" ? "Kembali ke Ruang Admin" : "Kembali ke akun utama"}>
              <button type="button" onClick={leaveEmployeeMode} className={`kms-admin-nav-item w-full ${collapsed ? "justify-center" : "justify-start"}`}>
                <ArrowLeftFromLine size={19} className="shrink-0" />
                {!collapsed && <span className="ml-3">{isNestedScopedContext ? "Kembali ke akun sebelumnya" : user?.role === "admin" ? "Kembali ke Admin" : "Kembali ke akun utama"}</span>}
              </button>
            </CollapsedSidebarTooltip>
          </div>
        )}
      </aside>
    </>
  );
}
