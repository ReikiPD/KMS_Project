import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Modal, Skeleton, TextArea, TextField, Tooltip, useToast } from "@idds/react";
import { Building2, LayoutList, Plus, Search, Tags, Trash2 } from "lucide-react";
import AdminPageHeader from "../../../components/AdminPageHeader";
import EmptyState from "../../../components/EmptyState";
import WorkUnitLabel from "../../../components/WorkUnitLabel";
import { apiFetch, inputValue } from "../../../lib/api";

const MASTER_DATA_CONFIG = {
  category: {
    endpoint: "/api/assets/categories",
    title: "Kategori Topik",
    description: "Kelola klasifikasi agar katalog KMS mudah dieksplorasi.",
    addLabel: "Tambah kategori",
    modalTitle: "Tambah kategori topik",
    modalDescription: "Buat klasifikasi topik yang singkat dan mudah dipahami pengguna.",
    nameLabel: "Nama Kategori",
    namePlaceholder: "Misal: Keselamatan Transportasi",
    searchLabel: "Cari kategori",
    searchPlaceholder: "Nama atau deskripsi kategori",
    listTitle: "Daftar kategori tersedia",
    listDescription: (count) => `${count} kategori digunakan untuk menata katalog.`,
    itemLabel: "kategori",
    emptyTitle: "Belum ada kategori",
    notFoundTitle: "Kategori tidak ditemukan",
    emptyDescription: "Kategori baru yang Anda buat akan tampil di sini.",
    notFoundDescription: "Coba gunakan kata kunci yang lebih umum.",
    createSuccess: "Kategori baru berhasil ditambahkan.",
    deleteSuccess: "Kategori berhasil dihapus dari sistem.",
    deleteQuestion: "Kategori ini akan diarsipkan dan tidak lagi tersedia pada formulir aset.",
    icon: Tags,
    hasDescription: true,
  },
  workUnit: {
    endpoint: "/api/assets/work-units",
    title: "Unit Kerja",
    description: "Kelola unit kerja yang menjadi konteks setiap pengetahuan KMS.",
    addLabel: "Tambah unit kerja",
    modalTitle: "Tambah unit kerja",
    modalDescription: "Gunakan nama resmi unit agar mudah dikenali di katalog dan laporan.",
    nameLabel: "Nama Unit Kerja",
    namePlaceholder: "Misal: Sekretariat Badan Kebijakan Transportasi",
    searchLabel: "Cari unit kerja",
    searchPlaceholder: "Nama lengkap atau singkatan unit",
    listTitle: "Daftar unit kerja",
    listDescription: (count) => `${count} unit tersedia sebagai pemilik pengetahuan.`,
    itemLabel: "unit kerja",
    emptyTitle: "Belum ada unit kerja",
    notFoundTitle: "Unit kerja tidak ditemukan",
    emptyDescription: "Unit kerja baru yang Anda buat akan tampil di sini.",
    notFoundDescription: "Coba gunakan kata kunci yang lebih singkat.",
    createSuccess: "Unit kerja baru berhasil ditambahkan.",
    deleteSuccess: "Unit kerja berhasil dihapus dari sistem.",
    deleteQuestion: "Unit kerja ini akan diarsipkan dan tidak lagi tersedia pada formulir aset.",
    icon: Building2,
    hasDescription: false,
  },
};

const slugify = (value) => value
  .toLocaleLowerCase("id-ID")
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/(^-|-$)/g, "");

export default function MasterDataPage({ type }) {
  const config = MASTER_DATA_CONFIG[type];
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiFetch(config.endpoint);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `Gagal memuat ${config.itemLabel}`);
      setItems(Array.isArray(result) ? result : []);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [config]);

  useEffect(() => { loadItems(); }, [loadItems]);

  const filteredItems = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("id-ID");
    if (!term) return items;
    return items.filter((item) => `${item.name || ""} ${item.description || ""}`.toLocaleLowerCase("id-ID").includes(term));
  }, [items, query]);

  const closeCreateModal = () => {
    if (saving) return;
    setCreateOpen(false);
    setName("");
    setDescription("");
    setError("");
  };

  const createItem = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const body = config.hasDescription
        ? { name: name.trim(), slug: slugify(name), description: description.trim() }
        : { name: name.trim() };
      const response = await apiFetch(config.endpoint, {
        method: "POST",
        auth: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `Gagal menambahkan ${config.itemLabel}`);
      toast({ state: "positive", title: "Berhasil", description: config.createSuccess, duration: 3000 });
      setCreateOpen(false);
      setName("");
      setDescription("");
      await loadItems();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteItem = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      const response = await apiFetch(`${config.endpoint}/${deleteTarget.id}`, { method: "DELETE", auth: true });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `Gagal menghapus ${config.itemLabel}`);
      toast({ state: "positive", title: "Terhapus", description: config.deleteSuccess, duration: 3000 });
      setDeleteTarget(null);
      await loadItems();
    } catch (deleteError) {
      toast({ state: "negative", title: "Gagal", description: deleteError.message, duration: 4000 });
    } finally {
      setSaving(false);
    }
  };

  const EmptyIcon = config.icon;

  return (
    <div className="mx-auto w-full max-w-6xl p-4 md:p-6 xl:p-8">
      <AdminPageHeader
        eyebrow="Manajemen Pengetahuan"
        title={config.title}
        description={config.description}
        breadcrumbs={[{ label: "Dasbor", href: "/admin/dashboard" }, { label: config.title }]}
        actions={<Button hierarchy="primary" prefixIcon={<Plus size={16} />} onClick={() => setCreateOpen(true)}>{config.addLabel}</Button>}
      />

      <Card className="kms-admin-surface p-5">
        <div className="kms-admin-panel-heading"><div className="flex gap-3"><span className="kms-admin-panel-heading-icon"><LayoutList size={18} /></span><div><h2>{config.listTitle}</h2><p>{config.listDescription(items.length)}</p></div></div></div>
        <div className="kms-admin-toolbar mb-4"><div className="min-w-0 flex-1"><TextField label={config.searchLabel} value={query} onChange={(value) => setQuery(inputValue(value))} placeholder={config.searchPlaceholder} prefixIcon={<Search size={16} />} /></div></div>

        {loading ? (
          <div className="space-y-2">{[1, 2, 3, 4].map((item) => <Skeleton key={item} height="48px" rounded="md" />)}</div>
        ) : filteredItems.length === 0 ? (
          <EmptyState className="kms-empty-state--compact" icon={EmptyIcon} title={query ? config.notFoundTitle : config.emptyTitle} description={query ? config.notFoundDescription : config.emptyDescription} actionLabel={query ? "Hapus pencarian" : undefined} onAction={query ? () => setQuery("") : undefined} />
        ) : (
          <div className="kms-admin-native-table-shell">
            <table className={`kms-admin-native-table text-left ${config.hasDescription ? "min-w-[34rem]" : "min-w-[28rem]"}`}>
              <thead><tr><th className="px-4 py-3 font-semibold">Nama {config.title}</th>{config.hasDescription && <th className="px-4 py-3 font-semibold">Deskripsi</th>}<th className="w-24 px-4 py-3 text-right font-semibold">Aksi</th></tr></thead>
              <tbody>{filteredItems.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3 font-semibold text-content-primary">{type === "workUnit" ? <WorkUnitLabel name={item.name} /> : item.name}</td>
                  {config.hasDescription && <td className="px-4 py-3"><span className="line-clamp-2 max-w-md">{item.description || "Belum ada deskripsi"}</span></td>}
                  <td className="px-4 py-3 text-right"><Tooltip variant="basic" title={`Hapus ${config.itemLabel}`} placement="top" showArrow={true}><Button size="sm" hierarchy="tertiary" onClick={() => setDeleteTarget(item)} aria-label={`Hapus ${item.name}`}><Trash2 size={16} className="text-content-secondary hover:text-status-danger" /></Button></Tooltip></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={createOpen} onClose={closeCreateModal} title={config.modalTitle} dialogClassname="ina-modal__dialog--size-md">
        <p className="mb-5 text-sm text-content-secondary">{config.modalDescription}</p>
        {error && <div className="mb-4"><Alert variant="critical" title={`${config.title} belum tersimpan`} message={error} /></div>}
        <form onSubmit={createItem} className="flex flex-col gap-4">
          <TextField label={config.nameLabel} value={name} onChange={(value) => { setName(inputValue(value)); setError(""); }} placeholder={config.namePlaceholder} required />
          {config.hasDescription && <TextArea label="Deskripsi singkat" value={description} onChange={(value) => { setDescription(inputValue(value)); setError(""); }} placeholder="Jelaskan cakupannya secara singkat" rows={4} />}
          <div className="mt-3 flex justify-end gap-3"><Button type="button" hierarchy="secondary" onClick={closeCreateModal} disabled={saving}>Batal</Button><Button type="submit" hierarchy="primary" prefixIcon={<Plus size={16} />} disabled={saving || !name.trim()}>{saving ? "Menyimpan..." : `Simpan ${config.itemLabel}`}</Button></div>
        </form>
      </Modal>

      <Modal open={Boolean(deleteTarget)} onClose={() => !saving && setDeleteTarget(null)} title={`Hapus ${config.itemLabel}`} dialogClassname="ina-modal__dialog--size-md">
        <p className="text-content-secondary"><strong className="text-content-primary">{deleteTarget?.name}</strong> — {config.deleteQuestion}</p>
        <div className="mt-8 flex justify-end gap-3"><Button hierarchy="secondary" onClick={() => setDeleteTarget(null)} disabled={saving}>Batal</Button><Button hierarchy="primary" className="kms-text-on-color !border-red-600 !bg-red-600 hover:!border-red-700 hover:!bg-red-700" onClick={deleteItem} disabled={saving}>{saving ? "Menghapus..." : "Ya, hapus"}</Button></div>
      </Modal>
    </div>
  );
}
