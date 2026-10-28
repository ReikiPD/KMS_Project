import { useCallback, useEffect, useRef } from "react";
import { useBlocker } from "react-router-dom";

import { NavigationProtectionContext } from "./NavigationProtectionContext";

// Only callbacks are kept in memory. Private form values never enter URLs/storage.
export default function NavigationProtection({ children }) {
  const guards = useRef(new Map());
  const register = useCallback((key, guard) => {
    guards.current.set(key, guard);
    return () => guards.current.delete(key);
  }, []);
  const activeGuard = () => [...guards.current.values()].findLast((guard) => guard.dirty());
  const discardAll = () => guards.current.forEach(guard => guard.discard?.());
  const blocker = useBlocker(() => Boolean(activeGuard()));
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    const guard = activeGuard();
    if (guard) guard.prompt(() => { discardAll(); blocker.proceed(); }, blocker.reset);
    else blocker.proceed();
  }, [blocker]);
  useEffect(() => {
    const confirmContextChange = (event) => {
      const guard = activeGuard();
      if (!guard) return;
      event.preventDefault();
      guard.prompt(() => { discardAll(); event.detail(); });
    };
    window.addEventListener("kms-before-context-change", confirmContextChange);
    return () => window.removeEventListener("kms-before-context-change", confirmContextChange);
  }, []);
  return <NavigationProtectionContext.Provider value={register}>{children}</NavigationProtectionContext.Provider>;
}
