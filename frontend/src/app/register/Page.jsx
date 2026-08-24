import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Building2, Mail, UserPlus } from "lucide-react";
import { Alert, Button, PasswordInput, Spinner, TextField, useToast } from "@idds/react";
import AuthLayout from "../../components/AuthLayout";
import { apiFetch } from "../../lib/api";

export default function RegisterPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [form, setForm] = useState({ fullName: "", email: "", department: "", password: "", confirmPassword: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const updateField = (field) => (value) => setForm((current) => ({ ...current, [field]: value }));

  const handleRegister = async (event) => {
    event.preventDefault();
    setError("");
    if (form.password.length < 8) {
      const message = "Kata sandi minimal terdiri dari 8 karakter.";
      setError(message);
      toast({ state: "destructive", title: "Pendaftaran belum dapat dilanjutkan", description: message, duration: 4000, position: "top-right" });
      return;
    }
    if (form.password !== form.confirmPassword) {
      const message = "Konfirmasi kata sandi belum sama.";
      setError(message);
      toast({ state: "destructive", title: "Pendaftaran belum dapat dilanjutkan", description: message, duration: 4000, position: "top-right" });
      return;
    }

    setSaving(true);
    try {
      const response = await apiFetch("/api/users/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: form.fullName.trim(), email: form.email.trim(), department: form.department.trim() || null, password: form.password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Pendaftaran belum dapat diproses");
      toast({ state: "positive", title: "Pendaftaran berhasil", description: "Akun Anda siap digunakan. Silakan masuk.", duration: 3500, position: "top-right" });
      navigate("/login", { replace: true, state: { registrationSuccess: true } });
    } catch (requestError) {
      setError(requestError.message);
      toast({ state: "destructive", title: "Pendaftaran belum berhasil", description: requestError.message, duration: 4000, position: "top-right" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AuthLayout
      eyebrow="PENDAFTARAN PENGGUNA"
      title="Buat akun KMS Anda"
      description="Daftar sebagai pengguna untuk ikut berdiskusi dan membagikan pengetahuan yang bermanfaat."
      formFooter={<p>Sudah memiliki akun? <Link to="/login">Masuk sekarang</Link></p>}
    >
      {error && <Alert className="mb-4" variant="critical" title="Pendaftaran belum berhasil" message={error} />}
      <form onSubmit={handleRegister} className="kms-register-form">
        <TextField size="sm" label="Nama lengkap" placeholder="Masukkan nama lengkap" autoComplete="name" value={form.fullName} onChange={updateField("fullName")} prefixIcon={<UserPlus size={16} />} maxLength={150} required />
        <TextField size="sm" label="Alamat email" placeholder="nama@email.com" type="email" autoComplete="email" value={form.email} onChange={updateField("email")} prefixIcon={<Mail size={16} />} maxLength={150} required />
        <TextField size="sm" className="kms-register-field-wide" label="Instansi / organisasi" placeholder="Opsional" autoComplete="organization" value={form.department} onChange={updateField("department")} prefixIcon={<Building2 size={16} />} maxLength={100} helperText="Opsional; untuk konteks kontribusi Anda." />
        <div className="kms-register-passwords grid gap-3.5 sm:grid-cols-2">
          <PasswordInput size="sm" label="Kata sandi" placeholder="Minimal 8 karakter" autoComplete="new-password" value={form.password} onChange={updateField("password")} required />
          <PasswordInput size="sm" label="Konfirmasi kata sandi" placeholder="Ulangi kata sandi" autoComplete="new-password" value={form.confirmPassword} onChange={updateField("confirmPassword")} required />
        </div>
        <Button type="submit" hierarchy="primary" size="md" className="kms-auth-submit kms-register-field-wide w-full justify-center" disabled={saving} prefixIcon={saving ? <Spinner size={17} borderWidth="medium" color="inherit" spinnerOnly /> : <UserPlus size={16} />}>{saving ? "Mendaftarkan..." : "Buat akun"}</Button>
      </form>
      <p className="kms-auth-note">Pendaftaran ini hanya membuat akun pengguna publik. Akun pegawai dikelola oleh administrator KMS Kemenhub.</p>
    </AuthLayout>
  );
}
