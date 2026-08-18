import { Navigate, useLocation } from "react-router-dom";
import { currentUser } from "../lib/api";

export default function RequireAssetWriter({ children }) {
  const location = useLocation();
  const isAdminReadOnlyView = currentUser()?.role === "admin" && new URLSearchParams(location.search).has("viewUser");
  if (isAdminReadOnlyView) return <Navigate to={`/admin/assets${location.search}`} replace state={{ from: location.pathname }} />;
  if (["pegawai", "admin"].includes(currentUser()?.role)) return children;
  return <Navigate to="/admin/assets" replace state={{ from: location.pathname }} />;
}
