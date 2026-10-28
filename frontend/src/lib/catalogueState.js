const SORTS = new Set(["terbaru", "terlama", "az", "terpopuler", "relevansi"]);
export function readCatalogueState(params, defaultLimit = 6) {
  const q = (params.get("q") || "").trim();
  const requestedSort = params.get("sort");
  const page = Number(params.get("page"));
  const limit = Number(params.get("limit"));
  return {
    q: q.length >= 3 ? q : "",
    categoryId: params.get("categoryId") || "",
    workUnitId: params.get("workUnitId") || "",
    assetType: ["document", "video"].includes(params.get("assetType")) ? params.get("assetType") : "",
    sort: SORTS.has(requestedSort) && (requestedSort !== "relevansi" || q.length >= 3) ? requestedSort : q.length >= 3 ? "relevansi" : "terbaru",
    page: Number.isInteger(page) && page > 0 ? Math.min(page, 100000) : 1,
    limit: [6, 12, 24].includes(limit) ? limit : defaultLimit,
  };
}
export function updateCatalogueParams(params, changes, defaultLimit = 6) {
  const state = { ...readCatalogueState(params, defaultLimit), ...changes };
  const next = new URLSearchParams();
  for (const key of ["q", "categoryId", "workUnitId", "assetType", "sort", "page", "limit"]) {
    if (state[key] !== "" && state[key] != null) next.set(key, String(state[key]));
  }
  return next;
}

export function libraryCataloguePath(params) {
  return `/library?${updateCatalogueParams(params, { page: 1, limit: 12 })}`;
}
