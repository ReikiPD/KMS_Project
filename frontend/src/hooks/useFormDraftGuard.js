import { useEffect, useRef, useState } from "react";
import useUnsavedChanges from "./useUnsavedChanges";

// Snapshot only when a form opens/finishes loading, never on each keystroke.
export default function useFormDraftGuard(value, enabled = true) {
  const serialized = JSON.stringify(value);
  const wasEnabled = useRef(false);
  const [baseline, setBaseline] = useState(serialized);
  useEffect(() => {
    if (enabled && !wasEnabled.current) setBaseline(serialized);
    wasEnabled.current = enabled;
  }, [enabled, serialized]);
  const dirty = enabled && wasEnabled.current && serialized !== baseline;
  const guard = useUnsavedChanges(dirty);
  return { ...guard, dirty };
}
