import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Alert,
  Badge,
  Button,
  CardPlain,
  Chip,
  DatePicker,
  SelectDropdown,
  Skeleton,
} from "@idds/react";
import {
  ArrowLeft,
  BookOpenCheck,
  Building2,
  Eye,
  FileText,
  FolderOpen,
  UserRound,
  UsersRound,
} from "lucide-react";
import AdminPageHeader from "../../../../components/AdminPageHeader";
import MediaCompositionChart from "../../../../components/MediaCompositionChart";
import { apiFetch } from "../../../../lib/api";
import { adminAssetPath } from "../../../../lib/routes";
import { useAuth } from "../../../../contexts/AuthContext";
import useAdminView from "../../../../hooks/useAdminView";
import { hasPermission } from "../../../../lib/permissions";

const PERIOD_OPTIONS = [
  { label: "Sepanjang waktu", value: "all" },
  { label: "7 hari", value: "7d" },
  { label: "30 hari", value: "30d" },
  { label: "90 hari", value: "90d" },
  { label: "Tahun berjalan", value: "year" },
  { label: "Rentang khusus", value: "custom" },
];
const VALID_PERIODS = new Set(PERIOD_OPTIONS.map((option) => option.value));
const formatNumber = (value) => new Intl.NumberFormat("id-ID").format(Number(value) || 0);
const formatDate = (value) => value
  ? new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value))
  : "—";
const isoOffset = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

function MetricCard({ icon: Icon, label, value, description, tone = "blue" }) {
  return <CardPlain className={`kms-admin-surface kms-admin-metric-card kms-admin-metric-card--${tone} p-4`}>
    <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium text-content-secondary">{label}</p><p className="mt-2 text-3xl font-bold text-content-primary">{formatNumber(value)}</p></div><span className="kms-admin-metric-icon" aria-hidden="true"><Icon size={20} /></span></div>
    <p className="mt-3 text-xs leading-5 text-content-secondary">{description}</p>
  </CardPlain>;
}

function BarChart({ data, valueKey, emptyText, ariaLabel }) {
  const max = Math.max(1, ...data.map((item) => Number(item[valueKey]) || 0));
  if (!data.length) return <div className="flex min-h-56 items-center justify-center px-4 text-center text-sm text-content-secondary">{emptyText}</div>;
  const width = Math.max(620, data.length * 92);
  return <div className="overflow-x-auto pb-2"><svg viewBox={`0 0 ${width} 240`} className="min-w-[620px] w-full" role="img" aria-label={ariaLabel}>
    {[0, 0.25, 0.5, 0.75, 1].map((step) => { const y = 184 - step * 144; return <g key={step}><line x1="44" y1={y} x2={width - 18} y2={y} className="kms-admin-chart-grid" /><text x="36" y={y + 4} textAnchor="end" className="kms-admin-chart-axis-label">{Math.round(max * step)}</text></g>; })}
    {data.map((item, index) => { const value = Number(item[valueKey]) || 0; const barWidth = 42; const slot = (width - 76) / data.length; const x = 56 + index * slot + Math.max(0, (slot - barWidth) / 2); const height = value ? Math.max(5, value / max * 144) : 2; return <g key={item.public_id || item.bucket || item.label}><title>{`${item.name || item.label}: ${formatNumber(value)}`}</title><rect x={x} y={184 - height} width={barWidth} height={height} rx="7" className="kms-admin-chart-bar" /><text x={x + barWidth / 2} y={174 - height} textAnchor="middle" className="kms-admin-chart-value">{formatNumber(value)}</text><text x={x + barWidth / 2} y="207" textAnchor="middle" className="kms-admin-chart-axis-label">{item.alias || item.label}</text></g>; })}
  </svg></div>;
}

export default function WorkUnitAnalyticsPage() {
  const { user: authenticatedUser } = useAuth();
  const { accessUser } = useAdminView();
  const permissionUser = accessUser || authenticatedUser;
  const canOpenWorkUnits = hasPermission(permissionUser, "work_units", "view");
  const { identifier } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryPeriod = searchParams.get("period");
  const period = VALID_PERIODS.has(queryPeriod) ? queryPeriod : "all";
  const startDate = searchParams.get("startDate") || "";
  const endDate = searchParams.get("endDate") || "";
  const [customDates, setCustomDates] = useState([startDate || isoOffset(-29), endDate || isoOffset(0)]);
  const [customOpen, setCustomOpen] = useState(period === "custom");
  const [scopeUnits, setScopeUnits] = useState([]);
  const [scopeLoading, setScopeLoading] = useState(true);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const updatePeriod = useCallback((nextPeriod) => {
    setCustomOpen(nextPeriod === "custom");
    if (nextPeriod === "custom") return;
    const next = new URLSearchParams(searchParams);
    if (nextPeriod === "all") next.delete("period"); else next.set("period", nextPeriod);
    next.delete("startDate");
    next.delete("endDate");
    setSearchParams(next);
  }, [searchParams, setSearchParams]);

  const applyCustom = () => {
    const [start, end] = customDates;
    if (!start || !end || start > end) { setError("Pilih rentang tanggal yang valid."); return; }
    setSearchParams({ period: "custom", startDate: start, endDate: end });
  };

  useEffect(() => {
    const controller = new AbortController();
    const loadScope = async () => {
      setScopeLoading(true);
      try {
        const response = await apiFetch("/api/assets/work-units/analytics/scope", { auth: true, signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Gagal memuat cakupan analitik Unit Kerja");
        if (controller.signal.aborted) return;
        const units = Array.isArray(result.data) ? result.data : [];
        setScopeUnits(units);
        if (!identifier && units[0]?.public_id) {
          const query = searchParams.toString();
          navigate(`/admin/work-units/${units[0].public_id}/analytics${query ? `?${query}` : ""}`, { replace: true });
        }
      } catch (loadError) {
        if (loadError.name !== "AbortError" && !controller.signal.aborted) setError(loadError.message);
      } finally {
        if (!controller.signal.aborted) setScopeLoading(false);
      }
    };
    loadScope();
    return () => controller.abort();
  }, [identifier, navigate, searchParams]);

  useEffect(() => {
    if (!identifier) {
      setLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ period });
        if (period === "custom") { params.set("startDate", startDate); params.set("endDate", endDate); }
        const response = await apiFetch(`/api/assets/work-units/${encodeURIComponent(identifier)}/analytics?${params}`, { auth: true, signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Gagal memuat analitik Unit Kerja");
        if (!controller.signal.aborted) setData(result);
      } catch (loadError) {
        if (loadError.name !== "AbortError" && !controller.signal.aborted) setError(loadError.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    load();
    return () => controller.abort();
  }, [endDate, identifier, period, startDate]);

  const metrics = data?.metrics || {};
  const scopeOptions = useMemo(() => scopeUnits.map((unit) => ({
    label: `${"↳ ".repeat(Math.max(0, Number(unit.depth) || 0))}Eselon ${({ 1: "I", 2: "II", 3: "III" })[Number(unit.echelon_level)] || unit.echelon_level} · ${unit.alias || unit.name}${unit.alias ? ` — ${unit.name}` : ""}`,
    value: String(unit.public_id),
  })), [scopeUnits]);
  const periodLabel = useMemo(() => period === "custom" && data?.period?.startDate
    ? `${formatDate(data.period.startDate)} – ${formatDate(data.period.endDate)}`
    : PERIOD_OPTIONS.find((option) => option.value === period)?.label || "Sepanjang waktu", [data?.period, period]);

  return <div className="mx-auto w-full max-w-7xl p-4 md:p-6 xl:p-8">
    <AdminPageHeader
      eyebrow="Analitik Unit Kerja"
      title={data?.unit?.name || "Dashboard Unit Kerja"}
      description="Pantau penerbit, jumlah aset, jangkauan, dan kontribusi unit ini beserta seluruh unit turunannya."
      breadcrumbs={[{ label: "Dasbor", href: "/admin/dashboard" }, { label: "Unit Kerja", href: "/admin/work-units" }, { label: data?.unit?.alias || "Analitik" }]}
      actions={<Button hierarchy="secondary" prefixIcon={<ArrowLeft size={16} />} onClick={() => navigate(canOpenWorkUnits ? "/admin/work-units" : "/admin/dashboard")}>{canOpenWorkUnits ? "Kembali ke Unit Kerja" : "Kembali ke Dasbor"}</Button>}
    />

    <CardPlain className="kms-admin-surface mb-5 p-4 md:p-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,42rem)_minmax(16rem,1fr)] lg:items-end">
        {scopeLoading
          ? <Skeleton height="64px" rounded="md" />
          : <SelectDropdown
              label="Unit yang dianalisis"
              options={scopeOptions}
              selected={data?.unit?.public_id || identifier || ""}
              onSelect={(value) => {
                const query = searchParams.toString();
                navigate(`/admin/work-units/${value}/analytics${query ? `?${query}` : ""}`);
              }}
              placeholder={scopeOptions.length ? "Pilih Unit Kerja" : "Tidak ada Unit Kerja yang diizinkan"}
              searchable
              indicator="check"
              disabled={!scopeOptions.length}
            />}
        <div className="rounded-lg border border-border-subtle bg-page-secondary px-4 py-3">
          <p className="text-sm font-bold text-content-primary">Cakupan mengikuti role dan struktur organisasi</p>
          <p className="mt-1 text-xs leading-5 text-content-secondary">Eselon I melihat unit di bawahnya, Eselon II melihat turunannya, dan Eselon III hanya melihat timnya—selama tingkat analitik tersebut diberi akses VIEW.</p>
        </div>
      </div>
    </CardPlain>

    <CardPlain className="kms-admin-surface mb-5 p-4 md:p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"><div><p className="text-sm font-bold text-content-primary">Periode analitik</p><p className="mt-1 text-xs text-content-secondary">Mempengaruhi seluruh angka dan visualisasi pada halaman ini.</p></div><Chip options={PERIOD_OPTIONS} selected={customOpen ? "custom" : period} onSelect={updatePeriod} size="small" variant="outline" /></div>
      {customOpen && <div className="mt-4 grid gap-4 border-t border-border-subtle pt-4 md:grid-cols-[minmax(0,1fr)_auto]"><DatePicker mode="range" selected={customDates} onChange={setCustomDates} dateFormat="yyyy-MM-dd" label="Rentang tanggal" disabledFutureDate triggerWidth="100%" /><div className="flex items-end"><Button hierarchy="primary" onClick={applyCustom}>Terapkan</Button></div></div>}
    </CardPlain>

    {error && <div className="mb-5"><Alert variant="critical" title="Analitik belum tersedia" message={error} /></div>}
    {loading ? <div className="space-y-5"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[1, 2, 3, 4, 5, 6].map((item) => <Skeleton key={item} height="135px" rounded="lg" />)}</div><Skeleton height="310px" rounded="lg" /></div> : data && <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2"><Badge type="soft" variant="brand">{data.unit.alias || `Eselon ${data.unit.echelon_level}`}</Badge><Badge type="soft" variant="info">{periodLabel}</Badge><span className={`kms-service-status ${data.unit.is_public ? "kms-service-status--online" : "kms-service-status--offline"}`}><span aria-hidden="true" />{data.unit.is_public ? "Tampil di publik" : "Disembunyikan"}</span></div>
      <section aria-label={`Ringkasan Eselon ${data.unit.echelon_level}`} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard icon={FolderOpen} label="Total aset" value={metrics.asset_count} description="Seluruh aset aktif pada unit ini dan unit turunannya." />
        <MetricCard icon={BookOpenCheck} label="Aset terbit" value={metrics.published_asset_count} description="Pengetahuan yang sudah dapat diakses publik." tone="teal" />
        <MetricCard icon={Eye} label="Total dilihat" value={metrics.total_view_count} description={data.period.viewMetric === "period" ? "Kunjungan pada periode terpilih." : "Akumulasi kunjungan aset terbit."} tone="gold" />
        <MetricCard icon={UsersRound} label="Penerbit" value={metrics.contributor_count} description="Pegawai yang berkontribusi pada periode ini." tone="purple" />
        <MetricCard icon={Building2} label="Unit langsung" value={data.unit.child_count} description="Unit turunan langsung dalam struktur organisasi." />
        <MetricCard icon={FileText} label="Draf" value={metrics.draft_count} description="Aset yang belum dipublikasikan." tone="gold" />
      </section>

      <section className="grid gap-5 xl:grid-cols-3">
        <CardPlain className="kms-admin-surface p-5 xl:col-span-2"><div className="mb-4"><h2 className="text-base font-bold text-content-primary">Tren penerbitan pengetahuan</h2><p className="mt-1 text-xs text-content-secondary">Dikelompokkan {data.period.trendGranularity.toLowerCase()}.</p></div><BarChart data={data.publicationTrend || []} valueKey="asset_count" emptyText="Belum ada penerbitan pada periode ini." ariaLabel={`Grafik tren penerbitan ${data.unit.name}`} /></CardPlain>
        <CardPlain className="kms-admin-surface p-5"><div className="mb-6"><h2 className="text-base font-bold text-content-primary">Komposisi media</h2><p className="mt-1 text-xs text-content-secondary">Persentase dokumen dan video terbit.</p></div><MediaCompositionChart centerLabel="aset terbit" valueFormatter={formatNumber} items={[{ key: "documents", label: "Dokumen", value: metrics.document_count, color: "var(--kms-pdf-red)" }, { key: "videos", label: "Video", value: metrics.video_count, color: "var(--kms-video-blue)" }]} /></CardPlain>
      </section>

      <section className="grid items-start gap-5 xl:grid-cols-2">
        <CardPlain className="kms-admin-surface p-5"><div className="mb-4"><h2 className="text-base font-bold text-content-primary">Kontribusi unit turunan</h2><p className="mt-1 text-xs text-content-secondary">Jumlah aset terbit pada setiap unit turunan langsung.</p></div><BarChart data={data.childUnits || []} valueKey="published_asset_count" emptyText="Belum ada unit turunan atau aset terbit." ariaLabel="Grafik kontribusi unit turunan" /></CardPlain>
        <CardPlain className="kms-admin-surface overflow-hidden"><div className="border-b border-border-subtle px-5 py-4"><h2 className="text-base font-bold text-content-primary">Penerbit aset</h2><p className="mt-1 text-xs text-content-secondary">Pegawai dengan kontribusi terbanyak pada periode aktif.</p></div>{data.contributors?.length ? <ol className="divide-y divide-border-subtle">{data.contributors.map((person, index) => <li key={person.public_id || `${person.full_name}-${index}`} className="flex items-center gap-3 px-5 py-3"><span className="kms-admin-ranking-number">{index + 1}</span><span className="kms-admin-metric-icon shrink-0" aria-hidden="true"><UserRound size={17} /></span><span className="min-w-0 flex-1"><strong className="block truncate text-sm text-content-primary">{person.full_name}</strong><span className="mt-0.5 block truncate text-xs text-content-secondary">{person.department || data.unit.name}</span></span><span className="shrink-0 text-right"><strong className="block text-sm text-content-primary">{formatNumber(person.published_asset_count)} terbit</strong><span className="text-xs text-content-secondary">{formatNumber(person.total_view_count)} dilihat</span></span></li>)}</ol> : <p className="p-8 text-center text-sm text-content-secondary">Belum ada penerbit pada periode ini.</p>}</CardPlain>
      </section>

      <CardPlain className="kms-admin-surface overflow-hidden"><div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-subtle px-5 py-4"><div><h2 className="text-base font-bold text-content-primary">Aset dengan jangkauan tertinggi</h2><p className="mt-1 text-xs text-content-secondary">Lima aset terbit yang paling banyak dilihat.</p></div></div>{data.topAssets?.length ? <ul className="divide-y divide-border-subtle">{data.topAssets.map((asset, index) => <li key={asset.public_id}><button type="button" onClick={() => navigate(adminAssetPath(asset))} className="group flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-page-secondary"><span className="kms-admin-ranking-number">{index + 1}</span><span className="min-w-0 flex-1"><strong className="block truncate text-sm text-content-primary group-hover:text-content-action group-hover:underline">{asset.title}</strong><span className="mt-1 block truncate text-xs text-content-secondary">{asset.work_unit_alias || asset.work_unit_name} · {asset.category_name || "Tanpa kategori"} · {formatDate(asset.created_at)}</span></span><span className="flex shrink-0 items-center gap-1 text-sm font-bold text-content-primary"><Eye size={15} />{formatNumber(asset.view_count)}</span></button></li>)}</ul> : <p className="p-8 text-center text-sm text-content-secondary">Belum ada aset terbit pada periode ini.</p>}</CardPlain>
    </div>}
  </div>;
}
