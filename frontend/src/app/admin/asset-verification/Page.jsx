import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "../../../styles/review-governance.css";
import ResponsiveTable from "../../../components/ResponsiveTable";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Alert, Badge, Button, CardPlain, SelectDropdown, Skeleton, TextField } from "@idds/react";
import { Building2, ChevronDown, FileCheck2, FileText, Search, SlidersHorizontal, Video, X } from "lucide-react";
import AdminPageHeader from "../../../components/AdminPageHeader";
import EmptyState from "../../../components/EmptyState";
import { useAuth } from "../../../contexts/AuthContext";
import useAdminView from "../../../hooks/useAdminView";
import { apiFetch, inputValue } from "../../../lib/api";
import { canDecideAssetVerification } from "../../../lib/permissions";
import { publicationStatus, publicationStatusOptions } from "../../../lib/publicationStatus";

const EMPTY_FILTERS = { echelon: "all", assetType: "all", wait: "all", assigned: "all", dateFrom: "", dateTo: "" };
const PRIORITY = {
  new: { label: "Baru", variant: "info" },
  due: { label: "Segera diperiksa", variant: "warning" },
  overdue: { label: "Terlambat", variant: "error" },
};
const FILTER_OPTIONS = {
  echelon: [{ value: "all", label: "Semua eselon" }, ...[1, 2, 3].map((value) => ({ value: String(value), label: `Eselon ${value}` }))],
  assetType: [{ value: "all", label: "Semua tipe" }, { value: "document", label: "Dokumen PDF" }, { value: "video", label: "Video" }],
  wait: [{ value: "all", label: "Semua waktu tunggu" }, { value: "new", label: "Baru (< 24 jam)" }, { value: "due", label: "Segera diperiksa (1–3 hari)" }, { value: "overdue", label: "Terlambat (> 3 hari)" }],
  assigned: [{ value: "all", label: "Semua penugasan" }, { value: "mine", label: "Ditugaskan kepada saya" }, { value: "unassigned", label: "Belum ditugaskan" }],
};
const unitLabel = (asset) => [...new Set([asset.parent_work_unit_alias || asset.parent_work_unit_name, asset.work_unit_alias || asset.work_unit_name].filter(Boolean))].join(" — ") || "Unit kerja belum diisi";
const dateLabel = (value) => value ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(new Date(value)) : "-";

export default function AssetVerificationPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const patchParams = (changes) => setSearchParams((current) => {
    const next = new URLSearchParams(current);
    Object.entries(changes).forEach(([key, value]) => { if (value && value !== "all") next.set(key, String(value)); else next.delete(key); });
    return next;
  });
  const { user: authenticatedUser } = useAuth();
  const { accessUser, withEmployeeContext } = useAdminView();
  const user = accessUser || authenticatedUser || {};
  const subjectKey = `${user.public_id || user.id || user.email || ""}:${user.role || ""}`;
  const canDecide = canDecideAssetVerification(user);
  const [items, setItems] = useState([]);
  const [scope, setScope] = useState(null);
  const status = searchParams.get("status") || "pending_review";
  const appliedQuery = searchParams.get("q") || "";
  const [query, setQuery] = useState(appliedQuery);
  const filters = useMemo(() => Object.fromEntries(Object.entries(EMPTY_FILTERS).map(([key, fallback]) => [key, searchParams.get(key) || fallback])), [searchParams]);
  const setStatus = (value) => patchParams({ status: value, page: 1 });
  const setFilters = (value) => patchParams({ ...value, page: 1 });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterReviewers, setFilterReviewers] = useState([]);
  const [filterReviewersError, setFilterReviewersError] = useState("");
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const setPage = (value) => patchParams({ page: typeof value === "function" ? value(page) : value });
  const [pagination, setPagination] = useState({ totalItems: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const loadSequence = useRef(0);

  const load = useCallback(async (signal) => {
    const sequence = ++loadSequence.current;
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ status, page: String(page), limit: "10" });
      if (appliedQuery) params.set("q", appliedQuery);
      Object.entries(filters).forEach(([key, value]) => { if (value && value !== "all") params.set(key, value); });
      const response = await apiFetch(`/api/assets/admin/publication-reviews?${params}`, { auth: true, signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || result.error || "Gagal memuat antrean verifikasi");
      if (sequence !== loadSequence.current || signal?.aborted) return;
      setItems(result.data || []); setScope(result.scope || null);
      setPagination(result.pagination || { totalItems: 0, totalPages: 0 });
    } catch (loadError) { if (sequence === loadSequence.current && !signal?.aborted) setError(loadError.message); }
    finally { if (sequence === loadSequence.current && !signal?.aborted) setLoading(false); }
  }, [appliedQuery, filters, page, status]);

  useEffect(() => { const controller = new AbortController(); load(controller.signal); return () => controller.abort(); }, [load, subjectKey]);
  useEffect(() => { setQuery(appliedQuery); }, [appliedQuery]);
  useEffect(() => {
    if (!filtersOpen) return undefined;
    const controller = new AbortController();
    const loadReviewers = async () => {
      setFilterReviewers([]); setFilterReviewersError("");
      try {
        const response = await apiFetch("/api/assets/admin/publication-reviewers", { auth: true, signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Pilihan nama verifikator belum dapat dimuat.");
        if (!controller.signal.aborted) setFilterReviewers(result.data || []);
      } catch (error) { if (!controller.signal.aborted) setFilterReviewersError(error.message); }
    };
    loadReviewers();
    return () => controller.abort();
  }, [filtersOpen, subjectKey]);

  const changeFilter = (key, value) => patchParams({ [key]: value, page: 1 });
  const activeFilters = Object.entries(filters).filter(([, value]) => value && value !== "all");
  const filterOptions = { ...FILTER_OPTIONS, assigned: [...FILTER_OPTIONS.assigned, ...filterReviewers.map((item) => ({ value: item.public_id, label: item.full_name }))] };
  const labelForFilter = (key, value) => filterOptions[key]?.find((item) => item.value === value)?.label
    || (key === "assigned" ? "Verifikator dipilih" : `${key === "dateFrom" ? "Mulai" : "Sampai"} ${dateLabel(value)}`);
  const search = (event) => { event.preventDefault(); patchParams({ q: query.trim(), page: 1 }); };
  const openReview = (asset) => {
    sessionStorage.setItem(`kms.review-scroll:${subjectKey}:${location.search}`, String(document.getElementById("kms-main-content")?.scrollTop || 0));
    navigate(`/admin/asset-verification/${encodeURIComponent(asset.public_id || asset.slug)}`, { state: { reviewOrigin: true } });
  };
  useEffect(() => {
    if (loading) return;
    const key = `kms.review-scroll:${subjectKey}:${location.search}`;
    const saved = sessionStorage.getItem(key);
    if (saved !== null) { document.getElementById("kms-main-content")?.scrollTo({ top: Number(saved), behavior: "auto" }); sessionStorage.removeItem(key); }
  }, [loading, subjectKey, location.search]);

  return <div className="mx-auto w-full max-w-7xl p-4 md:p-6 xl:p-8">
    <AdminPageHeader eyebrow="Manajemen Aset" title="Verifikasi Aset" description="Periksa dan putuskan kelayakan aset dalam cakupan unit kerja Anda."
      breadcrumbs={[{ label: "Dasbor", href: withEmployeeContext("/admin/dashboard") }, { label: "Verifikasi Aset" }]} />
    <CardPlain className="kms-admin-surface">
      <div className="kms-review-scope"><Building2 size={16} /><span>{scope?.type === "all" ? "Seluruh unit kerja" : scope?.work_unit_name || "Unit kerja akun dan turunannya"}</span><small>Pengajuan tertua diprioritaskan</small></div>
      <form className="kms-review-toolbar" onSubmit={search}>
        <div className="kms-review-search"><TextField label="Cari pengajuan" value={query} onChange={(value) => setQuery(inputValue(value))} placeholder="Judul, pengaju, atau unit kerja" showClearButton /></div>
        <SelectDropdown label="Status pengajuan" options={publicationStatusOptions} selected={status} onSelect={setStatus} searchable={false} showPreviewValue={false} mandatorySelected indicator="check" />
        <div className="kms-review-toolbar-actions"><Button type="submit" hierarchy="primary" prefixIcon={<Search size={16} />}>Cari</Button><Button type="button" hierarchy="secondary" prefixIcon={<SlidersHorizontal size={16} />} suffixIcon={<ChevronDown size={15} className={filtersOpen ? "rotate-180" : ""} />} onClick={() => setFiltersOpen((value) => !value)} aria-expanded={filtersOpen} aria-controls="verification-filters">Filter{activeFilters.length ? ` (${activeFilters.length})` : ""}</Button></div>
      </form>
      {filtersOpen && <div id="verification-filters" className="kms-review-filter-panel">
        {Object.entries({ echelon: "Tingkat organisasi", assetType: "Tipe aset", wait: "Lama menunggu", assigned: "Penugasan" }).map(([key, label]) => <SelectDropdown key={key} label={label} options={filterOptions[key]} selected={filters[key]} onSelect={(value) => changeFilter(key, String(value))} searchable={key === "assigned"} showPreviewValue={false} mandatorySelected />)}
        <label className="kms-review-date-filter">Diajukan mulai<input type="date" value={filters.dateFrom} max={filters.dateTo || undefined} onChange={(event) => changeFilter("dateFrom", event.target.value)} /></label>
        <label className="kms-review-date-filter">Diajukan sampai<input type="date" value={filters.dateTo} min={filters.dateFrom || undefined} onChange={(event) => changeFilter("dateTo", event.target.value)} /></label>
        {filterReviewersError && <p className="kms-review-inline-error" role="alert">{filterReviewersError}</p>}
      </div>}
      {activeFilters.length > 0 && <div className="kms-review-active-filters">
        {activeFilters.map(([key, value]) => <button key={key} type="button" onClick={() => changeFilter(key, EMPTY_FILTERS[key])} aria-label={`Hapus filter ${labelForFilter(key, value)}`}>{labelForFilter(key, value)}<X size={13} /></button>)}
        <Button hierarchy="link" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>Reset filter</Button>
      </div>}

      {error ? <div className="p-5"><Alert variant="critical" title="Antrean tidak dapat dimuat" message={error} /></div> : loading ? <div className="space-y-3 p-5">{[1, 2, 3, 4].map((row) => <Skeleton key={row} height="70px" />)}</div> : items.length === 0 ? <EmptyState icon={FileCheck2} title={`Tidak ada aset berstatus ${publicationStatus({ publication_status: status }).label.toLowerCase()}`} description="Pengajuan yang sesuai cakupan organisasi dan filter akan tampil di sini." /> : (
        <div className="overflow-x-auto">
          <ResponsiveTable label="Antrean verifikasi" minTableWidth={900} summary={[3]} className="kms-admin-native-table kms-review-responsive min-w-[900px] text-left">
            <thead><tr><th>Aset</th><th>Pengaju</th><th>Unit kerja</th><th>Status / prioritas</th><th>Penugasan</th><th className="text-right">Aksi</th></tr></thead>
            <tbody>{items.map((asset) => {
              const pending = asset.publication_status === "pending_review";
              const priority = pending ? (PRIORITY[asset.queue_priority] || PRIORITY.new) : publicationStatus(asset);
              const TypeIcon = asset.asset_type === "video" ? Video : FileText;
              return <tr key={asset.public_id}>
                <td><div className="flex items-start gap-3"><span className="rounded-lg bg-primary-100 p-2 text-content-guide"><TypeIcon size={18} /></span><div className="min-w-0"><p className="max-w-xs truncate font-semibold text-content-primary" title={asset.title}>{asset.title}</p><p className="mt-1 text-xs text-content-secondary">{asset.category_name || "Tanpa kategori"} · Putaran {asset.review_round || 1}</p></div></div></td>
                <td>{asset.author_name}</td><td>{unitLabel(asset)}</td>
                <td><Badge type="soft" variant={priority.variant} size="sm">{priority.label}</Badge><p className="mt-1 text-xs text-content-secondary">{pending ? `${asset.waiting_hours || 0} jam menunggu` : dateLabel(asset.reviewed_at)}</p></td>
                <td>{asset.assigned_verifier_name || (pending ? "Belum ditugaskan" : asset.reviewer_name || "—")}</td>
                <td className="text-right"><Button hierarchy="secondary" size="sm" onClick={() => openReview(asset)}>{pending && canDecide ? "Periksa" : "Lihat keterangan"}</Button></td>
              </tr>;
            })}</tbody>
          </ResponsiveTable>
        </div>
      )}
      {!loading && pagination.totalPages > 1 && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle px-5 py-4 text-sm text-content-secondary"><span>{pagination.totalItems} pengajuan</span><div className="flex items-center gap-2"><Button hierarchy="tertiary" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Sebelumnya</Button><span>{page} / {pagination.totalPages}</span><Button hierarchy="tertiary" size="sm" disabled={page >= pagination.totalPages} onClick={() => setPage((value) => value + 1)}>Berikutnya</Button></div></div>}
    </CardPlain>
  </div>;
}
