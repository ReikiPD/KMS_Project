import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardPlain,
  Chip,
  DatePicker,
  Modal,
  Pagination,
  Skeleton,
} from "@idds/react";
import {
  BookOpenCheck,
  BarChart3,
  CalendarDays,
  Eye,
  FileText,
  FolderOpen,
  PlayCircle,
  Search,
  Share2,
  TrendingUp,
  TrendingDown,
  Minus,
  UserRoundCheck,
} from "lucide-react";
import AdminPageHeader from "../../../components/AdminPageHeader";
import MultipleSearchSelect from "../../../components/MultipleSearchSelect";
import useAdminView from "../../../hooks/useAdminView";
import { apiFetch, currentUser } from "../../../lib/api";
import { searchSelectionsToQuery } from "../../../lib/search";

const PERIOD_OPTIONS = [
  { label: "Sepanjang waktu", value: "all" },
  { label: "7 hari", value: "7d" },
  { label: "30 hari", value: "30d" },
  { label: "90 hari", value: "90d" },
  { label: "Tahun berjalan", value: "year" },
  { label: "Rentang khusus", value: "custom" },
];

const validPeriods = new Set(PERIOD_OPTIONS.map((option) => option.value));
const formatNumber = (value) => new Intl.NumberFormat("id-ID").format(Number(value) || 0);
const formatDate = (value) => value ? new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value)) : "—";
const todayIso = () => new Date().toISOString().slice(0, 10);
const offsetIso = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

function MetricCard({ icon: Icon, label, value, description, tone = "blue" }) {
  return <CardPlain className={`kms-admin-surface kms-admin-metric-card kms-admin-metric-card--${tone} p-4 md:p-5`}><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium text-content-secondary">{label}</p><p className="mt-2 text-3xl font-bold tracking-tight text-content-primary">{formatNumber(value)}</p></div><span className="kms-admin-metric-icon" aria-hidden="true"><Icon size={21} /></span></div><p className="mt-3 text-xs leading-5 text-content-secondary">{description}</p></CardPlain>;
}

function TrendChart({ data }) {
  const max = Math.max(1, ...data.map((item) => Number(item.asset_count) || 0));
  if (!data.length) return <div className="flex min-h-52 items-center justify-center text-center text-sm text-content-secondary">Belum ada data pengetahuan terbit pada periode ini.</div>;
  return <div className="overflow-x-auto"><svg viewBox={`0 0 ${Math.max(560, data.length * 72)} 220`} className="min-w-[560px] w-full" role="img" aria-label="Grafik tren penambahan pengetahuan"><line x1="42" y1="178" x2={Math.max(520, data.length * 72 - 12)} y2="178" stroke="currentColor" className="text-border-subtle" /><line x1="42" y1="26" x2="42" y2="178" stroke="currentColor" className="text-border-subtle" />{data.map((item, index) => { const width = 34; const gap = Math.max(18, (Math.max(500, data.length * 72 - 70) / data.length) - width); const x = 52 + index * (width + gap); const height = Math.max(3, (Number(item.asset_count) || 0) / max * 132); return <g key={item.bucket || item.label}><rect x={x} y={178 - height} width={width} height={height} rx="6" className="fill-[var(--kms-blue-600)]" /><text x={x + width / 2} y={198} textAnchor="middle" className="fill-content-secondary text-[10px]">{item.label}</text><text x={x + width / 2} y={Math.max(18, 170 - height)} textAnchor="middle" className="fill-content-primary text-[11px] font-semibold">{item.asset_count}</text></g>; })}</svg></div>;
}

function KpiAnalysisModal({ open, onClose, organization, comparison, trend, periodLabel, granularity }) {
  const previous = comparison?.previous || {};
  const available = Boolean(comparison?.available);
  const metrics = [
    { label: "Pengetahuan terbit", current: organization.published_asset_count, previous: previous.published_asset_count, icon: BookOpenCheck },
    { label: "Total dilihat", current: organization.total_view_count, previous: previous.total_view_count, icon: Eye },
    { label: "Dokumen", current: organization.document_count, previous: previous.document_count, icon: FileText },
    { label: "Video", current: organization.video_count, previous: previous.video_count, icon: PlayCircle },
  ];
  const getDelta = (currentValue, previousValue) => {
    const current = Number(currentValue) || 0;
    const prior = Number(previousValue) || 0;
    if (!available) return null;
    if (prior === 0) return current === 0 ? 0 : 100;
    return Math.round(((current - prior) / prior) * 100);
  };

  return (
    <Modal open={open} onClose={onClose} title="Analisis dan perbandingan KPI" size="xl">
      <div className="kms-kpi-modal-content space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl bg-page-secondary p-4">
          <div><p className="text-sm font-bold text-content-primary">Periode aktif</p><p className="mt-1 text-sm text-content-secondary">{periodLabel}</p></div>
          <Badge type="soft" variant={available ? "info" : "warning"} text={available ? "Dibandingkan dengan periode sebelumnya" : "Perbandingan belum tersedia"} />
        </div>
        {!available && <Alert variant="info" title="Pilih periode untuk membandingkan" message="Gunakan filter 7 hari, 30 hari, 90 hari, tahun berjalan, atau rentang khusus agar nilai dapat dibandingkan dengan periode sebelumnya yang berdurasi sama." />}
        <CardPlain className="kms-kpi-trend-panel">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2"><div><p className="flex items-center gap-2 text-sm font-bold text-content-primary"><TrendingUp size={17} /> Tren penambahan pengetahuan</p><p className="mt-1 text-xs text-content-secondary">Aset terbit dikelompokkan {granularity?.toLowerCase() || "bulanan"}. Nilai kecil tetap menggunakan tinggi minimum agar terlihat.</p></div><Badge type="soft" variant="info" text={granularity || "Bulanan"} /></div>
          <TrendChart data={trend || []} />
        </CardPlain>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => {
            const Icon = metric.icon;
            const delta = getDelta(metric.current, metric.previous);
            const DeltaIcon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
            return <CardPlain key={metric.label} className="kms-kpi-comparison-card"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-content-secondary">{metric.label}</p><p className="mt-1 text-2xl font-bold text-content-primary">{formatNumber(metric.current)}</p></div><span className="kms-admin-metric-icon" aria-hidden="true"><Icon size={18} /></span></div><div className="mt-3 flex items-center justify-between gap-3 border-t border-border-subtle pt-3"><span className="text-xs text-content-secondary">Sebelumnya: <strong className="text-content-primary">{available ? formatNumber(metric.previous) : "—"}</strong></span>{delta !== null && <span className={`kms-metric-delta kms-metric-delta--${delta > 0 ? "up" : delta < 0 ? "down" : "flat"}`}><DeltaIcon size={13} />{Math.abs(delta)}%</span>}</div></CardPlain>;
          })}
        </div>
      </div>
    </Modal>
  );
}

const rankingMeta = {
  search: { title: "Paling Banyak Dicari", description: "Kata kunci yang paling sering dicari pengunjung.", icon: Search, unit: "pencarian" },
  view: { title: "Paling Banyak Dilihat", description: "Pengetahuan terbit dengan jangkauan tertinggi.", icon: Eye, unit: "dilihat" },
  share: { title: "Paling Banyak Dibagikan", description: "Pengetahuan yang paling sering dibagikan.", icon: Share2, unit: "dibagikan" },
  staff_published: { title: "Aset Terbit Terbanyak", description: "Pegawai dengan jumlah aset terbit paling banyak.", icon: BookOpenCheck, unit: "aset" },
  staff_views: { title: "Akumulasi Dilihat Tertinggi", description: "Pegawai dengan akumulasi jangkauan aset terbit tertinggi.", icon: Eye, unit: "dilihat" },
  staff_created: { title: "Aset Dibuat Terbanyak", description: "Pegawai dengan jumlah keseluruhan aset aktif paling banyak.", icon: FolderOpen, unit: "aset" },
};

function RankingList({ metric, items, onOpenAsset, compact = false }) {
  const meta = rankingMeta[metric];
  const isSearchMetric = metric === "search";
  const isStaffMetric = metric.startsWith("staff_");
  const isAssetMetric = !isSearchMetric && !isStaffMetric;
  if (!items.length) return <p className="py-5 text-center text-sm text-content-secondary">Belum ada data pada periode ini.</p>;
  return <ol className="divide-y divide-border-subtle">{items.map((item, index) => {
    const primaryText = isSearchMetric ? item.label || item.query : isStaffMetric ? item.full_name : item.title;
    const secondaryText = isStaffMetric
      ? `${item.department || "Unit belum diisi"}${item.email ? ` · ${item.email}` : ""}`
      : item.category_name || (item.asset_type === "video" ? "Video pembelajaran" : "Dokumen pengetahuan");
    return <li key={`${metric}-${item.id || item.label || item.query}`} className="py-3 first:pt-0 last:pb-0"><button type="button" disabled={!isAssetMetric} onClick={() => isAssetMetric && onOpenAsset(item.id)} className={`flex w-full items-start gap-3 text-left ${isAssetMetric ? "group" : "cursor-default"}`}><span className="kms-admin-ranking-number">{item.rank || index + 1}</span><span className="min-w-0 flex-1"><span className={`block ${compact ? "line-clamp-1" : "line-clamp-2"} text-sm font-semibold text-content-primary ${isAssetMetric ? "group-hover:underline" : ""}`}>{primaryText}</span>{!isSearchMetric && <span className="mt-1 block truncate text-xs text-content-secondary">{secondaryText}</span>}</span><span className="shrink-0 text-xs font-bold text-content-guide">{formatNumber(item.metric_value ?? item.search_count ?? item.view_count ?? item.share_count)}<span className="ml-1 font-medium text-content-secondary">{meta.unit}</span></span></button></li>;
  })}</ol>;
}

function RankingCard({ metric, items, onOpenRanking, onOpenAsset }) {
  const meta = rankingMeta[metric];
  const Icon = meta.icon;
  return <CardPlain className="kms-admin-surface kms-admin-ranking-card flex min-h-[18rem] flex-col p-4 md:p-5"><div className="flex items-start gap-3"><span className="kms-admin-metric-icon" aria-hidden="true"><Icon size={19} /></span><div className="min-w-0"><h2 className="text-base font-bold text-content-primary">{meta.title}</h2><p className="mt-1 text-xs leading-5 text-content-secondary">{meta.description}</p></div></div><div className="mt-4 flex-1"><RankingList metric={metric} items={items} onOpenAsset={onOpenAsset} compact /></div><Button hierarchy="secondary" size="sm" className="kms-ranking-more-button mt-4 self-start" onClick={() => onOpenRanking(metric)}>Lihat peringkat lengkap</Button></CardPlain>;
}

function RankingModal({ metric, open, onClose, period, startDate, endDate, authorId, onOpenAsset }) {
  const meta = rankingMeta[metric] || rankingMeta.search;
  const isStaffMetric = metric.startsWith("staff_");
  const [searchSelections, setSearchSelections] = useState([]);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { if (open) { setSearchSelections([]); setQuery(""); setPage(1); } }, [open, metric]);
  useEffect(() => {
    if (!open) return undefined;
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ metric, page: String(page), limit: "10", period });
        if (period === "custom") { params.set("startDate", startDate); params.set("endDate", endDate); }
        if (authorId) params.set("authorId", authorId);
        if (query) params.set("q", query);
        const response = await apiFetch(`/api/assets/admin/dashboard/rankings?${params}`, { auth: true, signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Gagal memuat ranking");
        if (!controller.signal.aborted) { setData(result.data || []); setPagination(result.pagination || null); }
      } catch (loadError) {
        if (loadError.name !== "AbortError" && !controller.signal.aborted) setError(loadError.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    load();
    return () => controller.abort();
  }, [authorId, endDate, metric, open, page, period, query, startDate]);

  const submitSearch = (event) => { event.preventDefault(); setPage(1); setQuery(searchSelectionsToQuery(searchSelections)); };
  const Icon = meta.icon;
  const searchLabel = metric === "search" ? "Cari kata kunci" : isStaffMetric ? "Cari Pegawai" : "Cari judul aset";
  const searchPlaceholder = metric === "search" ? "Masukkan kata kunci" : isStaffMetric ? "Nama, email, atau unit Pegawai" : "Masukkan judul aset";
  return <Modal open={open} onClose={onClose} title={meta.title} size="lg"><div className="space-y-5"><div className="flex items-start gap-3 rounded-lg bg-page-secondary p-3"><span className="kms-admin-metric-icon" aria-hidden="true"><Icon size={18} /></span><p className="text-sm text-content-secondary">{meta.description} Data mengikuti periode analitik yang sedang aktif.</p></div><form className="flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={submitSearch}><div className="min-w-0 flex-1"><MultipleSearchSelect label={searchLabel} selected={searchSelections} onSelect={setSearchSelections} options={data.map((item) => { const value = metric === "search" ? item.label || item.query : isStaffMetric ? item.full_name : item.title; const group = metric === "search" ? "Kata Kunci" : isStaffMetric ? "Pegawai" : "Judul Aset"; return { group, label: value, value, description: meta.unit }; }).filter((option) => option.value)} placeholder={searchPlaceholder} helperText="" /></div><Button type="submit" hierarchy="secondary" prefixIcon={<Search size={16} />}>Cari</Button></form>{error && <Alert variant="critical" title="Ranking tidak tersedia" message={error} />}{loading ? <div className="space-y-3">{[1, 2, 3, 4].map((item) => <Skeleton key={item} height="56px" rounded="md" />)}</div> : <RankingList metric={metric} items={data} onOpenAsset={(id) => { onClose(); onOpenAsset(id); }} />}{!loading && pagination?.totalPages > 1 && <div className="flex justify-center"><Pagination currentPage={page} totalPages={pagination.totalPages} pageSize={pagination.limit} pageSizeOptions={[10]} onPageChange={setPage} onPageSizeChange={() => setPage(1)} /></div>}</div></Modal>;
}

function PeriodToolbar({ period, customDates, onPeriodChange, onDatesChange, onApply, error }) {
  const [customOpen, setCustomOpen] = useState(period === "custom");
  useEffect(() => setCustomOpen(period === "custom"), [period]);
  const selectPeriod = (nextPeriod) => { setCustomOpen(nextPeriod === "custom"); onPeriodChange(nextPeriod); };
  return <CardPlain className="kms-admin-surface kms-admin-period-toolbar mb-5 p-4 md:p-5"><div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between"><div><p className="flex items-center gap-2 text-sm font-bold text-content-primary"><CalendarDays size={17} /> Periode analitik</p><p className="mt-1 text-xs text-content-secondary">Berlaku pada KPI, tren, dan seluruh peringkat dashboard.</p></div><div className="min-w-0 xl:max-w-3xl"><Chip options={PERIOD_OPTIONS} selected={customOpen ? "custom" : period} onSelect={selectPeriod} size="small" variant="outline" /></div></div>{customOpen && <div className="mt-4 grid gap-4 border-t border-border-subtle pt-4 md:grid-cols-[minmax(0,1fr)_auto]"><div><DatePicker mode="range" selected={customDates} onChange={onDatesChange} dateFormat="yyyy-MM-dd" label="Rentang tanggal" placeholder="Pilih tanggal mulai dan akhir" disabledFutureDate triggerWidth="100%" /><p className="mt-2 text-xs text-content-secondary">Rentang maksimal satu tahun hingga hari ini.</p></div><div className="flex items-end"><Button hierarchy="primary" onClick={onApply}>Terapkan</Button></div></div>}{error && <Alert className="mt-4" variant="critical" message={error} />}</CardPlain>;
}

function DashboardSkeleton() {
  return <div className="mt-5 space-y-5"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[1, 2, 3, 4].map((item) => <Skeleton key={item} height="150px" rounded="lg" />)}</div><Skeleton height="300px" rounded="lg" /><div className="grid gap-5 xl:grid-cols-3">{[1, 2, 3].map((item) => <Skeleton key={item} height="340px" rounded="lg" />)}</div></div>;
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const user = currentUser() || {};
  const { isActingAsEmployee, isAdminViewingUser, isLeaderViewingEmployee, isEmployeeContext, employeeId, staffMember, withEmployeeContext, exitEmployeeContext } = useAdminView();
  const queryPeriod = searchParams.get("period");
  const period = validPeriods.has(queryPeriod) ? queryPeriod : "all";
  const authorId = searchParams.get("authorId") || (isEmployeeContext ? employeeId : "");
  const startDate = searchParams.get("startDate") || "";
  const endDate = searchParams.get("endDate") || "";
  const [customDates, setCustomDates] = useState([startDate || offsetIso(-29), endDate || todayIso()]);
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [periodError, setPeriodError] = useState("");
  const [rankingMetric, setRankingMetric] = useState(null);
  const [kpiAnalysisOpen, setKpiAnalysisOpen] = useState(false);
  const [fallbackStaffRankings, setFallbackStaffRankings] = useState({ published: [], views: [], created: [] });
  const canWrite = ["pegawai", "admin"].includes(user.role) && !isAdminViewingUser;
  const showPersonal = user.role === "pegawai" || isActingAsEmployee || Boolean(authorId);
  const showStaffRankings = user.role === "admin" && !isEmployeeContext;

  useEffect(() => {
    if (period === "custom") setCustomDates([startDate || offsetIso(-29), endDate || todayIso()]);
  }, [endDate, period, startDate]);

  const updateParams = useCallback((updates) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      Object.entries(updates).forEach(([key, value]) => { if (value) next.set(key, String(value)); else next.delete(key); });
      return next;
    });
  }, [setSearchParams]);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ period });
        if (authorId) params.set("authorId", authorId);
        if (period === "custom") { params.set("startDate", startDate); params.set("endDate", endDate); }
        const response = await apiFetch(`/api/assets/admin/dashboard?${params}`, { auth: true, signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Gagal memuat dashboard");
        if (!controller.signal.aborted) setDashboard(result);
      } catch (loadError) {
        if (loadError.name !== "AbortError" && !controller.signal.aborted) setError(loadError.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    load();
    return () => controller.abort();
  }, [authorId, endDate, period, startDate]);

  useEffect(() => {
    if (!showStaffRankings || !dashboard || dashboard.staffRankings) {
      setFallbackStaffRankings({ published: [], views: [], created: [] });
      return undefined;
    }

    const controller = new AbortController();
    const loadFallbackStaffRankings = async () => {
      const metrics = ["staff_published", "staff_views", "staff_created"];
      try {
        const results = await Promise.all(metrics.map(async (metric) => {
          const params = new URLSearchParams({ metric, page: "1", limit: "5", period });
          if (period === "custom") {
            params.set("startDate", startDate);
            params.set("endDate", endDate);
          }
          const response = await apiFetch(`/api/assets/admin/dashboard/rankings?${params}`, { auth: true, signal: controller.signal });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "Gagal memuat ranking Pegawai");
          return result.data || [];
        }));
        if (!controller.signal.aborted) {
          setFallbackStaffRankings({ published: results[0], views: results[1], created: results[2] });
        }
      } catch (loadError) {
        if (loadError.name !== "AbortError" && !controller.signal.aborted) {
          setFallbackStaffRankings({ published: [], views: [], created: [] });
        }
      }
    };
    loadFallbackStaffRankings();
    return () => controller.abort();
  }, [dashboard, endDate, period, showStaffRankings, startDate]);

  const selectPeriod = (nextPeriod) => {
    if (nextPeriod === "custom") { updateParams({ period: "custom", startDate: customDates[0], endDate: customDates[1] }); return; }
    updateParams({ period: nextPeriod === "all" ? "" : nextPeriod, startDate: "", endDate: "" });
  };
  const applyCustomPeriod = () => {
    const [nextStart, nextEnd] = customDates;
    if (!nextStart || !nextEnd || nextStart > nextEnd) { setPeriodError("Pilih rentang tanggal yang valid."); return; }
    setPeriodError("");
    updateParams({ period: "custom", startDate: nextStart, endDate: nextEnd });
  };
  const openAsset = (id) => navigate(withEmployeeContext(`/admin/assets/${id}`));
  const openAssets = () => navigate(withEmployeeContext("/admin/assets"));
  const openCreate = () => navigate(withEmployeeContext("/admin/assets/create"));

  const organization = dashboard?.organization || {};
  const personal = dashboard?.personal || {};
  const periodInfo = dashboard?.period || { key: period, viewMetric: period === "all" ? "all_time" : "period", trendGranularity: "Bulanan" };
  const periodLabel = period === "custom" && periodInfo.startDate ? `${formatDate(periodInfo.startDate)} – ${formatDate(periodInfo.endDate)}` : (PERIOD_OPTIONS.find((option) => option.value === period)?.label || "Sepanjang waktu");
  const rankings = dashboard?.rankings || { search: [], view: [], share: [] };
  const comparison = dashboard?.comparison || { available: false, previous: {} };
  const staffRankings = dashboard?.staffRankings || fallbackStaffRankings;
  const heading = isAdminViewingUser
    ? (staffMember?.role === "pimpinan" ? "Dashboard Pimpinan" : "Dashboard Akun")
    : isEmployeeContext ? "Dashboard Pegawai" : "Dashboard Pengetahuan";
  const description = isActingAsEmployee ? `Admin sedang bekerja atas nama ${staffMember?.full_name || "Pegawai terpilih"}.` : isAdminViewingUser ? `Admin sedang melihat akun ${staffMember?.full_name || "terpilih"} dalam mode baca.` : isLeaderViewingEmployee ? `Pimpinan sedang melihat kontribusi ${staffMember?.full_name || "Pegawai terpilih"} dalam mode baca.` : user.role === "admin" ? "Pantau kinerja KMS secara keseluruhan dari satu tempat." : user.role === "pimpinan" ? "Pantau kinerja KMS secara keseluruhan dalam mode baca." : "Pantau kontribusi dan jangkauan knowledge Anda.";

  return <div className="kms-admin-dashboard mx-auto w-full max-w-7xl p-4 md:p-6 xl:p-8">
    <AdminPageHeader eyebrow={isActingAsEmployee ? "Mode kerja Pegawai" : isAdminViewingUser ? "Mode pantau akun" : isLeaderViewingEmployee ? "Mode pantau Pegawai" : user.role === "pimpinan" ? "Ruang Pimpinan" : user.role === "admin" ? "Ruang Admin" : "Ruang Pegawai"} title={heading} description={description} breadcrumbs={[{ label: "Dasbor" }]} actions={<>{isEmployeeContext && <Button hierarchy="tertiary" onClick={exitEmployeeContext} prefixIcon={<UserRoundCheck size={16} />}>{isActingAsEmployee || isAdminViewingUser ? "Kembali ke Ruang Admin" : "Kembali ke Dashboard Pimpinan"}</Button>}<Button hierarchy="secondary" onClick={openAssets} prefixIcon={<FolderOpen size={17} />}>{canWrite ? "Kelola aset" : "Lihat aset"}</Button>{canWrite && (user.role === "pegawai" || isActingAsEmployee) && <Button hierarchy="primary" onClick={openCreate} prefixIcon={<BookOpenCheck size={17} />}>Unggah pengetahuan</Button>}</>} />
    <PeriodToolbar period={period} customDates={customDates} onPeriodChange={selectPeriod} onDatesChange={setCustomDates} onApply={applyCustomPeriod} error={periodError} />
    {error && <Alert variant="critical" title="Dashboard tidak dapat dimuat" message={error} />}
    {loading ? <DashboardSkeleton /> : dashboard && <div className="mt-5 space-y-5">
      <section aria-labelledby="organization-overview-heading"><div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="kms-admin-section-eyebrow">Analitik KMS</p><h2 id="organization-overview-heading" className="mt-1 text-lg font-bold text-content-primary">{isEmployeeContext ? "Ringkasan kontribusi Pegawai" : "Ringkasan aset terbit"}</h2></div><div className="flex flex-wrap items-center gap-2"><Badge type="soft" variant="info" text={periodLabel} /><Button hierarchy="secondary" size="sm" prefixIcon={<BarChart3 size={16} />} onClick={() => setKpiAnalysisOpen(true)}>Lihat analisis KPI</Button></div></div><div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"><MetricCard icon={BookOpenCheck} label="Pengetahuan terbit" value={organization.published_asset_count} description={periodInfo.viewMetric === "period" ? "Diterbitkan pada periode terpilih" : "Aset aktif yang dapat diakses publik"} /><MetricCard icon={Eye} label="Total dilihat" value={organization.total_view_count} description={periodInfo.viewMetric === "period" ? "Kunjungan tercatat pada periode ini" : "Akumulasi kunjungan aset terbit"} tone="teal" /><MetricCard icon={FileText} label="Dokumen" value={organization.document_count} description={periodInfo.viewMetric === "period" ? "Diterbitkan pada periode ini" : "Dokumen dan artikel terbit"} tone="gold" /><MetricCard icon={PlayCircle} label="Video" value={organization.video_count} description={periodInfo.viewMetric === "period" ? "Diterbitkan pada periode ini" : "Video pembelajaran terbit"} tone="purple" /></div></section>
      <section aria-labelledby="ranking-heading"><div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="kms-admin-section-eyebrow">Penemuan dan jangkauan</p><h2 id="ranking-heading" className="mt-1 text-lg font-bold text-content-primary">Apa yang paling dicari, dilihat, dan dibagikan</h2></div></div><div className="grid gap-5 xl:grid-cols-3"><RankingCard metric="search" items={rankings.search || []} onOpenRanking={setRankingMetric} onOpenAsset={openAsset} /><RankingCard metric="view" items={rankings.view || []} onOpenRanking={setRankingMetric} onOpenAsset={openAsset} /><RankingCard metric="share" items={rankings.share || []} onOpenRanking={setRankingMetric} onOpenAsset={openAsset} /></div></section>
      {showStaffRankings && <section aria-labelledby="staff-ranking-heading"><div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="kms-admin-section-eyebrow">Kontribusi Pegawai</p><h2 id="staff-ranking-heading" className="mt-1 text-lg font-bold text-content-primary">Peringkat kontribusi di seluruh KMS</h2><p className="mt-1 text-sm text-content-secondary">Menampilkan lima Pegawai teratas pada periode analitik aktif.</p></div></div><div className="grid gap-5 xl:grid-cols-3"><RankingCard metric="staff_published" items={staffRankings.published || []} onOpenRanking={setRankingMetric} onOpenAsset={openAsset} /><RankingCard metric="staff_views" items={staffRankings.views || []} onOpenRanking={setRankingMetric} onOpenAsset={openAsset} /><RankingCard metric="staff_created" items={staffRankings.created || []} onOpenRanking={setRankingMetric} onOpenAsset={openAsset} /></div></section>}
      {showPersonal && <section className="grid items-start gap-5 lg:grid-cols-5"><CardPlain className="kms-admin-surface kms-admin-contribution-card p-5 lg:col-span-2"><div className="flex items-start justify-between gap-4"><div><p className="kms-admin-section-eyebrow">Kontribusi Pegawai</p><h2 className="mt-1 text-lg font-bold text-content-primary">Status knowledge pribadi</h2><p className="mt-1 text-sm leading-6 text-content-secondary">Draf hanya terlihat hingga diterbitkan.</p></div><span className="kms-admin-metric-icon kms-admin-metric-icon--teal" aria-hidden="true"><BookOpenCheck size={22} /></span></div><div className="mt-4 grid grid-cols-2 gap-3"><div className="kms-admin-personal-stat"><span>Total aset</span><strong>{formatNumber(personal.asset_count)}</strong></div><div className="kms-admin-personal-stat"><span>Sudah terbit</span><strong>{formatNumber(personal.published_asset_count)}</strong></div><div className="kms-admin-personal-stat"><span>Draf</span><strong>{formatNumber(personal.draft_count)}</strong></div><div className="kms-admin-personal-stat"><span>Total dilihat</span><strong>{formatNumber(personal.total_view_count)}</strong></div></div><Button hierarchy="secondary" size="sm" className="mt-4" onClick={openAssets}>Lihat aset</Button></CardPlain><Card className="overflow-hidden lg:col-span-3"><div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-subtle px-5 py-4"><div><p className="text-base font-bold text-content-primary">Aset Terbaru</p><p className="mt-1 text-sm text-content-secondary">Unggahan terbaru selalu tampil tanpa filter periode.</p></div><Button hierarchy="tertiary" size="sm" onClick={openAssets}>Lihat semua</Button></div>{(personal.recentAssets || []).length ? <ul className="divide-y divide-border-subtle">{personal.recentAssets.map((asset) => <li key={asset.id}><button type="button" onClick={() => openAsset(asset.id)} className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-page-secondary"><span className="kms-admin-asset-type-icon" aria-hidden="true">{asset.asset_type === "video" ? <PlayCircle size={18} /> : <FileText size={18} />}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-content-primary">{asset.title}</span><span className="mt-1 block text-xs text-content-secondary">{formatDate(asset.created_at)} · {asset.category_name || "Tanpa kategori"} · {formatNumber(asset.view_count)} dilihat</span></span><Badge type="soft" variant={asset.is_published ? "success" : "warning"} text={asset.is_published ? "Terbit" : "Draf"} /></button></li>)}</ul> : <div className="flex min-h-44 items-center justify-center px-5 text-sm text-content-secondary">Belum ada aset dari Pegawai ini.</div>}</Card></section>}
    </div>}
    <KpiAnalysisModal open={kpiAnalysisOpen} onClose={() => setKpiAnalysisOpen(false)} organization={organization} comparison={comparison} trend={dashboard?.publicationTrend || []} periodLabel={periodLabel} granularity={periodInfo.trendGranularity} />
    <RankingModal metric={rankingMetric || "search"} open={Boolean(rankingMetric)} onClose={() => setRankingMetric(null)} period={period} startDate={startDate} endDate={endDate} authorId={authorId} onOpenAsset={openAsset} />
  </div>;
}
