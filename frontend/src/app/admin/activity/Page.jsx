import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Alert, Avatar, Badge, Button, CardPlain, Modal, Pagination, SelectDropdown, Skeleton, useToast } from "@idds/react";
import { Bell, CheckCheck, MessageCircle, Reply, Search, Share2, ShieldCheck, Trash2 } from "lucide-react";
import AdminPageHeader from "../../../components/AdminPageHeader";
import MultipleSearchSelect from "../../../components/MultipleSearchSelect";
import EmptyState from "../../../components/EmptyState";
import { apiFetch, avatarUrl } from "../../../lib/api";
import { formatRelativeTime } from "../../../lib/dateTime";
import { queryToSearchSelections, searchSelectionsToQuery } from "../../../lib/search";

const notificationMeta = { comment: { icon: MessageCircle, label: "Komentar" }, reply: { icon: Reply, label: "Balasan" }, share: { icon: Share2, label: "Dibagikan" } };
const initials = (name = "") => name.split(" ").filter(Boolean).slice(0, 2).map((item) => item[0]).join("").toUpperCase() || "K";
const auditLabel = (action) => ({
  "account.logged_in": "Masuk ke akun", "profile.updated": "Memperbarui profil", "profile.avatar_updated": "Memperbarui foto profil", "profile.password_updated": "Mengubah kata sandi",
  "asset.draft_created": "Membuat draf aset", "asset.draft_updated": "Memperbarui draf aset", "asset.created_published": "Membuat aset terbit", "asset.created_draft": "Membuat aset draf", "asset.updated_published": "Memperbarui aset terbit", "asset.updated_draft": "Memperbarui aset draf", "asset.deleted": "Menghapus aset",
  "comment.created": "Mengirim komentar", "comment.updated": "Mengubah komentar", "comment.deleted": "Menghapus komentar", "comment.moderated": "Memoderasi komentar",
}[action] || "Aktivitas akun");

export default function ActivityPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [audits, setAudits] = useState([]);
  const [auditError, setAuditError] = useState("");
  const [isDeleteAuditOpen, setIsDeleteAuditOpen] = useState(false);
  const [deletingAudits, setDeletingAudits] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchSelections, setSearchSelections] = useState(() => queryToSearchSelections(searchParams.get("q") || ""));
  const page = Math.max(1, Number.parseInt(searchParams.get("page"), 10) || 1);
  const state = searchParams.get("state") === "unread" ? "unread" : "all";
  const query = searchParams.get("q") || "";

  const updateParams = (next) => setSearchParams((current) => {
    const params = new URLSearchParams(current);
    Object.entries(next).forEach(([key, value]) => { if (value) params.set(key, String(value)); else params.delete(key); });
    return params;
  });

  const load = useCallback(async () => {
    setLoading(true); setError(""); setAuditError("");
    try {
      const params = new URLSearchParams({ page: String(page), limit: "12", state });
      if (query) params.set("q", query);
      const [response, auditResponse] = await Promise.all([
        apiFetch(`/api/users/notifications?${params}`, { auth: true }),
        apiFetch("/api/users/audit-logs?limit=6", { auth: true }),
      ]);
      const result = await response.json();
      const auditResult = await auditResponse.json();
      if (!response.ok) throw new Error(result.error || "Gagal memuat aktivitas");
      setData(result.data || []); setPagination(result.pagination); setUnreadCount(result.unreadCount || 0);
      if (auditResponse.ok) setAudits(Array.isArray(auditResult.data) ? auditResult.data : []);
      else setAuditError(auditResult.error || "Gagal memuat riwayat tindakan");
    } catch (loadError) { setError(loadError.message); } finally { setLoading(false); }
  }, [page, query, state]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setSearchSelections(queryToSearchSelections(query)); }, [query]);

  const markRead = async (notification) => {
    if (notification.is_read) return;
    const response = await apiFetch(`/api/users/notifications/${notification.id}/read`, { method: "PATCH", auth: true });
    if (response.ok) { setData((items) => items.map((item) => item.id === notification.id ? { ...item, is_read: true } : item)); setUnreadCount((count) => Math.max(0, count - 1)); }
  };
  const markAll = async () => {
    const response = await apiFetch("/api/users/notifications/read-all", { method: "PATCH", auth: true });
    if (response.ok) { setData((items) => items.map((item) => ({ ...item, is_read: true }))); setUnreadCount(0); }
  };
  const openNotification = async (notification) => { await markRead(notification); if (notification.asset_id) navigate(`/admin/assets/${notification.asset_id}`); };
  const submitSearch = (event) => { event.preventDefault(); updateParams({ q: searchSelectionsToQuery(searchSelections), page: "" }); };
  const deleteAuditHistory = async () => {
    setDeletingAudits(true);
    try {
      const response = await apiFetch("/api/users/audit-logs", { method: "DELETE", auth: true });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Gagal menghapus riwayat tindakan");
      setAudits([]);
      setAuditError("");
      setIsDeleteAuditOpen(false);
      toast({ state: "positive", title: "Riwayat dihapus", description: `${result.deletedCount || 0} catatan tindakan telah dihapus.`, duration: 3000 });
    } catch (deleteError) {
      toast({ state: "negative", title: "Riwayat belum terhapus", description: deleteError.message, duration: 4000 });
    } finally {
      setDeletingAudits(false);
    }
  };

  return <div className="mx-auto w-full max-w-6xl p-4 md:p-6 xl:p-8">
    <AdminPageHeader compact eyebrow="Ruang Pegawai" title="Pusat Aktivitas" description="Pantau komentar, balasan, dan aktivitas berbagi pada aset pengetahuan Anda." breadcrumbs={[{ label: "Dasbor", href: "/admin/dashboard" }, { label: "Pusat Aktivitas" }]} actions={unreadCount > 0 && <Button hierarchy="secondary" onClick={markAll} prefixIcon={<CheckCheck size={16} />}>Tandai semua dibaca</Button>} />
    <CardPlain className="kms-admin-surface p-4 md:p-5"><div className="kms-admin-toolbar grid gap-4 md:grid-cols-[minmax(0,1fr)_180px] md:items-end"><form className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end" onSubmit={submitSearch}><MultipleSearchSelect label="Cari aktivitas" selected={searchSelections} onSelect={(values) => { setSearchSelections(values); if (!values.length && query) updateParams({ q: "", page: "" }); }} options={[...data.map((item) => ({ group: "Pengguna", label: item.actor_name, value: item.actor_name, description: "Pelaku aktivitas" })), ...data.map((item) => ({ group: "Judul Aset", label: item.asset_title, value: item.asset_title, description: "Aset yang menerima aktivitas" })), ...data.map((item) => ({ group: "Jenis Aktivitas", label: notificationMeta[item.type]?.label, value: notificationMeta[item.type]?.label, description: "Komentar, balasan, atau dibagikan" }))].filter((option) => option.value)} placeholder="Ketik lalu pilih judul aset, pengguna, atau jenis aktivitas" helperText="" /><Button type="submit" hierarchy="secondary" className="w-full sm:w-auto" prefixIcon={<Search size={16} />}>Cari</Button></form><SelectDropdown label="Status" width="100%" selected={state} onSelect={(value) => updateParams({ state: value === "unread" ? "unread" : "", page: "" })} options={[{ label: "Semua aktivitas", value: "all" }, { label: "Belum dibaca", value: "unread" }]} searchable={false} /></div></CardPlain>
    {error && <div className="mt-4"><Alert variant="critical" title="Aktivitas tidak dapat dimuat" message={error} /></div>}
    <CardPlain className="kms-admin-surface mt-5 overflow-hidden">{loading ? <div className="space-y-3 p-5">{[1, 2, 3, 4].map((item) => <Skeleton key={item} height="72px" rounded="lg" />)}</div> : data.length ? <ul className="divide-y divide-border-subtle">{data.map((notification) => { const meta = notificationMeta[notification.type] || notificationMeta.comment; const Icon = meta.icon; return <li key={notification.id}><button type="button" onClick={() => openNotification(notification)} className={`flex w-full items-start gap-3 px-4 py-4 text-left transition-colors hover:bg-page-secondary md:px-5 ${notification.is_read ? "" : "bg-[rgb(21_75_132_/_0.05)]"}`}><Avatar src={avatarUrl(notification.actor_avatar_url) || undefined} initials={initials(notification.actor_name)} alt={notification.actor_name || "Pengguna"} size={36} /><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><span className="inline-flex items-center gap-1 text-xs font-semibold text-content-guide"><Icon size={14} />{meta.label}</span>{!notification.is_read && <Badge type="soft" variant="info" size="sm">Baru</Badge>}</span><span className="mt-1 block text-sm text-content-primary"><strong>{notification.actor_name || "Seseorang"}</strong> berinteraksi dengan <strong>{notification.asset_title || "aset pengetahuan Anda"}</strong>.</span><span className="mt-1 block text-xs text-content-secondary">{formatRelativeTime(notification.created_at)}</span></span>{!notification.is_read && <span className="mt-2 h-2 w-2 rounded-full bg-[#0a67b1]" aria-label="Belum dibaca" />}</button></li>; })}</ul> : <EmptyState icon={Bell} title="Belum ada aktivitas" description="Komentar, balasan, dan share pada aset Anda akan tampil di sini." />}</CardPlain>
    {!loading && pagination?.totalPages > 1 && <div className="mt-5 flex justify-center"><Pagination currentPage={page} totalPages={pagination.totalPages} pageSize={pagination.limit} onPageChange={(value) => updateParams({ page: value })} /></div>}
    <CardPlain className="kms-admin-surface mt-5 overflow-hidden"><div className="flex items-center justify-between gap-4 border-b border-border-subtle px-5 py-4"><div className="flex items-center gap-2"><ShieldCheck size={18} className="text-content-guide" /><div><h2 className="font-bold text-content-primary">Riwayat tindakan Anda</h2><p className="mt-1 text-xs text-content-secondary">Hanya dapat dilihat dan dihapus oleh pemilik akun.</p></div></div>{audits.length > 0 && <Button hierarchy="tertiary" size="sm" prefixIcon={<Trash2 size={15} />} onClick={() => setIsDeleteAuditOpen(true)} className="shrink-0 text-critical-primary">Hapus riwayat</Button>}</div>{auditError ? <div className="p-5"><Alert variant="critical" title="Riwayat tidak dapat dimuat" message={auditError} /></div> : audits.length ? <ul className="divide-y divide-border-subtle">{audits.map((audit) => <li key={audit.id} className="flex items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-page-secondary"><div><p className="text-sm font-semibold text-content-primary">{auditLabel(audit.action)}</p><p className="mt-1 text-xs text-content-secondary">{audit.target_type === "asset" && audit.target_id ? `Aset #${audit.target_id}` : "Akun pribadi"}</p></div><time className="shrink-0 text-xs text-content-secondary">{formatRelativeTime(audit.created_at)}</time></li>)}</ul> : <div className="p-5"><EmptyState className="kms-empty-state--compact" icon={ShieldCheck} title="Belum ada riwayat tindakan" description="Perubahan profil dan pengelolaan aset Anda akan dicatat di bagian ini." /></div>}</CardPlain>
    <Modal open={isDeleteAuditOpen} onClose={() => !deletingAudits && setIsDeleteAuditOpen(false)} title="Hapus riwayat tindakan" dialogClassname="ina-modal__dialog--size-md">
      <p className="text-content-secondary">Seluruh riwayat tindakan akun Anda akan dihapus permanen. Tindakan ini tidak menghapus aset, komentar, atau data profil.</p>
      <div className="mt-7 flex justify-end gap-3">
        <Button hierarchy="secondary" onClick={() => setIsDeleteAuditOpen(false)} disabled={deletingAudits}>Batal</Button>
        <Button hierarchy="primary" className="kms-text-on-color !border-red-600 !bg-red-600 hover:!border-red-700 hover:!bg-red-700" prefixIcon={<Trash2 size={16} />} onClick={deleteAuditHistory} disabled={deletingAudits}>{deletingAudits ? "Menghapus..." : "Hapus permanen"}</Button>
      </div>
    </Modal>
  </div>;
}
