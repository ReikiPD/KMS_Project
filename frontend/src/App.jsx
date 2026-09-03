import { lazy, Suspense, useLayoutEffect } from "react";
import { BrowserRouter, Navigate, Outlet, Routes, Route, useLocation, useNavigationType } from "react-router-dom";
import { Spinner } from "@idds/react";
import SidebarProvider from "./contexts/SidebarProvider";
import AdminViewProvider from "./contexts/AdminViewProvider";
import ThemeProvider from "./contexts/ThemeProvider";
import AuthProvider from "./contexts/AuthProvider";
import Navbar from "./components/Navbar";
import Sidebar from "./components/Sidebar";
import PublicHeader from "./components/PublicHeader";
import PublicFooter from "./components/PublicFooter";
import { OfflineNotice } from "./components/AppRuntime";
import { PermissionGuard, RoleGuard } from "./components/RouteGuards";
import StatusPage from "./components/StatusPage";

const Page = lazy(() => import("./app/Page"));
const LoginPage = lazy(() => import("./app/login/Page"));
const DashboardPage = lazy(() => import("./app/admin/dashboard/Page"));
const CreateAssetPage = lazy(() => import("./app/admin/assets/create/Page"));
const MasterDataPage = lazy(() => import("./app/admin/master-data/Page"));
const AssetsPage = lazy(() => import("./app/admin/assets/Page"));
const EditAssetPage = lazy(() => import("./app/admin/assets/edit/Page"));
const AdminAssetDetailPage = lazy(() => import("./app/admin/assets/detail/Page"));
const AssetRecoveryPage = lazy(() => import("./app/admin/assets/recovery/Page"));
const AssetVerificationPage = lazy(() => import("./app/admin/asset-verification/Page"));
const ActivityPage = lazy(() => import("./app/admin/activity/Page"));
const ProfilePage = lazy(() => import("./app/admin/profile/Page"));
const EditProfilePage = lazy(() => import("./app/admin/profile/edit/Page"));
const DetailPage = lazy(() => import("./app/detail/Page"));
const StaffPage = lazy(() => import("./app/admin/staff/Page"));
const AnnouncementsPage = lazy(() => import("./app/admin/announcements/Page"));
const RolePermissionsPage = lazy(() => import("./app/admin/role-permissions/Page"));
const WorkUnitAnalyticsPage = lazy(() => import("./app/admin/work-units/analytics/Page"));

function AdminLayout() {
  const location = useLocation();
  return (
    <RoleGuard excludeRoles={["user"]}>
      <AdminViewProvider>
        <div className="kms-admin-shell flex h-dvh min-h-dvh flex-col overflow-hidden bg-page-secondary font-sans">
          <Navbar />
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <Sidebar />
            <main id="kms-main-content" className="flex-1 overflow-y-auto">
              <div key={location.pathname} className="kms-route-transition min-h-full"><Outlet /></div>
            </main>
          </div>
        </div>
      </AdminViewProvider>
    </RoleGuard>
  );
}

function PageLoading() {
  return (
    <div className="flex min-h-[16rem] items-center justify-center" role="status" aria-live="polite">
      <Spinner
        size={42}
        borderWidth="medium"
        color="primary"
        title="Memuat halaman"
        subtitle="Menyiapkan informasi yang Anda butuhkan."
      />
    </div>
  );
}

function PublicLayout() {
  const location = useLocation();
  return (
    <div className="kms-public flex min-h-screen flex-col bg-page-secondary font-sans">
      <PublicHeader />
      <main id="kms-main-content" className="flex-1"><div key={location.pathname} className="kms-route-transition"><Outlet /></div></main>
      <PublicFooter />
    </div>
  );
}

function ScrollToTopOnNewPage() {
  const { key } = useLocation();
  const navigationType = useNavigationType();

  useLayoutEffect(() => {
    // Keep the browser's native scroll restoration for Back/Forward. For a
    // newly opened page, start at its content heading instead of inheriting
    // the scroll position from the previous page.
    if (navigationType !== "PUSH") return undefined;

    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    document.getElementById("kms-main-content")?.scrollTo({ top: 0, left: 0, behavior: "auto" });
    return undefined;
  }, [key, navigationType]);

  return null;
}

function App() {
  return (
    <SidebarProvider>
      <AuthProvider>
        <BrowserRouter>
          <ThemeProvider>
          <a href="#kms-main-content" className="kms-skip-link">Lewati ke konten utama</a>
          <ScrollToTopOnNewPage />
          <OfflineNotice />
          <Suspense fallback={<PageLoading />}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/login/pegawai" element={<LoginPage />} />
              <Route path="/register" element={<Navigate to="/login" replace />} />
              <Route element={<PublicLayout />}>
                <Route index element={<Page />} />
                <Route path="detail/:id" element={<DetailPage />} />
                <Route path="*" element={<StatusPage />} />
              </Route>
              <Route path="/library" element={<Navigate to="/" replace />} />
              <Route path="/admin/comments" element={<Navigate to="/admin/activity" replace />} />
              <Route path="admin" element={<AdminLayout />}>
                <Route path="dashboard" element={<PermissionGuard resource="dashboard"><DashboardPage /></PermissionGuard>} />
                <Route path="profile" element={<PermissionGuard resource="profile"><ProfilePage /></PermissionGuard>} />
                <Route path="profile/edit" element={<PermissionGuard resource="profile" action="edit" redirectTo="/admin/profile"><EditProfilePage /></PermissionGuard>} />
                <Route path="profile/security" element={<Navigate to="/admin/profile/edit" replace />} />
                <Route path="assets" element={<PermissionGuard resource="assets"><AssetsPage /></PermissionGuard>} />
                <Route path="assets/recovery" element={<PermissionGuard resource="asset_recovery"><AssetRecoveryPage /></PermissionGuard>} />
                <Route path="asset-verification" element={<PermissionGuard resource="asset_verification"><AssetVerificationPage /></PermissionGuard>} />
                <Route path="assets/create" element={<PermissionGuard resource="assets" action="post" redirectTo="/admin/assets"><CreateAssetPage /></PermissionGuard>} />
                <Route path="assets/:id" element={<PermissionGuard resource="assets"><AdminAssetDetailPage /></PermissionGuard>} />
                <Route path="assets/edit/:id" element={<PermissionGuard resource="assets" action="edit" redirectTo="/admin/assets"><EditAssetPage /></PermissionGuard>} />
                <Route path="activity" element={<PermissionGuard resource="activity"><ActivityPage /></PermissionGuard>} />
                <Route path="staff" element={<PermissionGuard resource="staff_management"><StaffPage /></PermissionGuard>} />
                <Route path="role-permissions" element={<PermissionGuard resource="role_permissions"><RolePermissionsPage /></PermissionGuard>} />
                <Route path="categories" element={<PermissionGuard resource="categories"><MasterDataPage type="category" /></PermissionGuard>} />
                <Route path="work-units" element={<PermissionGuard resource="work_units"><MasterDataPage type="workUnit" /></PermissionGuard>} />
                <Route path="work-units/analytics" element={<PermissionGuard resources={["analytics_echelon_1", "analytics_echelon_2", "analytics_echelon_3"]}><WorkUnitAnalyticsPage /></PermissionGuard>} />
                <Route path="work-units/:identifier/analytics" element={<PermissionGuard resources={["analytics_echelon_1", "analytics_echelon_2", "analytics_echelon_3"]}><WorkUnitAnalyticsPage /></PermissionGuard>} />
                <Route path="announcements" element={<PermissionGuard resource="announcements"><AnnouncementsPage /></PermissionGuard>} />
                <Route path="*" element={<StatusPage code="404" title="Halaman admin tidak tersedia" description="Menu tersebut tidak tersedia untuk akun atau alamat yang Anda buka." />} />
              </Route>
            </Routes>
          </Suspense>
          </ThemeProvider>
        </BrowserRouter>
      </AuthProvider>
    </SidebarProvider>
  );
}

export default App;
