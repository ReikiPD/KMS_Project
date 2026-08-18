import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { AdminViewContext } from "./AdminViewContext";
import { apiFetch, currentUser } from "../lib/api";

const getEmployeeId = (value) => {
  const id = Number.parseInt(value, 10);
  return Number.isInteger(id) && id > 0 ? String(id) : "";
};

export default function AdminViewProvider({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const user = currentUser();
  const adminEmployeeId = user?.role === "admin" ? getEmployeeId(searchParams.get("asEmployee")) : "";
  // A regular `authorId` from an older Admin link is treated as a read-only
  // observation context. New links use the more explicit `viewUser` key.
  const adminViewedUserId = user?.role === "admin"
    ? getEmployeeId(searchParams.get("viewUser") || (adminEmployeeId ? "" : searchParams.get("authorId")))
    : "";
  // `authorId` is kept as a backwards-compatible entry point for older
  // Pimpinan links that were created before `viewEmployee` was introduced.
  const leaderEmployeeId = user?.role === "pimpinan"
    ? getEmployeeId(searchParams.get("viewEmployee") || searchParams.get("authorId"))
    : "";
  const employeeId = adminEmployeeId || adminViewedUserId || leaderEmployeeId;
  const isActingAsEmployee = Boolean(adminEmployeeId);
  const isAdminViewingUser = Boolean(adminViewedUserId);
  const isLeaderViewingEmployee = Boolean(leaderEmployeeId);
  const [staffMember, setStaffMember] = useState(null);
  const [staffLoading, setStaffLoading] = useState(false);

  useEffect(() => {
    if (!employeeId) {
      setStaffMember(null);
      setStaffLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    const loadStaffMember = async () => {
      setStaffLoading(true);
      try {
        const response = await apiFetch("/api/users/staff", { auth: true, signal: controller.signal });
        const result = await response.json();
        if (!response.ok || controller.signal.aborted) return;
        const members = result.data || result;
        setStaffMember(members.find((member) => String(member.id) === employeeId) || null);
      } catch {
        if (!controller.signal.aborted) setStaffMember(null);
      } finally {
        if (!controller.signal.aborted) setStaffLoading(false);
      }
    };
    loadStaffMember();
    return () => controller.abort();
  }, [employeeId]);

  const buildEmployeeContext = useCallback((path, selectedEmployeeId = employeeId, mode) => {
    const normalizedEmployeeId = getEmployeeId(selectedEmployeeId);
    if (!normalizedEmployeeId) return path;
    const target = new URL(path, window.location.origin);
    const resolvedMode = mode || (isActingAsEmployee ? "admin-work" : isAdminViewingUser ? "admin-view" : isLeaderViewingEmployee ? "leader-view" : "");
    target.searchParams.delete("asEmployee");
    target.searchParams.delete("viewUser");
    target.searchParams.delete("viewEmployee");
    if (resolvedMode === "admin-work") target.searchParams.set("asEmployee", normalizedEmployeeId);
    if (resolvedMode === "admin-view") target.searchParams.set("viewUser", normalizedEmployeeId);
    if (resolvedMode === "leader-view") target.searchParams.set("viewEmployee", normalizedEmployeeId);
    // authorId is retained for the existing protected asset API.
    target.searchParams.set("authorId", normalizedEmployeeId);
    return `${target.pathname}${target.search}${target.hash}`;
  }, [employeeId, isActingAsEmployee, isAdminViewingUser, isLeaderViewingEmployee]);

  const withEmployeeContext = useCallback((path) => buildEmployeeContext(path), [buildEmployeeContext]);
  const enterEmployeeContext = useCallback((selectedEmployeeId, path = "/admin/dashboard") => (
    buildEmployeeContext(path, selectedEmployeeId, "admin-work")
  ), [buildEmployeeContext]);
  const enterAdminView = useCallback((selectedEmployeeId, path = "/admin/dashboard") => (
    buildEmployeeContext(path, selectedEmployeeId, "admin-view")
  ), [buildEmployeeContext]);
  const enterLeaderView = useCallback((selectedEmployeeId, path = "/admin/dashboard") => (
    buildEmployeeContext(path, selectedEmployeeId, "leader-view")
  ), [buildEmployeeContext]);

  const exitEmployeeContext = useCallback(() => {
    navigate("/admin/dashboard", { replace: location.pathname === "/admin/dashboard" });
  }, [location.pathname, navigate]);

  const value = useMemo(() => ({
    isActingAsEmployee,
    isAdminViewingUser,
    isLeaderViewingEmployee,
    isEmployeeContext: isActingAsEmployee || isAdminViewingUser || isLeaderViewingEmployee,
    employeeId,
    staffMember,
    staffLoading,
    withEmployeeContext,
    enterEmployeeContext,
    enterAdminView,
    enterLeaderView,
    exitEmployeeContext,
  }), [isActingAsEmployee, isAdminViewingUser, isLeaderViewingEmployee, employeeId, staffMember, staffLoading, withEmployeeContext, enterEmployeeContext, enterAdminView, enterLeaderView, exitEmployeeContext]);

  return <AdminViewContext.Provider value={value}>{children}</AdminViewContext.Provider>;
}
