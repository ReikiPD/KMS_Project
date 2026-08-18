import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { setBrandTheme, setThemeMode } from "@idds/react";

export default function ThemeController() {
  const { pathname } = useLocation();

  useEffect(() => {
    setThemeMode("light");
    setBrandTheme(pathname.startsWith("/admin") ? "inagov" : "default");
  }, [pathname]);

  return null;
}
