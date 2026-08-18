import { Navigate, useLocation } from "react-router-dom";
import { currentUser } from "../lib/api";

export default function RequireBackoffice({ children }) {
  const location = useLocation();
  const user = currentUser();
  if (["pegawai", "pimpinan", "admin"].includes(user?.role)) return children;
  return <Navigate to="/login" replace state={{ from: location.pathname }} />;
}
