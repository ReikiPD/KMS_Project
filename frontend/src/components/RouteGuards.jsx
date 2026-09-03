import { Navigate, useLocation } from "react-router-dom";
import { Spinner } from "@idds/react";
import { useAuth } from "../contexts/AuthContext";
import useAdminView from "../hooks/useAdminView";
import { firstAllowedBackofficePath, hasPermission } from "../lib/permissions";

const GuardLoading = () => <div className="flex min-h-64 items-center justify-center"><Spinner size={36} title="Memeriksa sesi" spinnerOnly /></div>;

export function RoleGuard({ children, roles, excludeRoles = [], redirectTo = "/admin/dashboard", unauthenticatedTo = "/login/pegawai" }) {
  const location = useLocation();
  const { user, loading } = useAuth();

  if (loading) return <GuardLoading />;

  const roleAllowed = user && !excludeRoles.includes(user.role) && (!roles || roles.includes(user.role));
  if (roleAllowed) return children;

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
  const { user, loading } = useAuth();
  const { accessUser, isEmployeeContext, staffLoading } = useAdminView();
  if (loading || (isEmployeeContext && staffLoading)) return <GuardLoading />;
  if (hasPermission(accessUser || user, "assets", "post")) return children;
  return <Navigate to="/admin/assets" replace state={{ from: location.pathname }} />;
}

export function PermissionGuard({ children, resource, resources = [], action = "view", redirectTo }) {
  const location = useLocation();
  const { user, loading } = useAuth();
  const { accessUser, isEmployeeContext, staffLoading } = useAdminView();
  if (loading || (isEmployeeContext && staffLoading)) return <GuardLoading />;
  const permissionUser = accessUser || user;
  const allowed = resource
    ? hasPermission(permissionUser, resource, action)
    : resources.some((item) => hasPermission(permissionUser, item, action));
  if (allowed) return children;
  return <Navigate to={user ? (redirectTo || firstAllowedBackofficePath(permissionUser)) : "/login/pegawai"} replace state={{ from: `${location.pathname}${location.search}` }} />;
}
