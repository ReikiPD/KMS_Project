import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

export function OfflineNotice() {
  const [offline, setOffline] = useState(() => !navigator.onLine);

  useEffect(() => {
    const markOnline = () => setOffline(false);
    const markOffline = () => setOffline(true);
    window.addEventListener("online", markOnline);
    window.addEventListener("offline", markOffline);
    return () => {
      window.removeEventListener("online", markOnline);
      window.removeEventListener("offline", markOffline);
    };
  }, []);

  if (!offline) return null;
  return (
    <div className="kms-offline-notice" role="status" aria-live="polite">
      <WifiOff size={16} />
      Anda sedang offline. Materi yang belum pernah dibuka mungkin tidak tersedia.
    </div>
  );
}
