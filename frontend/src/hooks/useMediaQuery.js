import { useMemo, useSyncExternalStore } from "react";

export default function useMediaQuery(query) {
  const media = useMemo(() => window.matchMedia(query), [query]);
  const subscribe = useMemo(() => (notify) => {
    media.addEventListener("change", notify);
    return () => media.removeEventListener("change", notify);
  }, [media]);
  return useSyncExternalStore(subscribe, () => media.matches, () => false);
}
