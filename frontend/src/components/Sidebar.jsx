import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeftFromLine,
  LibraryBig,FolderLock,ListTree,FilePlus2,Shapes,Layers,Network,ChartNoAxesCombined,ContactRound,History,GitBranch,BookOpen,Database,
  ArchiveRestore,
  Bell,
  ChevronDown,
  FolderKanban,
  FileCheck2,
  LayoutDashboard,
  ListTodo,
  Megaphone,
  ShieldCheck,
  Tags,
  Users,
  X,
} from "lucide-react";
import { Tooltip } from "@idds/react";
import { SidebarContext } from "../contexts/SidebarContext";
import { useAuth } from "../contexts/AuthContext";
import useAdminView from "../hooks/useAdminView";
import {useInternalAssets} from "../features/internal-assets";
import { hasPermission, hasOrganizationScope } from "../lib/permissions";

const dashboardItem = { path: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard, resource: "dashboard" };
const menuGroups = [
  {
    key: "assets",
    label: "Manajemen Aset",
    icon: FolderKanban,
    items: [
      { path: "/admin/assets", label: "Aset Pengetahuan", icon: BookOpen, resource: "assets" },
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
      { path: "/admin/staff", label: "Daftar Staff", icon: ContactRound, resource: "staff_management" },
      { path: "/admin/role-permissions", label: "Hak Akses Role", icon: ShieldCheck, resource: "role_permissions" },
      { path: "/admin/activity", label: "Pusat Aktivitas", icon: Bell, resource: "activity" },
    ],
  },
  {
    key: "master-data",
    label: "Data Referensi",
    icon: Database,
    items: [
      { path: "/admin/work-units", label: "Unit Kerja", icon: Network, resource: "work_units" },
      { path: "/admin/categories", label: "Kategori Topik", icon: Tags, resource: "categories" },
    ],
  },
];

function CollapsedSidebarTooltip({ collapsed, title, children }) {
  if (!collapsed) return children;
  return <Tooltip variant="basic" title={title} placement="right" showArrow={true}>{children}</Tooltip>;
}

const pathIsActive = (pathname, path) => {
  if (path === "/admin/assets/recovery") return pathname === path;
  if (path === "/admin/asset-verification") return pathname === path;
  if (path === "/admin/assets") return pathname === path || (pathname.startsWith("/admin/assets/") && !pathname.startsWith("/admin/assets/recovery"));
  if (path === "/admin/work-units/analytics") return /^\/admin\/work-units\/(?:[^/]+\/)?analytics$/.test(pathname);
  return pathname === path;
};
const navItemIsActive = (pathname, item) => item.children?.some(child=>navItemIsActive(pathname,child)) || Boolean(item.path&&pathIsActive(pathname,item.path));

export default function Sidebar() {
  const { user } = useAuth();
  const { isSidebarOpen, isMobileSidebarOpen, isDrawer, closeMobileSidebar, toggleSidebar, toggleMobileSidebar } = useContext(SidebarContext);
  const drawerRef = useRef(null);
  const { accessUser, isNestedScopedContext, isEmployeeContext, staffMember, staffLoading, withEmployeeContext, exitEmployeeContext } = useAdminView();
  const location = useLocation();
  const navigate = useNavigate();
  const permissionUser = accessUser || user;
  const internalScope = useInternalAssets();
  const collapsed = !isDrawer && !isSidebarOpen;
  useLayoutEffect(() => {
    if (!isDrawer || !isMobileSidebarOpen) return undefined;
    const drawer = drawerRef.current;
    const trigger = document.activeElement;
    const background = [document.querySelector('.kms-admin-topbar'), document.querySelector('#kms-main-content')].filter(Boolean);
    const previous = background.map(node => node.inert);
    background.forEach(node => { node.inert = true; });
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusable = () => [...drawer.querySelectorAll('button:not(:disabled),a[href],[tabindex="0"]')].filter(node => node.getClientRects().length);
    // Wait for the drawer's visibility to be committed before moving focus.
    const focusFrame = requestAnimationFrame(() => focusable()[0]?.focus());
    const onKey = event => {
      if (event.key === 'Escape') { event.preventDefault(); closeMobileSidebar(); }
      if (event.key !== 'Tab') return;
      const nodes = focusable();
      const first = nodes[0], last = nodes.at(-1);
      if (!drawer.contains(document.activeElement)) { event.preventDefault(); first?.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    drawer.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(focusFrame);
      drawer.removeEventListener('keydown', onKey);
      background.forEach((node, i) => { node.inert = previous[i]; });
      document.body.style.overflow = overflow;
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, [isDrawer, isMobileSidebarOpen, closeMobileSidebar]);
  const visibleDashboard = hasPermission(permissionUser, dashboardItem.resource, "view") ? dashboardItem : null;
  const analyticsResource = [1, 2, 3]
    .map((level) => `analytics_echelon_${level}`)
    .find((resource) => hasPermission(permissionUser, resource, "view")) || "";
  const ownAnalyticsItem = useMemo(() => (
    (permissionUser?.work_unit_public_id || hasOrganizationScope(permissionUser)) && hasPermission(permissionUser, analyticsResource, "view")
      ? { path: "/admin/work-units/analytics", label: "Analitik Unit Saya", icon: ChartNoAxesCombined, resource: analyticsResource }
      : null
  ), [analyticsResource, permissionUser]);
  const visibleGroups = useMemo(() => [...menuGroups.map((group) => ({
    ...group,
    items: [
      ...group.items.filter((item) => hasPermission(permissionUser, item.resource, "view")),
      ...(group.key === "master-data" && ownAnalyticsItem ? [ownAnalyticsItem] : []),
    ],
  })), ...(internalScope.allowed ? [{
    key: "internal-assets", label: "Aset Data Internal", icon: FolderLock,
    items: [
      ...(internalScope.canView ? [
        {key:"internal-list",label:"List Data",icon:ListTree,children:[
          {path:"/admin/internal-assets",label:"Seluruh data BKT",icon:LibraryBig},
          ...internalScope.units.filter(unit=>Number(unit.echelon_level)===2).map(unit=>({path:`/admin/internal-assets/unit/${unit.id}`,label:unit.alias||unit.name,icon:GitBranch})),
        ]},
        ...(hasPermission(permissionUser,"internal_assets","post")?[{path:"/admin/internal-assets/create",label:"Input Aset",icon:FilePlus2}]:[]),
      ] : []),
      ...(hasPermission(permissionUser,"internal_asset_recovery","view") ? [{path:"/admin/internal-assets/recovery",label:"Riwayat Penghapusan",icon:History}] : []),
      ...(internalScope.canManageTypes ? [{path:"/admin/internal-data-types",label:"Jenis Data",icon:Shapes}] : []),
      ...(internalScope.canManageCategories ? [{path:"/admin/internal-data-categories",label:"Kategori",icon:Layers}] : []),
    ],
  }] : [])].filter((group) => group.items.length), [ownAnalyticsItem, permissionUser, internalScope]);
  const activeGroupKey = visibleGroups.find((group) => group.items.some(item=>navItemIsActive(location.pathname,item)))?.key;
  const [openGroups, setOpenGroups] = useState(() => new Set());
  const [openSubgroups, setOpenSubgroups] = useState(() => new Set());

  useEffect(() => {
    if (!activeGroupKey) return;
    setOpenGroups((current) => current.has(activeGroupKey) ? current : new Set([...current, activeGroupKey]));
  }, [activeGroupKey]);

  const isActive = (path) => pathIsActive(location.pathname,path);
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
  const toggleSubgroup = (key) => setOpenSubgroups((current) => {
    const next=new Set(current);if(next.has(key))next.delete(key);else next.add(key);return next;
  });
  const leaveEmployeeMode = () => {
    exitEmployeeContext();
    if (isMobileSidebarOpen) toggleMobileSidebar();
  };

  return (
    <>
      {isDrawer && isMobileSidebarOpen && <div className="kms-sidebar-backdrop" aria-hidden="true" onClick={closeMobileSidebar} />}

      <aside ref={drawerRef} id="kms-sidebar" role={isDrawer ? "dialog" : undefined} aria-modal={isDrawer && isMobileSidebarOpen ? true : undefined} aria-label="Menu navigasi" inert={isDrawer && !isMobileSidebarOpen ? true : undefined} className={`kms-admin-sidebar kms-responsive-sidebar flex flex-col border-r border-border-subtle ${collapsed ? "w-20" : "w-64"} ${isMobileSidebarOpen ? "is-open" : ""}`}>
        {isDrawer && <div className="kms-sidebar-drawer-heading"><strong>Menu navigasi</strong><button type="button" aria-label="Tutup menu navigasi" onClick={closeMobileSidebar}><X size={22}/></button></div>}
        <div className="kms-sidebar-scroll flex flex-1 flex-col overflow-y-auto overflow-x-hidden px-3 py-5">
          {!collapsed && <div className="kms-sidebar-workspace"><span aria-hidden="true"><LibraryBig size={20} /></span><div><strong>Ruang pengelolaan</strong><small>Pengetahuan terhubung</small></div></div>}
          {isEmployeeContext && !collapsed && (
            <div className="kms-admin-employee-context mb-4 rounded-lg px-3 py-3">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em]"><ShieldCheck size={14} /> {"Mode akses akun"}</p>
              <p className="mt-1 line-clamp-2 text-sm font-semibold">{staffLoading ? "Memuat akun…" : staffMember?.full_name || "Akun terpilih"}</p>
              <p className="mt-1 text-xs">{accessUser?.read_only ? "Baca-saja · perubahan dinonaktifkan" : "Mode kerja sesuai izin akun"}</p>
            </div>
          )}
          <p className={`px-3 text-[11px] font-bold uppercase tracking-[0.12em] text-content-tertiary ${collapsed ? "sr-only" : ""}`}>{isEmployeeContext ? `Menu ${staffMember?.role?.replaceAll("_", " ") || "akun"}` : "Menu utama"}</p>
          <nav className="mt-3 flex flex-col gap-1.5" aria-label="Menu utama backoffice">
            {hasPermission(permissionUser, "my_tasks", "view") && (
              <CollapsedSidebarTooltip collapsed={collapsed} title="Tugas Saya">
                <button type="button" onClick={() => handleNavigation("/admin/my-tasks")}
                  className={`kms-admin-nav-item ${isActive("/admin/my-tasks") ? "kms-admin-nav-item--active" : ""} ${collapsed ? "justify-center" : "justify-start"}`}
                  aria-current={isActive("/admin/my-tasks") ? "page" : undefined}>
                  <ListTodo size={19} className="shrink-0" />
                  {!collapsed && <span className="ml-3 truncate">Tugas Saya</span>}
                </button>
              </CollapsedSidebarTooltip>
            )}
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
                      {group.items.map((item) => {
                        const Icon=item.icon;
                        if(item.children){const nestedOpen=openSubgroups.has(item.key);const nestedActive=item.children.some(child=>navItemIsActive(location.pathname,child));return <div key={item.key} className="min-w-0">
                          <button type="button" onClick={()=>toggleSubgroup(item.key)} className={`kms-admin-nav-item kms-admin-nav-item--child w-full ${nestedActive?'kms-admin-nav-item--parent-active':''}`} aria-expanded={nestedOpen} aria-controls={`sidebar-subgroup-${item.key}`}>
                            <Icon size={17} className="shrink-0"/><span className="ml-3 min-w-0 flex-1 truncate text-left">{item.label}</span><ChevronDown size={15} className={`shrink-0 transition-transform duration-200 ${nestedOpen?'rotate-180':''}`}/>
                          </button>
                          {nestedOpen&&<div id={`sidebar-subgroup-${item.key}`} className="mt-1 flex flex-col gap-1 pl-4">{item.children.map(child=>{const ChildIcon=child.icon;return <button key={child.path} type="button" onClick={()=>handleNavigation(child.path)} className={`kms-admin-nav-item kms-admin-nav-item--child ${isActive(child.path)?'kms-admin-nav-item--active':''}`} aria-current={isActive(child.path)?'page':undefined}><ChildIcon size={16} className="shrink-0"/><span className="ml-3 truncate">{child.label}</span></button>;})}</div>}
                        </div>;}
                        return <button key={item.path} type="button" onClick={()=>handleNavigation(item.path)} className={`kms-admin-nav-item kms-admin-nav-item--child ${isActive(item.path)?'kms-admin-nav-item--active':''}`} aria-current={isActive(item.path)?'page':undefined}><Icon size={17} className="shrink-0"/><span className="ml-3 truncate">{item.label}</span></button>;
                      })}
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
                {!collapsed && <span className="ml-3">{isNestedScopedContext ? "Kembali ke akun sebelumnya" : "Kembali ke akun utama"}</span>}
              </button>
            </CollapsedSidebarTooltip>
          </div>
        )}
      </aside>
    </>
  );
}
