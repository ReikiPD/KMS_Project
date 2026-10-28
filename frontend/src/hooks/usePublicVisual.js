import { useContext, useState } from "react";
import { ThemeContext } from "../contexts/ThemeContext";

// Build-owned SVGs only; no remote renderer, CDN, injected SVG HTML, or document scripts.
const files = import.meta.glob("../assets/public-visuals/*.svg", { eager: true, query: "?url&no-inline", import: "default" });

export function usePublicVisualSource(kind, theme) {
  const context = useContext(ThemeContext);
  const mode = (theme || context?.mode) === "dark" ? "dark" : "light";
  return files[`../assets/public-visuals/${kind}-${mode}.svg`];
}

// A finite candidate chain. Failed URLs are retained for this mounted image so a
// theme change cannot keep retrying a broken upload. New URLs still get a chance.
export function usePublicImageSources(sources) {
  const [failed, setFailed] = useState(() => new Set());
  const candidates = [...new Set(sources.filter(Boolean))];
  const src = candidates.find((url) => !failed.has(url));
  const onError = (event) => {
    const url = event.target.getAttribute("src");
    if (event.target.tagName !== "IMG" || !candidates.includes(url)) return;
    setFailed((current) => current.has(url) ? current : new Set([...current, url]));
  };
  return { src, onError };
}
