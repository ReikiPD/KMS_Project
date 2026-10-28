const pool = require("../config/db");
const { getPositiveInteger, PUBLIC_ID_PATTERN } = require("../utils");
const { setAssetVersionActor } = require("../services/assetVersionService");
const { recordAudit } = require("../services/auditService");
const { createNotification } = require("../services/notificationService");
const { findEligibleReviewers } = require("../services/reviewAssignmentService");
const { hasOrganizationScope, hasPermission } = require("../services/permissionService");

const REVIEW_STATUSES = new Set(["pending_review", "approved", "revision_required", "rejected"]);
const DECISIONS = new Set(["approved", "revision_required", "rejected"]);
const ASSET_TYPES = new Set(["document", "video"]);
const WAIT_PRIORITIES = new Set(["new", "due", "overdue"]);
const CHECKLIST_KEYS = ["metadata", "content", "file", "work_unit", "classification"];
const accessSubject = (req) => req.accessContext || req.user;
const hasGlobalScope = (req) => hasOrganizationScope(accessSubject(req));

const decisionRestriction = (req, asset) => {
  const reviewer = accessSubject(req);
  if ([req.user?.id, reviewer?.id].filter(Boolean).map(Number).includes(Number(asset.author_id))) return "Pengaju tidak boleh memverifikasi asetnya sendiri";
  if (!hasGlobalScope(req) && asset.assigned_verifier_id && Number(asset.assigned_verifier_id) !== Number(reviewer?.id)) return "Pengajuan ini sudah ditugaskan kepada verifikator lain";
  return null;
};
const reviewCapabilities = (req, asset) => {
  const subject = accessSubject(req);
  const writable = !subject?.read_only && hasPermission(subject, "asset_verification", "view") && hasPermission(subject, "asset_verification", "edit");
  const pending = asset.publication_status === "pending_review";
  const reason = !writable ? "Izin EDIT Verifikasi Aset diperlukan; mode baca-saja tidak dapat mengubah data." : !pending ? "Pengajuan ini sudah diproses." : decisionRestriction(req, asset);
  return { decide: !reason, assign: writable && pending, add_note: writable, reason };
};

const scopedUnitPredicate = (parameter) => `a.work_unit_id IN (
  WITH RECURSIVE scoped_units AS (
    SELECT id FROM work_units WHERE id = ${parameter} AND deleted_at IS NULL
    UNION ALL
    SELECT child.id
    FROM work_units child
    INNER JOIN scoped_units parent_scope ON child.parent_id = parent_scope.id
    WHERE child.deleted_at IS NULL
  )
  SELECT id FROM scoped_units
)`;

const reviewerScope = (req, values, filters) => {
  if (hasGlobalScope(req)) return null;
  const workUnitId = Number(accessSubject(req)?.work_unit_id);
  if (!Number.isInteger(workUnitId) || workUnitId < 1) {
    return "Akun verifikator belum memiliki Unit Kerja sebagai batas pemeriksaan";
  }
  filters.push(scopedUnitPredicate(`$${values.push(workUnitId)}`));
  return null;
};

const normalizeChecklist = (value) => Object.fromEntries(CHECKLIST_KEYS.map((key) => [key, value?.[key] === true]));

const addQueueFilters = (req, values, filters) => {
  const echelon = Number.parseInt(req.query.echelon, 10);
  const assetType = ASSET_TYPES.has(req.query.assetType) ? req.query.assetType : "";
  const waitPriority = WAIT_PRIORITIES.has(req.query.wait) ? req.query.wait : "";
  const dateFrom = /^\d{4}-\d{2}-\d{2}$/.test(req.query.dateFrom || "") ? req.query.dateFrom : "";
  const dateTo = /^\d{4}-\d{2}-\d{2}$/.test(req.query.dateTo || "") ? req.query.dateTo : "";
  const assigned = String(req.query.assigned || "all").trim().toLowerCase();
  if ([1, 2, 3].includes(echelon)) filters.push(`w.echelon_level = $${values.push(echelon)}`);
  if (assetType) filters.push(`a.asset_type = $${values.push(assetType)}`);
  if (dateFrom) filters.push(`a.submitted_at >= $${values.push(dateFrom)}::date`);
  if (dateTo) filters.push(`a.submitted_at < ($${values.push(dateTo)}::date + INTERVAL '1 day')`);
  if (waitPriority === "new") filters.push("a.submitted_at > CURRENT_TIMESTAMP - INTERVAL '24 hours'");
  if (waitPriority === "due") filters.push("a.submitted_at <= CURRENT_TIMESTAMP - INTERVAL '24 hours' AND a.submitted_at > CURRENT_TIMESTAMP - INTERVAL '72 hours'");
  if (waitPriority === "overdue") filters.push("a.submitted_at <= CURRENT_TIMESTAMP - INTERVAL '72 hours'");
  if (assigned === "mine") filters.push(`a.assigned_verifier_id = $${values.push(accessSubject(req)?.id || null)}`);
  else if (assigned === "unassigned") filters.push("a.assigned_verifier_id IS NULL");
  else if (PUBLIC_ID_PATTERN.test(assigned)) filters.push(`assigned.public_id = $${values.push(assigned)}`);
};

const getPublicationReviews = async (req, res) => {
  const page = getPositiveInteger(req.query.page, 1, 100000);
  const limit = getPositiveInteger(req.query.limit, 10, 50);
  const status = REVIEW_STATUSES.has(req.query.status) ? req.query.status : "pending_review";
  const search = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 120) : "";
  const values = [status];
  const filters = ["a.deleted_at IS NULL", "a.publication_status = $1"];
  const scopeError = reviewerScope(req, values, filters);
  if (scopeError) return res.status(403).json({ error: scopeError });
  addQueueFilters(req, values, filters);
  if (search) {
    const parameter = `$${values.push(`%${search}%`)}`;
    filters.push(`CONCAT_WS(' ', a.title, u.full_name, w.name, w.alias, parent_w.name, parent_w.alias) ILIKE ${parameter}`);
  }

  try {
    const where = filters.join(" AND ");
    const totalResult = await pool.query(
      `SELECT COUNT(*)::INTEGER AS total
       FROM knowledge_assets a
       LEFT JOIN users u ON u.id = a.author_id
       LEFT JOIN work_units w ON w.id = a.work_unit_id
       LEFT JOIN work_units parent_w ON parent_w.id = w.parent_id
       LEFT JOIN users assigned ON assigned.id = a.assigned_verifier_id AND assigned.deleted_at IS NULL
       WHERE ${where}`,
      values,
    );
    const listValues = [...values, limit, (page - 1) * limit];
    const { rows } = await pool.query(
      `SELECT a.id, a.public_id, a.slug, a.title, a.asset_type, a.thumbnail_url,
              a.file_url, a.content, a.allow_download,
              a.publication_status, a.submitted_at, a.reviewed_at, a.review_note,
              a.review_round, a.author_id, a.assigned_verifier_id, a.assigned_at,
              assigned.public_id AS assigned_verifier_public_id,
              assigned.full_name AS assigned_verifier_name,
              GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - a.submitted_at)) / 3600))::INTEGER AS waiting_hours,
              CASE
                WHEN a.publication_status <> 'pending_review' THEN 'processed'
                WHEN a.submitted_at > CURRENT_TIMESTAMP - INTERVAL '24 hours' THEN 'new'
                WHEN a.submitted_at > CURRENT_TIMESTAMP - INTERVAL '72 hours' THEN 'due'
                ELSE 'overdue'
              END AS queue_priority,
              COALESCE(u.full_name, 'Pegawai tidak aktif') AS author_name,
              w.name AS work_unit_name, w.alias AS work_unit_alias,
              w.echelon_level AS work_unit_echelon_level,
              parent_w.name AS parent_work_unit_name, parent_w.alias AS parent_work_unit_alias,
              c.name AS category_name, reviewer.full_name AS reviewer_name
       FROM knowledge_assets a
       LEFT JOIN users u ON u.id = a.author_id
       LEFT JOIN work_units w ON w.id = a.work_unit_id
       LEFT JOIN work_units parent_w ON parent_w.id = w.parent_id
       LEFT JOIN categories c ON c.id = a.category_id
       LEFT JOIN users reviewer ON reviewer.id = a.reviewed_by
       LEFT JOIN users assigned ON assigned.id = a.assigned_verifier_id AND assigned.deleted_at IS NULL
       WHERE ${where}
       ORDER BY CASE WHEN a.publication_status = 'pending_review' AND a.submitted_at <= CURRENT_TIMESTAMP - INTERVAL '72 hours' THEN 0
                     WHEN a.publication_status = 'pending_review' AND a.submitted_at <= CURRENT_TIMESTAMP - INTERVAL '24 hours' THEN 1
                     WHEN a.publication_status = 'pending_review' THEN 2 ELSE 3 END,
                CASE WHEN a.publication_status = 'pending_review' THEN a.submitted_at END ASC NULLS LAST,
                a.reviewed_at DESC NULLS LAST, a.id DESC
       LIMIT $${listValues.length - 1} OFFSET $${listValues.length}`,
      listValues,
    );
    const totalItems = totalResult.rows[0]?.total || 0;
    return res.json({
      data: rows,
      scope: hasGlobalScope(req) ? { type: "all" } : {
        type: "work_unit_tree",
        work_unit_id: accessSubject(req).work_unit_id,
        work_unit_name: accessSubject(req).work_unit_name,
      },
      pagination: { currentPage: page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) },
    });
  } catch (error) {
    console.error("Error fetching publication reviews:", error);
    return res.status(500).json({ error: "Gagal memuat antrean verifikasi aset" });
  }
};

const loadScopedReviewAsset = async (req, reference, database = pool, { lock = false } = {}) => {
  const values = [reference];
  const filters = [
    "a.deleted_at IS NULL",
    "(a.public_id::text = $1::text OR a.slug::text = $1::text)",
  ];
  const scopeError = reviewerScope(req, values, filters);
  if (scopeError) return { error: scopeError };
  const { rows } = await database.query(
    `SELECT a.id, a.public_id, a.slug, a.title, a.author_id, a.work_unit_id,
            a.publication_status, a.review_round, a.assigned_verifier_id,
            a.assigned_at, assigned.full_name AS assigned_verifier_name,
            assigned.public_id AS assigned_verifier_public_id,
            a.asset_type, a.file_url, a.thumbnail_url, a.content, a.allow_download,
            a.submitted_at, a.reviewed_at, a.review_note, a.created_at,
            u.full_name AS author_name, w.name AS work_unit_name, w.alias AS work_unit_alias,
            parent_w.name AS parent_work_unit_name, parent_w.alias AS parent_work_unit_alias,
            c.name AS category_name
     FROM knowledge_assets a
     LEFT JOIN users assigned ON assigned.id = a.assigned_verifier_id AND assigned.deleted_at IS NULL
     LEFT JOIN users u ON u.id = a.author_id
     LEFT JOIN work_units w ON w.id = a.work_unit_id
     LEFT JOIN work_units parent_w ON parent_w.id = w.parent_id
     LEFT JOIN categories c ON c.id = a.category_id
     WHERE ${filters.join(" AND ")}
     ${lock ? "FOR UPDATE OF a" : ""}`,
    values,
  );
  return rows[0] ? { asset: rows[0] } : { status: 404, error: "Pengajuan tidak ditemukan atau berada di luar cakupan Anda" };
};

const getPublicationReviewers = async (req, res) => {
  try {
    const reference = String(req.query?.asset || "").trim();
    let asset = null;
    const scopeUnitId = hasGlobalScope(req) ? null : Number(accessSubject(req)?.work_unit_id);
    if (reference) {
      const result = await loadScopedReviewAsset(req, reference);
      if (result.error) return res.status(result.status || 403).json({ error: result.error });
      asset = result.asset;
    } else if (!hasGlobalScope(req) && (!Number.isInteger(scopeUnitId) || scopeUnitId < 1)) {
      return res.status(403).json({ error: "Akun belum memiliki Unit Kerja sebagai cakupan verifikasi" });
    }
    const rows = await findEligibleReviewers(pool, { asset, scopeUnitId });
    return res.json({ data: rows, emptyMessage: rows.length ? null : "Belum ada akun aktif dengan izin VIEW dan EDIT Verifikasi Aset pada unit ini atau unit atasannya. Periksa unit kerja dan Hak Akses Role akun verifikator." });
  } catch (error) {
    console.error("Error fetching publication reviewers:", error);
    return res.status(500).json({ error: "Gagal memuat daftar verifikator" });
  }
};

const getPublicationReviewContext = async (req, res) => {
  try {
    const result = await loadScopedReviewAsset(req, String(req.params.id || "").trim());
    if (result.error) return res.status(result.status || 403).json({ error: result.error });
    const [notes, decisions] = await Promise.all([
      pool.query(
        `SELECT id, author_label, body, created_at
         FROM asset_review_internal_notes WHERE asset_id = $1
         ORDER BY created_at DESC, id DESC LIMIT 50`,
        [result.asset.id],
      ),
      pool.query(
        `SELECT action, note, checklist, actor_label, actor_role, created_at
         FROM asset_publication_reviews WHERE asset_id = $1
         ORDER BY created_at DESC, id DESC LIMIT 20`,
        [result.asset.id],
      ),
    ]);
    return res.json({ asset: result.asset, notes: notes.rows, decisions: decisions.rows, capabilities: reviewCapabilities(req, result.asset) });
  } catch (error) {
    console.error("Error fetching review context:", error);
    return res.status(500).json({ error: "Gagal memuat catatan pemeriksaan" });
  }
};

const addPublicationReviewNote = async (req, res) => {
  const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
  if (body.length < 2 || body.length > 2000) return res.status(400).json({ error: "Catatan internal harus terdiri dari 2–2000 karakter" });
  try {
    const result = await loadScopedReviewAsset(req, String(req.params.id || "").trim());
    if (result.error) return res.status(result.status || 403).json({ error: result.error });
    const author = accessSubject(req);
    const { rows } = await pool.query(
      `INSERT INTO asset_review_internal_notes (asset_id, author_id, author_label, body)
       VALUES ($1, $2, $3, $4) RETURNING id, author_label, body, created_at`,
      [result.asset.id, author?.id || null, author?.full_name || req.user?.full_name || "Administrator KMS", body],
    );
    await recordAudit({
      actorId: req.user?.id || null, actorLabel: req.user?.full_name, actorRole: req.user?.role,
      action: "asset.review_note_added", targetType: "asset", targetId: result.asset.id,
      metadata: { contextUserId: req.accessContext?.id || null },
    });
    return res.status(201).json(rows[0]);
  } catch (error) {
    console.error("Error adding review note:", error);
    return res.status(500).json({ error: "Gagal menyimpan catatan internal" });
  }
};

const assignPublicationReviewer = async (req, res) => {
  const verifierPublicId = String(req.body?.verifierPublicId || "").trim().toLowerCase();
  if (verifierPublicId && !PUBLIC_ID_PATTERN.test(verifierPublicId)) return res.status(400).json({ error: "Referensi verifikator tidak valid" });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await loadScopedReviewAsset(req, String(req.params.id || "").trim(), client, { lock: true });
    if (result.error) { await client.query("ROLLBACK"); return res.status(result.status || 403).json({ error: result.error }); }
    if (result.asset.publication_status !== "pending_review") { await client.query("ROLLBACK"); return res.status(409).json({ error: "Hanya pengajuan yang masih menunggu yang dapat ditugaskan" }); }
    let verifier = null;
    if (verifierPublicId) {
      const rows = await findEligibleReviewers(client, { asset: result.asset, verifierPublicId });
      verifier = rows[0];
      if (!verifier) { await client.query("ROLLBACK"); return res.status(400).json({ error: "Akun tersebut bukan verifikator aktif atau pengajuan berada di luar cakupannya" }); }
    }
    const actor = accessSubject(req);
    const { rows } = await client.query(
      `UPDATE knowledge_assets SET assigned_verifier_id = $1, assigned_at = CASE WHEN $1::integer IS NULL THEN NULL ELSE CURRENT_TIMESTAMP END,
         assigned_by = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3
       RETURNING assigned_verifier_id, assigned_at`,
      [verifier?.id || null, actor?.id || req.user?.id || null, result.asset.id],
    );
    if (verifier) await createNotification({ recipientId: verifier.id, actorId: actor?.id || req.user?.id || null, assetId: result.asset.id, type: "asset_assigned" }, client);
    await client.query("COMMIT");
    await recordAudit({ actorId: req.user?.id || null, actorLabel: req.user?.full_name, actorRole: req.user?.role,
      action: verifier ? "asset.review_assigned" : "asset.review_unassigned", targetType: "asset", targetId: result.asset.id,
      metadata: { verifierId: verifier?.id || null, verifierName: verifier?.full_name || null, contextUserId: req.accessContext?.id || null } });
    return res.json({ ...rows[0], assigned_verifier_public_id: verifier?.public_id || null, assigned_verifier_name: verifier?.full_name || null });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("Error assigning publication reviewer:", error);
    return res.status(500).json({ error: "Gagal menyimpan penugasan verifikator" });
  } finally { client.release(); }
};

const reviewPublication = async (req, res) => {
  const reviewer = accessSubject(req);
  const reviewerId = reviewer?.id || req.user?.id || null;
  const reference = String(req.params.id || "").trim();
  const decision = String(req.body?.decision || "").trim();
  const note = typeof req.body?.note === "string" ? req.body.note.trim().replace(/\s+/g, " ") : "";
  const checklist = normalizeChecklist(req.body?.checklist);
  if (!DECISIONS.has(decision)) return res.status(400).json({ error: "Keputusan verifikasi tidak valid" });
  if (note.length < 5 || note.length > 2000) return res.status(400).json({ error: "Keterangan verifikator wajib diisi 5–2000 karakter" });
  if (decision === "approved" && CHECKLIST_KEYS.some((key) => !checklist[key])) {
    return res.status(400).json({ error: "Seluruh checklist kelayakan wajib dipenuhi sebelum aset diterbitkan" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await setAssetVersionActor(client, req, "verification");
    const values = [reference];
    const filters = [
      "a.deleted_at IS NULL",
      "a.publication_status = 'pending_review'",
      "(a.public_id::text = $1::text OR a.slug::text = $1::text)",
    ];
    const scopeError = reviewerScope(req, values, filters);
    if (scopeError) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: scopeError });
    }
    const currentResult = await client.query(
      `SELECT a.id, a.public_id, a.slug, a.title, a.author_id, a.review_round,
              a.assigned_verifier_id
       FROM knowledge_assets a
       WHERE ${filters.join(" AND ")}
       FOR UPDATE`,
      values,
    );
    const asset = currentResult.rows[0];
    if (!asset) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Pengajuan tidak ditemukan, berada di luar cakupan, atau sudah diproses" });
    }
    const restriction = decisionRestriction(req, asset);
    if (restriction) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: restriction });
    }

    const { rows } = await client.query(
      `UPDATE knowledge_assets
       SET publication_status = $1::varchar,
           is_published = ($1::varchar = 'approved'),
           reviewed_at = CURRENT_TIMESTAMP,
           reviewed_by = $2,
           review_note = $3,
           assigned_verifier_id = NULL,
           assigned_at = NULL,
           assigned_by = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING id, public_id, slug, title, publication_status, is_published,
                 reviewed_at, review_note, review_round, author_id`,
      [decision, reviewerId, note, asset.id],
    );
    await client.query(
      `INSERT INTO asset_publication_reviews
         (asset_id, review_round, action, note, actor_id, actor_label, actor_role, checklist)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [asset.id, asset.review_round, decision, note, reviewerId, reviewer?.full_name || "Administrator KMS", reviewer?.role || "admin", JSON.stringify(checklist)],
    );
    const notificationType = {
      approved: "asset_approved",
      revision_required: "asset_revision",
      rejected: "asset_rejected",
    }[decision];
    await createNotification({
      recipientId: asset.author_id,
      actorId: reviewerId,
      assetId: asset.id,
      type: notificationType,
    }, client);
    await client.query("COMMIT");
    await recordAudit({
      actorId: req.user?.id || null,
      actorLabel: req.user?.full_name,
      actorRole: req.user?.role,
      action: `asset.publication_${decision}`,
      targetType: "asset",
      targetId: asset.id,
      metadata: {
        reviewRound: asset.review_round,
        checklist,
        contextUserId: req.accessContext?.id || null,
        contextUserRole: req.accessContext?.role || null,
      },
    });
    return res.json({ message: decision === "approved" ? "Aset disetujui dan diterbitkan" : decision === "revision_required" ? "Aset dikembalikan untuk diperbaiki" : "Aset ditolak", asset: rows[0] });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("Error reviewing publication:", error);
    return res.status(500).json({ error: "Gagal menyimpan keputusan verifikasi" });
  } finally {
    client.release();
  }
};

module.exports = {
  addPublicationReviewNote,
  assignPublicationReviewer,
  getPublicationReviewContext,
  getPublicationReviewers,
  getPublicationReviews,
  normalizeChecklist,
  reviewCapabilities,
  reviewPublication,
};
