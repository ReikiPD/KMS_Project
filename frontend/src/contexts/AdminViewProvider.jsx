import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { AdminViewContext } from "./AdminViewContext";
import { accessContextOwnerKey, apiFetch } from "../lib/api";
import { buildContextAccessUser, hasPermission } from "../lib/permissions";
import { useAuth } from "./AuthContext";

const PUBLIC_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTEXT_PARAMS = ["asEmployee", "viewUser", "viewEmployee", "authorId"];
const CONTEXT_STORAGE_KEY = "kms.admin-view-context";

const normalizePublicId = (value) => {
  const normalized = typeof value === "string" ? value.trim() : "";
  return PUBLIC_ID_PATTERN.test(normalized) ? normalized.toLowerCase() : "";
};

const normalizeLegacyId = (value) => {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!/^\d+$/.test(normalized)) return "";
  const id = Number.parseInt(normalized, 10);
  return Number.isInteger(id) && id > 0 ? String(id) : "";
};

const modeAllowedForRole = (mode, role) => (
  (role === "admin" && ["admin-work", "admin-view"].includes(mode))
  || (role && !["user", "admin"].includes(role) && ["scoped-view", "leader-view"].includes(mode))
);

const contextBelongsToUser = (context, user) => (
  Boolean(context?.ownerKey) && context.ownerKey === accessContextOwnerKey(user)
);

const targetAllowedForMode = (mode, targetRole) => {
  if (mode === "admin-work") return targetRole === "pegawai";
  if (mode === "admin-view") return !["user", "admin"].includes(targetRole);
  if (["scoped-view", "leader-view"].includes(mode)) return !["user", "admin"].includes(targetRole);
  return false;
};

const readStoredContext = () => {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(CONTEXT_STORAGE_KEY) || "null");
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
};

const writeStoredContext = (context) => {
  if (!context) window.sessionStorage.removeItem(CONTEXT_STORAGE_KEY);
  else window.sessionStorage.setItem(CONTEXT_STORAGE_KEY, JSON.stringify(context));
};

const getQueryContext = (role, searchParams) => {
  if (role === "admin") {
    if (searchParams.get("asEmployee")) return { mode: "admin-work", value: searchParams.get("asEmployee") };
    if (searchParams.get("viewUser")) return { mode: "admin-view", value: searchParams.get("viewUser") };
    if (searchParams.get("authorId")) return { mode: "admin-view", value: searchParams.get("authorId") };
  }
  if (role && !["user", "admin"].includes(role)) {
    if (searchParams.get("viewEmployee")) return { mode: "scoped-view", value: searchParams.get("viewEmployee") };
    if (searchParams.get("authorId")) return { mode: "scoped-view", value: searchParams.get("authorId") };
  }
  return null;
};

const cleanContextPath = (path) => {
  const target = new URL(path, window.location.origin);
  CONTEXT_PARAMS.forEach((name) => target.searchParams.delete(name));
  return `${target.pathname}${target.search}${target.hash}`;
};

export default function AdminViewProvider({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [sessionContext, setSessionContext] = useState(() => readStoredContext());
  const queryContext = getQueryContext(user?.role, searchParams);
  const queryContextMode = queryContext?.mode || "";
  const queryContextValue = queryContext?.value || "";
  const hasQueryContext = Boolean(queryContextValue);
  const storedContext = modeAllowedForRole(sessionContext?.mode, user?.role)
    && contextBelongsToUser(sessionContext, user)
    ? sessionContext
    : null;
  const requestedContext = queryContext || storedContext;
  const requestedPublicId = normalizePublicId(requestedContext?.publicId || requestedContext?.value);
  const requestedSupervisorPublicId = normalizePublicId(requestedContext?.supervisorPublicId);
  const requestedLegacyId = normalizeLegacyId(requestedContext?.value);
  const hasRequestedContext = Boolean(requestedContext?.value || requestedContext?.publicId);
  const isActingAsEmployee = requestedContext?.mode === "admin-work";
  const isAdminViewingUser = requestedContext?.mode === "admin-view";
  const isScopedViewingAccount = ["scoped-view", "leader-view"].includes(requestedContext?.mode);
  const isLeaderViewingEmployee = isScopedViewingAccount;
  const isEmployeeContext = isActingAsEmployee || isAdminViewingUser || isLeaderViewingEmployee;
  const [staffMember, setStaffMember] = useState(null);
  const [supervisorMember, setSupervisorMember] = useState(null);
  const [staffLoading, setStaffLoading] = useState(hasRequestedContext);
  const [refreshRevision, setRefreshRevision] = useState(0);

  useEffect(() => {
    if (sessionContext && (
      !modeAllowedForRole(sessionContext.mode, user?.role)
      || !contextBelongsToUser(sessionContext, user)
    )) {
      writeStoredContext(null);
      setSessionContext(null);
    }
  }, [sessionContext, user]);

  useEffect(() => {
    if (!hasRequestedContext) {
      setStaffMember(null);
      setSupervisorMember(null);
      setStaffLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    const loadStaffMember = async () => {
      setStaffLoading(true);
      try {
        const response = await apiFetch("/api/users/staff", { auth: true, context: false, signal: controller.signal });
        const result = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok) {
          setStaffMember(null);
          setSupervisorMember(null);
          writeStoredContext(null);
          setSessionContext(null);
          return;
        }
        const members = result.data || result;
        const member = members.find((candidate) => (
          (requestedPublicId && String(candidate.public_id).toLowerCase() === requestedPublicId)
          || (requestedLegacyId && String(candidate.id) === requestedLegacyId)
        )) || null;
        const supervisor = requestedSupervisorPublicId
          ? members.find((candidate) => String(candidate.public_id || "").toLowerCase() === requestedSupervisorPublicId) || null
          : null;
        const supervisorIsValid = !requestedSupervisorPublicId || (
          user?.role === "admin"
          && requestedContext.mode === "admin-view"
          && member?.role && !["user", "admin"].includes(member.role)
          && supervisor?.role && !["user", "admin"].includes(supervisor.role)
          && hasPermission(supervisor, "staff_management", "view")
        );

        if (!member?.public_id || !targetAllowedForMode(requestedContext.mode, member.role) || !supervisorIsValid) {
          setStaffMember(null);
          setSupervisorMember(null);
          writeStoredContext(null);
          setSessionContext(null);
        } else {
          const canonical = {
            mode: requestedContext.mode,
            publicId: String(member.public_id).toLowerCase(),
            ownerKey: accessContextOwnerKey(user),
            ...(supervisor ? { supervisorPublicId: String(supervisor.public_id).toLowerCase() } : {}),
          };
          setStaffMember(member);
          setSupervisorMember(supervisor);
          writeStoredContext(canonical);
          setSessionContext((current) => (
            current?.mode === canonical.mode
              && current?.publicId === canonical.publicId
              && current?.supervisorPublicId === canonical.supervisorPublicId
              ? current
              : canonical
          ));
        }

        if (hasQueryContext) {
          navigate(cleanContextPath(`${location.pathname}${location.search}${location.hash}`), { replace: true });
        }
      } catch {
        if (!controller.signal.aborted) {
          setStaffMember(null);
          setSupervisorMember(null);
        }
      } finally {
        if (!controller.signal.aborted) setStaffLoading(false);
      }
    };
    loadStaffMember();
    return () => controller.abort();
  }, [hasQueryContext, hasRequestedContext, location.hash, location.pathname, location.search, navigate, queryContextMode, queryContextValue, requestedContext?.mode, requestedLegacyId, requestedPublicId, requestedSupervisorPublicId, refreshRevision, user]);

  useEffect(() => {
    const refresh = () => setRefreshRevision((current) => current + 1);
    window.addEventListener("kms-role-permissions-updated", refresh);
    return () => window.removeEventListener("kms-role-permissions-updated", refresh);
  }, []);

  const employeeId = staffMember?.id ? String(staffMember.id) : "";
  const employeePublicId = normalizePublicId(staffMember?.public_id) || requestedPublicId;
  const isNestedScopedContext = Boolean(supervisorMember && staffMember?.role && !["user", "admin"].includes(staffMember.role));
  const isNestedLeaderContext = isNestedScopedContext;
  const isDirectAdminScopedContext = Boolean(
    isAdminViewingUser
    && !isNestedScopedContext
    && staffMember?.role
    && !["user", "admin"].includes(staffMember.role)
  );
  const contextSourceUser = isNestedScopedContext
    ? buildContextAccessUser(user, supervisorMember)
    : user;
  const requiresScopedWorkGate = isScopedViewingAccount || isNestedScopedContext || isDirectAdminScopedContext;
  const scopedWorkEnabled = requiresScopedWorkGate
    ? hasPermission(isDirectAdminScopedContext ? staffMember : contextSourceUser, "staff_management", "post")
    : true;
  const accessUser = isEmployeeContext && staffMember
    ? buildContextAccessUser(contextSourceUser, staffMember, {
      readOnly: requiresScopedWorkGate && !scopedWorkEnabled,
    })
    : user;

  const activateContext = useCallback((mode, publicId, path, extras = {}) => {
    const normalized = normalizePublicId(publicId);
    if (!normalized) return cleanContextPath(path);
    const supervisorPublicId = normalizePublicId(extras.supervisorPublicId);
    const context = {
      mode,
      publicId: normalized,
      ownerKey: accessContextOwnerKey(user),
      ...(supervisorPublicId ? { supervisorPublicId } : {}),
    };
    writeStoredContext(context);
    setSessionContext(context);
    return cleanContextPath(path);
  }, [user]);

  const withEmployeeContext = useCallback((path) => cleanContextPath(path), []);
  const enterEmployeeContext = useCallback((publicId, path = "/admin/dashboard") => (
    activateContext("admin-work", publicId, path)
  ), [activateContext]);
  const enterAdminView = useCallback((publicId, path = "/admin/dashboard", options = {}) => (
    activateContext("admin-view", publicId, path, options)
  ), [activateContext]);
  const enterScopedView = useCallback((publicId, path = "/admin/dashboard") => (
    activateContext("scoped-view", publicId, path)
  ), [activateContext]);
  const enterLeaderView = enterScopedView;

  const exitEmployeeContext = useCallback(() => {
    const supervisorPublicId = normalizePublicId(sessionContext?.supervisorPublicId);
    if (supervisorPublicId && user?.role === "admin") {
      const parentContext = {
        mode: "admin-view",
        publicId: supervisorPublicId,
        ownerKey: accessContextOwnerKey(user),
      };
      writeStoredContext(parentContext);
      setSessionContext(parentContext);
      setStaffMember(null);
      setSupervisorMember(null);
      navigate("/admin/staff", { replace: location.pathname === "/admin/staff" });
      return;
    }
    writeStoredContext(null);
    setSessionContext(null);
    setStaffMember(null);
    setSupervisorMember(null);
    navigate("/admin/dashboard", { replace: location.pathname === "/admin/dashboard" });
  }, [location.pathname, navigate, sessionContext?.supervisorPublicId, user]);

  const value = useMemo(() => ({
    isActingAsEmployee,
    isAdminViewingUser,
    isLeaderViewingEmployee,
    isScopedViewingAccount,
    isNestedScopedContext,
    isNestedLeaderContext,
    isEmployeeContext,
    employeeId,
    employeePublicId,
    staffMember,
    supervisorMember,
    staffLoading,
    accessUser,
    withEmployeeContext,
    enterEmployeeContext,
    enterAdminView,
    enterScopedView,
    enterLeaderView,
    exitEmployeeContext,
  }), [isActingAsEmployee, isAdminViewingUser, isLeaderViewingEmployee, isScopedViewingAccount, isNestedScopedContext, isNestedLeaderContext, isEmployeeContext, employeeId, employeePublicId, staffMember, supervisorMember, staffLoading, accessUser, withEmployeeContext, enterEmployeeContext, enterAdminView, enterScopedView, enterLeaderView, exitEmployeeContext]);

  return <AdminViewContext.Provider value={value}>{children}</AdminViewContext.Provider>;
}
