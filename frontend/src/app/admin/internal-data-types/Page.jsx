import {InternalReferencePage} from '../../../features/internal-assets';

const config = {
  endpoint: '/api/internal-assets/types',
  resource: 'internal_data_types',
  labels: {
    title: 'Jenis Data Internal',
    description: 'Kelola klasifikasi seperti paparan, laporan, notulensi, dan data. Jenis data berbeda dari tipe file.',
    breadcrumb: 'Jenis data',
    entity: 'Jenis data',
    name: 'Nama jenis data',
    add: 'Tambah jenis data',
    edit: 'Edit jenis data',
    remove: 'Hapus jenis data',
    search: 'Cari jenis data',
    searchPlaceholder: 'Cari nama jenis data',
    errorTitle: 'Jenis data',
    emptyTitle: 'Jenis data tidak ditemukan',
    emptyDescription: 'Coba kata kunci lain atau tambahkan jenis data baru.',
    loadError: 'Jenis data belum dapat dimuat.',
    saveError: 'Jenis data belum dapat disimpan.',
    deleteError: 'Jenis data belum dapat dihapus.',
    inUse: 'Jenis data ini masih digunakan oleh aset internal dan tidak dapat dihapus.',
  },
};

export default function InternalDataTypesPage() {
  return <InternalReferencePage config={config} />;
}
