import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Alert, Badge, Button, CardPlain, Chip, Modal, Skeleton, Tooltip } from "@idds/react";
import { ArrowRight, BookOpen, Building2, BusFront, CalendarDays, Check, ChevronLeft, ChevronRight, Lightbulb, Megaphone, Plane, ScrollText, ShieldCheck, Ship, Star, Tag, TrainFront, Upload } from "lucide-react";
import { apiFetch, uploadUrl } from "../../lib/api";
import { libraryCataloguePath, updateCatalogueParams } from "../../lib/catalogueState";
import { publicAssetPath } from "../../lib/routes";
import { hasPermission } from "../../lib/permissions";
import { normalizeSearchSelections, searchSelectionsToQuery } from "../../lib/search";
import { workUnitFullName, workUnitVisualKind } from "../../lib/workUnits";
import { topicIconKind, workUnitVisualMode } from "../../lib/publicVisuals";
import PublicRouteArt from "../../components/PublicRouteArt";
import WorkUnitLogo from "../../components/WorkUnitLogo";
import CategoryLogo from "../../components/CategoryLogo";
import { useAuth } from "../../contexts/AuthContext";
import MultipleSearchSelect from "../../components/MultipleSearchSelect";
import AssetCard from "../../components/AssetCard";
import AssetQuickPreview from "../../components/AssetQuickPreview";
import EmptyState from "../../components/EmptyState";
import { PublicImage } from "../../components/PublicVisual";
import usePublicAssetPreview from "../../hooks/usePublicAssetPreview";
import usePublicOverlayFocus from "../../hooks/usePublicOverlayFocus";
import useMediaQuery from "../../hooks/useMediaQuery";
import transportPanorama from "../../assets/home-panorama/transport-panorama.webp?url&no-inline";
import unitPanorama from "../../assets/home-panorama/unit-panorama.webp?url&no-inline";
import railPanorama from "../../assets/home-panorama/unit-rail.webp?url&no-inline";
import seaPanorama from "../../assets/home-panorama/unit-sea.webp?url&no-inline";
import airPanorama from "../../assets/home-panorama/unit-air.webp?url&no-inline";
import roadPanorama from "../../assets/home-panorama/unit-road.webp?url&no-inline";
import educationPanorama from "../../assets/home-panorama/unit-education.webp?url&no-inline";
import policyPanorama from "../../assets/home-panorama/unit-policy.webp?url&no-inline";
import secretariatPanorama from "../../assets/home-panorama/unit-secretariat.webp?url&no-inline";
import inspectoratePanorama from "../../assets/home-panorama/unit-inspectorate.webp?url&no-inline";

const UNIT_PANORAMAS = { rail: railPanorama, sea: seaPanorama, air: airPanorama, road: roadPanorama, education: educationPanorama, policy: policyPanorama, secretariat: secretariatPanorama, inspectorate: inspectoratePanorama, multimodal: transportPanorama, office: unitPanorama };
const TOPIC_ICONS = { safety: ShieldCheck, laut: Ship, udara: Plane, darat: BusFront, kereta: TrainFront, education: BookOpen, policy: ScrollText, tag: Tag };

function useHomeResource(url) {
  const [state, setState] = useState({ loading: true, data: [], error: "" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState({ loading: true, data: [], error: "" });
    (async () => {
      try {
        const response = await apiFetch(url, { signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Informasi belum dapat dimuat.");
        const data = Array.isArray(result) ? result : result.data;
        if (!Array.isArray(data)) throw new Error("Informasi belum dapat dimuat.");
        if (!controller.signal.aborted) setState({ loading: false, data, error: "" });
      } catch (error) {
        if (!controller.signal.aborted) setState({ loading: false, data: [], error: error.message });
      }
    })();
    return () => controller.abort();
  }, [url, attempt]);
  return { ...state, retry: () => setAttempt(value => value + 1) };
}

const DEFAULT_EMPTY = {
  illustration: "empty-knowledge",
  title: "Belum ada pengetahuan yang diterbitkan",
  description: "Pengetahuan yang sudah diverifikasi akan tampil di sini.",
};

// Empty data uses the IDDS empty-state pattern; a failed request keeps the error alert and retry.
function ResourceState({ resource, empty = DEFAULT_EMPTY, children }) {
  if (resource.loading) return <div role="status" aria-label="Memuat informasi" className="kms-home-skeletons"><Skeleton height="4.5rem" /><Skeleton height="4.5rem" /></div>;
  if (resource.error) return <div className="kms-home-load-error"><Alert variant="danger" message={resource.error} /><Button hierarchy="secondary" onClick={resource.retry}>Coba lagi</Button></div>;
  if (!resource.data.length) return <EmptyState className="kms-home-empty" actionSize="md" {...empty} />;
  return children;
}

function HomeSearch({ units, categories }) {
  const navigate = useNavigate();
  const [selected, setSelected] = useState([]);
  const [draft, setDraft] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [recent] = useState(() => {
    try { const data = JSON.parse(localStorage.getItem("kms_recent_searches") || "[]"); return Array.isArray(data) ? data.filter(item => typeof item === "string").slice(0, 6) : []; } catch { return []; }
  });
  const container = useRef(null);
  useEffect(() => {
    const handler = event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault(); container.current?.querySelector("input")?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    if (draft.trim().length < 2) { setSuggestions([]); return undefined; }
    const timer = setTimeout(async () => {
      try {
        const response = await apiFetch(`/api/assets/search/suggestions?q=${encodeURIComponent(draft.trim())}`, { signal: controller.signal });
        const result = await response.json();
        if (response.ok && !controller.signal.aborted) setSuggestions(Array.isArray(result) ? result : result.data || []);
      } catch { if (!controller.signal.aborted) setSuggestions([]); }
    }, 220);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [draft]);
  const query = searchSelectionsToQuery(selected);
  const submit = value => {
    const q = typeof value === "string" ? value : searchSelectionsToQuery([...selected, ...(draft.trim() ? [draft] : [])]);
    if (q && q.length < 3) return;
    try { if (q) localStorage.setItem("kms_recent_searches", JSON.stringify([q, ...recent.filter(item => item.toLowerCase() !== q.toLowerCase())].slice(0, 6))); } catch { /* Search also works without browser storage. */ }
    navigate(libraryCataloguePath(updateCatalogueParams(new URLSearchParams(), { q, sort: q ? "relevansi" : "terbaru" })));
  };
  const options = [
    ...suggestions.map(item => ({ label: item.title, value: item.title, group: "Judul Pengetahuan" })),
    ...units.map(unit => ({ label: workUnitFullName(unit.name), value: workUnitFullName(unit.name), description: unit.alias, group: "Unit Kerja" })),
    ...categories.map(item => ({ label: item.name, value: item.name, group: "Kategori" })),
    ...recent.map(item => ({ label: item, value: item, group: "Pencarian Terakhir" })),
  ];
  return <>
    <CardPlain className="kms-home-search-card">
      <form className="kms-home-search-form" role="search" onSubmit={event => { event.preventDefault(); submit(); }}>
        <MultipleSearchSelect label="Cari pengetahuan" inputAriaLabel="Cari pengetahuan" size="lg" containerRef={container} selected={selected} onSelect={value => setSelected(normalizeSearchSelections(value))} onSearch={setDraft} options={options} placeholder="Coba: keselamatan pelayaran" helperText="" />
        <Button type="submit" hierarchy="primary" size="xl" disabled={Boolean(query) && query.length < 3}>Cari</Button>
      </form>
    </CardPlain>
    {recent.length > 0 && <div className="kms-home-recent"><span>Pencarian terakhir</span>{recent.slice(0, 3).map(item => <Button key={item} hierarchy="link" onClick={() => submit(item)}>{item}</Button>)}</div>}
  </>;
}

// Category shortcuts open the catalogue already filtered by that category.
function HomeExplore({ resource }) {
  const navigate = useNavigate();
  const topics = resource.data.filter(item => item?.id != null && item?.name);
  return <div className="kms-home-explore">
    <div className="kms-home-explore-head">
      {topics.length > 0 && <p id="home-topics-label">Telusuri topik</p>}
      <Link className="kms-home-hero-browse" to={catalogueLink({})}>Jelajahi semua pengetahuan<ArrowRight size={18} aria-hidden="true" /></Link>
    </div>
    {resource.loading && <div role="status" aria-label="Memuat rekomendasi topik"><Skeleton height="1.75rem" width="12rem" /></div>}
    {resource.error && <div className="kms-home-topics-error" role="status"><p>Rekomendasi topik belum dapat dimuat.</p><Button hierarchy="secondary" size="sm" onClick={resource.retry}>Coba lagi topik</Button></div>}
    {topics.length > 0 && <div className="kms-home-topics" role="group" aria-labelledby="home-topics-label">
      <Chip size="medium" variant="outline" selected="" options={topics.map(item => {
        const Icon = TOPIC_ICONS[topicIconKind(item.name)];
        return { label: <span className="kms-topic-label"><CategoryLogo category={item} fallback={Icon} size={18} />{item.name}</span>, value: String(item.id) };
      })} onSelect={value => { if (value) navigate(catalogueLink({ categoryId: String(value) })); }} />
    </div>}
  </div>;
}

function Announcements({ resource }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [visible, setVisible] = useState(false);
  const [pageVisible, setPageVisible] = useState(() => !document.hidden);
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [rotationRevision, setRotationRevision] = useState(0);
  const section = useRef(null);
  const trigger = useRef(null);
  const pointerStart = useRef(null);
  useEffect(() => {
    const onVisibility = () => setPageVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    const observer = new IntersectionObserver(entries => setVisible(entries[0].isIntersecting), { threshold: 0 });
    observer.observe(section.current);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  const show = (item, source) => { trigger.current = source; setSelected(item); setOpen(true); };
  const date = item => {
    const parsed = new Date(item.published_at || item.created_at || "");
    return Number.isNaN(parsed.getTime()) ? "" : parsed.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
  };
  const close = () => { setOpen(false); setSelected(null); };
  usePublicOverlayFocus(open, ".kms-home-announcement-modal", close, trigger);
  const destination = item => {
    if (item.asset) return publicAssetPath(item.asset);
    const link = item.link_url;
    // Only actual application links and HTTP(S) destinations are navigable.
    return typeof link === "string" && (/^\/(?!\/)/.test(link) || /^https?:\/\//i.test(link)) ? link : null;
  };
  const currentIndex = Math.min(activeIndex, Math.max(resource.data.length - 1, 0));
  const active = resource.data[currentIndex];
  const playing = resource.data.length > 1 && !open && visible && pageVisible && !reducedMotion;
  useEffect(() => {
    if (!playing) return undefined;
    // A fresh reading interval follows every manual change or temporary pause.
    const timer = setTimeout(() => {
      setDirection(1);
      setActiveIndex((currentIndex + 1) % resource.data.length);
    }, 7000);
    return () => clearTimeout(timer);
  }, [playing, currentIndex, resource.data.length, rotationRevision]);
  const changeSlide = index => {
    setDirection(index < currentIndex ? -1 : 1);
    if (resource.data.length) setActiveIndex((index + resource.data.length) % resource.data.length);
    setRotationRevision(value => value + 1);
  };
  const finishSwipe = event => {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy)) changeSlide(currentIndex + (dx < 0 ? 1 : -1));
  };
  return <section ref={section} id="pengumuman" tabIndex={-1} className="kms-home-announcement-anchor" aria-label="Pengumuman">
    {(resource.loading || resource.error || resource.data.length > 0) && <>
      <div className="kms-home-section-heading"><h2><Megaphone size={26} aria-hidden="true" />Pengumuman</h2>{resource.data.length > 0 && <Button hierarchy="secondary" size="md" className="kms-home-announcement-all" suffixIcon={<ArrowRight size={18} aria-hidden="true" />} onClick={event => show(null, event.currentTarget)}>Lihat semua pengumuman</Button>}</div>
      <ResourceState resource={resource}>{active && <div className="kms-home-announcement-carousel" role="region" aria-roledescription="carousel" aria-label="Pengumuman KMS" onPointerDown={event => { pointerStart.current = { x: event.clientX, y: event.clientY }; }} onPointerUp={finishSwipe} onPointerCancel={() => { pointerStart.current = null; }}>
        <div className="kms-home-announcement-stage" style={{ "--kms-announcement-enter-x": direction < 0 ? "-2rem" : "2rem" }}><CardPlain className="kms-home-announcement-slide">
          <div className="kms-home-announcement-image" key={active.public_id || currentIndex}><PublicImage sources={[uploadUrl(active.image_url), uploadUrl(active.asset?.thumbnail_url)]} fallback="announcement-soft" alt={`Gambar pengumuman ${active.title}`} loading="eager" /></div>
          <div className="kms-home-announcement-summary">
            <span className="kms-home-announcement-emblem" aria-hidden="true"><Megaphone size={32} /></span>
            <div key={active.public_id || currentIndex} className="kms-home-announcement-story">
              <Badge type="soft" variant="info" size="md" rounded="sm">{active.asset ? "Referensi pengetahuan" : "Pengumuman"}</Badge>
              <h3>{active.title}</h3><p className="kms-home-announcement-excerpt">{active.content}</p>
              {date(active) && <p className="kms-home-announcement-date"><CalendarDays size={17} aria-hidden="true" />{date(active)}</p>}
            </div>
            <div className="kms-home-announcement-actions"><Button hierarchy="primary" size="lg" suffixIcon={<ArrowRight size={17} />} onClick={event => show(active, event.currentTarget)}>Lihat pengumuman</Button></div>
          </div>
        </CardPlain>
        {resource.data.length > 1 && <>
          <div className="kms-home-announcement-arrow kms-home-announcement-arrow--previous"><Tooltip title="Pengumuman sebelumnya" variant="basic" placement="bottom"><Button hierarchy="secondary" size="lg" aria-label="Pengumuman sebelumnya" onClick={() => changeSlide(currentIndex - 1)}><ChevronLeft size={22} /></Button></Tooltip></div>
          <div className="kms-home-announcement-arrow kms-home-announcement-arrow--next"><Tooltip title="Pengumuman berikutnya" variant="basic" placement="bottom"><Button hierarchy="secondary" size="lg" aria-label="Pengumuman berikutnya" onClick={() => changeSlide(currentIndex + 1)}><ChevronRight size={22} /></Button></Tooltip></div>
        </>}</div>
        {resource.data.length > 1 && <>
          <div className="kms-home-announcement-controls">
            <div className="kms-home-announcement-dots" aria-label="Pilih pengumuman">{resource.data.map((item, index) => <Button key={item.public_id || index} hierarchy="tertiary" className="kms-home-announcement-dot" aria-label={`Tampilkan pengumuman ${index + 1}: ${item.title}`} aria-pressed={index === currentIndex} onClick={() => changeSlide(index)}><span aria-hidden="true" /></Button>)}</div>
          </div>
          <div className="kms-home-announcement-progress" aria-hidden="true">{playing && <span key={`${currentIndex}-${rotationRevision}`} />}</div>
        </>}
        <span className="sr-only" aria-live={playing ? "off" : "polite"} aria-atomic="true">Pengumuman {currentIndex + 1} dari {resource.data.length}: {active.title}</span>
      </div>}</ResourceState>
    </>}
    {open && <Modal open onClose={close} title={selected?.title || "Semua pengumuman"} size="lg" dialogClassname="kms-home-announcement-modal">
      {(selected ? [selected] : resource.data).map((item, i) => <article key={item.public_id || i} className="kms-home-announcement-detail">
        {!selected && <h3>{item.title}</h3>}{date(item) && <p className="text-content-secondary">{date(item)}</p>}
        {(item.image_url || item.asset?.thumbnail_url) && <PublicImage sources={[uploadUrl(item.image_url), uploadUrl(item.asset?.thumbnail_url)]} fallback="announcement-soft" alt={`Gambar pengumuman ${item.title}`} />}
        <p className="kms-home-announcement-copy">{item.content}</p>
        {destination(item) && <a className="kms-home-text-link" href={destination(item)} {...(/^https?:/i.test(destination(item)) ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{item.link_label || "Lihat selengkapnya"}<ArrowRight size={16} /></a>}
      </article>)}
    </Modal>}
  </section>;
}

const catalogueLink = changes => `/library?${updateCatalogueParams(new URLSearchParams(), { ...changes, page: 1, limit: 12 }, 12)}`;
// Mirrors the publication workflow: uploads are verified before they appear publicly.
const CONTRIBUTE_STEPS = ["Unggah dokumen atau video", "Diperiksa verifikator", "Terbit di KMS"];

function HomeUnitCard({ unit }) {
  const name = workUnitFullName(unit.name);
  return <Link to={catalogueLink({ workUnitId: String(unit.id) })} aria-label={`Jelajahi pengetahuan ${name}`}><CardPlain className={`kms-home-unit kms-mode--${workUnitVisualMode(unit)}`}>
    <span className="kms-home-unit-panorama" aria-hidden="true"><PublicImage sources={[UNIT_PANORAMAS[workUnitVisualKind(unit)], unitPanorama]} alt="" width={960} height={540} /></span>
    <WorkUnitLogo unit={unit} className="kms-home-unit-logo" />
    <span className="kms-home-unit-name">{name}</span><ArrowRight className="kms-home-unit-arrow" size={17} aria-hidden="true" />
  </CardPlain></Link>;
}


function HomeContent() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const featured = useHomeResource("/api/assets/featured");
  const announcements = useHomeResource("/api/announcements");
  const units = useHomeResource("/api/assets/work-units");
  const categories = useHomeResource("/api/assets/categories");
  const topics = useHomeResource("/api/assets/recommended-topics");
  const { previewAsset, previewTrigger, closePreview, openAssetPreview } = usePublicAssetPreview();
  const canContribute = !user || hasPermission(user, "assets", "post");
  return <div className="kms-new-home kms-home-panorama">
    <section className="kms-home-hero" aria-labelledby="home-heading">
      {/* Text stays on solid navy; the panorama only fills the opposite side. */}
      <div className="kms-home-hero-media" aria-hidden="true"><PublicImage className="kms-home-hero-photo" sources={[transportPanorama]} alt="" loading="eager" fetchPriority="high" width={2172} height={724} /></div>
      <PublicRouteArt variant="baseline" />
      <div className="kms-home-container kms-home-hero-grid">
        <div className="kms-home-hero-copy">
          <p className="kms-home-hero-eyebrow">Knowledge Management System</p>
          <h1 id="home-heading">Pusat pengetahuan transportasi Kementerian Perhubungan</h1>
          <p className="kms-home-hero-lead">Temukan pedoman, kajian, praktik baik, dan video pembelajaran dari seluruh unit kerja.</p>
          <HomeSearch units={units.data} categories={categories.data} />
          <HomeExplore resource={topics} />
        </div>
      </div>
    </section>
    <div className="kms-home-container">
      <Announcements resource={announcements} />
    </div>
    {(featured.loading || featured.error || featured.data.length > 0) && <div className="kms-public-band kms-public-band--featured kms-public-dots">
      <PublicRouteArt />
      <div className="kms-home-container"><section className="kms-home-block kms-home-featured-band" aria-labelledby="home-featured-title">
        <div className="kms-home-section-heading"><div className="kms-home-heading-copy"><h2 id="home-featured-title"><Star size={26} aria-hidden="true" />Pengetahuan sorotan</h2><p>Dokumen dan video pilihan untuk memperluas wawasan.</p></div><Link to={catalogueLink({})}>Lihat semua pengetahuan<ArrowRight size={17} aria-hidden="true" /></Link></div>
        <ResourceState resource={featured}><div className="kms-home-featured-grid">{featured.data.map(asset => <AssetCard key={asset.public_id || asset.id} asset={asset} variant="panorama" onPreview={openAssetPreview} />)}</div></ResourceState>
      </section></div>
    </div>}
    <div className="kms-public-band kms-public-band--units">
      <PublicRouteArt variant="bandStart" /><PublicRouteArt variant="bandEnd" />
      <div className="kms-home-container"><section id="unit-kerja" tabIndex={-1} className="kms-home-block kms-home-units-section" aria-labelledby="home-units-title"><div className="kms-home-section-heading"><div className="kms-home-heading-copy"><h2 id="home-units-title"><Building2 size={27} aria-hidden="true" />Unit kerja</h2><p>Temukan pengetahuan dari berbagai unit di Kementerian Perhubungan.</p></div><Link to={catalogueLink({})}>Lihat semua unit kerja<ArrowRight size={17} aria-hidden="true" /></Link></div><ResourceState resource={units} empty={{ illustration: "empty-knowledge", title: "Daftar unit kerja belum tersedia", description: "Unit kerja akan tampil setelah ditambahkan pengelola. Pengetahuan yang sudah terbit tetap dapat dijelajahi.", actionLabel: "Jelajahi semua pengetahuan", onAction: () => navigate(catalogueLink({})) }}><div className="kms-home-unit-grid">{units.data.filter(unit => !unit.parent_id).map(unit => <HomeUnitCard key={unit.id} unit={unit} />)}</div></ResourceState></section></div>
    </div>
    <div className="kms-home-container">
      <section className="kms-home-contribute-section" aria-labelledby="home-contribute-title">
        <CardPlain className="kms-home-contribute">
          <span className="kms-home-contribute-icon" aria-hidden="true"><Lightbulb size={30} /></span>
          <div className="kms-home-contribute-copy">
            <h2 id="home-contribute-title">Punya pengetahuan untuk dibagikan?</h2>
            <p>Pegawai Kemenhub dapat membagikan pedoman, kajian, dan praktik baik melalui akun kedinasan.</p>
            <ol className="kms-home-contribute-steps" aria-label="Alur berbagi pengetahuan">
              {CONTRIBUTE_STEPS.map((step, index) => <li key={step}><span aria-hidden="true">{index + 1}</span>{step}</li>)}
            </ol>
            {!canContribute && <p className="kms-home-contribute-denied">Akun Anda belum memiliki izin menambahkan aset. Hubungi pengelola hak akses.</p>}
          </div>
          <div className="kms-home-contribute-action">
            <Button hierarchy="primary" size="lg" prefixIcon={<Upload size={18} aria-hidden="true" />} disabled={!canContribute} onClick={() => navigate(user ? "/admin/assets/create" : "/login/pegawai?redirect=%2Fadmin%2Fassets%2Fcreate")}>Bagikan pengetahuan</Button>
            <p className="kms-home-contribute-note"><Check size={16} aria-hidden="true" />Khusus pegawai dengan akun kedinasan</p>
          </div>
        </CardPlain>
      </section>
    </div>
    <AssetQuickPreview asset={previewAsset} open={Boolean(previewAsset)} onClose={closePreview} restoreFocusRef={previewTrigger} />
  </div>;
}

export default function HomePage() {
  const [params] = useSearchParams();
  if (["q", "categoryId", "workUnitId", "assetType", "sort", "page", "limit"].some(key => params.has(key))) {
    return <Navigate replace to={`/library?${updateCatalogueParams(params, {}, 12)}`} />;
  }
  return <HomeContent />;
}
