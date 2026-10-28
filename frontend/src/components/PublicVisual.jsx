import { usePublicImageSources, usePublicVisualSource } from "../hooks/usePublicVisual";

export function PublicImage({ sources = [], fallback, theme, alt = "", className = "", loading = "lazy", ...props }) {
  const fallbackSrc = usePublicVisualSource(fallback, theme);
  const { src, onError } = usePublicImageSources([...sources, fallbackSrc]);
  if (!src) return <span className={className} aria-hidden="true" />;
  return <img {...props} src={src} alt={alt} aria-hidden={alt ? undefined : true} className={className} loading={loading} decoding="async" onError={onError} data-public-visual={src === fallbackSrc ? fallback : undefined} />;
}

/** Informative visuals require alt text. Decorative art defaults to alt="". */
export default function PublicVisual({ kind, theme, alt = "", className = "", ...props }) {
  return <PublicImage fallback={kind} theme={theme} alt={alt} className={`kms-public-visual ${className}`.trim()} {...props} />;
}
