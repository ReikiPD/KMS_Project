import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, Avatar, Button, CardPlain, Skeleton } from "@idds/react";
import { Mail, Pencil, UserRound } from "lucide-react";
import AdminPageHeader from "../../../components/AdminPageHeader";
import WorkUnitLabel from "../../../components/WorkUnitLabel";
import { apiFetch, avatarUrl } from "../../../lib/api";
import { useAuth } from "../../../contexts/AuthContext";

const initials = (name) => (name || "KM").split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
const displayDate = (value) => value ? new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" }).format(new Date(value)) : "-";

export default function ProfilePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const accountRole = user?.role;
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const loadProfile = async () => {
      try {
        const response = await apiFetch("/api/users/profile", { auth: true, signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Gagal memuat profil");
        if (!controller.signal.aborted) setProfile(data);
      } catch (loadError) {
        if (loadError.name !== "AbortError") setError(loadError.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    loadProfile();
    return () => controller.abort();
  }, []);

  if (loading) return <div className="mx-auto w-full max-w-6xl p-4 md:p-6 xl:p-8"><Skeleton height="28px" width="32%" /><div className="mt-5 grid gap-4 lg:grid-cols-[18rem_1fr]"><Skeleton height="300px" rounded="lg" /><Skeleton height="300px" rounded="lg" /></div></div>;

  return <div className="mx-auto w-full max-w-6xl p-4 md:p-6 xl:p-8">
    <AdminPageHeader compact eyebrow={accountRole === "pimpinan" ? "Akun Pimpinan" : "Akun Pegawai"} title="Profil Saya" description="Identitas akun dan informasi yang tampil pada kontribusi Anda." breadcrumbs={[{ label: "Dasbor", href: "/admin/dashboard" }, { label: "Profil Saya" }]} actions={<Button hierarchy="primary" onClick={() => navigate("/admin/profile/edit")} prefixIcon={<Pencil size={16} />}>Edit profil</Button>} />
    {error ? <Alert variant="critical" title="Profil tidak dapat dimuat" message={error} /> : profile && <div className="grid items-start gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <CardPlain className="kms-profile-surface kms-profile-identity-card h-fit p-4 text-center">
        <Avatar src={avatarUrl(profile.avatar_url) || undefined} alt={profile.full_name} initials={initials(profile.full_name)} size={48} shape="square" className="kms-profile-avatar-tile mx-auto" />
        <p className="mt-4 text-xs font-bold uppercase tracking-[0.08em] text-content-secondary">Akun aktif</p>
        <h2 className="mt-1 break-words text-lg font-bold text-content-primary">{profile.full_name}</h2>
        <p className="mt-1 text-sm text-content-secondary">{profile.role === "pegawai" ? "Pegawai Kemenhub" : profile.role === "pimpinan" ? "Pimpinan Kemenhub" : "Pengguna KMS"}</p>
        <Button hierarchy="secondary" size="sm" className="mt-5 w-full justify-center" onClick={() => navigate("/admin/profile/edit")}>Ubah profil</Button>
      </CardPlain>

      <CardPlain className="kms-profile-surface kms-profile-information-card h-fit p-5">
        <div className="flex items-center gap-3"><span className="kms-admin-metric-icon"><UserRound size={19} /></span><div><h2 className="text-base font-bold text-content-primary">Informasi akun</h2><p className="mt-0.5 text-sm text-content-secondary">Ringkasan data profil Anda.</p></div></div>
        <dl className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="kms-profile-detail"><dt>Nama lengkap</dt><dd>{profile.full_name}</dd></div>
          <div className="kms-profile-detail"><dt className="flex items-center gap-1.5"><Mail size={14} /> Email</dt><dd>{profile.email}</dd></div>
          <div className="kms-profile-detail"><dt>Unit / Departemen</dt><dd><WorkUnitLabel name={profile.department} fallback="Belum diisi" /></dd></div>
          <div className="kms-profile-detail"><dt>Bergabung sejak</dt><dd>{displayDate(profile.created_at)}</dd></div>
        </dl>
      </CardPlain>
    </div>}
  </div>;
}
