import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

export default function OfflineNotice() {
  const [offline, setOffline] = useState(() => !navigator.onLine);
  useEffect(() => {
    const online = () => setOffline(false);
    const goOffline = () => setOffline(true);
    window.addEventListener("online", online); window.addEventListener("offline", goOffline);
    return () => { window.removeEventListener("online", online); window.removeEventListener("offline", goOffline); };
  }, []);
  return offline ? <div className="kms-offline-notice" role="status" aria-live="polite"><WifiOff size={16} />Anda sedang offline. Materi yang belum pernah dibuka mungkin tidak tersedia.</div> : null;
}
