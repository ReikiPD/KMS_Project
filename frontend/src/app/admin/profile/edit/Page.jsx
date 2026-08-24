import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, Avatar, Button, CardPlain, FileUpload, Modal, PasswordInput, Skeleton, TextField, useToast } from "@idds/react";
import { Camera, KeyRound, Save, UserRound } from "lucide-react";
import AdminPageHeader from "../../../../components/AdminPageHeader";
import { apiFetch, avatarUrl, currentUser, inputValue } from "../../../../lib/api";

const initials = (name) => (name || "KM").split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

export default function EditProfilePage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({ fullName: "", email: "", department: "" });
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarError, setAvatarError] = useState("");
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [passwordError, setPasswordError] = useState("");
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const loadProfile = async () => {
      try {
        const response = await apiFetch("/api/users/profile", { auth: true, signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Gagal memuat profil");
        if (controller.signal.aborted) return;
        setProfile(data);
        setForm({ fullName: data.full_name || "", email: data.email || "", department: data.department || "" });
      } catch (loadError) {
        if (loadError.name !== "AbortError") setError(loadError.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    loadProfile();
    return () => controller.abort();
  }, []);

  const updateField = (field) => (value) => setForm((previous) => ({ ...previous, [field]: inputValue(value) }));
  const updatePasswordField = (field) => (value) => setPasswordForm((previous) => ({ ...previous, [field]: inputValue(value) }));
  const handleAvatarChange = (files, errors) => {
    if (errors?.length) {
      const message = errors[0].error || errors[0].message || "Avatar tidak valid";
      setAvatarError(message);
      setError(message);
      setAvatarFile(null);
      return;
    }
    setAvatarError("");
    setError("");
    setAvatarFile(files?.[0] || null);
  };
  const handleAvatarRemove = () => { setAvatarFile(null); setAvatarError(""); };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    if (avatarError) return setError(avatarError);
    setSaving(true);
    try {
      let uploadedAvatar = null;
      if (avatarFile) {
        const avatarPayload = new FormData();
        avatarPayload.append("avatar", avatarFile, avatarFile.name);
        const avatarResponse = await apiFetch("/api/users/profile/avatar", { method: "PATCH", auth: true, body: avatarPayload });
        uploadedAvatar = await avatarResponse.json();
        if (!avatarResponse.ok) throw new Error(uploadedAvatar.error || "Gagal mengunggah avatar");
        if (!uploadedAvatar.avatar_url) throw new Error("Avatar belum tersimpan. Pastikan backend sudah dijalankan ulang.");
      }
      const profileResponse = await apiFetch("/api/users/profile", { method: "PATCH", auth: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      let updatedProfile = await profileResponse.json();
      if (!profileResponse.ok) throw new Error(updatedProfile.error || "Gagal menyimpan profil");
      if (uploadedAvatar?.avatar_url && !updatedProfile.avatar_url) updatedProfile = { ...updatedProfile, avatar_url: uploadedAvatar.avatar_url };
      setProfile(updatedProfile);
      setAvatarFile(null);
      localStorage.setItem("kms_user", JSON.stringify({ ...(currentUser() || {}), ...updatedProfile }));
      window.dispatchEvent(new Event("kms-user-updated"));
      toast({ title: uploadedAvatar ? "Profil dan avatar berhasil diperbarui" : "Profil berhasil diperbarui", state: "positive", position: "top-right" });
      navigate("/admin/profile");
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  const closePasswordModal = () => {
    if (savingPassword) return;
    setPasswordModalOpen(false);
    setPasswordError("");
    setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
  };
  const handlePasswordSubmit = async (event) => {
    event.preventDefault();
    setPasswordError("");
    if (passwordForm.newPassword !== passwordForm.confirmPassword) return setPasswordError("Konfirmasi kata sandi baru belum sama.");
    setSavingPassword(true);
    try {
      const response = await apiFetch("/api/users/profile/password", { method: "PATCH", auth: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify(passwordForm) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Gagal memperbarui kata sandi");
      toast({ title: "Kata sandi berhasil diperbarui", state: "positive", position: "top-right" });
      setPasswordModalOpen(false);
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (saveError) {
      setPasswordError(saveError.message);
    } finally {
      setSavingPassword(false);
    }
  };

  if (loading) return <div className="mx-auto w-full max-w-5xl p-4 md:p-6 xl:p-8"><Skeleton height="28px" width="32%" /><Skeleton height="460px" rounded="lg" className="mt-5" /></div>;

  return <div className="mx-auto w-full max-w-5xl p-4 md:p-6 xl:p-8">
    <AdminPageHeader compact eyebrow={currentUser()?.role === "pimpinan" ? "Akun Pimpinan" : "Akun Pegawai"} title="Edit Profil" description="Perbarui informasi kontak dan foto. Kata sandi dikelola melalui dialog terpisah." breadcrumbs={[{ label: "Dasbor", href: "/admin/dashboard" }, { label: "Profil Saya", href: "/admin/profile" }, { label: "Edit Profil" }]} actions={<Button hierarchy="tertiary" onClick={() => navigate("/admin/profile")}>Batal</Button>} />
    {error && <div className="mb-4"><Alert variant="critical" title="Perubahan belum tersimpan" message={error} /></div>}
    <form onSubmit={handleSubmit}>
      <CardPlain className="kms-profile-surface p-5 md:p-6">
        <section>
          <div className="flex items-center gap-3"><span className="kms-admin-metric-icon"><UserRound size={19} /></span><div><h2 className="text-base font-bold text-content-primary">Identitas pegawai</h2><p className="mt-0.5 text-sm text-content-secondary">Pastikan nama, email, dan unit kerja selalu mutakhir.</p></div></div>
          <div className="mt-5 grid gap-4 md:grid-cols-3"><TextField label="Nama lengkap" value={form.fullName} onChange={updateField("fullName")} placeholder="Masukkan nama lengkap" /><TextField label="Email" type="email" value={form.email} onChange={updateField("email")} placeholder="nama@kemenhub.go.id" /><TextField label="Unit / Departemen" value={form.department} onChange={updateField("department")} placeholder="Direktorat ..." /></div>
        </section>
        <section className="mt-5 border-t border-border-subtle pt-5">
          <div className="flex items-center gap-3"><span className="kms-admin-metric-icon kms-admin-metric-icon--teal"><Camera size={19} /></span><div><h2 className="text-base font-bold text-content-primary">Foto profil</h2><p className="mt-0.5 text-sm text-content-secondary">Unggah JPG, PNG, atau WebP maksimal 2 MB bila ingin mengganti foto.</p></div></div>
          <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-start"><Avatar src={avatarUrl(profile?.avatar_url) || undefined} alt={profile?.full_name || "Foto profil"} initials={initials(profile?.full_name)} size={48} shape="square" className="kms-edit-profile-photo" /><div className="min-w-0 flex-1"><FileUpload label="Pilih foto baru" title="Unggah foto profil" description="Foto baru disimpan bersama perubahan profil." type="image/jpeg,image/png,image/webp" allowedExtensions={["jpg", "jpeg", "png", "webp"]} maxSize={2 * 1024 * 1024} onChange={handleAvatarChange} onRemove={handleAvatarRemove} disabled={saving} />{avatarFile && <p className="mt-2 text-xs font-medium text-content-secondary">Siap diunggah: {avatarFile.name}</p>}</div></div>
        </section>
        <section className="mt-5 flex flex-col gap-3 border-t border-border-subtle pt-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold text-content-primary">Keamanan akun</p><p className="mt-0.5 text-xs text-content-secondary">Perbarui kata sandi tanpa meninggalkan halaman ini.</p></div><Button hierarchy="secondary" type="button" onClick={() => setPasswordModalOpen(true)} prefixIcon={<KeyRound size={16} />}>Ubah kata sandi</Button></section>
      </CardPlain>
      <div className="mt-4 flex justify-end gap-3"><Button hierarchy="tertiary" type="button" onClick={() => navigate("/admin/profile")}>Batal</Button><Button hierarchy="primary" type="submit" disabled={saving} prefixIcon={<Save size={17} />}>{saving ? "Menyimpan..." : "Simpan perubahan"}</Button></div>
    </form>
    <Modal open={passwordModalOpen} onClose={closePasswordModal} title="Ubah kata sandi" size="sm"><form className="space-y-4" onSubmit={handlePasswordSubmit}>{passwordError && <Alert variant="critical" message={passwordError} />}<PasswordInput label="Kata sandi saat ini" value={passwordForm.currentPassword} onChange={updatePasswordField("currentPassword")} /><PasswordInput label="Kata sandi baru" value={passwordForm.newPassword} onChange={updatePasswordField("newPassword")} helperText="Minimal 8 karakter." /><PasswordInput label="Konfirmasi kata sandi baru" value={passwordForm.confirmPassword} onChange={updatePasswordField("confirmPassword")} /><div className="flex justify-end gap-3 pt-2"><Button hierarchy="secondary" type="button" onClick={closePasswordModal}>Batal</Button><Button hierarchy="primary" type="submit" disabled={savingPassword}>{savingPassword ? "Menyimpan..." : "Simpan kata sandi"}</Button></div></form></Modal>
  </div>;
}
