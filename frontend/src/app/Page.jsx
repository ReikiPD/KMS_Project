import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  BookOpenCheck,
  Building2,
  FileText,
  Filter,
  PlayCircle,
  SearchX,
  History,
  Sparkles,
} from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Divider,
  Drawer,
  InputSearch,
  Pagination,
  SelectDropdown,
  Skeleton,
} from "@idds/react";
import AssetCard from "../components/AssetCard";
import transportHero from "../assets/knowledge/transport-hero.png";
import { API_BASE_URL, inputValue } from "../lib/api";

const PAGE_SIZE_OPTIONS = [6, 12, 24];
const sortOptions = [
  { label: "Terbaru", value: "terbaru" },
  { label: "Terlama", value: "terlama" },
  { label: "A - Z", value: "az" },
];

function UnitWorkList({ workUnits, selected, totalItems, onSelect, onClose }) {
  const chooseUnit = (value) => {
    onSelect(value);
    onClose?.();
  };

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
      {workUnits.map((unit) => {
        const isActive = selected === String(unit.id);
        return (
          <Button
            key={unit.id}
            hierarchy={isActive ? "primary" : "tertiary"}
            size="md"
            className={`kms-unit-work-item ${isActive ? "kms-unit-work-item--active" : ""}`}
          onClick={() => chooseUnit(String(unit.id))}
        >
          <span className="kms-unit-work-mark" aria-hidden="true">{unit.name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase() || "UK"}</span>
          <span className="kms-unit-work-name">{unit.name}</span>
          <Badge className="kms-unit-work-count" type="soft" variant={isActive ? "neutral" : "brand"} size="sm">{unit.asset_count ?? 0}</Badge>
          </Button>
        );
      })}
    </div>
  );
}

export default function Page() {
  const [urlSearchParams, setUrlSearchParams] = useSearchParams();
  const urlQuery = urlSearchParams.get("q")?.trim() || "";
  const [assets, setAssets] = useState([]);
  const [featuredAssets, setFeaturedAssets] = useState([]);
  const [categories, setCategories] = useState([]);
  const [workUnits, setWorkUnits] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [searchInput, setSearchInput] = useState(() => urlQuery);
  const [searchQuery, setSearchQuery] = useState(() => (urlQuery.length >= 3 ? urlQuery : ""));
  const [categoryId, setCategoryId] = useState("");
  const [workUnitId, setWorkUnitId] = useState("");
  const [sort, setSort] = useState("terbaru");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(6);
  const [loading, setLoading] = useState(true);
  const [featuredLoading, setFeaturedLoading] = useState(true);
  const [error, setError] = useState("");
  const [isUnitDrawerOpen, setIsUnitDrawerOpen] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [recentSearches, setRecentSearches] = useState([]);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const trackedQuery = useRef("");
  const searchInputRef = useRef(searchInput);
  const urlQueryRef = useRef(urlQuery);
  const setUrlSearchParamsRef = useRef(setUrlSearchParams);

  const totalUnitAssets = useMemo(
    () => workUnits.reduce((total, unit) => total + Number(unit.asset_count || 0), 0),
    [workUnits],
  );
  const activeUnitName = workUnitId
    ? workUnits.find((unit) => String(unit.id) === workUnitId)?.name
    : "Semua Unit Kerja";

  useEffect(() => {
    const controller = new AbortController();
    const loadFiltersAndFeatured = async () => {
      try {
        const [categoriesResponse, unitsResponse, featuredResponse] = await Promise.all([
          fetch(`${API_BASE_URL}/api/assets/categories`, { signal: controller.signal }),
          fetch(`${API_BASE_URL}/api/assets/work-units?withAssetCount=true`, { signal: controller.signal }),
          fetch(`${API_BASE_URL}/api/assets/featured`, { signal: controller.signal }),
        ]);
        if (controller.signal.aborted) return;
        if (categoriesResponse.ok) setCategories(await categoriesResponse.json());
        if (unitsResponse.ok) setWorkUnits(await unitsResponse.json());
        if (featuredResponse.ok) setFeaturedAssets(await featuredResponse.json());
      } catch {
        // The catalogue still works if auxiliary data cannot be loaded.
      } finally {
        if (!controller.signal.aborted) setFeaturedLoading(false);
      }
    };
    loadFiltersAndFeatured();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    try { setRecentSearches(JSON.parse(localStorage.getItem("kms_recent_searches") || "[]")); } catch { setRecentSearches([]); }
  }, []);

  useEffect(() => {
    searchInputRef.current = searchInput;
  }, [searchInput]);

  useEffect(() => {
    urlQueryRef.current = urlQuery;
  }, [urlQuery]);

  useEffect(() => {
    setUrlSearchParamsRef.current = setUrlSearchParams;
  }, [setUrlSearchParams]);

  useEffect(() => {
    const query = searchInput.trim();
    if (query.length < 3) { setSuggestions([]); return undefined; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/assets/search/suggestions?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        const data = await response.json();
        if (response.ok && !controller.signal.aborted) setSuggestions(Array.isArray(data) ? data : (data.data || []));
      } catch { if (!controller.signal.aborted) setSuggestions([]); }
    }, 220);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [searchInput]);

  useEffect(() => {
    const nextQuery = urlQuery.length >= 3 ? urlQuery : "";
    searchInputRef.current = urlQuery;
    setSearchInput((current) => current === urlQuery ? current : urlQuery);
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
        const response = await fetch(`${API_BASE_URL}/api/assets/homepage?${params}`, { signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Gagal memuat katalog pengetahuan");
        if (controller.signal.aborted) return;
        setAssets(result.data);
        setPagination(result.pagination);
        if (searchQuery && trackedQuery.current !== searchQuery) {
          trackedQuery.current = searchQuery;
          fetch(`${API_BASE_URL}/api/assets/search-events`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: searchQuery, resultCount: result.pagination?.totalItems || 0 }) }).catch(() => undefined);
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

  const updateSearch = useCallback((value) => {
    const nextValue = inputValue(value);
    if (searchInputRef.current !== nextValue) {
      searchInputRef.current = nextValue;
      setSearchInput(nextValue);
    }
    if (nextValue.trim()) return;

    setSearchQuery((current) => current === "" ? current : "");
    setCurrentPage((current) => current === 1 ? current : 1);

    if (!urlQueryRef.current) return;
    urlQueryRef.current = "";
    setUrlSearchParamsRef.current({}, { replace: true });
  }, []);

  const submitSearch = useCallback((value = searchInput) => {
    const query = inputValue(value).trim();
    if (query.length > 0 && query.length < 3) return;
    setSearchInput(query);
    setSearchQuery(query);
    setSort(query ? "relevansi" : "terbaru");
    setIsSearchFocused(false);
    if (query) {
      const nextRecent = [query, ...recentSearches.filter((item) => item.toLowerCase() !== query.toLowerCase())].slice(0, 6);
      setRecentSearches(nextRecent);
      localStorage.setItem("kms_recent_searches", JSON.stringify(nextRecent));
    }
    setCurrentPage(1);
    setUrlSearchParams(query ? { q: query } : {}, { replace: true });
    window.requestAnimationFrame(() => document.getElementById("catalogue-results")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [recentSearches, searchInput, setUrlSearchParams]);

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
    setSearchInput("");
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
  const availableSortOptions = searchQuery ? [{ label: "Relevansi", value: "relevansi" }, ...sortOptions] : sortOptions;
  const resultStart = pagination?.totalItems ? (currentPage - 1) * pageSize + 1 : 0;
  const resultEnd = pagination?.totalItems ? Math.min(currentPage * pageSize, pagination.totalItems) : 0;

  return (
    <div className="kms-public-page pb-14 md:pb-20">
      <section className="kms-hero border-b border-stroke-secondary">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-11 md:px-8 md:py-16 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.86fr)] lg:items-center lg:gap-12">
          <div>
            <Badge className="kms-hero-badge" type="soft" variant="brand" size="md" prefixIcon={<BookOpenCheck size={16} />}>Pusat Pengetahuan Kemenhub</Badge>
            <div className="mt-5 max-w-3xl">
              <h1 className="kms-display-title text-white">Temukan pengetahuan untuk menggerakkan transportasi Indonesia.</h1>
              <p className="mt-4 text-base leading-7 text-white/80 md:text-lg">Jelajahi praktik baik, panduan, dokumen, dan video pembelajaran dari unit kerja Kementerian Perhubungan.</p>
            </div>
            <form className="kms-hero-search relative mt-7 flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-end" onSubmit={(event) => { event.preventDefault(); submitSearch(); }}>
              <div className="min-w-0 flex-1"><InputSearch label="Cari pengetahuan" value={searchInput} onFocus={() => setIsSearchFocused(true)} onChange={updateSearch} placeholder="Ketik judul, topik, atau kata kunci (minimal 3 karakter)" />
                {isSearchFocused && (searchInput.trim().length >= 3 || recentSearches.length > 0) && <div className="kms-search-suggestions" role="listbox" aria-label="Saran pencarian">{searchInput.trim().length >= 3 ? <>{suggestions.length ? suggestions.map((suggestion) => <button key={suggestion.id} type="button" role="option" className="kms-search-suggestion" onMouseDown={(event) => event.preventDefault()} onClick={() => submitSearch(suggestion.title)}><SearchX size={15} /><span className="min-w-0"><strong className="block truncate">{suggestion.title}</strong><small>{suggestion.asset_type === "video" ? "Video" : "Dokumen"}</small></span></button>) : <p className="px-3 py-3 text-xs text-content-secondary">Tekan Enter untuk mencari seluruh isi pengetahuan.</p>}</> : <>{recentSearches.length > 0 && <><p className="px-3 pb-1 pt-3 text-xs font-bold text-content-secondary">Pencarian terakhir</p>{recentSearches.map((query) => <button key={query} type="button" className="kms-search-suggestion" onMouseDown={(event) => event.preventDefault()} onClick={() => submitSearch(query)}><History size={15} /><span className="truncate">{query}</span></button>)}</>}</>}</div>}
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
          <div className="kms-hero-visual"><img src={transportHero} alt="Ilustrasi keterhubungan transportasi Indonesia melalui pengetahuan" /></div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 md:px-8">
        <section className="py-10" aria-labelledby="featured-heading">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <p className="kms-section-eyebrow"><Sparkles size={16} /> Jangan lewatkan</p>
              <h2 id="featured-heading" className="kms-section-title">Pengetahuan sorotan</h2>
            </div>
          </div>
          {featuredLoading ? (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">{[1, 2, 3].map((item) => <Skeleton key={item} height="260px" rounded="lg" />)}</div>
          ) : featuredAssets.length ? (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">{featuredAssets.map((asset) => <AssetCard key={asset.id} asset={asset} />)}</div>
          ) : (
            <Card className="border-dashed" title="Belum ada pengetahuan sorotan" description="Aset pilihan akan muncul di bagian ini." />
          )}
        </section>

        <Divider light />

        <section className="py-10" aria-labelledby="catalogue-heading">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
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

          <div className="mt-7 grid gap-8 lg:grid-cols-[260px_minmax(0,1fr)]">
            <aside className="hidden lg:block" aria-label="Filter Unit Kerja">
              <div className="kms-catalogue-filter sticky top-6">
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
                <p className="text-sm text-content-secondary" aria-live="polite">
                  {loading ? "Memuat pengetahuan…" : `Menampilkan ${resultStart}–${resultEnd} dari ${pagination?.totalItems || 0} pengetahuan`}
                </p>
                <div className="flex flex-wrap gap-2">{searchQuery && <Badge type="soft" variant="brand" size="sm">Hasil: “{searchQuery}”</Badge>}{workUnitId && <Badge type="soft" variant="brand" size="sm">{activeUnitName}</Badge>}</div>
              </div>

              {error && <div className="mt-6"><Alert variant="danger" message={error} /></div>}
              {loading ? (
                <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: pageSize }, (_, index) => <Skeleton key={index} height="300px" rounded="lg" />)}</div>
              ) : !error && assets.length === 0 ? (
                <div className="mt-6 rounded-xl border border-dashed border-stroke-primary bg-page-primary px-6 py-16 text-center">
                  <SearchX className="mx-auto text-content-secondary" size={36} />
                  <h3 className="mt-4 text-lg font-semibold text-content-primary">Pengetahuan tidak ditemukan</h3>
                  <p className="mx-auto mt-2 max-w-md text-sm text-content-secondary">Coba gunakan kata kunci lain atau hapus filter yang sedang dipilih.</p>
                  <Button className="mt-5" hierarchy="secondary" size="md" onClick={resetFilters}>Reset filter</Button>
                </div>
              ) : (
                <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">{assets.map((asset) => <AssetCard key={asset.id} asset={asset} />)}</div>
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
    </div>
  );
}
