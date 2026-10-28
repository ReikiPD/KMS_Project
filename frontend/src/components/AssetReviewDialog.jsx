import { useEffect, useState } from "react";
import { Alert, Badge, Button, Modal, SelectDropdown, Skeleton, TextArea, useToast } from "@idds/react";
import { CheckCircle2, ChevronDown, ExternalLink, GitCompareArrows, History, RotateCcw, StickyNote, XCircle } from "lucide-react";
import AssetVersionHistory from "./AssetVersionHistory";
import { apiFetch, inputValue, uploadUrl } from "../lib/api";
import { canDecideAssetVerification } from "../lib/permissions";
import { publicationStatus } from "../lib/publicationStatus";
import useUnsavedChanges from "../hooks/useUnsavedChanges";
import { UnsavedChangesModal } from "./AssetFormStatus";

function ReviewShell({ embedded, children, ...props }) {
  return embedded ? <div hidden={!props.open}>{children}</div> : <Modal {...props}>{children}</Modal>;
}

const CHECKLIST = [
  ["metadata", "Metadata", "Judul, kategori, dan informasi dasar tepat."],
  ["content", "Isi", "Materi jelas, relevan, dan layak diterbitkan."],
  ["file", "File", "File dapat dibuka dan jenisnya sesuai."],
  ["work_unit", "Unit kerja", "Pemilik dan unit kerja sudah benar."],
  ["classification", "Klasifikasi", "Materi sesuai untuk akses publik."],
];
const EMPTY_CHECKLIST = Object.fromEntries(CHECKLIST.map(([key]) => [key, false]));
const dateTime = (value) => value ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "-";
const unitLabel = (asset) => [...new Set([asset.parent_work_unit_alias || asset.parent_work_unit_name, asset.work_unit_alias || asset.work_unit_name].filter(Boolean))].join(" — ");

export default function AssetReviewDialog({ asset, user, onClose, onSaved, embedded = false }) {
  const { toast } = useToast();
  const reference = asset.public_id || asset.slug;
  const basePath = `/api/assets/admin/publication-reviews/${encodeURIComponent(reference)}`;
  const pending = asset.publication_status === "pending_review";
  const canDecide = canDecideAssetVerification(user);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [context, setContext] = useState({ notes: [], decisions: [] });
  const [contextLoading, setContextLoading] = useState(true);
  const [contextError, setContextError] = useState("");
  const [reviewers, setReviewers] = useState([]);
  const [reviewersLoading, setReviewersLoading] = useState(false);
  const [reviewersError, setReviewersError] = useState("");
  const [emptyMessage, setEmptyMessage] = useState("");
  const [reviewerReload, setReviewerReload] = useState(0);
  const [assignment, setAssignment] = useState({ id: asset.assigned_verifier_id, publicId: asset.assigned_verifier_public_id, name: asset.assigned_verifier_name });
  const [assignee, setAssignee] = useState(asset.assigned_verifier_public_id || "unassigned");
  const [assignmentError, setAssignmentError] = useState("");
  const [checklist, setChecklist] = useState(EMPTY_CHECKLIST);
  const [note, setNote] = useState(asset.review_note || "");
  const [internalNote, setInternalNote] = useState("");
  const [internalError, setInternalError] = useState("");
  const [decisionError, setDecisionError] = useState("");
  const [saving, setSaving] = useState("");
  const [contextRevision, setContextRevision] = useState(0);
  const dirty = internalNote.trim() !== "" || (pending && (note !== (asset.review_note || "") || Object.values(checklist).some(Boolean) || assignee !== (assignment.publicId || "unassigned")));
  const unsaved = useUnsavedChanges(dirty);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setContextLoading(true); setContextError("");
      try {
        const response = await apiFetch(`${basePath}/context`, { auth: true, signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.detail || result.error || "Riwayat pemeriksaan belum dapat dimuat.");
        if (controller.signal.aborted) return;
        setContext({ notes: result.notes || [], decisions: result.decisions || [], capabilities: result.capabilities });
        if (!pending) setChecklist(result.decisions?.find((item) => ["approved", "rejected", "revision_required"].includes(item.action))?.checklist || EMPTY_CHECKLIST);
      } catch (error) { if (!controller.signal.aborted) setContextError(error.message); }
      finally { if (!controller.signal.aborted) setContextLoading(false); }
    };
    load();
    return () => controller.abort();
  }, [basePath, pending, contextRevision, user?.permissions, user?.read_only]);

  useEffect(() => {
    if (!canDecide || !pending) return undefined;
    const controller = new AbortController();
    const load = async () => {
      setReviewersLoading(true); setReviewersError("");
      try {
        const params = new URLSearchParams({ asset: reference });
        const response = await apiFetch(`/api/assets/admin/publication-reviewers?${params}`, { auth: true, signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.detail || result.error || "Daftar verifikator belum dapat dimuat.");
        if (!controller.signal.aborted) { setReviewers(result.data || []); setEmptyMessage(result.emptyMessage || "Belum ada verifikator dengan izin dan cakupan unit yang sesuai aset ini."); }
      } catch (error) { if (!controller.signal.aborted) setReviewersError(error.message); }
      finally { if (!controller.signal.aborted) setReviewersLoading(false); }
    };
    load();
    return () => controller.abort();
  }, [canDecide, pending, reference, reviewerReload, user?.id, user?.role]);

  const decisionAllowed = canDecide && pending && context.capabilities?.decide === true;
  const checkedCount = CHECKLIST.filter(([key]) => checklist[key] === true).length;
  const close = () => { if (!saving) unsaved.requestLeave(onClose); };
  const saveAssignment = async () => {
    if (saving) return;
    setSaving("assignment"); setAssignmentError("");
    try {
      const response = await apiFetch(`${basePath}/assignment`, {
        method: "PATCH", auth: true, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verifierPublicId: assignee === "unassigned" ? null : assignee }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || result.error || "Penugasan belum dapat disimpan.");
      setAssignment({ id: result.assigned_verifier_id, publicId: result.assigned_verifier_public_id, name: result.assigned_verifier_name });
      setContextRevision((value) => value + 1);
      toast({ state: "positive", title: "Penugasan tersimpan", description: result.assigned_verifier_name ? `Ditugaskan kepada ${result.assigned_verifier_name}.` : "Penugasan dilepas.", duration: 3000 });
      onSaved();
    } catch (error) { setAssignmentError(error.message); } finally { setSaving(""); }
  };
  const decide = async (decision) => {
    if (saving || !decisionAllowed) return;
    if (note.trim().length < 5) {
      setDecisionError("Isi keterangan keputusan minimal 5 karakter.");
      document.querySelector(".kms-review-decision textarea")?.focus();
      return;
    }
    if (decision === "approved" && checkedCount !== CHECKLIST.length) return setDecisionError("Lengkapi seluruh checklist sebelum menyetujui aset.");
    setSaving(decision); setDecisionError("");
    try {
      const response = await apiFetch(basePath, { method: "PATCH", auth: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, note: note.trim(), checklist }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || result.error || "Keputusan belum dapat disimpan.");
      toast({ state: "positive", title: "Keputusan tersimpan", description: result.message, duration: 3500 });
      unsaved.markSaved(); onSaved(); onClose();
    } catch (error) { setDecisionError(error.message); } finally { setSaving(""); }
  };
  const addNote = async () => {
    if (saving) return;
    if (internalNote.trim().length < 2) {
      setInternalError("Catatan internal minimal 2 karakter.");
      document.querySelector(".kms-review-disclosure textarea")?.focus();
      return;
    }
    setSaving("note"); setInternalError("");
    try {
      const response = await apiFetch(`${basePath}/notes`, { method: "POST", auth: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: internalNote.trim() }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Catatan belum dapat disimpan.");
      setContext((current) => ({ ...current, notes: [result, ...current.notes] })); setInternalNote("");
    } catch (error) { setInternalError(error.message); } finally { setSaving(""); }
  };
  const options = [{ value: "unassigned", label: "Belum ditugaskan" }, ...reviewers.map((item) => ({ value: item.public_id, label: `${item.full_name} · ${item.work_unit_name}` }))];
  if (assignment.publicId && !reviewers.some((item) => item.public_id === assignment.publicId)) options.push({ value: assignment.publicId, label: `${assignment.name || "Verifikator saat ini"} (penugasan tersimpan)`, disabled: true });

  return <>
    <UnsavedChangesModal open={unsaved.open} onStay={unsaved.stay} onLeave={unsaved.leave} />
    <AssetVersionHistory asset={historyOpen ? asset : null} onClose={() => setHistoryOpen(false)} />
    <ReviewShell embedded={embedded} open={!historyOpen} onClose={close} title={pending ? "Penilaian kelayakan aset" : "Keterangan verifikasi"} size="lg">
      <div className="kms-review-dialog">
        {embedded && <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-bold">Penilaian kelayakan</h2><Button hierarchy="tertiary" size="sm" prefixIcon={<GitCompareArrows size={16} />} onClick={() => setHistoryOpen(true)}>Bandingkan versi</Button></div>}
        {dirty && <p className="kms-dirty-indicator" role="status">● Perubahan belum disimpan</p>}
        {contextError && <div role="alert"><Alert variant="critical" title="Konteks pemeriksaan belum tersedia" message={contextError} /><Button hierarchy="secondary" size="sm" onClick={() => setContextRevision(value => value + 1)}>Muat ulang pemeriksaan</Button></div>}
        <section className="kms-review-overview">
          <div className="kms-review-section-heading"><div><h2>{asset.title}</h2><p>{asset.author_name} · {unitLabel(asset)}</p></div><Badge type="soft" size="sm" variant={publicationStatus(asset).variant}>{publicationStatus(asset).label}</Badge></div>
          {asset.content && <p className="kms-review-description">{asset.content}</p>}
          <div className="kms-review-material-actions">
            {asset.file_url && <a href={uploadUrl(asset.file_url)} target="_blank" rel="noreferrer"><ExternalLink size={16} />Buka materi</a>}
            <Button hierarchy="tertiary" size="sm" prefixIcon={<GitCompareArrows size={16} />} onClick={() => setHistoryOpen(true)}>Bandingkan versi</Button>
          </div>
        </section>

        {context.capabilities?.assign && <section className="kms-review-assignment" aria-label="Penugasan verifikator">
          <div className="kms-review-assignment-row">
            <SelectDropdown label="Verifikator penanggung jawab" selected={assignee} options={options}
              onSelect={(value) => { setAssignee(String(value || "unassigned")); setAssignmentError(""); }}
              searchable showPreviewValue={false} mandatorySelected loading={reviewersLoading}
              disabled={reviewersLoading || Boolean(reviewersError) || Boolean(saving)} panelHeight={240} />
            <Button hierarchy="secondary" size="sm" onClick={saveAssignment} disabled={Boolean(saving) || reviewersLoading || Boolean(reviewersError) || assignee === (assignment.publicId || "unassigned")}>{saving === "assignment" ? "Menyimpan…" : "Simpan penugasan"}</Button>
          </div>
          {reviewersLoading ? <p className="kms-review-helper" role="status">Memuat verifikator yang sesuai unit aset…</p> : reviewersError ? <div className="kms-review-inline-error" role="alert"><span>{reviewersError}</span><Button hierarchy="link" size="sm" onClick={() => setReviewerReload((value) => value + 1)}>Coba lagi</Button></div> : <p className="kms-review-helper">{reviewers.length ? "Akun dengan izin VIEW dan EDIT Verifikasi Aset di unit pemilik atau unit atasannya." : emptyMessage}</p>}
          {assignmentError && <p className="kms-review-inline-error" role="alert">{assignmentError}</p>}
        </section>}

        <fieldset className="kms-review-checklist" disabled={!decisionAllowed || Boolean(saving)}>
          <legend>Checklist kelayakan <span>{checkedCount}/{CHECKLIST.length} sesuai</span></legend>
          <div className="kms-review-checklist-grid">{CHECKLIST.map(([key, label, description]) => <label key={key}>
            <input type="checkbox" className="kms-permission-checkbox" checked={checklist[key] === true} onChange={(event) => setChecklist((current) => ({ ...current, [key]: event.target.checked }))} />
            <span><strong>{label}</strong><small>{description}</small></span>
          </label>)}</div>
        </fieldset>

        <section className="kms-review-decision">
          {pending && context.capabilities?.reason && <Alert variant="info" title="Pemeriksaan dalam mode baca" message={context.capabilities.reason} />}
          <TextArea status={decisionError ? "error" : "neutral"} statusMessage={decisionError} aria-invalid={Boolean(decisionError)} label={pending ? "Keterangan keputusan *" : "Keterangan keputusan"} value={note} onChange={(value) => { setNote(inputValue(value)); setDecisionError(""); }} rows={3} maxLength={2000} disabled={!decisionAllowed || Boolean(saving)} placeholder="Alasan keputusan atau bagian yang perlu diperbaiki." />
          <p className="kms-review-helper">Keterangan ini akan diterima oleh pengaju aset.</p>
        </section>

        <details className="kms-review-disclosure">
          <summary><StickyNote size={17} /><span>Catatan internal <small>{context.notes.length}</small></span><ChevronDown size={16} className="kms-disclosure-chevron" /></summary>
          <div className="kms-review-disclosure-body">
            <p className="kms-review-helper">Hanya terlihat oleh tim verifikator.</p>
            {contextError && <p className="kms-review-inline-error" role="alert">{contextError}</p>}
            {contextLoading ? <Skeleton height="40px" /> : <ul className="kms-review-timeline">{context.notes.map((item) => <li key={item.id}><p>{item.body}</p><small>{item.author_label} · {dateTime(item.created_at)}</small></li>)}</ul>}
            {context.capabilities?.add_note && <><TextArea label="Tambah catatan internal" value={internalNote} onChange={(value) => setInternalNote(inputValue(value))} rows={2} maxLength={2000} /><div className="kms-review-note-action"><Button hierarchy="secondary" size="sm" onClick={addNote} disabled={Boolean(saving)}>{saving === "note" ? "Menyimpan…" : "Tambah catatan"}</Button></div></>}
            {internalError && <p className="kms-review-inline-error" role="alert">{internalError}</p>}
          </div>
        </details>
        <details className="kms-review-disclosure">
          <summary><History size={17} /><span>Riwayat keputusan <small>{context.decisions.length}</small></span><ChevronDown size={16} className="kms-disclosure-chevron" /></summary>
          <div className="kms-review-disclosure-body">
            {contextError ? <p className="kms-review-inline-error" role="alert">{contextError}</p> : contextLoading ? <Skeleton height="40px" /> : context.decisions.length ? <ul className="kms-review-timeline">{context.decisions.map((item, index) => <li key={`${item.created_at}-${index}`}><strong>{publicationStatus({ publication_status: item.action }).label} · {item.actor_label}</strong><p>{item.note}</p><small>{dateTime(item.created_at)}</small></li>)}</ul> : <p className="kms-review-helper">Belum ada keputusan sebelumnya.</p>}
          </div>
        </details>

        {decisionError && <Alert variant="critical" title="Keputusan belum tersimpan" message={decisionError} />}
        <footer className="kms-review-footer">
          {decisionAllowed && checkedCount !== CHECKLIST.length && <p className="kms-review-helper w-full">Centang seluruh kriteria kelayakan untuk mengaktifkan Setujui &amp; terbitkan.</p>}
          <Button hierarchy="tertiary" onClick={close} disabled={Boolean(saving)}>{decisionAllowed ? "Batal" : "Tutup"}</Button>
          {decisionAllowed && <div className="kms-review-decision-actions">
            <Button hierarchy="secondary" prefixIcon={<XCircle size={16} />} onClick={() => decide("rejected")} disabled={Boolean(saving)}>{saving === "rejected" ? "Menyimpan…" : "Tolak"}</Button>
            <Button hierarchy="secondary" prefixIcon={<RotateCcw size={16} />} onClick={() => decide("revision_required")} disabled={Boolean(saving)}>{saving === "revision_required" ? "Menyimpan…" : "Minta perbaikan"}</Button>
            <Button hierarchy="primary" prefixIcon={<CheckCircle2 size={16} />} onClick={() => decide("approved")} disabled={Boolean(saving) || checkedCount !== CHECKLIST.length}>{saving === "approved" ? "Menerbitkan…" : "Setujui & terbitkan"}</Button>
          </div>}
        </footer>
      </div>
    </ReviewShell>
  </>;
}
