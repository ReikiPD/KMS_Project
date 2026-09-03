import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Card, Modal, SelectDropdown, Skeleton, TextArea, TextField, useToast } from "@idds/react";
import { Pencil, Plus, Save, ShieldCheck } from "lucide-react";
import AdminPageHeader from "../../../components/AdminPageHeader";
import { useAuth } from "../../../contexts/AuthContext";
import useAdminView from "../../../hooks/useAdminView";
import { apiFetch, inputValue } from "../../../lib/api";
import { hasPermission } from "../../../lib/permissions";

const ROLE_LABELS = { pegawai: "Pegawai", pimpinan: "Pimpinan", admin: "Admin" };
const ACTION_LABELS = { view: "VIEW", post: "POST", edit: "EDIT", delete: "DELETE" };
const EMPTY_ROLE_FORM = { name: "", description: "" };

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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [roleForm, setRoleForm] = useState(EMPTY_ROLE_FORM);
  const [error, setError] = useState("");
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

  const savePermissions = async () => {
    if (!canEdit || saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await apiFetch(`/api/users/role-permissions/${selectedRole}`, {
        auth: true,
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          permissions: resources.map(({ key }) => ({ resource: key, ...(permissions[key] || {}) })),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Gagal menyimpan hak akses role");
      setPermissions(result.permissions || permissions);
      await refreshSession();
      window.dispatchEvent(new Event("kms-role-permissions-updated"));
      toast({ state: "positive", title: "Hak akses tersimpan", description: `Matriks akses ${roleLabel(selectedRole)} langsung berlaku pada permintaan berikutnya.`, duration: 3500 });
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

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

  return (
    <div className="mx-auto w-full max-w-7xl p-4 md:p-6 xl:p-8">
      <AdminPageHeader
        eyebrow="Manajemen Pegawai"
        title="Hak Akses Role"
        description="Atur akses halaman dan tindakan yang boleh dilakukan setiap role backoffice."
        breadcrumbs={[{ label: "Dasbor", href: "/admin/dashboard" }, { label: "Manajemen Pegawai", href: "/admin/staff" }, { label: "Hak Akses Role" }]}
        actions={(canCreate || canEdit) ? <div className="flex flex-wrap gap-2">
          {canCreate && <Button hierarchy="secondary" prefixIcon={<Plus size={17} />} onClick={() => { setError(""); setRoleForm(EMPTY_ROLE_FORM); setCreateOpen(true); }}>Tambah role</Button>}
          {canEdit && <Button hierarchy="secondary" prefixIcon={<Pencil size={17} />} onClick={openEditRole} disabled={!selectedRoleMeta}>Edit role</Button>}
          {canEdit && <Button hierarchy="primary" prefixIcon={<Save size={17} />} onClick={savePermissions} disabled={saving || loading}>{saving ? "Menyimpan…" : "Simpan akses"}</Button>}
        </div> : null}
      />

      <section className="kms-role-permission-toolbar mb-5" aria-label="Pemilihan role">
        <div className="grid gap-3 md:grid-cols-[14rem_minmax(0,1fr)] md:items-center">
          <SelectDropdown
            label="Role yang diatur"
            options={roles.map((role) => ({ value: role.code, label: role.name }))}
            selected={selectedRole}
            onSelect={(value) => setSelectedRole(String(value))}
            searchable={false}
            indicator="check"
          />
          <div className={`kms-role-permission-note kms-role-permission-note--${selectedRole === "admin" ? "caution" : "info"}`}>
            <span className="kms-role-permission-note-icon"><ShieldCheck size={18} /></span>
            <div>
              <p>{selectedRole === "admin" ? "Admin environment tetap memiliki akses penuh" : "Berlaku untuk seluruh akun role ini"}</p>
              <span>{selectedRole === "admin" ? "Matriks mengatur Admin database; Admin environment tetap tersedia untuk pemulihan." : "Server mengevaluasi izin ini pada setiap permintaan."}</span>
            </div>
          </div>
        </div>
      </section>

      {error && <div className="mb-4"><Alert variant="critical" title="Hak akses belum dapat diproses" message={error} /></div>}

      <Card className="kms-admin-surface overflow-hidden p-0">
        <div className="flex items-center gap-3 border-b border-border-subtle px-5 py-4">
          <span className="rounded-lg bg-primary-100 p-2 text-content-guide"><ShieldCheck size={19} /></span>
          <div><h2 className="font-bold text-content-primary">Matriks akses {roleLabel(selectedRole)}</h2><p className="text-sm text-content-secondary">VIEW membuka halaman; POST membuat data; EDIT memperbarui data; DELETE menghapus data.</p></div>
        </div>
        {loading ? (
          <div className="space-y-3 p-5">{[1, 2, 3, 4, 5].map((item) => <Skeleton key={item} height="58px" rounded="md" />)}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="kms-admin-native-table min-w-[760px] text-left">
              <thead><tr><th className="px-5 py-3">Halaman / fitur</th>{actions.map((action) => <th key={action} className="w-28 px-4 py-3 text-center">{ACTION_LABELS[action]}</th>)}</tr></thead>
              <tbody>{resources.map((resource) => (
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
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={createOpen} onClose={() => !creating && setCreateOpen(false)} title="Tambah role baru" size="md">
        <div className="space-y-4">
          {error && <Alert variant="critical" title="Role belum dapat ditambahkan" message={error} />}
          <p className="text-sm text-content-secondary">Role baru dibuat tanpa akses. Setelah dibuat, pilih izin yang diperlukan pada matriks agar prinsip akses minimum tetap terjaga.</p>
          <TextField
            label="Nama role *"
            value={roleForm.name}
            onChange={(value) => setRoleForm((current) => ({ ...current, name: inputValue(value) }))}
            placeholder="Contoh: Moderator Konten"
            maxLength={80}
            required
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
            <Button hierarchy="secondary" onClick={() => setCreateOpen(false)} disabled={creating}>Batal</Button>
            <Button hierarchy="primary" prefixIcon={<Plus size={17} />} onClick={createRole} disabled={creating}>{creating ? "Menambahkan…" : "Tambah role"}</Button>
          </div>
        </div>
      </Modal>

      <Modal open={editOpen} onClose={() => !creating && setEditOpen(false)} title="Edit role" size="md">
        <div className="space-y-4">
          {error && <Alert variant="critical" title="Role belum dapat diperbarui" message={error} />}
          <p className="text-sm text-content-secondary">Kode teknis role tetap dipertahankan agar akun dan hak akses yang sudah tersimpan tidak terputus.</p>
          <TextField label="Nama role *" value={roleForm.name} onChange={(value) => setRoleForm((current) => ({ ...current, name: inputValue(value) }))} maxLength={80} required />
          <TextArea label="Deskripsi" value={roleForm.description} onChange={(value) => setRoleForm((current) => ({ ...current, description: inputValue(value) }))} placeholder="Jelaskan fungsi role ini secara singkat." rows={3} maxLength={255} />
          <div className="kms-modal-actions flex justify-end gap-2 pt-1">
            <Button hierarchy="secondary" onClick={() => setEditOpen(false)} disabled={creating}>Batal</Button>
            <Button hierarchy="primary" prefixIcon={<Pencil size={17} />} onClick={updateRole} disabled={creating}>{creating ? "Menyimpan…" : "Simpan perubahan"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
