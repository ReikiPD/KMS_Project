import ValidatedForm from "../../../components/ValidatedForm";
import ResponsiveTable from "../../../components/ResponsiveTable";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Alert,
  Badge,
  Button,
  Card,
  Modal,
  Pagination,
  PasswordInput,
  SelectDropdown,
  Skeleton,
  TextField,
  Tooltip,
} from "@idds/react";
import { BarChart3, Pencil, Plus, Search, Trash2, Users } from "lucide-react";
import AdminPageHeader from "../../../components/AdminPageHeader";
import useFormDraftGuard from "../../../hooks/useFormDraftGuard";
import FormDraftStatus from "../../../components/FormDraftStatus";
import EmptyState from "../../../components/EmptyState";
import MultipleSearchSelect from "../../../components/MultipleSearchSelect";
import WorkUnitLabel from "../../../components/WorkUnitLabel";
import useAdminView from "../../../hooks/useAdminView";
import { apiFetch, inputValue } from "../../../lib/api";
import { useAuth } from "../../../contexts/AuthContext";
import { queryToSearchSelections, searchSelectionsToQuery } from "../../../lib/search";
import { hasPermission, canAccessStaffAccount, buildContextAccessUser, firstAllowedBackofficePath } from "../../../lib/permissions";

const blankStaff = { fullName: "", email: "", workUnitId: "", password: "", confirmPassword: "", role: "pegawai" };
const STAFF_PAGE_SIZE_OPTIONS = [10, 20, 50];
const FALLBACK_ROLES = [
  { code: "pegawai", name: "Pegawai" },
  { code: "pimpinan", name: "Pimpinan" },
  { code: "admin", name: "Admin" },
];

export default function StaffPage() {
  const { user: authenticatedUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeQuery = searchParams.get("q")?.trim() || "";
  const parsedPage = Number.parseInt(searchParams.get("page"), 10);
  const parsedLimit = Number.parseInt(searchParams.get("limit"), 10);
  const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const limit = STAFF_PAGE_SIZE_OPTIONS.includes(parsedLimit) ? parsedLimit : STAFF_PAGE_SIZE_OPTIONS[0];
  const {
    accessUser,
    isAdminViewingUser,
    isNestedScopedContext,
    isEmployeeContext,
    staffMember,
    staffLoading,
    enterAdminView,
  } = useAdminView();
  const user = accessUser || authenticatedUser;
  const canCreate = hasPermission(user, "staff_management", "view") && hasPermission(user, "staff_management", "edit");
  const canEdit = hasPermission(user, "staff_management", "view") && hasPermission(user, "staff_management", "edit");
  const canDelete = hasPermission(user, "staff_management", "view") && hasPermission(user, "staff_management", "delete");
  const canEnter = canAccessStaffAccount(user);
  const canWorkInStaffAccount = canEdit;
  const canOpenMember = (member) => canEnter && !isNestedScopedContext
    && ![user?.id, authenticatedUser?.id].filter(Boolean).some((id) => Number(id) === Number(member.id));
  const canChangeMember = (member) => ![user?.id, authenticatedUser?.id, user?.supervisor?.id].filter(Boolean).some((id) => Number(id) === Number(member.id));

  const [staff, setStaff] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit, totalItems: 0, totalPages: 0 });
  const [searchSelections, setSearchSelections] = useState(() => queryToSearchSelections(activeQuery));
  const [workUnits, setWorkUnits] = useState([]);
  const [roles, setRoles] = useState(FALLBACK_ROLES);
  const [loading, setLoading] = useState(true);
  const [workUnitsLoading, setWorkUnitsLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState(blankStaff);
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [memberToDelete, setMemberToDelete] = useState(null);
  const [memberToEdit, setMemberToEdit] = useState(null);
  const [editedRole, setEditedRole] = useState("pegawai");
  const [editedWorkUnitId, setEditedWorkUnitId] = useState("");

  const createGuard = useFormDraftGuard(form, isCreateOpen);
  const editGuard = useFormDraftGuard({ editedRole, editedWorkUnitId }, Boolean(memberToEdit));
  const closeCreate = () => !saving && createGuard.requestLeave(() => { setCreateOpen(false); setForm(blankStaff); });
  const closeEdit = () => !saving && editGuard.requestLeave(() => setMemberToEdit(null));

  const updateListParams = (updates) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      Object.entries(updates).forEach(([key, value]) => {
        const isDefaultPage = key === "page" && Number(value) === 1;
        const isDefaultLimit = key === "limit" && Number(value) === STAFF_PAGE_SIZE_OPTIONS[0];
        if (value === "" || value === null || value === undefined || isDefaultPage || isDefaultLimit) next.delete(key);
        else next.set(key, String(value));
      });
      return next;
    });
  };

  const loadStaff = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (activeQuery) params.set("q", activeQuery);
      const response = await apiFetch(`/api/users/staff?${params.toString()}`, { auth: true });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Gagal memuat data akun kedinasan");
      setStaff(result.data || result);
      setPagination(result.pagination || { page, limit, totalItems: (result.data || result).length, totalPages: 1 });
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [activeQuery, limit, page]);

  const loadWorkUnits = async () => {
    setWorkUnitsLoading(true);
    try {
      const response = await apiFetch("/api/users/staff-work-units", { auth: true });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Gagal memuat Unit Kerja");
      setWorkUnits(result);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setWorkUnitsLoading(false);
    }
  };

  const loadRoles = async () => {
    try {
      const response = await apiFetch("/api/users/roles", { auth: true });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Gagal memuat role");
      setRoles(Array.isArray(result.data) && result.data.length ? result.data : FALLBACK_ROLES);
    } catch (loadError) {
      setError(loadError.message);
    }
  };

  useEffect(() => { loadStaff(); }, [loadStaff]);
  useEffect(() => {
    if (canCreate || canEdit) loadWorkUnits();
    else setWorkUnitsLoading(false);
  }, [canCreate, canEdit]);
  useEffect(() => { loadRoles(); }, []);
  useEffect(() => { setSearchSelections(queryToSearchSelections(activeQuery)); }, [activeQuery]);

  const submitSearch = (event) => {
    event.preventDefault();
    updateListParams({ q: searchSelectionsToQuery(searchSelections), page: 1 });
  };

  const createStaff = async () => {
    if (!form.fullName.trim() || !form.email.trim() || !form.workUnitId || !form.password || !form.confirmPassword) {
      setError("Nama, email, Unit Kerja, dan kata sandi wajib diisi.");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError("Konfirmasi kata sandi belum sama.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const response = await apiFetch("/api/users/staff", {
        auth: true,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: form.fullName,
          email: form.email,
          workUnitId: form.workUnitId,
          password: form.password,
          role: form.role,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Gagal menambahkan akun kedinasan");
      setCreateOpen(false);
      setForm(blankStaff);
      await loadStaff();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  const removeStaff = async (member) => {
    setDeleting(member.id);
    setError("");
    try {
      const response = await apiFetch(`/api/users/staff/${member.public_id || member.id}`, { auth: true, method: "DELETE" });
      const result = response.status === 204 ? {} : await response.json();
      if (!response.ok) throw new Error(result.error || "Gagal menonaktifkan akun kedinasan");
      if (staff.length === 1 && page > 1) updateListParams({ page: page - 1 });
      else await loadStaff();
      setMemberToDelete(null);
    } catch (removeError) {
      setError(removeError.message);
    } finally {
      setDeleting(null);
    }
  };

  const saveRole = async () => {
    if (!memberToEdit || !canEdit) return;
    setSaving(true);
    setError("");
    try {
      const response = await apiFetch(`/api/users/staff/${memberToEdit.public_id || memberToEdit.id}/role`, {
        auth: true,
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: editedRole, workUnitId: editedWorkUnitId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Gagal memperbarui role akun");
      setMemberToEdit(null);
      await loadStaff();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  const openRoleEditor = (member) => {
    setMemberToEdit(member);
    setEditedRole(member.role);
    setEditedWorkUnitId(member.organization_scope === "all" ? "admin" : member.work_unit_id ? String(member.work_unit_id) : "");
  };

  const field = (key, label, type = "text") => (
    <TextField required key={key} label={label} type={type} value={form[key]} onChange={(value) => setForm((previous) => ({ ...previous, [key]: inputValue(value) }))} />
  );
  const workUnitOptions = workUnits.map((workUnit) => ({
    label: workUnit.organization_scope === "all" ? "Admin — seluruh unit / Eselon" : `${Number(workUnit.echelon_level) > 1 ? "↳ " : ""}Eselon ${({ 1: "I", 2: "II", 3: "III" })[Number(workUnit.echelon_level)] || "I"} · ${workUnit.alias || workUnit.name}${workUnit.alias ? ` — ${workUnit.name}` : ""}`,
    value: String(workUnit.id),
  }));
  const assignableRoles = roles;
  const roleOptions = assignableRoles.map((role) => ({ label: role.name, value: role.code, disabled: role.assignable === false }));
  const roleName = (code) => roles.find((role) => role.code === code)?.name || code;
  const openStaff = (member) => {
    if (!canOpenMember(member)) return;
    if (!member.public_id) return setError("Referensi publik akun belum tersedia. Jalankan migrasi terbaru.");
    const destination = firstAllowedBackofficePath(buildContextAccessUser(user, member, { readOnly: !canWorkInStaffAccount }));
    return enterAdminView(member.public_id, destination, isEmployeeContext ? { supervisorPublicId: staffMember.public_id } : {});
  };

  const firstVisibleItem = pagination.totalItems > 0 ? (page - 1) * limit + 1 : 0;
  const lastVisibleItem = Math.min(page * limit, pagination.totalItems);

  return (
    <div className="mx-auto w-full max-w-7xl p-4 md:p-6 xl:p-8">
      <FormDraftStatus guard={createGuard} /><FormDraftStatus guard={editGuard} />
      <AdminPageHeader
        eyebrow="Akses organisasi"
        title="Daftar Staf"
        description="Lihat tabel, akses akun, atau kelola staf sesuai hak akses role dan cakupan unit kerja."
        breadcrumbs={[{ label: "Dasbor", href: "/admin/dashboard" }, { label: "Manajemen Pegawai" }]}
        actions={canCreate ? <Button hierarchy="primary" prefixIcon={<Plus size={17} />} onClick={() => setCreateOpen(true)}>Tambah akun</Button> : null}
      />

      {error && <div className="mb-4"><Alert variant="critical" title="Manajemen pegawai" message={error} /></div>}

      <Card className="overflow-hidden p-0">
        <div className="flex items-center gap-3 border-b border-border-subtle px-5 py-4">
          <span className="rounded-lg bg-primary-100 p-2 text-content-guide"><Users size={19} /></span>
          <div>
            <h2 className="font-bold text-content-primary">Daftar akun kedinasan aktif</h2>
            <p className="text-sm text-content-secondary">Hak akses setiap akun mengikuti matriks role yang ditetapkan Admin.</p>
          </div>
        </div>

        <div className="border-b border-border-subtle bg-page-secondary/40 px-5 py-4">
          <form className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end" onSubmit={submitSearch}>
            <MultipleSearchSelect
              label="Cari akun"
              selected={searchSelections}
              onSelect={(values) => {
                setSearchSelections(values);
                if (!values.length && activeQuery) updateListParams({ q: "", page: 1 });
              }}
              options={[
                ...staff.map((member) => ({ group: "Nama Akun", label: member.full_name, value: member.full_name, description: "Nama pemilik akun" })),
                ...staff.map((member) => ({ group: "Email", label: member.email, value: member.email, description: "Alamat email kedinasan" })),
                ...staff.map((member) => ({ group: "Unit Kerja", label: member.department, value: member.department, description: "Unit atau departemen" })),
                ...staff.map((member) => ({ group: "Role", label: roleName(member.role), value: member.role, description: "Hak akses akun" })),
              ].filter((option) => option.value)}
              placeholder="Ketik lalu pilih nama, email, unit, atau role"
              helperText=""
            />
            <Button type="submit" hierarchy="secondary" prefixIcon={<Search size={16} />} className="w-full sm:w-auto">Cari</Button>
          </form>
        </div>

        {loading || (isAdminViewingUser && staffLoading) ? (
          <div className="space-y-3 p-5">{[1, 2, 3].map((item) => <Skeleton key={item} height="54px" rounded="md" />)}</div>
        ) : staff.length ? (
          <div>
            <div className="kms-admin-native-table-shell max-h-none rounded-none border-x-0">
              <ResponsiveTable label="Daftar staf" summary={[1]} className="kms-admin-native-table kms-staff-responsive min-w-[720px] text-left">
                <thead>
                  <tr><th className="px-5 py-3">Akun</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Unit / Departemen</th><th className="px-4 py-3 text-center">Aset</th><th className="px-4 py-3 text-center">Terbit</th><th className="px-4 py-3 text-center">Dilihat</th><th className="px-5 py-3 text-right">Aksi</th></tr>
                </thead>
                <tbody>
                  {staff.map((member) => (
                    <tr key={member.id}>
                      <td className="px-5 py-3"><p className="font-semibold text-content-primary">{member.full_name}</p><p className="text-xs text-content-secondary">{member.email}</p><details className="kms-mobile-row-details"><summary>Rincian akun</summary><p>{member.department || "Unit belum diisi"}</p><p>{member.asset_count || 0} aset · {member.published_asset_count || 0} terbit · {member.total_view_count || 0} dilihat</p></details></td>
                      <td className="px-4 py-3">
                        <Badge type="soft" variant={member.role === "pimpinan" ? "warning" : member.role === "admin" ? "success" : "info"}>
                          {roleName(member.role)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-content-secondary"><WorkUnitLabel name={member.department} fallback="—" /></td>
                      <td className="px-4 py-3 text-center">{member.asset_count || 0}</td>
                      <td className="px-4 py-3 text-center">{member.published_asset_count || 0}</td>
                      <td className="px-4 py-3 text-center">{member.total_view_count || 0}</td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-2">
                          {canOpenMember(member) && <Tooltip variant="basic" title={canWorkInStaffAccount ? "Buka mode kerja akun sesuai izin role" : "Lihat dashboard akun dalam mode baca-saja"} placement="top" showArrow={true}><Button hierarchy="tertiary" size="sm" prefixIcon={<BarChart3 size={15} />} onClick={() => openStaff(member)}>{canWorkInStaffAccount ? "Akses akun" : "Lihat akun"}</Button></Tooltip>}
                          {canEdit && canChangeMember(member) && <Tooltip variant="basic" title="Edit akun dan hak akses" placement="top" showArrow={true}><Button hierarchy="tertiary" size="sm" aria-label={`Ubah role ${member.full_name}`} onClick={() => openRoleEditor(member)}><Pencil size={16} /></Button></Tooltip>}
                          {canDelete && canChangeMember(member) && (
                            <Tooltip variant="basic" title="Nonaktifkan akun" placement="top" showArrow={true}><Button hierarchy="tertiary" size="sm" aria-label={`Nonaktifkan ${member.full_name}`} onClick={() => setMemberToDelete(member)} disabled={deleting === member.id}><Trash2 size={16} className="text-status-danger" /></Button></Tooltip>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </ResponsiveTable>
            </div>
            <div className="space-y-3 border-t border-border-subtle px-5 py-4">
              <p className="text-sm text-content-secondary">Menampilkan {firstVisibleItem}–{lastVisibleItem} dari {pagination.totalItems} akun</p>
              {pagination.totalPages > 0 && (
                <Pagination
                  currentPage={page}
                  totalPages={pagination.totalPages}
                  pageSize={limit}
                  pageSizeOptions={STAFF_PAGE_SIZE_OPTIONS}
                  onPageChange={(value) => updateListParams({ page: value })}
                  onPageSizeChange={(value) => updateListParams({ limit: value, page: 1 })}
                  fullWidth
                />
              )}
            </div>
          </div>
        ) : (
          <div className="p-5"><EmptyState className="kms-empty-state--compact" icon={Users} title={activeQuery ? "Akun tidak ditemukan" : "Belum ada akun kedinasan"} description={activeQuery ? `Tidak ada akun yang cocok dengan “${activeQuery}”.` : "Akun backoffice aktif dalam cakupan Unit Kerja akan tampil di sini."} actionLabel={activeQuery ? "Hapus pencarian" : undefined} onAction={activeQuery ? () => updateListParams({ q: "", page: 1 }) : undefined} /></div>
        )}
      </Card>

      <Modal open={isCreateOpen} onClose={closeCreate} title="Tambah akun kedinasan" size="md">
        <ValidatedForm busy={saving} className="space-y-4" onSubmit={event => { event.preventDefault(); createStaff(); }} rules={{"Konfirmasi kata sandi": value => value !== form.password ? "Konfirmasi kata sandi belum sama." : ""}}>
          {error && <Alert variant="critical" title="Akun belum tersimpan" message={error} />}
          <p className="text-sm text-content-secondary">Pilih role dan Unit Kerja sebelum membuat akun. Kata sandi awal dapat diganti oleh pemilik akun setelah login.</p>
          {field("fullName", "Nama lengkap")}
          {field("email", "Email", "email")}
          <SelectDropdown required label="Role akses" options={roleOptions} selected={form.role} onSelect={(value) => setForm((previous) => ({ ...previous, role: String(value) }))} searchable indicator="check" />
          <SelectDropdown required label="Unit Kerja" options={workUnitOptions} selected={form.workUnitId} onSelect={(value) => setForm((previous) => ({ ...previous, workUnitId: value }))} placeholder={workUnitsLoading ? "Memuat Unit Kerja..." : "Pilih Unit Kerja"} searchable indicator="check" disabled={workUnitsLoading} />
          {form.workUnitId === "admin" && <Alert variant="caution" title="Cakupan seluruh Eselon" message="Akun dapat menjangkau seluruh unit. Fitur dan tindakan yang diizinkan tetap mengikuti Hak Akses Role; pilihan ini tidak otomatis memberi seluruh izin." />}
          <div className="grid gap-4 sm:grid-cols-2">
            <PasswordInput minLength={8} label="Kata sandi awal" placeholder="Minimal 8 karakter" autoComplete="new-password" value={form.password} onChange={(value) => setForm((previous) => ({ ...previous, password: inputValue(value) }))} helperText="Gunakan minimal 8 karakter." required />
            <PasswordInput label="Konfirmasi kata sandi" placeholder="Ulangi kata sandi" autoComplete="new-password" value={form.confirmPassword} onChange={(value) => setForm((previous) => ({ ...previous, confirmPassword: inputValue(value) }))} required />
          </div>
          <div className="kms-modal-actions flex justify-end gap-2 pt-2">
            <Button hierarchy="secondary" onClick={closeCreate}>Batal</Button>
            <Button hierarchy="primary" type="submit" disabled={saving || workUnitsLoading}>{saving ? "Menyimpan..." : "Tambah akun"}</Button>
          </div>
        </ValidatedForm>
      </Modal>
      <Modal open={Boolean(memberToEdit)} onClose={closeEdit} title="Edit akun" size="md">
        <ValidatedForm busy={saving} className="space-y-5" onSubmit={event => { event.preventDefault(); saveRole(); }}>
          {error && <Alert variant="critical" title="Perubahan belum tersimpan" message={error} />}
          <div className="rounded-lg bg-page-secondary p-4"><p className="font-semibold text-content-primary">{memberToEdit?.full_name}</p><p className="mt-1 text-sm text-content-secondary">{memberToEdit?.email}</p></div>
          <SelectDropdown label="Role baru" options={roleOptions} selected={editedRole} onSelect={(value) => setEditedRole(String(value))} searchable indicator="check" />
          <SelectDropdown required label="Unit Kerja" options={workUnitOptions} selected={editedWorkUnitId} onSelect={(value) => setEditedWorkUnitId(String(value))} placeholder={workUnitsLoading ? "Memuat Unit Kerja..." : "Pilih Unit Kerja"} searchable indicator="check" disabled={workUnitsLoading} />
          {editedWorkUnitId === "admin" && <Alert variant="caution" title="Cakupan seluruh Eselon" message="Pilihan Admin mencakup seluruh unit, bukan bagian struktur Eselon. Hak Akses Role tetap membatasi tindakan akun." />}
          <Alert variant="caution" title="Sesi akun akan diakhiri" message="Role dan Unit Kerja menentukan halaman serta cakupan analitik yang boleh dilihat. Pemilik akun perlu login kembali setelah perubahan disimpan." />
          <div className="kms-modal-actions flex justify-end gap-2"><Button hierarchy="secondary" onClick={closeEdit} disabled={saving}>Batal</Button><Button hierarchy="primary" type="submit" disabled={saving || !editedWorkUnitId || (editedRole === memberToEdit?.role && editedWorkUnitId === String(memberToEdit?.work_unit_id || ""))}>{saving ? "Menyimpan…" : "Simpan akses"}</Button></div>
        </ValidatedForm>
      </Modal>
      <Modal open={Boolean(memberToDelete)} onClose={() => !deleting && setMemberToDelete(null)} title="Nonaktifkan akun kedinasan" size="md">
        <div className="space-y-5"><Alert variant="caution" title="Akun tidak dapat login setelah dinonaktifkan" message="Aset, komentar, dan riwayat tindakan tetap disimpan agar informasi organisasi tidak hilang." /><div className="rounded-lg bg-page-secondary p-4"><p className="font-semibold text-content-primary">{memberToDelete?.full_name}</p><p className="mt-1 text-sm text-content-secondary">{memberToDelete?.email}</p></div><div className="kms-modal-actions flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button hierarchy="secondary" onClick={() => setMemberToDelete(null)} disabled={Boolean(deleting)}>Batal</Button><Button hierarchy="primary" className="!border-status-danger !bg-status-danger" onClick={() => removeStaff(memberToDelete)} disabled={Boolean(deleting)}>{deleting ? "Menonaktifkan…" : "Nonaktifkan akun"}</Button></div></div>
      </Modal>
    </div>
  );
}
