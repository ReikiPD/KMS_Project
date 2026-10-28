import { Suspense, useLayoutEffect } from "react";
import { Outlet, useLocation, useNavigationType } from "react-router-dom";
import NavigationProtection from "../contexts/NavigationProtection";
import AccountContextBanner from "../components/AccountContextBanner";
import useAdminView from "../hooks/useAdminView";
import { Spinner } from "@idds/react";
import AdminViewProvider from "../contexts/AdminViewProvider";
import { InternalAssetsProvider } from "../features/internal-assets";
import ThemeProvider from "../contexts/ThemeProvider";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import PublicHeader from "../components/PublicHeader";
import PublicFooter from "../components/PublicFooter";
import { OfflineNotice } from "../components/AppRuntime";
import { RoleGuard } from "../components/RouteGuards";

function AdminContent() {
  const location = useLocation();
  const { accessUser, staffLoading, employeePublicId } = useAdminView();
  if (staffLoading) return <PageLoading />;
  return <><AccountContextBanner /><div key={`${location.pathname}:${employeePublicId || accessUser?.id || "main"}`} className="kms-route-transition min-h-full"><Outlet /></div></>;
}

function AdminLayout() {
  return (
    <RoleGuard excludeRoles={["user"]}>
      <AdminViewProvider>
        <InternalAssetsProvider>
          <div className="kms-admin-shell flex h-dvh min-h-dvh flex-col overflow-hidden bg-page-secondary font-sans">
            <Navbar />
            <div className="flex min-h-0 flex-1 overflow-hidden">
              <Sidebar />
              <main id="kms-main-content" className="flex-1 overflow-y-auto">
                <AdminContent />
              </main>
            </div>
          </div>
        </InternalAssetsProvider>
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
  const { pathname } = useLocation();
  const navigationType = useNavigationType();

  useLayoutEffect(() => {
    // Keep the browser's native scroll restoration for Back/Forward. For a
    // newly opened page, start at its content heading instead of inheriting
    // the scroll position from the previous page.
    if (navigationType !== "PUSH") return undefined;

    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    document.getElementById("kms-main-content")?.scrollTo({ top: 0, left: 0, behavior: "auto" });
    return undefined;
  }, [pathname, navigationType]);

  return null;
}

function ApplicationFrame() {
  return <ThemeProvider><NavigationProtection>
    <a href="#kms-main-content" className="kms-skip-link">Lewati ke konten utama</a>
    <ScrollToTopOnNewPage /><OfflineNotice />
    <Suspense fallback={<PageLoading />}><Outlet /></Suspense>
  </NavigationProtection></ThemeProvider>;
}

export { AdminLayout, PublicLayout, ApplicationFrame };
