import { Navigate, useLocation } from "react-router-dom";
import { currentUser } from "../lib/api";

export function RoleGuard({ children, roles, redirectTo = "/admin/dashboard", unauthenticatedTo = "/login" }) {
  const location = useLocation();
  const user = currentUser();

  if (user && roles.includes(user.role)) return children;

  return (
    <Navigate
      to={user ? redirectTo : unauthenticatedTo}
      replace
      state={{ from: `${location.pathname}${location.search}` }}
    />
  );
}

export function RequireAssetWriter({ children }) {
  const location = useLocation();
  const user = currentUser();
  const isAdminReadOnlyView = user?.role === "admin" && new URLSearchParams(location.search).has("viewUser");

  if (isAdminReadOnlyView) {
    return <Navigate to={`/admin/assets${location.search}`} replace state={{ from: location.pathname }} />;
  }
  if (["pegawai", "admin"].includes(user?.role)) return children;
  return <Navigate to="/admin/assets" replace state={{ from: location.pathname }} />;
}
