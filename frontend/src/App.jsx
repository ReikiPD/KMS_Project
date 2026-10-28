import { lazy } from "react";
import { createBrowserRouter, createRoutesFromElements, RouterProvider, Navigate, Route } from "react-router-dom";
import SidebarProvider from "./contexts/SidebarProvider";
import { InternalAssetsBoundary } from "./features/internal-assets";
import AuthProvider from "./contexts/AuthProvider";
import { PermissionGuard } from "./components/RouteGuards";
import StatusPage from "./components/StatusPage";
import { AdminLayout, PublicLayout, ApplicationFrame } from "./layouts/ApplicationLayouts";

const Page = lazy(() => import("./app/Page"));
const LoginPage = lazy(() => import("./app/login/Page"));
const DashboardPage = lazy(() => import("./app/admin/dashboard/Page"));
const MyTasksPage = lazy(() => import("./app/admin/my-tasks/Page"));
const CreateAssetPage = lazy(() => import("./app/admin/assets/create/Page"));
const MasterDataPage = lazy(() => import("./app/admin/master-data/Page"));
const AssetsPage = lazy(() => import("./app/admin/assets/Page"));
const EditAssetPage = lazy(() => import("./app/admin/assets/edit/Page"));
const AdminAssetDetailPage = lazy(() => import("./app/admin/assets/detail/Page"));
const AssetRecoveryPage = lazy(() => import("./app/admin/assets/recovery/Page"));
const AssetVerificationPage = lazy(() => import("./app/admin/asset-verification/Page"));
const AssetReviewPage = lazy(() => import("./app/admin/asset-verification/ReviewPage"));
const ActivityPage = lazy(() => import("./app/admin/activity/Page"));
const ProfilePage = lazy(() => import("./app/admin/profile/Page"));
const EditProfilePage = lazy(() => import("./app/admin/profile/edit/Page"));
const DetailPage = lazy(() => import("./app/detail/Page"));
const StaffPage = lazy(() => import("./app/admin/staff/Page"));
const AnnouncementsPage = lazy(() => import("./app/admin/announcements/Page"));
const RolePermissionsPage = lazy(() => import("./app/admin/role-permissions/Page"));
const WorkUnitAnalyticsPage = lazy(() => import("./app/admin/work-units/analytics/Page"));
const InternalAssetsPage = lazy(() => import("./app/admin/internal-assets/Page"));
const InternalAssetCreatePage = lazy(() => import("./app/admin/internal-assets/create/Page"));
const InternalDataTypesPage = lazy(() => import("./app/admin/internal-data-types/Page"));
const InternalDataCategoriesPage = lazy(() => import("./app/admin/internal-data-categories/Page"));

const router = createBrowserRouter(createRoutesFromElements(
  <Route element={<ApplicationFrame />}>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/login/pegawai" element={<LoginPage />} />
    <Route path="/register" element={<Navigate to="/login" replace />} />
    <Route element={<PublicLayout />}>
      <Route index element={<Page />} />
      <Route path="library" element={<Page catalogueOnly />} />
      <Route path="detail/:id" element={<DetailPage />} />
      <Route path="*" element={<StatusPage />} />
    </Route>
    <Route path="/admin/comments" element={<Navigate to="/admin/activity" replace />} />
    <Route path="admin" element={<AdminLayout />}>
      <Route path="my-tasks" element={<PermissionGuard resource="my_tasks"><MyTasksPage /></PermissionGuard>} />
      <Route path="dashboard" element={<PermissionGuard resource="dashboard"><DashboardPage /></PermissionGuard>} />
      <Route path="profile" element={<PermissionGuard resource="profile"><ProfilePage /></PermissionGuard>} />
      <Route path="profile/edit" element={<PermissionGuard resource="profile" action="edit" redirectTo="/admin/profile"><EditProfilePage /></PermissionGuard>} />
      <Route path="profile/security" element={<Navigate to="/admin/profile/edit" replace />} />
      <Route path="assets" element={<PermissionGuard resource="assets"><AssetsPage /></PermissionGuard>} />
      <Route path="internal-assets" element={<PermissionGuard resource="internal_assets"><InternalAssetsBoundary><InternalAssetsPage /></InternalAssetsBoundary></PermissionGuard>} />
      <Route path="internal-assets/recovery" element={<PermissionGuard resource="internal_asset_recovery"><InternalAssetsBoundary><InternalAssetsPage recovery /></InternalAssetsBoundary></PermissionGuard>} />
      <Route path="internal-assets/unit/:branch" element={<PermissionGuard resource="internal_assets"><InternalAssetsBoundary><InternalAssetsPage /></InternalAssetsBoundary></PermissionGuard>} />
      <Route path="internal-assets/create" element={<PermissionGuard resource="internal_assets" action="post"><InternalAssetsBoundary><InternalAssetCreatePage /></InternalAssetsBoundary></PermissionGuard>} />
      <Route path="internal-assets/:id/edit" element={<PermissionGuard resource="internal_assets" action="edit"><InternalAssetsBoundary><InternalAssetCreatePage /></InternalAssetsBoundary></PermissionGuard>} />
      <Route path="internal-data-types" element={<PermissionGuard resource="internal_data_types"><InternalAssetsBoundary><InternalDataTypesPage /></InternalAssetsBoundary></PermissionGuard>} />
      <Route path="internal-data-categories" element={<PermissionGuard resource="internal_data_categories"><InternalAssetsBoundary><InternalDataCategoriesPage /></InternalAssetsBoundary></PermissionGuard>} />
      <Route path="assets/recovery" element={<PermissionGuard resource="asset_recovery"><AssetRecoveryPage /></PermissionGuard>} />
      <Route path="asset-verification" element={<PermissionGuard resource="asset_verification"><AssetVerificationPage /></PermissionGuard>} />
      <Route path="asset-verification/:id" element={<PermissionGuard resource="asset_verification"><AssetReviewPage /></PermissionGuard>} />
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
  </Route>
));

function App() {
  return <SidebarProvider><AuthProvider><RouterProvider router={router} /></AuthProvider></SidebarProvider>;
}

export default App;
