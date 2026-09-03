import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Modal,
  SelectDropdown,
  SingleFileUpload,
  Skeleton,
  TextArea,
  TextField,
  Toggle,
  Tooltip,
  useToast,
} from "@idds/react";
import { Edit, Image as ImageIcon, Megaphone, Plus, Search, Trash2 } from "lucide-react";
import AdminPageHeader from "../../../components/AdminPageHeader";
import EmptyState from "../../../components/EmptyState";
import { apiFetch, apiUpload, inputValue, uploadUrl } from "../../../lib/api";
import { useAuth } from "../../../contexts/AuthContext";
import useAdminView from "../../../hooks/useAdminView";
import { hasPermission } from "../../../lib/permissions";

const EMPTY_FORM = {
  announcementType: "plain",
  assetId: "",
  title: "",
  content: "",
  linkUrl: "",
  linkLabel: "Lihat selengkapnya",
  displayOrder: "0",
  isPublished: false,
};

export default function AnnouncementsPage() {
  const { user: authenticatedUser } = useAuth();
  const { accessUser } = useAdminView();
  const user = accessUser || authenticatedUser;
  const canCreate = hasPermission(user, "announcements", "post");
  const canEdit = hasPermission(user, "announcements", "edit");
  const canDelete = hasPermission(user, "announcements", "delete");
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [assetOptions, setAssetOptions] = useState([]);
  const [assetsLoading, setAssetsLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [removeImage, setRemoveImage] = useState(false);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setAssetsLoading(true);
    setError("");
    try {
      const [response, assetsResponse] = await Promise.all([
        apiFetch("/api/announcements/admin", { auth: true }),
        apiFetch("/api/announcements/admin/assets", { auth: true }),
      ]);
      const [result, assetsResult] = await Promise.all([response.json(), assetsResponse.json()]);
      if (!response.ok) throw new Error(result.error || "Gagal memuat pengumuman");
      if (!assetsResponse.ok) throw new Error(assetsResult.error || "Gagal memuat pilihan aset");
      setItems(Array.isArray(result) ? result : []);
      setAssetOptions(Array.isArray(assetsResult) ? assetsResult : []);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
      setAssetsLoading(false);
    }
  }, []);

  useEffect(() => { loadItems(); }, [loadItems]);

  const filteredItems = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("id-ID");
    if (!term) return items;
    return items.filter((item) => `${item.title} ${item.content} ${item.asset?.title || ""}`.toLocaleLowerCase("id-ID").includes(term));
  }, [items, query]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditTarget(null);
    setImageFile(null);
    setRemoveImage(false);
    setError("");
  };

  const openCreate = () => {
    resetForm();
    setFormOpen(true);
  };

  const openEdit = (item) => {
    setEditTarget(item);
    setForm({
      announcementType: item.asset ? "asset" : "plain",
      assetId: item.asset?.public_id || "",
      title: item.title || "",
      content: item.content || "",
      linkUrl: item.link_url || "",
      linkLabel: item.link_label || "Lihat selengkapnya",
      displayOrder: String(item.display_order ?? 0),
      isPublished: item.is_published === true,
    });
    setImageFile(null);
    setRemoveImage(false);
    setError("");
    setFormOpen(true);
  };

  const closeForm = () => {
    if (saving) return;
    setFormOpen(false);
    resetForm();
  };

  const updateForm = (key, value) => {
    setError("");
    setForm((current) => ({ ...current, [key]: value }));
  };

  const selectAnnouncementType = (value) => {
    setError("");
    setForm((current) => ({
      ...current,
      announcementType: value,
      assetId: "",
      linkUrl: value === "asset" ? "" : current.linkUrl,
      linkLabel: value === "asset"
        ? (current.linkLabel === "Lihat selengkapnya" ? "Lihat pengetahuan" : current.linkLabel)
        : (current.linkLabel === "Lihat pengetahuan" ? "Lihat selengkapnya" : current.linkLabel),
    }));
  };

  const saveAnnouncement = async (event) => {
    event.preventDefault();
    if (!form.title.trim() || !form.content.trim()) {
      setError("Judul dan isi pengumuman wajib diisi.");
      return;
    }
    if (form.announcementType === "asset" && !form.assetId) {
      setError("Pilih aset yang akan dijadikan referensi pengumuman.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = new FormData();
      Object.entries(form).forEach(([key, value]) => payload.append(key, String(value)));
      payload.append("removeImage", String(removeImage));
      if (imageFile) payload.append("image", imageFile);
      const response = await apiUpload(editTarget ? `/api/announcements/${editTarget.public_id}` : "/api/announcements", {
        method: editTarget ? "PUT" : "POST",
        auth: true,
        body: payload,
      });
      if (!response.ok) throw new Error(response.data?.error || "Pengumuman belum dapat disimpan");
      toast({
        state: "positive",
        title: editTarget ? "Perubahan tersimpan" : "Pengumuman dibuat",
        description: form.isPublished ? "Pengumuman tampil di beranda publik." : "Pengumuman disimpan sebagai draf.",
        duration: 3500,
      });
      setFormOpen(false);
      resetForm();
      await loadItems();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  const selectedAsset = assetOptions.find((asset) => asset.public_id === form.assetId);
  const selectableAssets = assetOptions.map((asset) => ({
    label: asset.title,
    value: asset.public_id,
    description: `${asset.asset_type === "video" ? "Video" : "Dokumen"} · ${asset.parent_work_unit_alias || asset.parent_work_unit_name || asset.work_unit_alias || asset.work_unit_name || "Tanpa unit kerja"}`,
  }));

  const deleteAnnouncement = async () => {
    if (!deleteTarget || saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await apiFetch(`/api/announcements/${deleteTarget.public_id}`, { method: "DELETE", auth: true });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Pengumuman belum dapat dihapus");
      setDeleteTarget(null);
      toast({ state: "positive", title: "Pengumuman dihapus", description: "Pengumuman tidak lagi tampil di beranda.", duration: 3000 });
      await loadItems();
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl p-4 md:p-6 xl:p-8">
      <AdminPageHeader
        eyebrow="Informasi Publik"
        title="Pengumuman"
        description="Kelola informasi penting yang ditampilkan pada beranda KMS Kemenhub."
        breadcrumbs={[{ label: "Dasbor", href: "/admin/dashboard" }, { label: "Pengumuman" }]}
        actions={canCreate ? <Button hierarchy="primary" prefixIcon={<Plus size={17} />} onClick={openCreate}>Tambah pengumuman</Button> : null}
      />

      {error && !formOpen && <div className="mb-5"><Alert variant="critical" title="Pengumuman belum dapat diproses" message={error} /></div>}

      <Card className="p-5 md:p-6">
        <div className="mb-5 max-w-xl">
          <TextField label="Cari pengumuman" value={query} onChange={(value) => setQuery(inputValue(value))} placeholder="Judul atau isi pengumuman" prefixIcon={<Search size={16} />} />
        </div>
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2">{[1, 2, 3, 4].map((item) => <Skeleton key={item} height="190px" rounded="lg" />)}</div>
        ) : filteredItems.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {filteredItems.map((item) => (
              <article key={item.public_id} className="overflow-hidden rounded-xl border border-outline-secondary bg-page-primary">
                {item.image_url || item.asset?.thumbnail_url ? <img src={uploadUrl(item.image_url || item.asset.thumbnail_url)} alt="" className="aspect-[16/7] w-full object-cover" /> : <div className="flex aspect-[16/7] items-center justify-center bg-page-secondary text-content-guide"><ImageIcon size={34} /></div>}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><h2 className="line-clamp-2 font-bold text-content-primary">{item.title}</h2><p className="mt-1 line-clamp-2 text-sm leading-6 text-content-secondary">{item.content}</p></div>
                    <Badge type="soft" variant={item.is_published ? "success" : "warning"} size="sm">{item.is_published ? "Publik" : "Draf"}</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge type="soft" variant={item.asset ? "brand" : "neutral"} size="sm">{item.asset ? "Referensi aset" : "Pengumuman biasa"}</Badge>
                    {item.asset && !item.asset_is_available && <Badge type="soft" variant="warning" size="sm">Aset tidak tampil publik</Badge>}
                  </div>
                  {item.asset && <p className="mt-2 line-clamp-1 text-xs text-content-secondary">Aset: {item.asset.title}</p>}
                  <div className="mt-4 flex items-center justify-between gap-3 border-t border-outline-secondary pt-3">
                    <span className="text-xs text-content-secondary">Urutan {item.display_order}</span>
                    <div className="flex gap-1">
                      {canEdit && <Tooltip variant="basic" title="Edit pengumuman" placement="top" showArrow><Button hierarchy="tertiary" size="sm" aria-label={`Edit ${item.title}`} onClick={() => openEdit(item)}><Edit size={16} /></Button></Tooltip>}
                      {canDelete && <Tooltip variant="basic" title="Hapus pengumuman" placement="top" showArrow><Button hierarchy="tertiary" size="sm" aria-label={`Hapus ${item.title}`} onClick={() => setDeleteTarget(item)}><Trash2 size={16} className="text-content-secondary hover:text-status-danger" /></Button></Tooltip>}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : <EmptyState icon={Megaphone} title={query ? "Pengumuman tidak ditemukan" : "Belum ada pengumuman"} description={query ? "Coba gunakan kata kunci lain." : "Buat pengumuman pertama untuk ditampilkan di beranda."} actionLabel={!query ? "Tambah pengumuman" : undefined} onAction={!query ? openCreate : undefined} />}
      </Card>

      <Modal open={formOpen} onClose={closeForm} title={editTarget ? "Edit pengumuman" : "Tambah pengumuman"} dialogClassname="ina-modal__dialog--size-lg">
        <p className="mb-5 text-sm text-content-secondary">Gunakan bahasa singkat dan jelas. Pengumuman dapat berdiri sendiri atau mengarahkan pengguna ke aset pengetahuan terbit.</p>
        {error && <div className="mb-4"><Alert variant="critical" title="Pengumuman belum tersimpan" message={error} /></div>}
        <form onSubmit={saveAnnouncement} className="grid gap-4">
          <SelectDropdown
            label="Jenis pengumuman"
            options={[
              { label: "Pengumuman biasa", value: "plain" },
              { label: "Referensi aset pengetahuan", value: "asset" },
            ]}
            selected={form.announcementType}
            onSelect={selectAnnouncementType}
            searchable={false}
            indicator="check"
          />
          {form.announcementType === "asset" && (
            <SelectDropdown
              label="Referensi aset *"
              options={selectableAssets}
              selected={form.assetId}
              onSelect={(value) => updateForm("assetId", value)}
              placeholder={assetsLoading ? "Memuat aset terbit…" : "Cari dan pilih aset terbit"}
              searchable
              indicator="check"
              disabled={assetsLoading}
              required
            />
          )}
          <TextField label="Judul pengumuman *" value={form.title} onChange={(value) => updateForm("title", inputValue(value))} maxLength={180} placeholder="Misal: Pembaruan pedoman keselamatan transportasi" required />
          <TextArea label="Isi pengumuman *" value={form.content} onChange={(value) => updateForm("content", inputValue(value))} rows={5} maxLength={4000} placeholder="Tuliskan informasi utama yang perlu diketahui pengguna." required />
          <div className={`grid gap-4 ${form.announcementType === "plain" ? "md:grid-cols-2" : ""}`}>
            {form.announcementType === "plain" && <TextField label="Tautan tujuan (opsional)" value={form.linkUrl} onChange={(value) => updateForm("linkUrl", inputValue(value))} placeholder="/halaman atau https://..." />}
            <TextField label="Label tombol" value={form.linkLabel} onChange={(value) => updateForm("linkLabel", inputValue(value))} maxLength={60} placeholder="Lihat selengkapnya" />
          </div>
          <TextField label="Urutan tampil" type="number" value={form.displayOrder} onChange={(value) => updateForm("displayOrder", inputValue(value))} helperText="Angka lebih kecil tampil lebih dahulu." />
          {editTarget?.image_url && !removeImage && !imageFile && (
            <div className="rounded-xl border border-outline-secondary bg-page-secondary p-3">
              <img src={uploadUrl(editTarget.image_url)} alt="Gambar pengumuman saat ini" className="max-h-48 w-full rounded-lg object-cover" />
              <Button type="button" hierarchy="tertiary" size="sm" className="mt-2" onClick={() => setRemoveImage(true)}>Hapus gambar saat ini</Button>
            </div>
          )}
          {form.announcementType === "asset" && selectedAsset && (removeImage || !editTarget?.image_url) && !imageFile && (
            <div className="rounded-xl border border-outline-secondary bg-page-secondary p-3">
              <p className="text-sm font-semibold text-content-primary">Gambar otomatis dari aset</p>
              <p className="mt-1 text-xs leading-5 text-content-secondary">Jika tidak mengunggah gambar khusus, carousel memakai thumbnail aset <strong>{selectedAsset.title}</strong>.</p>
              {selectedAsset.thumbnail_url && <img src={uploadUrl(selectedAsset.thumbnail_url)} alt="" className="mt-3 max-h-44 w-full rounded-lg object-cover" />}
            </div>
          )}
          <SingleFileUpload title={editTarget ? "Ganti gambar pengumuman" : "Unggah gambar pengumuman"} description="Opsional · JPG, PNG, atau WebP · maksimal 2 MB" accept="image/jpeg,image/png,image/webp" allowedExtensions={["jpg", "jpeg", "png", "webp"]} maxSize={2 * 1024 * 1024} onChange={(file, validationError) => { setImageFile(file); setRemoveImage(false); setError(validationError ? validationError.error : ""); }} onRemove={() => { setImageFile(null); setRemoveImage(false); }} />
          <div className="rounded-xl border border-outline-secondary bg-page-secondary p-4">
            <div className="kms-mobile-split-row flex items-center justify-between gap-4"><div><p className="font-semibold text-content-primary">Tampilkan di beranda</p><p className="mt-1 text-xs leading-5 text-content-secondary">Draf hanya terlihat pada halaman pengelolaan Admin.</p></div><Toggle checked={form.isPublished} onChange={(checked) => updateForm("isPublished", checked)} aria-label="Tampilkan pengumuman di beranda" /></div>
          </div>
          <div className="kms-modal-actions mt-2 flex justify-end gap-3"><Button type="button" hierarchy="secondary" onClick={closeForm} disabled={saving}>Batal</Button><Button type="submit" hierarchy="primary" disabled={saving}>{saving ? "Menyimpan…" : editTarget ? "Simpan perubahan" : "Simpan pengumuman"}</Button></div>
        </form>
      </Modal>

      <Modal open={Boolean(deleteTarget)} onClose={() => !saving && setDeleteTarget(null)} title="Hapus pengumuman" dialogClassname="ina-modal__dialog--size-md">
        <p className="text-content-secondary">Pengumuman <strong className="text-content-primary">{deleteTarget?.title}</strong> akan dihapus dan tidak lagi tampil di beranda.</p>
        <div className="kms-modal-actions mt-8 flex justify-end gap-3"><Button hierarchy="secondary" onClick={() => setDeleteTarget(null)} disabled={saving}>Batal</Button><Button hierarchy="primary" className="kms-text-on-color !border-red-600 !bg-red-600 hover:!border-red-700 hover:!bg-red-700" onClick={deleteAnnouncement} disabled={saving}>{saving ? "Menghapus…" : "Ya, hapus"}</Button></div>
      </Modal>
    </div>
  );
}
