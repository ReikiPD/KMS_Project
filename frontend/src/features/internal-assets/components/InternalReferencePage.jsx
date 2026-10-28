import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, CardPlain, Modal, Table } from '@idds/react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import AdminPageHeader from '../../../components/AdminPageHeader';
import EmptyState from '../../../components/EmptyState';
import MobileDataList from '../../../components/MobileDataList';
import ValidatedForm from '../../../components/ValidatedForm';
import FormDraftStatus from '../../../components/FormDraftStatus';
import { apiFetch } from '../../../lib/api';
import { hasPermission } from '../../../lib/permissions';
import { useAuth } from '../../../contexts/AuthContext';
import useAdminView from '../../../hooks/useAdminView';
import useFormDraftGuard from '../../../hooks/useFormDraftGuard';
import '../styles/internal-assets.css';

export default function InternalReferencePage({ config }) {
  const { endpoint, resource, labels } = config;
  const { user } = useAuth();
  const { accessUser } = useAdminView();
  const subject = accessUser || user;
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState('');
  const guard = useFormDraftGuard(name, editing !== null);
  const closeEditor = () => !saving && guard.requestLeave(() => setEditing(null));
  const canEdit = hasPermission(subject, resource, 'edit');
  const canDelete = hasPermission(subject, resource, 'delete');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await apiFetch(endpoint);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || labels.loadError);
      setData(result.data || []);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [endpoint, labels.loadError]);
  useEffect(() => { load(); }, [load]);

  const openEditor = (row, initialName) => {
    setName(initialName);
    setModalError('');
    setEditing(row);
  };
  const save = async (event) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setModalError('');
    try {
      const response = await apiFetch(`${endpoint}${editing?.id ? `/${editing.id}` : ''}`, {
        method: editing?.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || labels.saveError);
      setEditing(null);
      await load();
    } catch (saveError) {
      setModalError(saveError.message);
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    setSaving(true);
    setModalError('');
    try {
      const response = await apiFetch(`${endpoint}/${deleting.id}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || labels.deleteError);
      setDeleting(null);
      await load();
    } catch (deleteError) {
      setModalError(deleteError.message);
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { header: labels.name, accessor: 'name' },
    { header: 'Digunakan pada', accessor: 'asset_count', render: row => `${row.asset_count} aset` },
  ];
  if (canEdit || canDelete) columns.push({
    header: 'Aksi', accessor: 'actions', render: row => <div className="flex gap-2">
      {canEdit && <Button size="sm" hierarchy="tertiary" aria-label={`Edit ${row.name}`} onClick={() => openEditor(row, row.name)}><Pencil size={17} /></Button>}
      {canDelete && <Button size="sm" hierarchy="tertiary" aria-label={`Hapus ${row.name}`} onClick={() => { setModalError(''); setDeleting(row); }}><Trash2 size={17} /></Button>}
    </div>,
  });
  const filtered = data.filter(item => item.name.toLocaleLowerCase('id-ID').includes(search.toLocaleLowerCase('id-ID')));
  const onPage = useCallback(params => { setPage(params.page); setLimit(params.pageSize); }, []);

  return <div className="kms-internal-page mx-auto w-full max-w-7xl p-4 md:p-6 xl:p-8">
    <FormDraftStatus guard={guard} />
    <AdminPageHeader eyebrow="Data referensi internal" title={labels.title} description={labels.description}
      breadcrumbs={[{ label: 'Aset Data Internal' }, { label: labels.breadcrumb }]}
      actions={hasPermission(subject, resource, 'post') ? <Button hierarchy="primary" prefixIcon={<Plus size={18} />} onClick={() => openEditor({}, '')}>{labels.add}</Button> : null} />
    {error && <Alert variant="critical" title={labels.errorTitle} message={error} />}
    <CardPlain className="kms-admin-surface kms-internal-table-card">
      <label className="kms-internal-search-label">{labels.search}<input value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder={labels.searchPlaceholder} /></label>
      {!loading && !filtered.length
        ? <EmptyState title={labels.emptyTitle} description={labels.emptyDescription} />
        : <div className="kms-admin-table-shell kms-admin-table-shell--page kms-reference-with-mobile">{!loading && <MobileDataList rows={filtered.slice((page - 1) * limit, page * limit)} columns={columns} primary={['name', 'actions']} />}<Table key={search} columns={columns} data={filtered.slice((page - 1) * limit, page * limit)} total={filtered.length} loading={loading} onFetchParamsChange={onPage} pageSizeOptions={[10, 20, 50]} initialPageSize={limit} showSearch={false} rowKey="id" striped /></div>}
    </CardPlain>
    <Modal open={editing !== null} onClose={closeEditor} title={editing?.id ? labels.edit : labels.add} size="sm">
      <ValidatedForm busy={saving} onSubmit={save} className="kms-internal-page">
        {modalError && <Alert variant="critical" title="Belum tersimpan" message={modalError} />}
        <label>{labels.name}<input aria-label={labels.name} required autoFocus maxLength={100} value={name} onChange={event => setName(event.target.value)} disabled={saving} /></label>
        <div className="kms-internal-form-actions"><Button type="button" hierarchy="secondary" onClick={closeEditor} disabled={saving}>Batal</Button><Button type="submit" hierarchy="primary" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button></div>
      </ValidatedForm>
    </Modal>
    <Modal open={deleting !== null} onClose={() => { if (!saving) setDeleting(null); }} title={`${labels.remove}?`} size="sm">
      <p>{deleting?.asset_count ? labels.inUse : `${labels.entity} “${deleting?.name}” akan dihapus permanen.`}</p>
      {modalError && <Alert variant="critical" title="Belum terhapus" message={modalError} />}
      <div className="kms-internal-form-actions"><Button hierarchy="secondary" onClick={() => setDeleting(null)} disabled={saving}>Batal</Button><Button hierarchy="primary" disabled={saving || Boolean(deleting?.asset_count)} onClick={remove}>{labels.remove}</Button></div>
    </Modal>
  </div>;
}
