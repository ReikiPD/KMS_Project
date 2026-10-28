import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Building2,
  ChevronDown,
  FileText,
  Filter,
  History,
  LayoutGrid,
  PlayCircle,
  SearchX,
} from "lucide-react";
import {
  Alert,
  Button,
  Drawer,
  Pagination,
  SelectDropdown,
  Skeleton,
  Tooltip,
} from "@idds/react";
import AssetCard from "../../components/AssetCard";
import AssetQuickPreview from "../../components/AssetQuickPreview";
import EmptyState from "../../components/EmptyState";
import MultipleSearchSelect from "../../components/MultipleSearchSelect";

import ActiveFilters from "../../components/ActiveFilters";
import PublicRouteArt from "../../components/PublicRouteArt";
import WorkUnitLogo from "../../components/WorkUnitLogo";
import { readCatalogueState, updateCatalogueParams } from "../../lib/catalogueState";
import { apiFetch } from "../../lib/api";
import usePublicAssetPreview from "../../hooks/usePublicAssetPreview";
import usePublicOverlayFocus from "../../hooks/usePublicOverlayFocus";
import { normalizeSearchSelections, queryToSearchSelections, searchSelectionsToQuery } from "../../lib/search";
import { workUnitFullName, workUnitShortName } from "../../lib/workUnits";

const PAGE_SIZE_OPTIONS = [6, 12, 24];
const sortOptions = [
  { label: "Terbaru", value: "terbaru" },
  { label: "Terlama", value: "terlama" },
  { label: "Paling sering dilihat", value: "terpopuler" },
  { label: "A - Z", value: "az" },
];

function AssetCardSkeleton({ compact = false }) {
  return <div className={`kms-asset-skeleton ${compact ? "kms-asset-skeleton--compact" : ""}`} aria-hidden="true"><Skeleton height={compact ? "145px" : "170px"} rounded="md" /><div className="space-y-3 p-4"><Skeleton height="20px" width="88%" rounded="sm" /><Skeleton height="20px" width="64%" rounded="sm" /><Skeleton height="14px" width="52%" rounded="sm" /><div className="flex gap-3 pt-1"><Skeleton height="12px" width="30%" rounded="sm" /><Skeleton height="12px" width="38%" rounded="sm" /></div></div><div className="kms-asset-skeleton-footer" /></div>;
}

function UnitWorkList({ workUnits, selected, onSelect, onClose }) {
  const [expandedUnitIds, setExpandedUnitIds] = useState(() => new Set());
  const rootUnits = useMemo(
    () => workUnits.filter((unit) => !unit.parent_id),
    [workUnits],
  );
  const childrenByParent = useMemo(() => {
    const grouped = new Map();
    workUnits.filter((unit) => unit.parent_id).forEach((unit) => {
      const key = String(unit.parent_id || "");
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(unit);
    });
    return grouped;
  }, [workUnits]);

  useEffect(() => {
    let selectedUnit = workUnits.find((unit) => String(unit.id) === String(selected));
    if (!selectedUnit?.parent_id) return;
    const ancestors = [];
    while (selectedUnit?.parent_id) {
      ancestors.push(String(selectedUnit.parent_id));
      selectedUnit = workUnits.find((unit) => String(unit.id) === String(selectedUnit.parent_id));
    }
    setExpandedUnitIds((current) => {
      const next = new Set(current);
      ancestors.forEach((identifier) => next.add(identifier));
      return next.size === current.size ? current : next;
    });
  }, [selected, workUnits]);

  const chooseUnit = (value) => {
    onSelect(value);
    onClose?.();
  };

  const chooseParent = (unit, hasChildren) => {
    onSelect(String(unit.id));
    if (!hasChildren) {
      onClose?.();
      return;
    }
    const key = String(unit.id);
    setExpandedUnitIds((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const unitButton = (unit, { depth = 0, expanded, hasChildren = false } = {}) => {
    const child = depth > 0;
    const isActive = selected === String(unit.id);
    const shortName = unit.alias || workUnitShortName(unit.name);
    const fullName = workUnitFullName(unit.name);
    return (
      <Tooltip key={unit.id} variant="basic" title={child && unit.parent_name ? `${fullName} — bagian dari ${unit.parent_name}` : fullName} placement="right" showArrow={true}>
        <Button
          hierarchy={isActive ? "primary" : "tertiary"}
          size="md"
          className={`kms-unit-work-item ${child ? "kms-unit-work-item--child" : ""} ${isActive ? "kms-unit-work-item--active" : ""}`}
          aria-label={`${fullName}${hasChildren ? `, ${expanded ? "tutup" : "buka"} daftar unit turunan` : ""}`}
          aria-expanded={hasChildren ? expanded : undefined}
          onClick={() => chooseParent(unit, hasChildren)}
        >
          <WorkUnitLogo unit={unit} className="kms-catalogue-unit-logo" />
          <span className="kms-unit-work-name">{shortName}</span>
          <span className="kms-unit-work-tail">
            {hasChildren && <ChevronDown className={`kms-unit-work-chevron ${expanded ? "kms-unit-work-chevron--open" : ""}`} size={16} aria-hidden="true" />}
          </span>
        </Button>
      </Tooltip>
    );
  };

  const renderUnitTree = (units, depth = 0) => units.map((unit) => {
    const children = childrenByParent.get(String(unit.id)) || [];
    const expanded = expandedUnitIds.has(String(unit.id));
    return (
      <div key={unit.id} className="kms-unit-work-group">
        {unitButton(unit, { depth, expanded, hasChildren: children.length > 0 })}
        {expanded && children.length > 0 && renderUnitTree(children, depth + 1)}
      </div>
    );
  });

  return (
    <div className="kms-unit-work-list">
      <Button
        hierarchy={selected === "" ? "primary" : "secondary"}
        size="md"
        className={`kms-unit-work-item ${selected === "" ? "kms-unit-work-item--active" : ""}`}
        onClick={() => chooseUnit("")}
      >
        <span className="kms-unit-work-mark" aria-hidden="true"><LayoutGrid size={18} /></span>
        <span className="kms-unit-work-name">Semua Unit Kerja</span>
      </Button>
      {renderUnitTree(rootUnits)}
    </div>
  );
}

export default function CataloguePage() {
  const [urlSearchParams, setUrlSearchParams] = useSearchParams();
  const defaultLimit = 12;
  const catalogue = readCatalogueState(urlSearchParams, defaultLimit);
  const { q: searchQuery, categoryId, workUnitId, assetType, sort, page: currentPage, limit: pageSize } = catalogue;
  const urlQuery = searchQuery;
  const updateCatalogue = useCallback((changes) => setUrlSearchParams(previous => updateCatalogueParams(previous, changes, defaultLimit)), [setUrlSearchParams, defaultLimit]);
  const [assets, setAssets] = useState([]);
  const [categories, setCategories] = useState([]);
  const [workUnits, setWorkUnits] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [searchSelections, setSearchSelections] = useState(() => queryToSearchSelections(urlQuery));
  const [searchDraft, setSearchDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isUnitDrawerOpen, setIsUnitDrawerOpen] = useState(false);
  const [desktopFilters, setDesktopFilters] = useState(() => window.matchMedia("(min-width: 1200px)").matches);
  const filterTrigger = useRef(null);
  usePublicOverlayFocus(isUnitDrawerOpen && !desktopFilters, ".kms-public-filter-panel", () => setIsUnitDrawerOpen(false), filterTrigger);
  const [filterDraft, setFilterDraft] = useState({ categoryId: "", workUnitId: "", assetType: "", sort: "terbaru" });
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1200px)");
    const change = () => setDesktopFilters(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => { setIsUnitDrawerOpen(false); }, [urlSearchParams]);
  const [suggestions, setSuggestions] = useState([]);
  const [recentSearches, setRecentSearches] = useState([]);
  const { previewAsset, previewTrigger, closePreview, openAssetPreview } = usePublicAssetPreview();
  const trackedQuery = useRef("");
  const homePageRef = useRef(null);
  const searchContainerRef = useRef(null);
  const searchInput = searchSelectionsToQuery(searchSelections);

  const activeUnitName = workUnitId
    ? workUnits.find((unit) => String(unit.id) === workUnitId)?.name
    : "Semua Unit Kerja";

  useEffect(() => {
    const controller = new AbortController();
    const loadFilters = async () => {
      try {
        const [categoriesResponse, unitsResponse] = await Promise.all([
          apiFetch("/api/assets/categories", { signal: controller.signal }),
          apiFetch("/api/assets/work-units", { signal: controller.signal }),
        ]);
        if (controller.signal.aborted) return;
        if (categoriesResponse.ok) setCategories(await categoriesResponse.json());
        if (unitsResponse.ok) setWorkUnits(await unitsResponse.json());
      } catch {
        // The catalogue still works if auxiliary data cannot be loaded.
      }
    };
    loadFilters();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    try { setRecentSearches(JSON.parse(localStorage.getItem("kms_recent_searches") || "[]")); } catch { setRecentSearches([]); }
  }, []);

  useEffect(() => {
    const focusGlobalSearch = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase("id-ID") === "k") {
        event.preventDefault();
        searchContainerRef.current?.querySelector("input")?.focus();
        searchContainerRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
      }
    };
    window.addEventListener("keydown", focusGlobalSearch);
    return () => window.removeEventListener("keydown", focusGlobalSearch);
  }, []);

  useEffect(() => {
    const page = homePageRef.current;
    if (!page) return undefined;
    const sections = [...page.querySelectorAll(".kms-home-reveal:not(.is-visible)")];
    if (!sections.length) return undefined;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion || !("IntersectionObserver" in window)) {
      sections.forEach((section) => section.classList.add("is-visible"));
      return undefined;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -10%", threshold: 0.08 });

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const query = searchDraft.trim();
    if (query.length < 2) { setSuggestions([]); return undefined; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await apiFetch(`/api/assets/search/suggestions?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        const data = await response.json();
        if (response.ok && !controller.signal.aborted) setSuggestions(Array.isArray(data) ? data : (data.data || []));
      } catch { if (!controller.signal.aborted) setSuggestions([]); }
    }, 220);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [searchDraft]);

  useEffect(() => {
    setSearchSelections((current) => searchSelectionsToQuery(current) === urlQuery ? current : queryToSearchSelections(urlQuery));
  }, [urlQuery]);

  useEffect(() => {
    const controller = new AbortController();
    const loadAssets = async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          page: String(currentPage),
          limit: String(pageSize),
          sort,
        });
        if (searchQuery) params.set("q", searchQuery);
        if (categoryId) params.set("categoryId", categoryId);
        if (workUnitId) params.set("workUnitId", workUnitId);
        if (assetType) params.set("assetType", assetType);
        const response = await apiFetch(`/api/assets/homepage?${params}`, { signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Gagal memuat katalog pengetahuan");
        if (controller.signal.aborted) return;
        setAssets(result.data);
        setPagination(result.pagination);
        if (searchQuery && trackedQuery.current !== searchQuery) {
          trackedQuery.current = searchQuery;
          apiFetch("/api/assets/search-events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: searchQuery, resultCount: result.pagination?.totalItems || 0 }) }).catch(() => undefined);
        }
      } catch (loadError) {
        if (!controller.signal.aborted) setError(loadError.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    loadAssets();
    return () => controller.abort();
  }, [categoryId, currentPage, pageSize, searchQuery, sort, workUnitId, assetType]);

  const updateSearchSelections = useCallback((values) => {
    const nextValues = normalizeSearchSelections(values);
    setSearchSelections(nextValues);
    if (nextValues.length) return;
    updateCatalogue({ q: "", sort: "terbaru", page: 1 });
  }, [updateCatalogue]);

  const submitSearch = useCallback((value = searchSelections) => {
    const nextSelections = Array.isArray(value) ? normalizeSearchSelections(value) : queryToSearchSelections(value);
    const query = searchSelectionsToQuery(nextSelections);
    if (query.length > 0 && query.length < 3) return;
    setSearchSelections(nextSelections);
    if (query) {
      const nextRecent = [query, ...recentSearches.filter((item) => item.toLowerCase() !== query.toLowerCase())].slice(0, 6);
      setRecentSearches(nextRecent);
      localStorage.setItem("kms_recent_searches", JSON.stringify(nextRecent));
    }
    updateCatalogue({ q: query, sort: query ? "relevansi" : "terbaru", page: 1 });
    window.requestAnimationFrame(() => document.getElementById("catalogue-results")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }));
  }, [recentSearches, searchSelections, updateCatalogue]);

  const selectCategory = (value) => {
    if (value === categoryId) return;
    updateCatalogue({ categoryId: value, page: 1 });
  };

  const selectSort = (value) => {
    if (value === sort) return;
    updateCatalogue({ sort: value, page: 1 });
  };

  const selectWorkUnit = (value) => {
    if (value === workUnitId) return;
    updateCatalogue({ workUnitId: value, page: 1 });
  };

  const changePageSize = (value) => {
    const nextSize = Number.parseInt(value, 10);
    if (!PAGE_SIZE_OPTIONS.includes(nextSize) || nextSize === pageSize) return;
    updateCatalogue({ limit: nextSize, page: 1 });
  };

  const resetFilters = () => {
    setSearchSelections([]);
    setSearchDraft("");
    updateCatalogue({ q: "", categoryId: "", workUnitId: "", assetType: "", sort: "terbaru", page: 1 });
  };

  const changePage = (value) => {
    const requestedPage = Number.parseInt(value, 10);
    const totalPages = Number(pagination?.totalPages || 1);
    if (!Number.isInteger(requestedPage) || requestedPage < 1 || requestedPage > totalPages || requestedPage === currentPage) return;
    updateCatalogue({ page: requestedPage });
    window.requestAnimationFrame(() => document.getElementById("catalogue-results")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }));
  };

  const categoryOptions = [{ label: "Semua kategori", value: "" }, ...categories.map((category) => ({ label: category.name, value: String(category.id) }))];
  const normalizedDraft = searchDraft.trim().toLocaleLowerCase("id-ID");
  const normalizedDraftTerms = normalizedDraft.match(/[\p{L}\p{N}]+/gu) || [];
  const matchesDraft = (value) => {
    if (!normalizedDraftTerms.length) return true;
    const haystack = String(value || "").toLocaleLowerCase("id-ID");
    return normalizedDraftTerms.every((term) => haystack.includes(term));
  };
  const searchOptions = [
    ...workUnits.filter((unit) => matchesDraft(`${unit.name} ${unit.alias || ""} ${unit.parent_name || ""} ${workUnitFullName(unit.name)}`)).slice(0, 6).map((unit) => ({
      group: "Unit Kerja",
      label: workUnitFullName(unit.name),
      value: workUnitFullName(unit.name),
      description: unit.alias || "Unit kerja Kementerian Perhubungan",
      icon: <Building2 size={15} />,
    })),
    ...categories.filter((category) => matchesDraft(category.name)).slice(0, 6).map((category) => ({
      group: "Kategori",
      label: category.name,
      value: category.name,
      description: "Kategori topik pengetahuan",
      icon: <Filter size={15} />,
    })),
    ...[
      { group: "Tipe Aset", label: "Dokumen PDF", value: "PDF", description: "Dokumen dan panduan", icon: <FileText size={15} /> },
      { group: "Tipe Aset", label: "Video pembelajaran", value: "Video", description: "Media video", icon: <PlayCircle size={15} /> },
    ].filter((option) => matchesDraft(`${option.label} ${option.value}`)),
    ...suggestions.filter((suggestion) => matchesDraft(suggestion.title)).map((suggestion) => ({
      group: "Judul Pengetahuan",
      label: suggestion.title,
      value: suggestion.title,
      description: suggestion.asset_type === "video" ? "Video pembelajaran" : "Dokumen PDF",
      icon: suggestion.asset_type === "video" ? <PlayCircle size={15} /> : <FileText size={15} />,
    })),
    ...recentSearches.filter(matchesDraft).slice(0, 6).map((query) => ({
      group: "Pencarian Terakhir",
      label: query,
      value: query,
      description: "Pernah Anda cari sebelumnya",
      icon: <History size={15} />,
    })),
  ];
  const availableSortOptions = searchQuery ? [{ label: "Relevansi", value: "relevansi" }, ...sortOptions] : sortOptions;
  const typeOptions = [{ label: "Semua jenis", value: "" }, { label: "Dokumen", value: "document" }, { label: "Video", value: "video" }];
  const activeFilters = [
    assetType && { key: "type", label: assetType === "video" ? "Video" : "Dokumen", onRemove: () => updateCatalogue({ assetType: "", page: 1 }) },
    searchQuery && { key: "q", label: searchQuery, onRemove: () => updateCatalogue({ q: "", sort: sort === "relevansi" ? "terbaru" : sort, page: 1 }) },
    categoryId && { key: "category", label: categoryOptions.find(item => item.value === categoryId)?.label || "Kategori", onRemove: () => selectCategory("") },
    workUnitId && { key: "unit", label: workUnitFullName(activeUnitName), onRemove: () => selectWorkUnit("") },
    sort !== "terbaru" && { key: "sort", label: availableSortOptions.find(item => item.value === sort)?.label || sort, onRemove: () => selectSort("terbaru") },
  ].filter(Boolean);
  const closeFilters = () => { setIsUnitDrawerOpen(false); filterTrigger.current?.focus(); };
  const handleFilterEscape = event => {
    if (desktopFilters && isUnitDrawerOpen && event.key === "Escape") {
      event.stopPropagation();
      closeFilters();
    }
  };
  const filterFields = <div id="catalogue-filter-fields" className="space-y-5 p-4 kms-catalogue-draft-filters">
    <p className="text-sm text-content-secondary">Pilihan digunakan setelah Anda menekan Terapkan.</p>
    <div className="kms-library-filter-fields">
      <SelectDropdown label="Jenis aset" options={typeOptions} selected={filterDraft.assetType} onSelect={value => setFilterDraft(current => ({ ...current, assetType: value }))} searchable={false} width="100%" />
      <SelectDropdown label="Kategori" options={categoryOptions} selected={filterDraft.categoryId} onSelect={value => setFilterDraft(current => ({ ...current, categoryId: value }))} width="100%" />
      <SelectDropdown label="Urutkan" options={availableSortOptions} selected={filterDraft.sort} onSelect={value => setFilterDraft(current => ({ ...current, sort: value }))} searchable={false} width="100%" />
    </div>
    {!desktopFilters && <><h3 className="font-bold">Unit kerja</h3><UnitWorkList workUnits={workUnits} selected={filterDraft.workUnitId} onSelect={value => setFilterDraft(current => ({ ...current, workUnitId: value }))} /></>}
    <div className="kms-form-actionbar">
      <Button hierarchy="tertiary" onClick={() => setFilterDraft({ categoryId: "", workUnitId: desktopFilters ? workUnitId : "", assetType: "", sort: "terbaru" })}>Reset</Button>
      <Button hierarchy="secondary" onClick={closeFilters}>Batal</Button>
      <Button hierarchy="primary" onClick={() => { updateCatalogue({ ...filterDraft, workUnitId: desktopFilters ? workUnitId : filterDraft.workUnitId, page: 1 }); closeFilters(); }}>Terapkan</Button>
    </div>
  </div>;
  const searchForm = (
    <form className="kms-library-search"
      onSubmit={(event) => { event.preventDefault(); submitSearch(); }}>
      <div className="min-w-0 flex-1">
        <MultipleSearchSelect containerRef={searchContainerRef} label="Cari pengetahuan" selected={searchSelections}
          onSelect={updateSearchSelections} onSearch={setSearchDraft} options={searchOptions}
          placeholder="Ketik lalu pilih judul, topik, unit, atau kontributor" helperText="" />
      </div>
      <Button type="submit" hierarchy="primary" disabled={Boolean(searchInput.trim()) && searchInput.trim().length < 3}>Cari</Button>
      {searchInput && searchInput.trim().length < 3 && <p className="px-1 pt-2 text-xs text-content-secondary">Masukkan minimal 3 karakter untuk mulai mencari.</p>}
    </form>
  );
  return (
    <div ref={homePageRef} className="kms-public-page pb-14 md:pb-20 kms-library-page">
      <div className="kms-public-band kms-public-band--catalogue kms-public-dots">
        <PublicRouteArt />
        <div className="kms-library-container">
          <div className="kms-catalogue-heading flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div>
              <p className="kms-section-eyebrow">Eksplorasi pengetahuan</p>
              <h1 id="catalogue-heading" tabIndex={-1} className="kms-section-title">Semua Pengetahuan</h1>
              <p className="mt-2 text-sm text-content-secondary">Pilih unit kerja, kategori, atau urutan untuk menemukan pengetahuan yang relevan.</p>
            </div>
            <div className="kms-library-toolbar" onKeyDown={handleFilterEscape}>
              {searchForm}
              <Button ref={filterTrigger} hierarchy="secondary" size="md" prefixIcon={<Filter size={16} />} aria-expanded={isUnitDrawerOpen} aria-controls={isUnitDrawerOpen ? "catalogue-filter-fields" : undefined} onClick={() => { setFilterDraft({ categoryId, workUnitId, assetType, sort }); setIsUnitDrawerOpen(value => !value); }}>Filter{activeFilters.length ? ` (${activeFilters.length})` : ""}</Button>
            </div>
            {desktopFilters && isUnitDrawerOpen && <section className="kms-library-filter-panel" aria-label="Filter pengetahuan" onKeyDown={handleFilterEscape}>{filterFields}</section>}
          </div>

        </div>
      </div>
      <div className="kms-library-container">
        <section className="kms-catalogue-results" aria-label="Daftar pengetahuan">
          <div className="kms-catalogue-layout grid items-stretch gap-8 lg:grid-cols-[260px_minmax(0,1fr)]">
            <aside className="hidden h-full lg:block" aria-label="Filter Unit Kerja">
              <div className="kms-catalogue-filter sticky top-6">
                <div className="mb-4 flex items-start gap-3">
                  <div className="rounded-lg bg-surface-secondary p-2 text-content-guide"><Building2 size={20} /></div>
                  <div><h3 className="font-bold text-content-primary">Unit Kerja</h3><p className="mt-0.5 text-xs text-content-secondary">Saring sumber pengetahuan.</p></div>
                </div>
                <UnitWorkList workUnits={workUnits} selected={workUnitId} onSelect={selectWorkUnit} />
              </div>
            </aside>

            <div id="catalogue-results" className="min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="sr-only" aria-live="polite">{loading ? "Memuat pengetahuan" : "Daftar pengetahuan diperbarui"}</span>
                <ActiveFilters items={activeFilters} onReset={resetFilters} />
              </div>

              {error && <div className="mt-6"><Alert variant="danger" message={error} /></div>}
              {loading ? (
                <div className="kms-library-grid mt-6">{Array.from({ length: pageSize }, (_, index) => <AssetCardSkeleton key={index} />)}</div>
              ) : !error && assets.length === 0 ? (
                <EmptyState className="mt-6" icon={SearchX} illustration={searchQuery || categoryId || workUnitId || assetType ? "empty-search" : "empty-knowledge"} title={searchQuery || categoryId || workUnitId || assetType ? "Pengetahuan tidak ditemukan" : "Belum ada pengetahuan"} description={searchQuery || categoryId || workUnitId || assetType ? "Coba gunakan kata kunci lain atau hapus filter yang sedang dipilih." : "Pengetahuan yang diterbitkan akan tersedia di sini. Silakan kunjungi kembali nanti."} actionLabel={searchQuery || categoryId || workUnitId || assetType ? "Reset filter" : undefined} onAction={resetFilters} />
              ) : (
                <div className="kms-library-grid mt-6">{assets.map((asset) => <AssetCard key={asset.id} asset={asset} variant="library" searchQuery={searchQuery} onPreview={openAssetPreview} />)}</div>
              )}

              {!loading && !error && (pagination?.totalItems || 0) > 0 && (
                <div className="mt-10 flex justify-center">
                  <Pagination
                    currentPage={currentPage}
                    totalPages={pagination.totalPages}
                    pageSize={pageSize}
                    pageSizeOptions={PAGE_SIZE_OPTIONS}
                    onPageChange={changePage}
                    onPageSizeChange={changePageSize}
                  />
                </div>
              )}
            </div>
          </div>
        </section>

      </div>

      <Drawer isOpen={isUnitDrawerOpen && !desktopFilters} onClose={() => setIsUnitDrawerOpen(false)} title="Filter pengetahuan" width="sm" panelClassName="kms-public-filter-panel">
        {filterFields}
      </Drawer>
      <AssetQuickPreview asset={previewAsset} open={Boolean(previewAsset)} onClose={closePreview} restoreFocusRef={previewTrigger} />
    </div>
  );
}
