const encodeRouteReference = (value) => encodeURIComponent(String(value || ""));

export const assetRouteReference = (asset) => asset?.slug || asset?.public_id || "";

// Mutating requests must survive title/slug changes while the editor is open.
export const assetRequestReference = (asset, fallback = "") => asset?.public_id || asset?.slug || fallback;

export const publicAssetPath = (asset) => `/detail/${encodeRouteReference(assetRouteReference(asset))}`;

export const adminAssetPath = (asset) => `/admin/assets/${encodeRouteReference(assetRouteReference(asset))}`;

export const adminAssetEditPath = (asset) => `/admin/assets/edit/${encodeRouteReference(assetRouteReference(asset))}`;
