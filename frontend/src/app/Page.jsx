import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Building2,
  ChevronDown,
  FileText,
  Filter,
  History,
  PlayCircle,
  SearchX,
  Sparkles,
  X,
} from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Divider,
  Drawer,
  Pagination,
  SelectDropdown,
  Skeleton,
  Tooltip,
} from "@idds/react";
import AssetCard from "../components/AssetCard";
import AssetQuickPreview from "../components/AssetQuickPreview";
import AnnouncementCarousel from "../components/AnnouncementCarousel";
import EmptyState from "../components/EmptyState";
import MultipleSearchSelect from "../components/MultipleSearchSelect";
import transportHero from "../assets/knowledge/transport-hero.png";
import { apiFetch } from "../lib/api";
import { assetRouteReference } from "../lib/routes";
import { normalizeSearchSelections, queryToSearchSelections, searchSelectionsToQuery } from "../lib/search";
import { workUnitFullName, workUnitShortName } from "../lib/workUnits";

const PAGE_SIZE_OPTIONS = [6, 12, 24];
const sortOptions = [
  { label: "Terbaru", value: "terbaru" },
  { label: "Terlama", value: "terlama" },
  { label: "A - Z", value: "az" },
];

function AssetCardSkeleton({ compact = false }) {
  return <div className={`kms-asset-skeleton ${compact ? "kms-asset-skeleton--compact" : ""}`} aria-hidden="true"><Skeleton height={compact ? "145px" : "170px"} rounded="md" /><div className="space-y-3 p-4"><Skeleton height="20px" width="88%" rounded="sm" /><Skeleton height="20px" width="64%" rounded="sm" /><Skeleton height="14px" width="52%" rounded="sm" /><div className="flex gap-3 pt-1"><Skeleton height="12px" width="30%" rounded="sm" /><Skeleton height="12px" width="38%" rounded="sm" /></div></div><div className="kms-asset-skeleton-footer" /></div>;
}

function UnitWorkList({ workUnits, selected, totalItems, onSelect, onClose }) {
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
          aria-label={`${fullName}, ${unit.asset_count ?? 0} aset${hasChildren ? `, ${expanded ? "tutup" : "buka"} daftar unit turunan` : ""}`}
          aria-expanded={hasChildren ? expanded : undefined}
          onClick={() => chooseParent(unit, hasChildren)}
        >
          <span className="kms-unit-work-mark" aria-hidden="true">{(unit.alias || unit.name).split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase() || "UK"}</span>
          <span className="kms-unit-work-name">{shortName}</span>
          <span className="kms-unit-work-tail">
            <Badge className="kms-unit-work-count" type="soft" variant={isActive ? "neutral" : "brand"} size="sm">{unit.asset_count ?? 0}</Badge>
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
        <span className="kms-unit-work-mark" aria-hidden="true">KM</span>
        <span className="kms-unit-work-name">Semua Unit Kerja</span>
        <Badge className="kms-unit-work-count" type="soft" variant={selected === "" ? "neutral" : "brand"} size="sm">{totalItems}</Badge>
      </Button>
      {renderUnitTree(rootUnits)}
    </div>
  );
}

export default function Page() {
  const [urlSearchParams, setUrlSearchParams] = useSearchParams();
  const urlQuery = urlSearchParams.get("q")?.trim() || "";
  const [assets, setAssets] = useState([]);
  const [featuredAssets, setFeaturedAssets] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [categories, setCategories] = useState([]);
  const [workUnits, setWorkUnits] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [searchSelections, setSearchSelections] = useState(() => queryToSearchSelections(urlQuery));
  const [searchDraft, setSearchDraft] = useState("");
  const [searchQuery, setSearchQuery] = useState(() => (urlQuery.length >= 3 ? urlQuery : ""));
  const [categoryId, setCategoryId] = useState("");
  const [workUnitId, setWorkUnitId] = useState("");
  const [sort, setSort] = useState("terbaru");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(6);
  const [loading, setLoading] = useState(true);
  const [featuredLoading, setFeaturedLoading] = useState(true);
  const [announcementLoading, setAnnouncementLoading] = useState(true);
  const [error, setError] = useState("");
  const [isUnitDrawerOpen, setIsUnitDrawerOpen] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [recentSearches, setRecentSearches] = useState([]);
  const [previewAsset, setPreviewAsset] = useState(null);
  const trackedQuery = useRef("");
  const homePageRef = useRef(null);
  const searchContainerRef = useRef(null);
  const searchInput = searchSelectionsToQuery(searchSelections);

  const totalUnitAssets = useMemo(
    () => workUnits
      .filter((unit) => Number(unit.echelon_level || 1) === 1)
      .reduce((total, unit) => total + Number(unit.asset_count || 0), 0),
    [workUnits],
  );
  const activeUnitName = workUnitId
    ? workUnits.find((unit) => String(unit.id) === workUnitId)?.name
    : "Semua Unit Kerja";

  useEffect(() => {
    const controller = new AbortController();
    const loadFiltersAndFeatured = async () => {
      try {
        const [categoriesResponse, unitsResponse, featuredResponse, announcementsResponse] = await Promise.all([
          apiFetch("/api/assets/categories", { signal: controller.signal }),
          apiFetch("/api/assets/work-units?withAssetCount=true", { signal: controller.signal }),
          apiFetch("/api/assets/featured", { signal: controller.signal }),
          apiFetch("/api/announcements", { signal: controller.signal }),
        ]);
        if (controller.signal.aborted) return;
        if (categoriesResponse.ok) setCategories(await categoriesResponse.json());
        if (unitsResponse.ok) setWorkUnits(await unitsResponse.json());
        if (featuredResponse.ok) setFeaturedAssets(await featuredResponse.json());
        if (announcementsResponse.ok) setAnnouncements(await announcementsResponse.json());
      } catch {
        // The catalogue still works if auxiliary data cannot be loaded.
      } finally {
        if (!controller.signal.aborted) {
          setFeaturedLoading(false);
          setAnnouncementLoading(false);
        }
      }
    };
    loadFiltersAndFeatured();
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
        searchContainerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
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
  }, [announcementLoading, announcements.length, featuredAssets.length, featuredLoading]);

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
    const nextQuery = urlQuery.length >= 3 ? urlQuery : "";
    setSearchSelections((current) => searchSelectionsToQuery(current) === urlQuery ? current : queryToSearchSelections(urlQuery));
    setSearchQuery((current) => {
      if (current === nextQuery) return current;
      setCurrentPage(1);
      return nextQuery;
    });
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
  }, [categoryId, currentPage, pageSize, searchQuery, sort, workUnitId]);

  const updateSearchSelections = useCallback((values) => {
    const nextValues = normalizeSearchSelections(values);
    setSearchSelections(nextValues);
    if (nextValues.length) return;
    setSearchQuery("");
    setSort("terbaru");
    setCurrentPage(1);
    setUrlSearchParams({}, { replace: true });
  }, [setUrlSearchParams]);

  const openAssetPreview = useCallback(async (asset) => {
    setPreviewAsset(asset);
    try {
      const response = await apiFetch(`/api/assets/${encodeURIComponent(assetRouteReference(asset))}`);
      if (!response.ok) return;
      const detail = await response.json();
      setPreviewAsset((current) => current?.id === asset.id ? detail : current);
    } catch {
      // Ringkasan kartu tetap dapat digunakan ketika detail tidak tersedia.
    }
  }, []);

  const submitSearch = useCallback((value = searchSelections) => {
    const nextSelections = Array.isArray(value) ? normalizeSearchSelections(value) : queryToSearchSelections(value);
    const query = searchSelectionsToQuery(nextSelections);
    if (query.length > 0 && query.length < 3) return;
    setSearchSelections(nextSelections);
    setSearchQuery(query);
    setSort(query ? "relevansi" : "terbaru");
    if (query) {
      const nextRecent = [query, ...recentSearches.filter((item) => item.toLowerCase() !== query.toLowerCase())].slice(0, 6);
      setRecentSearches(nextRecent);
      localStorage.setItem("kms_recent_searches", JSON.stringify(nextRecent));
    }
    setCurrentPage(1);
    setUrlSearchParams(query ? { q: query } : {}, { replace: true });
    window.requestAnimationFrame(() => document.getElementById("catalogue-results")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [recentSearches, searchSelections, setUrlSearchParams]);

  const selectCategory = (value) => {
    if (value === categoryId) return;
    setCategoryId(value);
    setCurrentPage(1);
  };

  const selectSort = (value) => {
    if (value === sort) return;
    setSort(value);
    setCurrentPage(1);
  };

  const selectWorkUnit = (value) => {
    if (value === workUnitId) return;
    setWorkUnitId(value);
    setCurrentPage(1);
  };

  const changePageSize = (value) => {
    const nextSize = Number.parseInt(value, 10);
    if (!PAGE_SIZE_OPTIONS.includes(nextSize) || nextSize === pageSize) return;
    setPageSize(nextSize);
    setCurrentPage(1);
  };

  const resetFilters = () => {
    setSearchSelections([]);
    setSearchDraft("");
    setSearchQuery("");
    setCategoryId("");
    setWorkUnitId("");
    setSort("terbaru");
    setCurrentPage(1);
    const params = new URLSearchParams(urlSearchParams);
    params.delete("q");
    setUrlSearchParams(params, { replace: true });
  };

  const changePage = (value) => {
    const requestedPage = Number.parseInt(value, 10);
    const totalPages = Number(pagination?.totalPages || 1);
    if (!Number.isInteger(requestedPage) || requestedPage < 1 || requestedPage > totalPages || requestedPage === currentPage) return;
    setCurrentPage(requestedPage);
    window.requestAnimationFrame(() => document.getElementById("catalogue-results")?.scrollIntoView({ behavior: "smooth", block: "start" }));
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
      description: `${unit.alias ? `${unit.alias} · ` : ""}${unit.asset_count || 0} pengetahuan tersedia`,
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
  const activeFilterCount = [searchQuery, categoryId, workUnitId, sort !== "terbaru" ? sort : ""].filter(Boolean).length;
  const showAnnouncementSection = announcementLoading || announcements.length > 0;
  const showFeaturedSection = !featuredLoading && featuredAssets.length > 0;
  return (
    <div ref={homePageRef} className="kms-public-page pb-14 md:pb-20">
      <section className="kms-hero border-b border-stroke-secondary">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-11 md:px-8 md:py-16 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.86fr)] lg:items-center lg:gap-12">
          <div className="kms-hero-copy">
            <div className="max-w-3xl">
              <h1 className="kms-display-title kms-on-brand">Temukan pengetahuan untuk menggerakkan transportasi Indonesia.</h1>
              <p className="kms-on-brand-muted mt-4 text-base leading-7 md:text-lg">Jelajahi praktik baik, panduan, dokumen, dan video pembelajaran dari unit kerja Kementerian Perhubungan.</p>
            </div>
            <form
              className="kms-hero-search relative mt-7 flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-end"
              onSubmit={(event) => { event.preventDefault(); submitSearch(); }}
            >
              <div className="min-w-0 flex-1">
                <MultipleSearchSelect
                  containerRef={searchContainerRef}
                  label="Cari pengetahuan"
                  selected={searchSelections}
                  onSelect={updateSearchSelections}
                  onSearch={setSearchDraft}
                  options={searchOptions}
                  placeholder="Ketik lalu pilih judul, topik, unit, atau kontributor"
                  helperText=""
                />
              </div>
              <Button type="submit" hierarchy="primary" disabled={Boolean(searchInput.trim()) && searchInput.trim().length < 3}>Cari</Button>
              {searchInput && searchInput.trim().length < 3 && <p className="px-1 pt-2 text-xs text-content-secondary">Masukkan minimal 3 karakter untuk mulai mencari.</p>}
            </form>
            <div className="mt-6 grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="kms-hero-feature"><FileText size={20} /><span>Dokumen praktis</span></div>
              <div className="kms-hero-feature"><PlayCircle size={20} /><span>Video pembelajaran</span></div>
              <div className="kms-hero-feature"><Building2 size={20} /><span>Lintas unit kerja</span></div>
            </div>
          </div>
          <div className="kms-hero-visual"><img src={transportHero} alt="Ilustrasi keterhubungan transportasi Indonesia melalui pengetahuan" decoding="async" fetchPriority="high" /></div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 md:px-8">
        <AnnouncementCarousel announcements={announcements} loading={announcementLoading} />

        {showAnnouncementSection && showFeaturedSection && <Divider light />}

        {showFeaturedSection && (
          <section className="kms-home-section kms-home-section--featured kms-home-reveal my-10" aria-labelledby="featured-heading">
            <div className="relative z-[1] mb-6 flex items-end justify-between gap-4">
              <div>
                <p className="kms-section-eyebrow"><Sparkles size={16} /> Pilihan utama</p>
                <h2 id="featured-heading" className="kms-section-title">Pengetahuan sorotan</h2>
                <p className="mt-2 max-w-2xl text-sm text-content-secondary">Referensi pilihan Admin atau pengetahuan terpopuler untuk membantu pekerjaan dan pembelajaran Anda hari ini.</p>
              </div>
            </div>
            <div className="kms-asset-grid relative z-[1] grid grid-cols-1 gap-5 md:grid-cols-3">{featuredAssets.map((asset) => <AssetCard key={asset.id} asset={asset} onPreview={openAssetPreview} />)}</div>
          </section>
        )}

        {(showAnnouncementSection || showFeaturedSection) && <Divider light />}

        <section className="kms-home-section kms-home-section--catalogue kms-home-reveal py-10" aria-labelledby="catalogue-heading">
          <div className="kms-catalogue-heading flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div>
              <p className="kms-section-eyebrow">Eksplorasi pengetahuan</p>
              <h2 id="catalogue-heading" className="kms-section-title">Daftar pengetahuan untuk Anda jelajahi</h2>
              <p className="mt-2 text-sm text-content-secondary">Pilih unit kerja, kategori, atau urutan untuk menemukan pengetahuan yang relevan.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:w-[460px]">
              <SelectDropdown label="Kategori" options={categoryOptions} selected={categoryId} onSelect={selectCategory} placeholder="Semua kategori" indicator="check" width="100%" />
              <SelectDropdown label="Urutkan" options={availableSortOptions} selected={sort} onSelect={selectSort} placeholder="Pilih urutan" indicator="check" width="100%" searchable={false} />
            </div>
          </div>

          <div className="kms-catalogue-layout mt-7 grid items-stretch gap-8 lg:grid-cols-[260px_minmax(0,1fr)]">
            <aside className="hidden h-full lg:block" aria-label="Filter Unit Kerja">
              <div className="kms-catalogue-filter sticky top-6 min-h-full">
                <div className="mb-4 flex items-start gap-3">
                  <div className="rounded-lg bg-surface-secondary p-2 text-content-guide"><Building2 size={20} /></div>
                  <div><h3 className="font-bold text-content-primary">Unit Kerja</h3><p className="mt-0.5 text-xs text-content-secondary">Saring sumber pengetahuan.</p></div>
                </div>
                <UnitWorkList workUnits={workUnits} selected={workUnitId} totalItems={totalUnitAssets} onSelect={selectWorkUnit} />
              </div>
            </aside>

            <div id="catalogue-results" className="min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button hierarchy="secondary" size="md" className="lg:hidden" prefixIcon={<Filter size={16} />} onClick={() => setIsUnitDrawerOpen(true)}>Filter Unit Kerja</Button>
                <span className="sr-only" aria-live="polite">{loading ? "Memuat pengetahuan" : "Daftar pengetahuan diperbarui"}</span>
                <div className="flex flex-wrap items-center gap-2">{activeFilterCount > 0 && <Badge type="soft" variant="info" size="sm">{activeFilterCount} filter aktif</Badge>}{searchQuery && <Badge type="soft" variant="brand" size="sm">Hasil: “{searchQuery}”</Badge>}{workUnitId && <Tooltip variant="basic" title={workUnitFullName(activeUnitName)} placement="top" showArrow={true}><Badge type="soft" variant="brand" size="sm">{workUnitShortName(activeUnitName)}</Badge></Tooltip>}{activeFilterCount > 0 && <Button hierarchy="tertiary" size="sm" prefixIcon={<X size={14} />} onClick={resetFilters}>Hapus semua filter</Button>}</div>
              </div>

              {error && <div className="mt-6"><Alert variant="danger" message={error} /></div>}
              {loading ? (
                <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: pageSize }, (_, index) => <AssetCardSkeleton key={index} />)}</div>
              ) : !error && assets.length === 0 ? (
                <EmptyState className="mt-6" icon={SearchX} title="Pengetahuan tidak ditemukan" description="Coba gunakan kata kunci lain atau hapus filter yang sedang dipilih." actionLabel="Reset filter" onAction={resetFilters} />
              ) : (
                <div className="kms-asset-grid mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">{assets.map((asset) => <AssetCard key={asset.id} asset={asset} searchQuery={searchQuery} onPreview={openAssetPreview} />)}</div>
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

      <Drawer isOpen={isUnitDrawerOpen} onClose={() => setIsUnitDrawerOpen(false)} title="Filter Unit Kerja" width="sm">
        <div className="p-4">
          <p className="mb-4 text-sm text-content-secondary">Pilih unit kerja untuk menyaring katalog pengetahuan.</p>
          <UnitWorkList workUnits={workUnits} selected={workUnitId} totalItems={totalUnitAssets} onSelect={selectWorkUnit} onClose={() => setIsUnitDrawerOpen(false)} />
        </div>
      </Drawer>
      <AssetQuickPreview asset={previewAsset} open={Boolean(previewAsset)} onClose={() => setPreviewAsset(null)} />
    </div>
  );
}
