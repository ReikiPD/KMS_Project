import { lazy, Suspense, useLayoutEffect } from "react";
import { BrowserRouter, Navigate, Outlet, Routes, Route, useLocation, useNavigationType } from "react-router-dom";
import { Spinner } from "@idds/react";
import SidebarProvider from "./contexts/SidebarProvider";
import AdminViewProvider from "./contexts/AdminViewProvider";
import ThemeProvider from "./contexts/ThemeProvider";
import Navbar from "./components/Navbar";
import Sidebar from "./components/Sidebar";
import PublicHeader from "./components/PublicHeader";
import PublicFooter from "./components/PublicFooter";
import { OfflineNotice } from "./components/AppRuntime";
import { RequireAssetWriter, RoleGuard } from "./components/RouteGuards";

const Page = lazy(() => import("./app/Page"));
const LoginPage = lazy(() => import("./app/login/Page"));
const RegisterPage = lazy(() => import("./app/register/Page"));
const DashboardPage = lazy(() => import("./app/admin/dashboard/Page"));
const CreateAssetPage = lazy(() => import("./app/admin/assets/create/Page"));
const MasterDataPage = lazy(() => import("./app/admin/master-data/Page"));
const AssetsPage = lazy(() => import("./app/admin/assets/Page"));
const EditAssetPage = lazy(() => import("./app/admin/assets/edit/Page"));
const AdminAssetDetailPage = lazy(() => import("./app/admin/assets/detail/Page"));
const AssetRecoveryPage = lazy(() => import("./app/admin/assets/recovery/Page"));
const ActivityPage = lazy(() => import("./app/admin/activity/Page"));
const ProfilePage = lazy(() => import("./app/admin/profile/Page"));
const EditProfilePage = lazy(() => import("./app/admin/profile/edit/Page"));
const DetailPage = lazy(() => import("./app/detail/Page"));
const StaffPage = lazy(() => import("./app/admin/staff/Page"));

const BACKOFFICE_ROLES = ["pegawai", "pimpinan", "admin"];
const PROFILE_ROLES = ["pegawai", "pimpinan"];

function AdminLayout() {
  return (
    <RoleGuard roles={BACKOFFICE_ROLES}>
      <AdminViewProvider>
        <div className="kms-admin-shell flex h-dvh min-h-dvh flex-col overflow-hidden bg-page-secondary font-sans">
          <Navbar />
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <Sidebar />
            <main id="kms-main-content" className="flex-1 overflow-y-auto">
              <Outlet />
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
  return (
    <div className="kms-public flex min-h-screen flex-col bg-page-secondary font-sans">
      <PublicHeader />
      <main id="kms-main-content" className="flex-1"><Outlet /></main>
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
      <BrowserRouter>
        <ThemeProvider>
          <a href="#kms-main-content" className="kms-skip-link">Lewati ke konten utama</a>
          <ScrollToTopOnNewPage />
          <OfflineNotice />
          <Suspense fallback={<PageLoading />}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route element={<PublicLayout />}>
                <Route index element={<Page />} />
                <Route path="detail/:id" element={<DetailPage />} />
              </Route>
              <Route path="/library" element={<Navigate to="/" replace />} />
              <Route path="/admin/comments" element={<Navigate to="/admin/activity" replace />} />
              <Route path="admin" element={<AdminLayout />}>
                <Route path="dashboard" element={<DashboardPage />} />
                <Route path="profile" element={<RoleGuard roles={PROFILE_ROLES}><ProfilePage /></RoleGuard>} />
                <Route path="profile/edit" element={<RoleGuard roles={PROFILE_ROLES}><EditProfilePage /></RoleGuard>} />
                <Route path="profile/security" element={<Navigate to="/admin/profile/edit" replace />} />
                <Route path="assets" element={<AssetsPage />} />
                <Route path="assets/recovery" element={<RoleGuard roles={["admin"]}><AssetRecoveryPage /></RoleGuard>} />
                <Route path="assets/create" element={<RequireAssetWriter><CreateAssetPage /></RequireAssetWriter>} />
                <Route path="assets/:id" element={<AdminAssetDetailPage />} />
                <Route path="assets/edit/:id" element={<RequireAssetWriter><EditAssetPage /></RequireAssetWriter>} />
                <Route path="activity" element={<RoleGuard roles={["pegawai"]}><ActivityPage /></RoleGuard>} />
                <Route path="staff" element={<StaffPage />} />
                <Route path="categories" element={<RoleGuard roles={["admin"]}><MasterDataPage type="category" /></RoleGuard>} />
                <Route path="work-units" element={<RoleGuard roles={["admin"]}><MasterDataPage type="workUnit" /></RoleGuard>} />
              </Route>
            </Routes>
          </Suspense>
        </ThemeProvider>
      </BrowserRouter>
    </SidebarProvider>
  );
}

export default App;
