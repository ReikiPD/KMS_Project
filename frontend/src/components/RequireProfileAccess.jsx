import { Navigate, useLocation } from "react-router-dom";
import { currentUser } from "../lib/api";

export default function RequireProfileAccess({ children }) {
  const location = useLocation();
  if (["pegawai", "pimpinan"].includes(currentUser()?.role)) return children;
  return <Navigate to="/admin/dashboard" replace state={{ from: location.pathname }} />;
}
