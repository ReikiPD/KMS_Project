const pool = require("../database/db");
const { recordAudit } = require("../services/auditService");
const { createNotification } = require("../services/notificationService");

const REVIEW_STATUSES = new Set(["pending_review", "approved", "revision_required", "rejected"]);
const DECISIONS = new Set(["approved", "revision_required", "rejected"]);

const getPositiveInteger = (value, fallback, max) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
};

const accessSubject = (req) => req.accessContext || req.user;
const hasGlobalScope = (req) => req.user?.role === "admin" && !req.accessContext;

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

const getPublicationReviews = async (req, res) => {
  const page = getPositiveInteger(req.query.page, 1, 100000);
  const limit = getPositiveInteger(req.query.limit, 10, 50);
  const status = REVIEW_STATUSES.has(req.query.status) ? req.query.status : "pending_review";
  const search = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 120) : "";
  const values = [status];
  const filters = ["a.deleted_at IS NULL", "a.publication_status = $1"];
  const scopeError = reviewerScope(req, values, filters);
  if (scopeError) return res.status(403).json({ error: scopeError });
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
       WHERE ${where}`,
      values,
    );
    const listValues = [...values, limit, (page - 1) * limit];
    const { rows } = await pool.query(
      `SELECT a.id, a.public_id, a.slug, a.title, a.asset_type, a.thumbnail_url,
              a.file_url, a.content, a.allow_download,
              a.publication_status, a.submitted_at, a.reviewed_at, a.review_note,
              a.review_round, a.author_id,
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
       WHERE ${where}
       ORDER BY CASE WHEN a.publication_status = 'pending_review' THEN a.submitted_at END ASC NULLS LAST,
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

const reviewPublication = async (req, res) => {
  if (req.accessContext) {
    return res.status(403).json({ error: "Keputusan verifikasi harus dilakukan dari akun utama, bukan mode akses akun" });
  }
  const reference = String(req.params.id || "").trim();
  const decision = String(req.body?.decision || "").trim();
  const note = typeof req.body?.note === "string" ? req.body.note.trim().replace(/\s+/g, " ") : "";
  if (!DECISIONS.has(decision)) return res.status(400).json({ error: "Keputusan verifikasi tidak valid" });
  if (note.length < 5 || note.length > 2000) return res.status(400).json({ error: "Keterangan verifikator wajib diisi 5–2000 karakter" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
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
      `SELECT a.id, a.public_id, a.slug, a.title, a.author_id, a.review_round
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
    if (req.user?.id && Number(asset.author_id) === Number(req.user.id)) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Pengaju tidak boleh memverifikasi asetnya sendiri" });
    }

    const { rows } = await client.query(
      `UPDATE knowledge_assets
       SET publication_status = $1::varchar,
           is_published = ($1::varchar = 'approved'),
           reviewed_at = CURRENT_TIMESTAMP,
           reviewed_by = $2,
           review_note = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING id, public_id, slug, title, publication_status, is_published,
                 reviewed_at, review_note, review_round, author_id`,
      [decision, req.user?.id || null, note, asset.id],
    );
    await client.query(
      `INSERT INTO asset_publication_reviews
         (asset_id, review_round, action, note, actor_id, actor_label, actor_role)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [asset.id, asset.review_round, decision, note, req.user?.id || null, req.user?.full_name || "Administrator KMS", req.user?.role || "admin"],
    );
    const notificationType = {
      approved: "asset_approved",
      revision_required: "asset_revision",
      rejected: "asset_rejected",
    }[decision];
    await createNotification({
      recipientId: asset.author_id,
      actorId: req.user?.id || null,
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
      metadata: { reviewRound: asset.review_round },
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

module.exports = { getPublicationReviews, reviewPublication };
