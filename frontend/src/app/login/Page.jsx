import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Building2, LogIn, Mail } from "lucide-react";
import { Alert, Button, PasswordInput, Spinner, TextField, useToast } from "@idds/react";
import AuthLayout from "../../components/AuthLayout";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import { firstAllowedBackofficePath } from "../../lib/permissions";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { confirmLogin, loading: sessionLoading } = useAuth();
  const isStaffLogin = location.pathname === "/login/pegawai";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (event) => {
    event.preventDefault();
    if (sessionLoading) return;
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch("/api/users/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password, audience: isStaffLogin ? "backoffice" : "public" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Terjadi kesalahan saat masuk");

      const authenticatedUser = await confirmLogin(data.user);
      toast({ state: "positive", title: "Login berhasil", description: `Selamat datang, ${authenticatedUser.full_name || "pengguna"}.`, duration: 3000, position: "top-right" });
      const requestedRedirect = new URLSearchParams(location.search).get("redirect") || location.state?.from;
      const safeRedirect = typeof requestedRedirect === "string"
        && requestedRedirect.startsWith("/")
        && !requestedRedirect.startsWith("//")
        && !["/login", "/login/pegawai", "/register"].includes(requestedRedirect)
        ? requestedRedirect
        : null;
      navigate(safeRedirect || (isStaffLogin ? firstAllowedBackofficePath(authenticatedUser) : "/"), { replace: true });
    } catch (requestError) {
      setError(requestError.message);
      toast({ state: "destructive", title: "Login belum berhasil", description: requestError.message, duration: 4000, position: "top-right" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      eyebrow="AKSES AKUN"
      title={isStaffLogin ? "Akses Ruang Kedinasan" : "Masuk ke KMS Kemenhub"}
      description={isStaffLogin ? "Masuk menggunakan akun kedinasan yang dikelola administrator KMS." : "Masuk untuk membaca dan berpartisipasi dalam diskusi pengetahuan."}
    >
      {location.state?.registrationSuccess && <Alert className="mb-4" variant="success" title="Pendaftaran berhasil" message="Silakan masuk menggunakan akun baru Anda." />}
      {error && <Alert className="mb-4" variant="critical" title="Belum dapat masuk" message={error} />}

      {isStaffLogin && <div className="kms-auth-staff-label mb-4"><Building2 size={16} /><span>Portal Pegawai, Pimpinan, dan Admin</span></div>}

      <form onSubmit={handleLogin} className="kms-auth-login-form">
        <TextField size="sm" label="Alamat email" placeholder={isStaffLogin ? "nama@kemenhub.go.id" : "nama@email.com"} type="email" autoComplete="email" value={email} onChange={setEmail} prefixIcon={<Mail size={16} />} disabled={sessionLoading || loading} required />
        <PasswordInput size="sm" label="Kata sandi" placeholder="Masukkan kata sandi" autoComplete="current-password" value={password} onChange={setPassword} disabled={sessionLoading || loading} required />
        <Button type="submit" hierarchy="primary" size="md" className="kms-auth-submit w-full justify-center" disabled={sessionLoading || loading} prefixIcon={(sessionLoading || loading) ? <Spinner size={17} borderWidth="medium" color="inherit" spinnerOnly /> : <LogIn size={16} />}>{sessionLoading ? "Memeriksa sesi..." : loading ? "Memproses..." : "Masuk"}</Button>
      </form>

      {isStaffLogin && <p className="kms-auth-note">Akses ini khusus akun kedinasan yang diterbitkan atau dikelola administrator KMS Kemenhub.</p>}
    </AuthLayout>
  );
}
