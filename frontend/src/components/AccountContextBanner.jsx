import { Button } from "@idds/react";
import { ArrowLeft, Eye, Pencil } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import useAdminView from "../hooks/useAdminView";

export default function AccountContextBanner() {
  const { user } = useAuth();
  const { isEmployeeContext, staffMember, accessUser, isNestedScopedContext, exitEmployeeContext } = useAdminView();
  if (!isEmployeeContext || !staffMember) return null;
  const readOnly = Boolean(accessUser?.read_only);
  return <div className="kms-context-banner" role="region" aria-label="Konteks akun aktif">
    <div><strong>{readOnly ? <Eye size={15} className="inline" /> : <Pencil size={15} className="inline" />} {readOnly ? "Baca-saja" : "Mode kerja"} · {staffMember.full_name}</strong><small>Diakses oleh {user?.full_name || "akun utama"} · {accessUser?.organization_scope === "all" ? "Seluruh kementerian" : staffMember.work_unit_name || "Cakupan unit akun"}</small></div>
    <Button size="sm" hierarchy="secondary" prefixIcon={<ArrowLeft size={15} />} onClick={exitEmployeeContext}>{isNestedScopedContext ? "Kembali ke akun sebelumnya" : "Kembali ke akun utama"}</Button>
  </div>;
}
