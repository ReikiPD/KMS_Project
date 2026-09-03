import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, clearAccessContext, synchronizeAccessContextOwner } from "../lib/api";
import { AuthContext } from "./AuthContext";

export default function AuthProvider({ children }) {
  const [user, setUserState] = useState(null);
  const [loading, setLoading] = useState(true);
  const sessionRequestId = useRef(0);
  const activeSessionRequest = useRef(null);

  const setUser = useCallback((nextUser) => {
    sessionRequestId.current += 1;
    activeSessionRequest.current?.abort();
    activeSessionRequest.current = null;
    setUserState(nextUser);
    setLoading(false);
  }, []);

  const refreshSession = useCallback(async () => {
    activeSessionRequest.current?.abort();
    const controller = new AbortController();
    const requestId = sessionRequestId.current + 1;
    sessionRequestId.current = requestId;
    activeSessionRequest.current = controller;

    try {
      const response = await apiFetch("/api/users/session", {
        cache: "no-store",
        context: false,
        signal: controller.signal,
      });
      const result = await response.json().catch(() => ({}));
      const currentUser = response.ok && result.authenticated ? result.user || null : null;
      if (requestId === sessionRequestId.current) {
        synchronizeAccessContextOwner(currentUser);
        setUserState(currentUser);
      }
      return currentUser;
    } catch (error) {
      if (error?.name !== "AbortError" && requestId === sessionRequestId.current) setUserState(null);
      return null;
    } finally {
      if (requestId === sessionRequestId.current) {
        activeSessionRequest.current = null;
        setLoading(false);
      }
    }
  }, []);

  const confirmLogin = useCallback(async (loginUser) => {
    // Batalkan pemeriksaan sesi lama sebelum menerima cookie dari respons
    // login. Ini mencegah respons lama menghapus/menimpa sesi yang baru.
    clearAccessContext();
    setUser(loginUser);
    const verifiedUser = await refreshSession();
    if (!verifiedUser) {
      setUser(null);
      throw new Error("Login diterima, tetapi sesi tidak tersimpan. Muat ulang halaman lalu coba kembali.");
    }
    return verifiedUser;
  }, [refreshSession, setUser]);

  useEffect(() => {
    refreshSession();
    const expire = () => {
      clearAccessContext();
      setUser(null);
    };
    window.addEventListener("kms-session-expired", expire);
    return () => {
      activeSessionRequest.current?.abort();
      sessionRequestId.current += 1;
      window.removeEventListener("kms-session-expired", expire);
    };
  }, [refreshSession, setUser]);

  const logout = useCallback(async () => {
    try { await apiFetch("/api/users/logout", { method: "POST", context: false }); } catch { /* Cookie tetap dibersihkan setelah kedaluwarsa. */ }
    clearAccessContext();
    setUser(null);
  }, [setUser]);

  const value = useMemo(() => ({
    user,
    loading,
    setUser,
    updateUser: (updates) => setUser((current) => current ? { ...current, ...updates } : current),
    confirmLogin,
    refreshSession,
    logout,
  }), [confirmLogin, loading, logout, refreshSession, setUser, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
