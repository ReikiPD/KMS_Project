import { useLayoutEffect } from "react";
import { BrowserRouter, Navigate, Routes, Route, useLocation, useNavigationType } from "react-router-dom";
import SidebarProvider from "./contexts/SidebarProvider";
import AdminViewProvider from "./contexts/AdminViewProvider";
import Navbar from "./components/Navbar";
import Sidebar from "./components/Sidebar";
import Page from "./app/Page";
import LoginPage from "./app/login/Page";
import RegisterPage from "./app/register/Page";
import DashboardPage from "./app/admin/dashboard/Page";
import CreateAssetPage from "./app/admin/assets/create/Page";
import CategoryPage from "./app/admin/categories/Page";
import WorkUnitPage from "./app/admin/work-units/Page";
import AssetsPage from "./app/admin/assets/Page";
import EditAssetPage from "./app/admin/assets/edit/Page";
import AdminAssetDetailPage from "./app/admin/assets/detail/Page";
import AssetRecoveryPage from "./app/admin/assets/recovery/Page";
import ActivityPage from "./app/admin/activity/Page";
import ProfilePage from "./app/admin/profile/Page";
import EditProfilePage from "./app/admin/profile/edit/Page";
import DetailPage from "./app/detail/Page";
import StaffPage from "./app/admin/staff/Page";
import ThemeController from "./components/ThemeController";
import PublicHeader from "./components/PublicHeader";
import PublicFooter from "./components/PublicFooter";
import RequirePegawai from "./components/RequirePegawai";
import RequireProfileAccess from "./components/RequireProfileAccess";
import RequireBackoffice from "./components/RequireBackoffice";
import RequireAdmin from "./components/RequireAdmin";
import RequireAssetWriter from "./components/RequireAssetWriter";
import OfflineNotice from "./components/OfflineNotice";

function AdminLayout({ children }) {
  return (
    <RequireBackoffice><AdminViewProvider><div className="kms-admin-shell flex h-dvh min-h-dvh flex-col overflow-hidden bg-page-secondary font-sans">
      <Navbar />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        <main id="kms-main-content" className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div></AdminViewProvider></RequireBackoffice>
  );
}

function PublicLayout({ children }) {
  return (
    <div className="kms-public flex min-h-screen flex-col bg-page-secondary font-sans">
      <PublicHeader />
      <main id="kms-main-content" className="flex-1">{children}</main>
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
          <a href="#kms-main-content" className="kms-skip-link">Lewati ke konten utama</a>
          <ThemeController />
          <ScrollToTopOnNewPage />
          <OfflineNotice />
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/" element={<PublicLayout><Page /></PublicLayout>} />
            <Route path="/detail/:id" element={<PublicLayout><DetailPage /></PublicLayout>} />
            <Route path="/library" element={<Navigate to="/" replace />} />
            <Route path="/admin/dashboard" element={<AdminLayout><DashboardPage /></AdminLayout>} />
            <Route path="/admin/profile" element={<AdminLayout><RequireProfileAccess><ProfilePage /></RequireProfileAccess></AdminLayout>} />
            <Route path="/admin/profile/edit" element={<AdminLayout><RequireProfileAccess><EditProfilePage /></RequireProfileAccess></AdminLayout>} />
            <Route path="/admin/profile/security" element={<Navigate to="/admin/profile/edit" replace />} />
            <Route path="/admin/assets" element={<AdminLayout><AssetsPage /></AdminLayout>} />
            <Route path="/admin/assets/recovery" element={<AdminLayout><RequireAdmin><AssetRecoveryPage /></RequireAdmin></AdminLayout>} />
            <Route path="/admin/assets/create" element={<AdminLayout><RequireAssetWriter><CreateAssetPage /></RequireAssetWriter></AdminLayout>} />
            <Route path="/admin/assets/:id" element={<AdminLayout><AdminAssetDetailPage /></AdminLayout>} />
            <Route path="/admin/assets/edit/:id" element={<AdminLayout><RequireAssetWriter><EditAssetPage /></RequireAssetWriter></AdminLayout>} />
            <Route path="/admin/comments" element={<Navigate to="/admin/activity" replace />} />
            <Route path="/admin/activity" element={<AdminLayout><RequirePegawai><ActivityPage /></RequirePegawai></AdminLayout>} />
            <Route path="/admin/staff" element={<AdminLayout><StaffPage /></AdminLayout>} />
            <Route path="/admin/categories" element={<AdminLayout><RequireAdmin><CategoryPage /></RequireAdmin></AdminLayout>} />
            <Route path="/admin/work-units" element={<AdminLayout><RequireAdmin><WorkUnitPage /></RequireAdmin></AdminLayout>} />
          </Routes>
      </BrowserRouter>
    </SidebarProvider>
  );
}

export default App;
