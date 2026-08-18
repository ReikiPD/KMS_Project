import { Navigate, useLocation } from "react-router-dom";
import { currentUser } from "../lib/api";

export default function RequireAdmin({ children }) {
  const location = useLocation();
  if (currentUser()?.role === "admin") return children;
  return <Navigate to="/admin/dashboard" replace state={{ from: location.pathname }} />;
}
