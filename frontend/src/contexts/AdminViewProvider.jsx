import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { AdminViewContext } from "./AdminViewContext";
import { accessContextOwnerKey, apiFetch } from "../lib/api";
import { canAccessStaffAccount } from "../lib/permissions";
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

const modeAllowedForRole = (mode, user) => (
  ["admin-work", "admin-view", "scoped-view", "leader-view", "account-view"].includes(mode)
  && canAccessStaffAccount(user)
);

const contextBelongsToUser = (context, user) => (
  Boolean(context?.ownerKey) && context.ownerKey === accessContextOwnerKey(user)
);

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

const getQueryContext = (user, searchParams) => {
  if (!canAccessStaffAccount(user)) return null;
  const value = CONTEXT_PARAMS.map((name) => searchParams.get(name)).find(Boolean);
  return value ? { mode: "account-view", value } : null;
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
  const queryContext = getQueryContext(user, searchParams);
  const queryContextMode = queryContext?.mode || "";
  const queryContextValue = queryContext?.value || "";
  const hasQueryContext = Boolean(queryContextValue);
  const storedContext = modeAllowedForRole(sessionContext?.mode, user)
    && contextBelongsToUser(sessionContext, user)
    ? sessionContext
    : null;
  const requestedContext = queryContext || storedContext;
  const requestedPublicId = normalizePublicId(requestedContext?.publicId || requestedContext?.value);
  const requestedSupervisorPublicId = normalizePublicId(requestedContext?.supervisorPublicId);
  const requestedLegacyId = normalizeLegacyId(requestedContext?.value);
  const hasRequestedContext = Boolean(requestedContext?.value || requestedContext?.publicId);
  const isActingAsEmployee = requestedContext?.mode === "admin-work";
  const isAdminViewingUser = ["admin-view", "account-view"].includes(requestedContext?.mode);
  const isScopedViewingAccount = ["scoped-view", "leader-view"].includes(requestedContext?.mode);
  const isLeaderViewingEmployee = isScopedViewingAccount;
  const isEmployeeContext = isActingAsEmployee || isAdminViewingUser || isLeaderViewingEmployee;
  const [staffMember, setStaffMember] = useState(null);
  const loadedMember = useRef(null);
  loadedMember.current = staffMember;
  const [supervisorMember, setSupervisorMember] = useState(null);
  const [staffLoading, setStaffLoading] = useState(hasRequestedContext);
  const [refreshRevision, setRefreshRevision] = useState(0);

  useEffect(() => {
    if (sessionContext && (
      !modeAllowedForRole(sessionContext.mode, user)
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
      // A permission refresh for the same account must not unmount its form.
      // Actual context switches still replace all account-scoped page state.
      setStaffLoading(!loadedMember.current || normalizePublicId(loadedMember.current.public_id) !== requestedPublicId);
      try {
        let publicId = requestedPublicId;
        if (!publicId && requestedLegacyId) {
          const legacyResponse = await apiFetch("/api/users/staff", { auth: true, context: false, signal: controller.signal });
          const legacy = await legacyResponse.json();
          publicId = (legacy.data || []).find((item) => String(item.id) === requestedLegacyId)?.public_id;
        }
        const response = await apiFetch("/api/users/staff/context", {
          auth: true, context: false, signal: controller.signal,
          headers: {
            "X-KMS-Context-User": publicId || "",
            "X-KMS-Context-Mode": requestedContext.mode,
            ...(requestedSupervisorPublicId ? { "X-KMS-Context-Supervisor": requestedSupervisorPublicId } : {}),
          },
        });
        const result = await response.json();
        if (controller.signal.aborted) return;
        const member = result.account;
        if (!response.ok || !member?.public_id) {
          setStaffMember(null); setSupervisorMember(null);
          writeStoredContext(null); setSessionContext(null);
        } else {
          const canonical = {
            mode: requestedContext.mode,
            publicId: String(member.public_id).toLowerCase(),
            ownerKey: accessContextOwnerKey(user),
            ...(member.supervisor_public_id ? { supervisorPublicId: member.supervisor_public_id } : {}),
          };
          setStaffMember(member); setSupervisorMember(member.supervisor || null);
          writeStoredContext(canonical);
          setSessionContext((current) => current?.mode === canonical.mode
            && current?.publicId === canonical.publicId
            && current?.supervisorPublicId === canonical.supervisorPublicId ? current : canonical);
        }

        if (hasQueryContext) {
          navigate(cleanContextPath(window.location.href), { replace: true });
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
  }, [hasQueryContext, hasRequestedContext, navigate, queryContextMode, queryContextValue, requestedContext?.mode, requestedLegacyId, requestedPublicId, requestedSupervisorPublicId, refreshRevision, user]);

  useEffect(() => {
    const refresh = () => setRefreshRevision((current) => current + 1);
    window.addEventListener("kms-role-permissions-updated", refresh);
    return () => window.removeEventListener("kms-role-permissions-updated", refresh);
  }, []);

  const employeeId = staffMember?.id ? String(staffMember.id) : "";
  const employeePublicId = normalizePublicId(staffMember?.public_id) || requestedPublicId;
  const isNestedScopedContext = Boolean(supervisorMember);
  const isNestedLeaderContext = isNestedScopedContext;
  // Backend returns the effective permissions for every context (including
  // read-only restrictions). Do not reconstruct access from a role name.
  const accessUser = useMemo(() => isEmployeeContext && staffMember ? {
    ...staffMember, environmentAdmin: false,
    actorAccount: { id: user?.id, public_id: user?.public_id, full_name: user?.full_name, role: user?.role },
    contextAccount: { id: staffMember.id, public_id: staffMember.public_id, full_name: staffMember.full_name, role: staffMember.role },
  } : user, [isEmployeeContext, staffMember, user]);

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
    const performEntry = () => {
      setStaffLoading(true);
      writeStoredContext(context);
      setSessionContext(context);
      setStaffMember(null);
      setSupervisorMember(null);
      navigate(cleanContextPath(path));
    };
    if (window.dispatchEvent(new CustomEvent("kms-before-context-change", { cancelable: true, detail: performEntry }))) performEntry();
  }, [navigate, user]);

  const withEmployeeContext = useCallback((path) => cleanContextPath(path), []);
  const enterEmployeeContext = useCallback((publicId, path = "/admin/dashboard") => (
    activateContext("admin-work", publicId, path)
  ), [activateContext]);
  const enterAdminView = useCallback((publicId, path = "/admin/dashboard", options = {}) => (
    activateContext("account-view", publicId, path, options)
  ), [activateContext]);
  const enterScopedView = useCallback((publicId, path = "/admin/dashboard") => (
    activateContext("scoped-view", publicId, path)
  ), [activateContext]);
  const enterLeaderView = enterScopedView;

  const exitEmployeeContext = useCallback(() => {
    const performExit = () => {
    const supervisorPublicId = normalizePublicId(sessionContext?.supervisorPublicId);
    if (supervisorPublicId && canAccessStaffAccount(user)) {
      const parentContext = {
        mode: "account-view",
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
    };
    if (window.dispatchEvent(new CustomEvent("kms-before-context-change", { cancelable: true, detail: performExit }))) performExit();
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
