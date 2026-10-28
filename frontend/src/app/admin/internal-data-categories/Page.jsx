import {InternalReferencePage} from '../../../features/internal-assets';

const config = {
  endpoint: '/api/internal-assets/categories',
  resource: 'internal_data_categories',
  labels: {
    title: 'Kategori Data Internal',
    description: 'Kelola kategori yang tersedia pada formulir input aset internal.',
    breadcrumb: 'Kategori',
    entity: 'Kategori',
    name: 'Nama kategori',
    add: 'Tambah kategori',
    edit: 'Edit kategori',
    remove: 'Hapus kategori',
    search: 'Cari kategori',
    searchPlaceholder: 'Cari nama kategori',
    errorTitle: 'Kategori data',
    emptyTitle: 'Kategori tidak ditemukan',
    emptyDescription: 'Coba kata kunci lain atau tambahkan kategori baru.',
    loadError: 'Kategori belum dapat dimuat.',
    saveError: 'Kategori belum dapat disimpan.',
    deleteError: 'Kategori belum dapat dihapus.',
    inUse: 'Kategori ini masih digunakan oleh aset internal dan tidak dapat dihapus.',
  },
};

export default function InternalDataCategoriesPage() {
  return <InternalReferencePage config={config} />;
}
