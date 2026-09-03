export const PUBLICATION_STATUSES = {
  draft: { label: "Draf", variant: "neutral", description: "Belum diajukan kepada verifikator." },
  pending_review: { label: "Menunggu verifikasi", variant: "warning", description: "Aset sedang menunggu keputusan verifikator." },
  approved: { label: "Terbit", variant: "success", description: "Aset telah disetujui dan tersedia pada katalog publik." },
  revision_required: { label: "Perlu perbaikan", variant: "info", description: "Perbaiki aset sesuai keterangan verifikator, lalu ajukan kembali." },
  rejected: { label: "Ditolak", variant: "warning", description: "Aset belum dinyatakan layak untuk diterbitkan." },
};

export const publicationStatus = (asset) => (
  PUBLICATION_STATUSES[asset?.publication_status]
  || (asset?.is_published ? PUBLICATION_STATUSES.approved : PUBLICATION_STATUSES.draft)
);

export const publicationStatusOptions = [
  { label: "Menunggu verifikasi", value: "pending_review" },
  { label: "Sudah disetujui", value: "approved" },
  { label: "Perlu perbaikan", value: "revision_required" },
  { label: "Ditolak", value: "rejected" },
];
