import { useEffect, useRef, useState } from 'react';
import { Alert, Badge, Button, Modal } from '@idds/react';
import { Download, History } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { assetRouteReference } from '../lib/routes';
import { publicationStatus } from '../lib/publicationStatus';

const labels = {
  title: 'Judul', slug: 'Alamat aset', asset_type: 'Jenis aset', content: 'Isi / deskripsi',
  category_id: 'Kategori', work_unit_id: 'Unit kerja', author_id: 'Publisher',
  file_url: 'File utama', thumbnail_url: 'Thumbnail', allow_download: 'Izin download',
  video_duration_seconds: 'Durasi video', video_chapters: 'Bab video', is_published: 'Publikasi',
  publication_status: 'Status verifikasi', review_round: 'Putaran verifikasi',
  review_note: 'Keterangan verifikator', reviewed_by: 'Verifikator', reviewed_at: 'Waktu keputusan',
  submitted_at: 'Waktu pengajuan', deleted_at: 'Penghapusan', created: 'Aset dibuat', baseline: 'Data awal',
};
const snapshotKeys = { category_id: 'category_name', work_unit_id: 'work_unit_name', author_id: 'author_name' };
const dateTime = (value) => value ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
const valueLabel = (snapshot, key) => {
  if (!snapshot) return '—';
  if (key === 'file_url' || key === 'thumbnail_url') return 'File diganti; gunakan download versi untuk memeriksa isinya.';
  if (key === 'reviewed_by') return 'Lihat akun pengubah pada versi keputusan.';
  const value = snapshot[snapshotKeys[key] || key];
  if (key === 'publication_status') return publicationStatus({ publication_status: value }).label;
  if (['submitted_at', 'reviewed_at', 'deleted_at'].includes(key)) return dateTime(value);
  if (typeof value === 'boolean') return value ? 'Ya' : 'Tidak';
  if (Array.isArray(value)) return value.length ? JSON.stringify(value, null, 2) : '—';
  return value ?? '—';
};

function HistoryContent({ asset }) {
  const base = `/api/assets/admin/${encodeURIComponent(asset.public_id || assetRouteReference(asset))}/versions`;
  const [page, setPage] = useState(1);
  const [list, setList] = useState(null);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');
  const [detailError, setDetailError] = useState('');
  const [retry, setRetry] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const downloadController = useRef(null);
  const objectUrls = useRef(new Set());

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setList(null); setError(''); setDetail(null); setSelectedId('');
      try {
        const response = await apiFetch(`${base}?page=${page}`, { auth: true, signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Gagal memuat riwayat.');
        if (!controller.signal.aborted) { setList(body); setSelectedId(body.data[0]?.public_id || ''); }
      } catch (failure) { if (!controller.signal.aborted) setError(failure.message); }
    };
    load();
    return () => controller.abort();
  }, [base, page, retry]);

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    const load = async () => {
      setDetail(null); setDetailError('');
      try {
        const response = await apiFetch(`${base}/${selectedId}`, { auth: true, signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Gagal memuat versi.');
        if (!controller.signal.aborted) setDetail(body);
      } catch (failure) { if (!controller.signal.aborted) setDetailError(failure.message); }
    };
    load();
    return () => controller.abort();
  }, [base, selectedId]);

  useEffect(() => {
    const urls = objectUrls.current;
    return () => { downloadController.current?.abort(); urls.forEach((url) => URL.revokeObjectURL(url)); };
  }, []);

  const download = async (kind) => {
    const controller = new AbortController();
    downloadController.current = controller;
    setDownloading(true); setDetailError('');
    try {
      // apiFetch carries account-context headers; a plain link would lose that scope.
      const response = await apiFetch(`${base}/${selectedId}/media/${kind}`, { auth: true, signal: controller.signal });
      if (!response.ok) throw new Error((await response.json()).error || 'File gagal diunduh.');
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      objectUrls.current.add(url);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = response.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] || `aset-versi-${detail.version_number}`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      window.setTimeout(() => { URL.revokeObjectURL(url); objectUrls.current.delete(url); }, 30000);
    } catch (failure) { if (!controller.signal.aborted) setDetailError(failure.message); }
    finally { if (!controller.signal.aborted) setDownloading(false); }
  };

  return <div className="space-y-4 text-content-primary">
    <p className="break-words font-semibold">{asset.title}</p>
    <p className="text-sm leading-6 text-content-secondary">Riwayat hanya untuk backoffice. Pilih versi untuk melihat keadaan aset saat disimpan dan perubahan dibanding versi sebelumnya. Ini tidak mengubah aset yang sedang aktif.</p>
    {error && <Alert variant="critical" title="Riwayat belum dimuat" message={error} />}
    {error && <Button hierarchy="secondary" onClick={() => setRetry((value) => value + 1)}>Coba lagi</Button>}
    {!list && !error && <p role="status">Memuat riwayat…</p>}
    {list && !list.data.length && <p>Belum ada riwayat pada halaman ini.</p>}
    {list?.data.length > 0 && <div className="kms-version-layout">
      <nav aria-label="Pilih versi aset" className="min-w-0 space-y-2">
        {list.data.map((version, index) => <button key={version.public_id} type="button" aria-pressed={selectedId === version.public_id}
          className="kms-version-option" onClick={() => setSelectedId((current) => current === version.public_id ? current : version.public_id)}>
          <span className="flex items-center gap-2 font-semibold"><History size={15} />Versi {version.version_number}{page === 1 && index === 0 && <Badge type="soft" variant="info" size="sm">Terbaru</Badge>}</span>
          <span className="mt-2 block text-xs text-content-secondary">{dateTime(version.created_at)}</span>
          <span className="mt-1 block text-sm">{version.actor.name}</span>
          {version.actor.context_name && <span className="block text-xs text-content-secondary">Melalui akun {version.actor.context_name}</span>}
          <span className="mt-2 block text-xs text-content-secondary">{version.changed_fields.map((field) => labels[field] || field).join(', ')}</span>
        </button>)}
        <div className="flex items-center justify-between gap-2 pt-2">
          <Button size="sm" hierarchy="tertiary" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>Sebelumnya</Button>
          <Button size="sm" hierarchy="tertiary" disabled={page * 10 >= list.total} onClick={() => setPage((value) => value + 1)}>Berikutnya</Button>
        </div>
        <p className="text-center text-xs text-content-secondary">Halaman {page} · {list.total} versi</p>
      </nav>
      <section className="min-w-0 space-y-4" aria-label="Detail versi" aria-live="polite">
        {detailError && <Alert variant="critical" title="Versi belum dapat dibuka" message={detailError} />}
        {!detail && !detailError && <p role="status">Memuat versi…</p>}
        {detail && <>
          <div className="rounded-xl border border-border-subtle bg-page-secondary p-4">
            <div className="flex flex-wrap items-center gap-2"><h3 className="font-bold">Versi {detail.version_number}</h3><Badge type="soft" variant={publicationStatus(detail.snapshot).variant}>{publicationStatus(detail.snapshot).label}</Badge></div>
            {detail.source === 'baseline' && <p className="mt-3 text-sm text-content-secondary">Data awal saat fitur riwayat diaktifkan. Perubahan sebelum waktu ini tidak tersedia.</p>}
            <h4 className="mt-4 break-words text-lg font-semibold">{detail.snapshot.title}</h4>
            <p className="mt-2 text-sm text-content-secondary">{detail.snapshot.work_unit_name || 'Tanpa unit kerja'} · {detail.snapshot.category_name || 'Tanpa kategori'}</p>
            <p className="mt-1 text-sm text-content-secondary">Publisher: {detail.snapshot.author_name || '—'}</p>
            <div className="kms-version-text mt-4 text-sm leading-6">{detail.snapshot.content || 'Tidak ada isi / deskripsi.'}</div>
            <div className="mt-4 flex flex-wrap gap-2">
              {detail.snapshot.has_file && detail.can_download && <Button hierarchy="secondary" size="sm" disabled={downloading} prefixIcon={<Download size={15} />} onClick={() => download('file')}>Download file versi ini</Button>}
              {detail.snapshot.has_thumbnail && detail.can_download && <Button hierarchy="tertiary" size="sm" disabled={downloading} onClick={() => download('thumbnail')}>Download thumbnail</Button>}
              {!detail.snapshot.has_file && <span className="text-sm text-content-secondary">Belum ada file pada versi ini.</span>}
              {!detail.can_download && <span className="text-sm text-content-secondary">Download dibatasi oleh publisher.</span>}
            </div>
          </div>
          {detail.previous_snapshot && <div><h4 className="mb-3 font-semibold">Perubahan dari versi {detail.version_number - 1}</h4>
            <dl className="space-y-3">{detail.changed_fields.filter((key) => labels[key]).map((key) => <div key={key} className="rounded-xl border border-border-subtle p-3">
              <dt className="mb-2 text-sm font-semibold">{labels[key]}</dt>
              <dd className="grid gap-3 text-sm sm:grid-cols-2"><div><span className="text-xs text-content-secondary">Sebelumnya</span><div className="kms-version-text mt-1">{valueLabel(detail.previous_snapshot, key)}</div></div><div><span className="text-xs text-content-guide">Versi ini</span><div className="kms-version-text mt-1">{valueLabel(detail.snapshot, key)}</div></div></dd>
            </div>)}</dl>
          </div>}
        </>}
      </section>
    </div>}
  </div>;
}

export default function AssetVersionHistory({ asset, onClose }) {
  return <Modal open={Boolean(asset)} onClose={onClose} title="Riwayat versi aset" size="xl">
    {asset && <HistoryContent key={assetRouteReference(asset)} asset={asset} />}
  </Modal>;
}
