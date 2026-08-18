import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Alert, Avatar, Badge, Button, CardPlain, Pagination, SelectDropdown, Skeleton, TextField } from "@idds/react";
import { Bell, CheckCheck, MessageCircle, Reply, Search, Share2, ShieldCheck } from "lucide-react";
import AdminPageHeader from "../../../components/AdminPageHeader";
import { API_BASE_URL, authHeaders, avatarUrl, inputValue } from "../../../lib/api";

const notificationMeta = { comment: { icon: MessageCircle, label: "Komentar" }, reply: { icon: Reply, label: "Balasan" }, share: { icon: Share2, label: "Dibagikan" } };
const initials = (name = "") => name.split(" ").filter(Boolean).slice(0, 2).map((item) => item[0]).join("").toUpperCase() || "K";
const relativeTime = (value) => {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "Baru saja";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} menit lalu`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} jam lalu`;
  return `${Math.floor(seconds / 86400)} hari lalu`;
};
const auditLabel = (action) => ({
  "account.logged_in": "Masuk ke akun", "profile.updated": "Memperbarui profil", "profile.avatar_updated": "Memperbarui foto profil", "profile.password_updated": "Mengubah kata sandi",
  "asset.draft_created": "Membuat draf aset", "asset.draft_updated": "Memperbarui draf aset", "asset.created_published": "Membuat aset terbit", "asset.created_draft": "Membuat aset draf", "asset.updated_published": "Memperbarui aset terbit", "asset.updated_draft": "Memperbarui aset draf", "asset.deleted": "Menghapus aset",
  "comment.created": "Mengirim komentar", "comment.updated": "Mengubah komentar", "comment.deleted": "Menghapus komentar", "comment.moderated": "Memoderasi komentar",
}[action] || "Aktivitas akun");

export default function ActivityPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [audits, setAudits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [queryInput, setQueryInput] = useState(searchParams.get("q") || "");
  const page = Math.max(1, Number.parseInt(searchParams.get("page"), 10) || 1);
  const state = searchParams.get("state") === "unread" ? "unread" : "all";
  const query = searchParams.get("q") || "";

  const updateParams = (next) => setSearchParams((current) => {
    const params = new URLSearchParams(current);
    Object.entries(next).forEach(([key, value]) => { if (value) params.set(key, String(value)); else params.delete(key); });
    return params;
  });

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ page: String(page), limit: "12", state });
      if (query) params.set("q", query);
      const [response, auditResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/api/users/notifications?${params}`, { headers: authHeaders() }),
        fetch(`${API_BASE_URL}/api/users/audit-logs?limit=6`, { headers: authHeaders() }),
      ]);
      const result = await response.json();
      const auditResult = await auditResponse.json();
      if (!response.ok) throw new Error(result.error || "Gagal memuat aktivitas");
      setData(result.data || []); setPagination(result.pagination); setUnreadCount(result.unreadCount || 0);
      if (auditResponse.ok) setAudits(auditResult.data || []);
    } catch (loadError) { setError(loadError.message); } finally { setLoading(false); }
  }, [page, query, state]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setQueryInput(query); }, [query]);

  const markRead = async (notification) => {
    if (notification.is_read) return;
    const response = await fetch(`${API_BASE_URL}/api/users/notifications/${notification.id}/read`, { method: "PATCH", headers: authHeaders() });
    if (response.ok) { setData((items) => items.map((item) => item.id === notification.id ? { ...item, is_read: true } : item)); setUnreadCount((count) => Math.max(0, count - 1)); }
  };
  const markAll = async () => {
    const response = await fetch(`${API_BASE_URL}/api/users/notifications/read-all`, { method: "PATCH", headers: authHeaders() });
    if (response.ok) { setData((items) => items.map((item) => ({ ...item, is_read: true }))); setUnreadCount(0); }
  };
  const openNotification = async (notification) => { await markRead(notification); if (notification.asset_id) navigate(`/admin/assets/${notification.asset_id}`); };
  const submitSearch = (event) => { event.preventDefault(); updateParams({ q: queryInput.trim(), page: "" }); };

  return <div className="mx-auto w-full max-w-6xl p-4 md:p-6 xl:p-8">
    <AdminPageHeader compact eyebrow="Ruang Pegawai" title="Pusat Aktivitas" description="Pantau komentar, balasan, dan aktivitas berbagi pada aset pengetahuan Anda." breadcrumbs={[{ label: "Dasbor", href: "/admin/dashboard" }, { label: "Pusat Aktivitas" }]} actions={unreadCount > 0 && <Button hierarchy="secondary" onClick={markAll} prefixIcon={<CheckCheck size={16} />}>Tandai semua dibaca</Button>} />
    <CardPlain className="kms-admin-surface p-4 md:p-5"><div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px] md:items-end"><form className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end" onSubmit={submitSearch}><div className="min-w-0"><TextField label="Cari aktivitas" value={queryInput} onChange={(value) => setQueryInput(inputValue(value))} placeholder="Judul aset atau nama pengguna" /></div><Button type="submit" hierarchy="secondary" className="w-full sm:w-auto" prefixIcon={<Search size={16} />}>Cari</Button></form><SelectDropdown label="Status" width="100%" selected={state} onSelect={(value) => updateParams({ state: value === "unread" ? "unread" : "", page: "" })} options={[{ label: "Semua aktivitas", value: "all" }, { label: "Belum dibaca", value: "unread" }]} searchable={false} /></div></CardPlain>
    {error && <div className="mt-4"><Alert variant="critical" title="Aktivitas tidak dapat dimuat" message={error} /></div>}
    <CardPlain className="kms-admin-surface mt-5 overflow-hidden">{loading ? <div className="space-y-3 p-5">{[1, 2, 3, 4].map((item) => <Skeleton key={item} height="72px" rounded="lg" />)}</div> : data.length ? <ul className="divide-y divide-border-subtle">{data.map((notification) => { const meta = notificationMeta[notification.type] || notificationMeta.comment; const Icon = meta.icon; return <li key={notification.id}><button type="button" onClick={() => openNotification(notification)} className={`flex w-full items-start gap-3 px-4 py-4 text-left transition-colors hover:bg-page-secondary md:px-5 ${notification.is_read ? "" : "bg-[rgb(21_75_132_/_0.05)]"}`}><Avatar src={avatarUrl(notification.actor_avatar_url) || undefined} initials={initials(notification.actor_name)} alt={notification.actor_name || "Pengguna"} size={36} /><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><span className="inline-flex items-center gap-1 text-xs font-semibold text-content-guide"><Icon size={14} />{meta.label}</span>{!notification.is_read && <Badge type="soft" variant="info" size="sm">Baru</Badge>}</span><span className="mt-1 block text-sm text-content-primary"><strong>{notification.actor_name || "Seseorang"}</strong> berinteraksi dengan <strong>{notification.asset_title || "aset pengetahuan Anda"}</strong>.</span><span className="mt-1 block text-xs text-content-secondary">{relativeTime(notification.created_at)}</span></span>{!notification.is_read && <span className="mt-2 h-2 w-2 rounded-full bg-[#0a67b1]" aria-label="Belum dibaca" />}</button></li>; })}</ul> : <div className="flex min-h-56 flex-col items-center justify-center p-6 text-center"><Bell size={32} className="text-content-tertiary" /><p className="mt-3 font-semibold text-content-primary">Belum ada aktivitas</p><p className="mt-1 text-sm text-content-secondary">Komentar, balasan, dan share pada aset Anda akan tampil di sini.</p></div>}</CardPlain>
    {!loading && pagination?.totalPages > 1 && <div className="mt-5 flex justify-center"><Pagination currentPage={page} totalPages={pagination.totalPages} pageSize={pagination.limit} onPageChange={(value) => updateParams({ page: value })} /></div>}
    <CardPlain className="kms-admin-surface mt-5 overflow-hidden"><div className="border-b border-border-subtle px-5 py-4"><div className="flex items-center gap-2"><ShieldCheck size={18} className="text-content-guide" /><div><h2 className="font-bold text-content-primary">Riwayat tindakan Anda</h2><p className="mt-1 text-xs text-content-secondary">Hanya dapat dilihat oleh pemilik akun.</p></div></div></div>{audits.length ? <ul className="divide-y divide-border-subtle">{audits.map((audit) => <li key={audit.id} className="flex items-center justify-between gap-4 px-5 py-3"><div><p className="text-sm font-semibold text-content-primary">{auditLabel(audit.action)}</p><p className="mt-1 text-xs text-content-secondary">{audit.target_type === "asset" && audit.target_id ? `Aset #${audit.target_id}` : "Akun pribadi"}</p></div><time className="shrink-0 text-xs text-content-secondary">{relativeTime(audit.created_at)}</time></li>)}</ul> : <p className="px-5 py-7 text-sm text-content-secondary">Belum ada riwayat tindakan yang tercatat.</p>}</CardPlain>
  </div>;
}
