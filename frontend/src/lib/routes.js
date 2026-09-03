const encodeRouteReference = (value) => encodeURIComponent(String(value || ""));

export const assetRouteReference = (asset) => asset?.slug || asset?.public_id || "";

export const publicAssetPath = (asset) => `/detail/${encodeRouteReference(assetRouteReference(asset))}`;

export const adminAssetPath = (asset) => `/admin/assets/${encodeRouteReference(assetRouteReference(asset))}`;

export const adminAssetEditPath = (asset) => `/admin/assets/edit/${encodeRouteReference(assetRouteReference(asset))}`;
