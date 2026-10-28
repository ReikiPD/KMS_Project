import { Tag } from "lucide-react";
import { uploadUrl } from "../lib/api";
import { usePublicImageSources } from "../hooks/usePublicVisual";

export default function CategoryLogo({ category, fallback: Icon = Tag, size = 18, className = "" }) {
  const { src, onError } = usePublicImageSources([uploadUrl(category?.logo_url)]);
  return <span className={`kms-category-logo ${className}`.trim()} style={{ width: size, height: size }} aria-hidden="true">
    {src ? <img src={src} alt="" loading="lazy" decoding="async" onError={onError} /> : <Icon size={size} />}
  </span>;
}
