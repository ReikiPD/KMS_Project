import { Navigate, useLocation } from "react-router-dom";
import { currentUser } from "../lib/api";

export default function RequirePegawai({ children }) {
  const location = useLocation();
  const user = currentUser();
  if (user?.role === "pegawai") return children;
  return <Navigate to={user ? "/admin/dashboard" : "/login"} replace state={{ from: location.pathname }} />;
}
