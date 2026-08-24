import { useEffect, useMemo, useState } from "react";
import { setBrandTheme, setThemeMode } from "@idds/react";
import { useLocation } from "react-router-dom";
import { ThemeContext } from "./ThemeContext";

const STORAGE_KEY = "ina-theme";
const VALID_MODES = new Set(["light", "dark"]);

function systemTheme() {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function initialTheme() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return VALID_MODES.has(stored) ? stored : systemTheme();
  } catch {
    return systemTheme();
  }
}

function applyDocumentTheme(mode) {
  document.documentElement.setAttribute("data-theme", mode);
  document.documentElement.style.colorScheme = mode;
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    "content",
    mode === "dark" ? "#071525" : "#0B1F3A",
  );
}

export default function ThemeProvider({ children }) {
  const { pathname } = useLocation();
  const [mode, setMode] = useState(initialTheme);

  useEffect(() => {
    setBrandTheme(pathname.startsWith("/admin") ? "inagov" : "default");
    setThemeMode(mode);
    applyDocumentTheme(mode);
    try {
      window.localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // Tema tetap aktif untuk sesi ini saat penyimpanan browser tidak tersedia.
    }
  }, [mode, pathname]);

  useEffect(() => {
    const syncTheme = (event) => {
      if (event.key === STORAGE_KEY && VALID_MODES.has(event.newValue)) setMode(event.newValue);
    };
    window.addEventListener("storage", syncTheme);
    return () => window.removeEventListener("storage", syncTheme);
  }, []);

  const value = useMemo(() => ({
    mode,
    isDark: mode === "dark",
    setTheme: (nextMode) => {
      if (VALID_MODES.has(nextMode)) setMode(nextMode);
    },
    toggleTheme: () => setMode((current) => current === "dark" ? "light" : "dark"),
  }), [mode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
