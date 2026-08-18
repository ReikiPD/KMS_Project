import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Building2, LogIn, Mail, ShieldCheck, User } from "lucide-react";
import { Alert, Button, PasswordInput, TextField, useToast } from "@idds/react";
import AuthLayout from "../../components/AuthLayout";
import { API_BASE_URL } from "../../lib/api";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [loginType, setLoginType] = useState("publik");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const isAdmin = loginType === "admin";
      const response = await fetch(`${API_BASE_URL}/api/users/${isAdmin ? "admin/login" : "login"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password, audience: loginType === "publik" ? "public" : "backoffice" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Terjadi kesalahan saat masuk");

      localStorage.setItem("kms_token", data.token);
      localStorage.setItem("kms_user", JSON.stringify(data.user));
      window.dispatchEvent(new Event("kms-user-updated"));
      toast({ state: "positive", title: "Login berhasil", description: `Selamat datang, ${data.user.full_name || "pengguna"}.`, duration: 3000, position: "top-right" });
      const requestedRedirect = new URLSearchParams(location.search).get("redirect") || location.state?.from;
      const safeRedirect = typeof requestedRedirect === "string" && requestedRedirect.startsWith("/") && !requestedRedirect.startsWith("//") ? requestedRedirect : null;
      navigate(safeRedirect || (["pegawai", "pimpinan", "admin"].includes(data.user.role) ? "/admin/dashboard" : "/"));
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
      title="Masuk ke KMS Kemenhub"
      description="Masuk untuk berkomentar atau mengelola pengetahuan sesuai peran Anda."
      formFooter={<p>Belum memiliki akun? <Link to="/register">Daftar sebagai pengguna</Link></p>}
    >
      {location.state?.registrationSuccess && <Alert className="mb-4" variant="success" title="Pendaftaran berhasil" message="Silakan masuk menggunakan akun baru Anda." />}
      {error && <Alert className="mb-4" variant="critical" title="Belum dapat masuk" message={error} />}

      <div className="kms-login-tabs mb-4 grid grid-cols-3 p-1" role="tablist" aria-label="Jenis akun">
        <button type="button" role="tab" aria-selected={loginType === "publik"} onClick={() => setLoginType("publik")} className={`flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-semibold transition ${loginType === "publik" ? "kms-login-tab--active" : "kms-login-tab--idle"}`}><User size={15} />Pengguna</button>
        <button type="button" role="tab" aria-selected={loginType === "pegawai"} onClick={() => setLoginType("pegawai")} className={`flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-semibold transition ${loginType === "pegawai" ? "kms-login-tab--active" : "kms-login-tab--idle"}`}><Building2 size={15} />Pegawai</button>
        <button type="button" role="tab" aria-selected={loginType === "admin"} onClick={() => setLoginType("admin")} className={`flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-semibold transition ${loginType === "admin" ? "kms-login-tab--active" : "kms-login-tab--idle"}`}><ShieldCheck size={15} />Admin</button>
      </div>

      <form onSubmit={handleLogin} className="kms-auth-login-form">
        <TextField size="sm" label={loginType === "publik" ? "Alamat email" : "Email"} placeholder={loginType === "publik" ? "nama@email.com" : "nama@kemenhub.go.id"} type="email" autoComplete="email" value={email} onChange={setEmail} prefixIcon={<Mail size={16} />} required />
        <PasswordInput size="sm" label="Kata sandi" placeholder="Masukkan kata sandi" autoComplete="current-password" value={password} onChange={setPassword} required />
        <Button type="submit" hierarchy="primary" size="md" className="kms-auth-submit w-full justify-center" disabled={loading} prefixIcon={<LogIn size={16} />}>{loading ? "Memproses..." : "Masuk"}</Button>
      </form>

      {loginType === "pegawai" && <p className="kms-auth-note">Akun Pegawai dan Pimpinan diterbitkan oleh administrator KMS Kemenhub.</p>}
      {loginType === "admin" && <p className="kms-auth-note">Akun Admin dikelola melalui konfigurasi server dan tidak disimpan sebagai pengguna aplikasi.</p>}
    </AuthLayout>
  );
}
