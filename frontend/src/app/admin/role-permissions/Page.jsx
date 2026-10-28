import ValidatedForm from "../../../components/ValidatedForm";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import "../../../styles/review-governance.css";
import { Alert, Button, CardPlain, Modal, SelectDropdown, Skeleton, TextArea, TextField, useToast } from "@idds/react";
import { AlertTriangle, ChevronDown, Clock3, Eye, History, Pencil, Plus, Save, ShieldCheck, Users } from "lucide-react";
import AdminPageHeader from "../../../components/AdminPageHeader";
import useUnsavedChanges from "../../../hooks/useUnsavedChanges";
import useFormDraftGuard from "../../../hooks/useFormDraftGuard";
import FormDraftStatus from "../../../components/FormDraftStatus";
import { UnsavedChangesModal } from "../../../components/AssetFormStatus";
import { useAuth } from "../../../contexts/AuthContext";
import useAdminView from "../../../hooks/useAdminView";
import { apiFetch, inputValue } from "../../../lib/api";
import { hasPermission } from "../../../lib/permissions";

const ROLE_LABELS = { pegawai: "Pegawai", pimpinan: "Pimpinan", admin: "Admin" };
const ACTION_LABELS = { view: "VIEW", post: "POST", edit: "EDIT", delete: "DELETE" };
const EMPTY_ROLE_FORM = { name: "", description: "" };

function AccessRiskSummary({ warnings = [], expanded = false }) {
  if (!warnings.length) return null;
  return (
    <details className="kms-access-risks" open={expanded || undefined}>
      <summary>
        <AlertTriangle size={18} aria-hidden="true" />
        <span><strong>{warnings.length} akses sensitif perlu diperhatikan</strong><small>Periksa kewenangan role sebelum menyimpan perubahan.</small></span>
        <ChevronDown size={17} className="kms-disclosure-chevron" aria-hidden="true" />
      </summary>
      <ul>{warnings.map((warning) => <li key={warning.code}><strong>{warning.title}</strong><p>{warning.detail}</p></li>)}</ul>
    </details>
  );
}

export default function RolePermissionsPage() {
  const { user: authenticatedUser, refreshSession } = useAuth();
  const { accessUser } = useAdminView();
  const user = accessUser || authenticatedUser;
  const { toast } = useToast();
  const [selectedRole, setSelectedRole] = useState("pegawai");
  const [roles, setRoles] = useState([]);
  const [resources, setResources] = useState([]);
  const [actions, setActions] = useState([]);
  const [permissions, setPermissions] = useState({});
  const [baseline, setBaseline] = useState("{}");
  const [resourceQuery, setResourceQuery] = useState("");
  const [collapsed, setCollapsed] = useState({});
  const dirty = JSON.stringify(permissions) !== baseline;
  const unsaved = useUnsavedChanges(dirty);
  const [governance, setGovernance] = useState({ impact: { totalAccounts: 0, sample: [] }, history: [], review: null, warnings: [] });
  const [preview, setPreview] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [rolePreviewOpen, setRolePreviewOpen] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [roleForm, setRoleForm] = useState(EMPTY_ROLE_FORM);
  const [error, setError] = useState("");
  const roleGuard = useFormDraftGuard(roleForm, createOpen || editOpen);
  const closeRole = () => !creating && roleGuard.requestLeave(() => { setCreateOpen(false); setEditOpen(false); });
  const canEdit = hasPermission(user, "role_permissions", "edit");
  const canCreate = hasPermission(user, "role_permissions", "post");
  const roleLabel = (code) => roles.find((role) => role.code === code)?.name || ROLE_LABELS[code] || code;
  const selectedRoleMeta = roles.find((role) => role.code === selectedRole);

  const loadPermissions = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch(`/api/users/role-permissions?role=${encodeURIComponent(selectedRole)}`, { auth: true });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Gagal memuat hak akses role");
      const nextRoles = (result.roles || []).map((role) => typeof role === "string"
        ? { code: role, name: ROLE_LABELS[role] || role }
        : role);
      setRoles(nextRoles);
      if (result.role && result.role !== selectedRole) setSelectedRole(result.role);
      setResources(result.resources || []);
      setActions(result.actions || []);
      setPermissions(result.permissions || {});
      setBaseline(JSON.stringify(result.permissions || {}));
      setGovernance({ impact: result.impact || { totalAccounts: 0, sample: [] }, history: result.history || [], review: result.review || null, warnings: result.warnings || [] });
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [selectedRole]);

  useEffect(() => { loadPermissions(); }, [loadPermissions]);

  const updatePermission = (resource, action, checked) => {
    if (!canEdit) return;
    setPermissions((current) => {
      const nextRow = { ...(current[resource] || {}) };
      if (action === "view" && !checked) {
        actions.forEach((item) => { nextRow[item] = false; });
      } else {
        nextRow[action] = checked;
        if (checked && action !== "view") nextRow.view = true;
      }
      return { ...current, [resource]: nextRow };
    });
  };

  const permissionPayload = () => resources.map(({ key }) => ({ resource: key, ...(permissions[key] || {}) }));

  const requestSavePreview = async () => {
    if (!canEdit || saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await apiFetch(`/api/users/role-permissions/${selectedRole}/preview`, {
        auth: true,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions: permissionPayload() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Gagal menyiapkan pratinjau perubahan");
      setPreview(result);
    } catch (saveError) { setError(saveError.message); } finally { setSaving(false); }
  };

  const savePermissions = async () => {
    if (!canEdit || saving) return;
    setSaving(true); setError("");
    try {
      const response = await apiFetch(`/api/users/role-permissions/${selectedRole}`, { auth: true, method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ permissions: permissionPayload() }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Gagal menyimpan hak akses role");
      setPermissions(result.permissions || permissions);
      setBaseline(JSON.stringify(result.permissions || permissions));
      setGovernance({ impact: result.impact || governance.impact, history: result.history || governance.history, review: result.review || governance.review, warnings: result.warnings || [] });
      setPreview(null);
      await refreshSession();
      window.dispatchEvent(new Event("kms-role-permissions-updated"));
      toast({ state: "positive", title: "Hak akses tersimpan", description: `Matriks akses ${roleLabel(selectedRole)} langsung berlaku pada permintaan berikutnya.`, duration: 3500 });
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  const markReviewed = async () => {
    if (!canEdit || reviewing) return;
    setReviewing(true); setError("");
    try {
      const response = await apiFetch(`/api/users/role-permissions/${selectedRole}/review`, { auth: true, method: "PATCH" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Peninjauan akses belum dapat dicatat");
      setGovernance((current) => ({ ...current, review: result.review }));
      toast({ state: "positive", title: "Peninjauan dicatat", description: "Akses role dijadwalkan untuk ditinjau kembali enam bulan lagi.", duration: 3500 });
      setReviewOpen(false);
    } catch (reviewError) { setError(reviewError.message); } finally { setReviewing(false); }
  };

  const effectiveSummary = useMemo(() => {
    const visible = resources.filter(({ key }) => permissions[key]?.view).length;
    const writes = resources.reduce((total, { key }) => total + ["post", "edit", "delete"].filter((action) => permissions[key]?.[action]).length, 0);
    return { visible, writes };
  }, [permissions, resources]);

  const createRole = async () => {
    if (!canCreate || creating) return;
    if (roleForm.name.trim().length < 3) {
      setError("Nama role minimal terdiri dari 3 karakter.");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const response = await apiFetch("/api/users/roles", {
        auth: true,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(roleForm),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Gagal menambahkan role");
      setRoles((current) => [...current.filter((role) => role.code !== result.role.code), result.role]);
      setSelectedRole(result.role.code);
      setPermissions(result.permissions || {});
      setRoleForm(EMPTY_ROLE_FORM);
      setCreateOpen(false);
      toast({ state: "positive", title: "Role berhasil ditambahkan", description: `Atur matriks akses ${result.role.name}, lalu pilih Simpan akses.`, duration: 4000 });
    } catch (createError) {
      setError(createError.message);
    } finally {
      setCreating(false);
    }
  };

  const openEditRole = () => {
    if (!selectedRoleMeta) return;
    setRoleForm({ name: selectedRoleMeta.name || "", description: selectedRoleMeta.description || "" });
    setError("");
    setEditOpen(true);
  };

  const updateRole = async () => {
    if (!canEdit || creating || !selectedRoleMeta) return;
    if (roleForm.name.trim().length < 3) {
      setError("Nama role minimal terdiri dari 3 karakter.");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const response = await apiFetch(`/api/users/roles/${encodeURIComponent(selectedRole)}`, {
        auth: true,
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(roleForm),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Gagal mengubah role");
      setRoles((current) => current.map((role) => role.code === selectedRole ? result.role : role));
      setRoleForm(EMPTY_ROLE_FORM);
      setEditOpen(false);
      await refreshSession();
      window.dispatchEvent(new Event("kms-role-permissions-updated"));
      toast({ state: "positive", title: "Role diperbarui", description: "Nama dan deskripsi role langsung diperbarui.", duration: 3500 });
    } catch (updateError) {
      setError(updateError.message);
    } finally {
      setCreating(false);
    }
  };

  const groupFor = (key) => key.startsWith("internal_") ? "Aset Data Internal" : ["assets", "asset_recovery", "asset_verification"].includes(key) ? "Manajemen pengetahuan" : ["staff_management", "staff_all_units", "role_permissions"].includes(key) ? "Akun dan hak akses" : ["categories", "work_units"].includes(key) ? "Data referensi" : "Informasi dan analitik";
  const visibleGroups = [...new Set(resources.map((item) => groupFor(item.key)))].map((label) => ({ label, items: resources.filter((item) => groupFor(item.key) === label && `${item.label} ${item.description}`.toLocaleLowerCase("id-ID").includes(resourceQuery.trim().toLocaleLowerCase("id-ID"))) })).filter((group) => group.items.length);

  return (
    <div className="mx-auto w-full max-w-7xl p-4 md:p-6 xl:p-8">
      <FormDraftStatus guard={roleGuard} />
      <UnsavedChangesModal open={unsaved.open} onStay={unsaved.stay} onLeave={unsaved.leave} />
      <AdminPageHeader
        eyebrow="Manajemen Pegawai"
        title="Hak Akses Role"
        description="Atur akses halaman dan tindakan yang boleh dilakukan setiap role backoffice."
        breadcrumbs={[{ label: "Dasbor", href: "/admin/dashboard" }, { label: "Manajemen Pegawai", href: "/admin/staff" }, { label: "Hak Akses Role" }]}
        actions={
          <div className={`kms-role-permission-note kms-role-heading-note kms-role-permission-note--${selectedRole === "admin" ? "caution" : "info"}`}>
            <span className="kms-role-permission-note-icon"><ShieldCheck size={18} /></span>
            <div>
              <p>{selectedRole === "admin" ? "Admin environment tetap memiliki akses penuh" : "Berlaku untuk seluruh akun role ini"}</p>
              <span>{selectedRole === "admin" ? "Matriks mengatur Admin database. Akun pemulihan tetap tersedia." : "Perubahan akses juga berlaku saat akun diakses melalui Manajemen Pegawai."}</span>
            </div>
          </div>
        }
      />

      <section className="kms-role-permission-toolbar kms-role-toolbar mb-4" aria-label="Pemilihan role">
        <div className="kms-role-toolbar-select">
          <SelectDropdown label="Role yang diatur" options={roles.map((role) => ({ value: role.code, label: role.name }))}
            selected={selectedRole} onSelect={(value) => unsaved.requestLeave(() => setSelectedRole(String(value)))}
            searchable={false} showPreviewValue={false} mandatorySelected indicator="check" />
        </div>
        <div className="kms-role-toolbar-actions">
          {canCreate && <Button hierarchy="secondary" prefixIcon={<Plus size={16} />} onClick={() => unsaved.requestLeave(() => { setError(""); setRoleForm(EMPTY_ROLE_FORM); setCreateOpen(true); })}>Tambah role</Button>}
          {canEdit && <Button hierarchy="secondary" prefixIcon={<Pencil size={16} />} onClick={openEditRole} disabled={!selectedRoleMeta || loading}>Edit role</Button>}
          <Button hierarchy="secondary" prefixIcon={<Eye size={16} />} onClick={() => setRolePreviewOpen(true)} disabled={loading}>Pratinjau role</Button>
          {canEdit && <Button hierarchy="primary" prefixIcon={<Save size={16} />} onClick={requestSavePreview} disabled={saving || loading}>{saving ? "Memeriksa…" : "Simpan akses"}</Button>}
        </div>
      </section>

      {error && <div className="mb-4"><Alert variant="critical" title="Hak akses belum dapat diproses" message={error} /></div>}

      <dl className="kms-role-metrics" aria-label="Ringkasan akses efektif">
        {[
          { label: "Halaman dapat dilihat", value: effectiveSummary.visible, hint: "Sesuai matriks yang dipilih", icon: Eye, tone: "blue" },
          { label: "Izin tindakan tulis", value: effectiveSummary.writes, hint: "POST, EDIT, dan DELETE", icon: ShieldCheck, tone: "teal" },
          { label: "Akun aktif terdampak", value: governance.impact.totalAccounts || 0, hint: "Menggunakan role ini", icon: Users, tone: "violet" },
          { label: "Peninjauan akses", value: governance.review?.overdue ? "Perlu ditinjau" : "Terjadwal",
            hint: governance.review?.next_review_at ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(new Date(governance.review.next_review_at)) : "Belum pernah ditinjau",
            icon: Clock3, tone: "amber", compact: true },
        ].map(({ label, value, hint, icon: Icon, tone, compact }) => (
          <div key={label} className={`kms-role-metric kms-role-metric--${tone}`}>
            <div><dt>{label}</dt><dd className={compact ? "kms-role-metric-status" : ""}>{loading ? "…" : value}</dd><p>{hint}</p></div>
            <span className="kms-role-metric-icon"><Icon size={21} aria-hidden="true" /></span>
          </div>
        ))}
      </dl>

      <div className="mb-4 flex flex-wrap justify-end gap-2">
        <Button hierarchy="tertiary" size="sm" prefixIcon={<History size={16} />} onClick={() => setHistoryOpen(true)} disabled={loading}>Riwayat akses</Button>
        <Button hierarchy="tertiary" size="sm" prefixIcon={<Clock3 size={16} />} onClick={() => setReviewOpen(true)} disabled={loading}>Peninjauan berkala</Button>
      </div>
      <div className="mb-4"><AccessRiskSummary warnings={governance.warnings} /></div>

      <div className="mb-4"><TextField label="Cari halaman atau fitur" value={resourceQuery} onChange={(value) => setResourceQuery(inputValue(value))} placeholder="Misalnya Daftar Staf atau Verifikasi" showClearButton />{dirty && <p className="kms-dirty-indicator" role="status">● Perubahan akses belum disimpan</p>}</div>
      <CardPlain className="kms-admin-surface overflow-hidden p-0">
        <div className="flex items-center gap-3 border-b border-border-subtle px-5 py-4">
          <span className="rounded-lg bg-primary-100 p-2 text-content-guide"><ShieldCheck size={19} /></span>
          <div><h2 className="font-bold text-content-primary">Matriks akses {roleLabel(selectedRole)}</h2><p className="text-sm text-content-secondary">Arti setiap izin mengikuti keterangan halaman. Daftar Staf: VIEW tabel, POST akses baca-saja, EDIT mode kerja dan kelola akun, DELETE nonaktifkan akun.</p></div>
        </div>
        {loading ? (
          <div className="space-y-3 p-5">{[1, 2, 3, 4, 5].map((item) => <Skeleton key={item} height="58px" rounded="md" />)}</div>
        ) : (
          <div className="kms-role-matrix-scroll" role="region" aria-label="Matriks izin per modul" tabIndex={0}>
            <table className="kms-admin-native-table kms-role-matrix min-w-[760px] text-left">
              <thead><tr><th className="px-5 py-3">Halaman / fitur</th>{actions.map((action) => <th key={action} className="w-28 px-4 py-3 text-center">{ACTION_LABELS[action]}</th>)}</tr></thead>
              <tbody>{visibleGroups.map((group) => <Fragment key={group.label}><tr className="kms-role-group"><td colSpan={actions.length + 1}><button type="button" className="flex w-full items-center gap-2 p-2" aria-expanded={!collapsed[group.label]} onClick={() => setCollapsed((current) => ({ ...current, [group.label]: !current[group.label] }))}><ChevronDown size={16} className={collapsed[group.label] ? "-rotate-90" : ""} />{group.label} · {group.items.length} halaman</button></td></tr>{!collapsed[group.label] && group.items.map((resource) => (
                <tr key={resource.key}>
                  <td className="px-5 py-3"><p className="font-semibold text-content-primary">{resource.label}</p><p className="mt-1 text-xs text-content-secondary">{resource.description}</p></td>
                  {actions.map((action) => {
                    const actionAvailable = resource.actions?.includes(action);
                    return (
                    <td key={action} className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        className="kms-permission-checkbox"
                        checked={Boolean(permissions[resource.key]?.[action])}
                        onChange={(event) => updatePermission(resource.key, action, event.target.checked)}
                        disabled={!canEdit || !actionAvailable}
                        aria-label={actionAvailable ? `${ACTION_LABELS[action]} ${resource.label} untuk ${roleLabel(selectedRole)}` : `${ACTION_LABELS[action]} tidak berlaku untuk ${resource.label}`}
                        title={actionAvailable ? undefined : "Aksi ini tidak tersedia pada fitur tersebut"}
                      />
                    </td>
                    );
                  })}
                </tr>
              ))}</Fragment>)}</tbody>
            </table>
          </div>
        )}
      </CardPlain>

      <Modal open={historyOpen} onClose={() => setHistoryOpen(false)} title={`Riwayat akses — ${roleLabel(selectedRole)}`} size="lg">
        <div className="divide-y divide-border-subtle">
          {governance.history.length ? governance.history.map((item, index) => <div key={`${item.created_at}-${index}`} className="py-3">
            <p className="font-semibold text-content-primary">{item.actor_label || "Sistem"}</p>
            <p className="mt-1 text-sm text-content-secondary">{item.action === "role_permissions.reviewed" ? "Meninjau ulang akses" : "Mengubah hak akses"} · {new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.created_at))}</p>
          </div>) : <p className="py-4 text-sm text-content-secondary">Belum ada riwayat perubahan.</p>}
        </div>
      </Modal>
      <Modal open={reviewOpen} onClose={() => !reviewing && setReviewOpen(false)} title={`Peninjauan berkala — ${roleLabel(selectedRole)}`} size="md">
        <div className="space-y-4">
          {error && <Alert variant="critical" title="Peninjauan belum tersimpan" message={error} />}
          <p className="text-sm text-content-secondary">Periksa kembali kebutuhan akses role sedikitnya setiap enam bulan.</p>
          <dl className="space-y-2 text-sm"><dt className="text-content-secondary">Peninjauan berikutnya</dt><dd className="font-semibold">{governance.review?.next_review_at ? new Intl.DateTimeFormat("id-ID", { dateStyle: "long" }).format(new Date(governance.review.next_review_at)) : "Belum dijadwalkan"}</dd>
            <dt className="text-content-secondary">Terakhir ditinjau oleh</dt><dd>{governance.review?.reviewed_by_label || "Belum pernah ditinjau"}</dd></dl>
          {canEdit && <Button hierarchy="primary" onClick={markReviewed} disabled={reviewing}>{reviewing ? "Mencatat…" : "Tandai telah ditinjau"}</Button>}
        </div>
      </Modal>

      <Modal open={createOpen} onClose={closeRole} title="Tambah role baru" size="md">
        <ValidatedForm busy={creating} className="space-y-4" onSubmit={event => { event.preventDefault(); createRole(); }}>
          {error && <Alert variant="critical" title="Role belum dapat ditambahkan" message={error} />}
          <p className="text-sm text-content-secondary">Role baru dibuat tanpa akses. Setelah dibuat, pilih izin yang diperlukan pada matriks agar prinsip akses minimum tetap terjaga.</p>
          <TextField
            label="Nama role *"
            value={roleForm.name}
            onChange={(value) => setRoleForm((current) => ({ ...current, name: inputValue(value) }))}
            placeholder="Contoh: Moderator Konten"
            maxLength={80}
            required minLength={3}
          />
          <TextArea
            label="Deskripsi"
            value={roleForm.description}
            onChange={(value) => setRoleForm((current) => ({ ...current, description: inputValue(value) }))}
            placeholder="Jelaskan fungsi role ini secara singkat."
            rows={3}
            maxLength={255}
          />
          <Alert variant="info" title="Akses tidak diberikan otomatis" message="Setelah role dibuat, centang akses yang dibutuhkan lalu klik Simpan akses." />
          <div className="kms-modal-actions flex justify-end gap-2 pt-1">
            <Button hierarchy="secondary" onClick={closeRole} disabled={creating}>Batal</Button>
            <Button hierarchy="primary" prefixIcon={<Plus size={17} />} type="submit" disabled={creating}>{creating ? "Menambahkan…" : "Tambah role"}</Button>
          </div>
        </ValidatedForm>
      </Modal>

      <Modal open={editOpen} onClose={closeRole} title="Edit role" size="md">
        <ValidatedForm busy={creating} className="space-y-4" onSubmit={event => { event.preventDefault(); updateRole(); }}>
          {error && <Alert variant="critical" title="Role belum dapat diperbarui" message={error} />}
          <p className="text-sm text-content-secondary">Kode teknis role tetap dipertahankan agar akun dan hak akses yang sudah tersimpan tidak terputus.</p>
          <TextField label="Nama role *" value={roleForm.name} onChange={(value) => setRoleForm((current) => ({ ...current, name: inputValue(value) }))} minLength={3} maxLength={80} required />
          <TextArea label="Deskripsi" value={roleForm.description} onChange={(value) => setRoleForm((current) => ({ ...current, description: inputValue(value) }))} placeholder="Jelaskan fungsi role ini secara singkat." rows={3} maxLength={255} />
          <div className="kms-modal-actions flex justify-end gap-2 pt-1">
            <Button hierarchy="secondary" onClick={closeRole} disabled={creating}>Batal</Button>
            <Button hierarchy="primary" prefixIcon={<Pencil size={17} />} type="submit" disabled={creating}>{creating ? "Menyimpan…" : "Simpan perubahan"}</Button>
          </div>
        </ValidatedForm>
      </Modal>

      <Modal open={rolePreviewOpen} onClose={() => setRolePreviewOpen(false)} title={`Pratinjau sebagai ${roleLabel(selectedRole)}`} size="lg">
        <div className="space-y-4"><Alert variant="info" title="Simulasi navigasi role" message="Ini adalah ringkasan akses efektif dari matriks saat ini, tanpa berpindah atau mengambil alih akun pengguna." /><div className="grid gap-3 sm:grid-cols-2">{resources.filter(({ key }) => permissions[key]?.view).map((resource) => <div key={resource.key} className="rounded-xl border border-border-subtle p-4"><p className="font-bold text-content-primary">{resource.label}</p><p className="mt-1 text-xs leading-5 text-content-secondary">{resource.description}</p><div className="mt-3 flex flex-wrap gap-2">{resource.actions.filter((action) => permissions[resource.key]?.[action]).map((action) => <span key={action} className="rounded-full bg-primary-100 px-2 py-1 text-xs font-semibold text-content-guide">{ACTION_LABELS[action]}</span>)}</div></div>)}</div>{effectiveSummary.visible === 0 && <p className="text-sm text-content-secondary">Role ini belum dapat membuka halaman backoffice.</p>}<div className="flex justify-end"><Button hierarchy="secondary" onClick={() => setRolePreviewOpen(false)}>Tutup</Button></div></div>
      </Modal>

      <Modal open={Boolean(preview)} onClose={() => !saving && setPreview(null)} title="Konfirmasi perubahan hak akses" size="lg">
        {preview && <div className="space-y-4"><Alert variant="caution" title={`${preview.changes?.length || 0} perubahan akan diterapkan`} message={`Perubahan ini langsung memengaruhi ${preview.impact?.totalAccounts || 0} akun aktif dengan role ${roleLabel(selectedRole)}.`} /><AccessRiskSummary warnings={preview.warnings} expanded /><div><h3 className="font-bold text-content-primary">Perubahan</h3><div className="mt-2 max-h-60 divide-y divide-border-subtle overflow-y-auto rounded-xl border border-border-subtle">{preview.changes?.length ? preview.changes.map((change) => <div key={`${change.resource}-${change.action}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm"><span className="text-content-primary">{change.resourceLabel} · {ACTION_LABELS[change.action]}</span><span className={change.enabled ? "font-semibold text-green-600" : "font-semibold text-red-600"}>{change.enabled ? "Diaktifkan" : "Dinonaktifkan"}</span></div>) : <p className="p-4 text-sm text-content-secondary">Tidak ada perubahan terhadap matriks tersimpan.</p>}</div></div>{preview.impact?.sample?.length > 0 && <p className="text-sm text-content-secondary">Contoh akun terdampak: {preview.impact.sample.map((item) => item.full_name).join(", ")}.</p>}<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button hierarchy="secondary" onClick={() => setPreview(null)} disabled={saving}>Batal</Button><Button hierarchy="primary" prefixIcon={<Save size={17} />} onClick={savePermissions} disabled={saving || !preview.changes?.length}>{saving ? "Menyimpan…" : "Terapkan perubahan"}</Button></div></div>}
      </Modal>
    </div>
  );
}
