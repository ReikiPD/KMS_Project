const pool = require("../database/db");
const { hasPermission } = require("../services/permissionService");

const sendDatabaseError = (res, message, error) => res.status(500).json({
  error: message,
  detail: error.message,
});

const normalizeWorkUnitPayload = (body, defaults = {}) => {
  const name = String(body.name ?? defaults.name ?? "").trim().replace(/\s+/g, " ");
  const alias = String(body.alias ?? defaults.alias ?? "").trim().replace(/\s+/g, " ");
  const echelonLevel = Number.parseInt(body.echelonLevel ?? body.echelon_level ?? defaults.echelon_level ?? 1, 10);
  const rawParentId = body.parentId ?? body.parent_id ?? defaults.parent_id;
  const parentId = rawParentId === null || rawParentId === undefined || rawParentId === ""
    ? null
    : Number.parseInt(rawParentId, 10);
  const isPublic = typeof body.isPublic === "boolean"
    ? body.isPublic
    : typeof body.is_public === "boolean"
      ? body.is_public
      : defaults.is_public !== false;

  if (!name || name.length > 100) return { error: "Nama Unit Kerja wajib diisi dan maksimal 100 karakter" };
  if (!alias || alias.length > 40) return { error: "Alias Unit Kerja wajib diisi dan maksimal 40 karakter" };
  if (![1, 2, 3].includes(echelonLevel)) return { error: "Tingkat Unit Kerja harus Eselon I, Eselon II, atau Eselon III" };
  if (echelonLevel === 1 && parentId !== null) return { error: "Eselon I tidak boleh memiliki Unit Kerja induk" };
  if (echelonLevel > 1 && (!Number.isInteger(parentId) || parentId < 1)) {
    return { error: `Eselon ${echelonLevel === 2 ? "II" : "III"} wajib memilih Unit Kerja induk` };
  }
  return { name, alias, echelonLevel, parentId, isPublic };
};

const validateWorkUnitParent = async ({ echelonLevel, parentId }, currentId = null, client = pool) => {
  if (echelonLevel === 1) return null;
  if (currentId && Number(currentId) === Number(parentId)) return "Unit Kerja tidak dapat menjadi induk bagi dirinya sendiri";
  const expectedParentLevel = echelonLevel - 1;
  const { rows } = await client.query(
    "SELECT id FROM work_units WHERE id = $1 AND echelon_level = $2 AND deleted_at IS NULL",
    [parentId, expectedParentLevel],
  );
  return rows[0] ? null : `Induk Eselon ${expectedParentLevel === 1 ? "I" : "II"} tidak ditemukan atau sudah tidak aktif`;
};

const getAllCategories = async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM categories WHERE deleted_at IS NULL ORDER BY id ASC");
    return res.json(rows);
  } catch (error) {
    return sendDatabaseError(res, "Gagal mengambil kategori", error);
  }
};

const createCategory = async (req, res) => {
  const { name, slug, description } = req.body;
  try {
    const { rows } = await pool.query(
      "INSERT INTO categories (name, slug, description) VALUES ($1, $2, $3) RETURNING *",
      [name, slug, description],
    );
    return res.status(201).json(rows[0]);
  } catch (error) {
    return sendDatabaseError(res, "Gagal membuat kategori", error);
  }
};

const updateCategory = async (req, res) => {
  const { name, slug, description } = req.body;
  try {
    const { rows } = await pool.query(
      "UPDATE categories SET name=$1, slug=$2, description=$3 WHERE id=$4 RETURNING *",
      [name, slug, description, req.params.id],
    );
    if (!rows[0]) return res.status(404).json({ error: "Kategori tidak ditemukan" });
    return res.json(rows[0]);
  } catch (error) {
    return sendDatabaseError(res, "Gagal mengubah kategori", error);
  }
};

const deleteCategory = async (req, res) => {
  try {
    const { rows } = await pool.query(
      "UPDATE categories SET deleted_at = CURRENT_TIMESTAMP WHERE id=$1 AND deleted_at IS NULL RETURNING id",
      [req.params.id],
    );
    if (!rows[0]) return res.status(404).json({ error: "Kategori tidak ditemukan" });
    return res.json({ message: "Kategori berhasil diarsipkan (soft delete)" });
  } catch (error) {
    return sendDatabaseError(res, "Gagal menghapus kategori", error);
  }
};

const getAllWorkUnits = async (req, res) => {
  try {
    const includeAssetCount = req.query.withAssetCount === "true";
    const { rows } = await pool.query(
      `WITH RECURSIVE unit_tree AS (
         SELECT w.id, w.name, w.alias, w.echelon_level, w.parent_id, w.is_public, w.sort_order,
                TRUE AS effective_is_public,
                LPAD(w.sort_order::text, 10, '0') || '-' || LPAD(w.id::text, 10, '0') AS sort_path
         FROM work_units w
         WHERE w.parent_id IS NULL AND w.deleted_at IS NULL AND w.is_public = TRUE
         UNION ALL
         SELECT child.id, child.name, child.alias, child.echelon_level, child.parent_id, child.is_public, child.sort_order,
                parent_scope.effective_is_public AND child.is_public,
                parent_scope.sort_path || '.' || LPAD(child.sort_order::text, 10, '0') || '-' || LPAD(child.id::text, 10, '0')
         FROM work_units child
         INNER JOIN unit_tree parent_scope ON parent_scope.id = child.parent_id
         WHERE child.deleted_at IS NULL AND child.is_public = TRUE
       ), descendants AS (
         SELECT id AS root_id, id AS unit_id FROM unit_tree
         UNION ALL
         SELECT scope.root_id, child.id
         FROM descendants scope
         INNER JOIN unit_tree child ON child.parent_id = scope.unit_id
       )
       SELECT w.id, w.name, w.alias, w.echelon_level, w.parent_id, w.is_public, w.sort_order,
              parent.name AS parent_name, parent.alias AS parent_alias
              ${includeAssetCount ? ", COUNT(DISTINCT a.id)::INTEGER AS asset_count" : ""}
       FROM unit_tree w
       LEFT JOIN unit_tree parent ON parent.id = w.parent_id
       ${includeAssetCount ? `LEFT JOIN descendants scope ON scope.root_id = w.id
       LEFT JOIN knowledge_assets a ON a.work_unit_id = scope.unit_id
         AND a.is_published = TRUE AND a.deleted_at IS NULL` : ""}
       WHERE w.effective_is_public = TRUE
       GROUP BY w.id, w.name, w.alias, w.echelon_level, w.parent_id, w.is_public, w.sort_order,
                w.sort_path, parent.name, parent.alias
       ORDER BY w.sort_path`,
    );
    return res.json(rows);
  } catch (error) {
    return sendDatabaseError(res, "Gagal mengambil Unit Kerja", error);
  }
};

const getBackofficeWorkUnits = async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `WITH RECURSIVE unit_tree AS (
         SELECT w.*, w.is_public AS effective_is_public,
                LPAD(w.sort_order::text, 10, '0') || '-' || LPAD(w.id::text, 10, '0') AS sort_path
         FROM work_units w
         WHERE w.parent_id IS NULL AND w.deleted_at IS NULL
         UNION ALL
         SELECT child.*, parent_scope.effective_is_public AND child.is_public,
                parent_scope.sort_path || '.' || LPAD(child.sort_order::text, 10, '0') || '-' || LPAD(child.id::text, 10, '0')
         FROM work_units child
         INNER JOIN unit_tree parent_scope ON parent_scope.id = child.parent_id
         WHERE child.deleted_at IS NULL
       ), descendants AS (
         SELECT id AS root_id, id AS unit_id FROM unit_tree
         UNION ALL
         SELECT scope.root_id, child.id
         FROM descendants scope
         INNER JOIN unit_tree child ON child.parent_id = scope.unit_id
       )
       SELECT w.id, w.public_id, w.name, w.alias, w.echelon_level, w.parent_id, w.is_public, w.sort_order,
              w.created_at, w.updated_at, w.effective_is_public,
              parent.name AS parent_name, parent.alias AS parent_alias,
              COUNT(DISTINCT direct_child.id)::INTEGER AS child_count,
              COUNT(DISTINCT a.id) FILTER (WHERE a.deleted_at IS NULL)::INTEGER AS asset_count,
              COUNT(DISTINCT a.id) FILTER (WHERE a.deleted_at IS NULL AND a.is_published = TRUE)::INTEGER AS published_asset_count
       FROM unit_tree w
       LEFT JOIN unit_tree parent ON parent.id = w.parent_id
       LEFT JOIN unit_tree direct_child ON direct_child.parent_id = w.id
       LEFT JOIN descendants scope ON scope.root_id = w.id
       LEFT JOIN knowledge_assets a ON a.work_unit_id = scope.unit_id
       GROUP BY w.id, w.public_id, w.name, w.alias, w.echelon_level, w.parent_id, w.is_public, w.sort_order,
                w.created_at, w.updated_at, w.effective_is_public, w.sort_path,
                parent.name, parent.alias
       ORDER BY w.sort_path`,
    );
    return res.json(rows);
  } catch (error) {
    return sendDatabaseError(res, "Gagal mengambil Unit Kerja backoffice", error);
  }
};

const DASHBOARD_PERIODS = new Set(["all", "7d", "30d", "90d", "year", "custom"]);
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const dateToIsoDay = (date) => date.toISOString().slice(0, 10);
const addUtcDays = (date, days) => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};
const parseIsoDay = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || dateToIsoDay(parsed) !== value ? null : parsed;
};
const getAnalyticsPeriod = (query) => {
  const key = typeof query.period === "string" && DASHBOARD_PERIODS.has(query.period) ? query.period : "all";
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  let start = null;
  let end = today;
  if (key === "7d") start = addUtcDays(today, -6);
  if (key === "30d") start = addUtcDays(today, -29);
  if (key === "90d") start = addUtcDays(today, -89);
  if (key === "year") start = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
  if (key === "custom") {
    start = parseIsoDay(query.startDate);
    end = parseIsoDay(query.endDate);
    if (!start || !end) return { error: "Rentang tanggal khusus tidak valid" };
    if (start > end) return { error: "Tanggal mulai tidak boleh melebihi tanggal akhir" };
    if (end > today) return { error: "Tanggal akhir tidak boleh melewati hari ini" };
    if ((end.getTime() - start.getTime()) / DAY_IN_MS > 365) return { error: "Rentang tanggal maksimal satu tahun" };
  }
  return {
    key,
    hasRange: Boolean(start),
    startDate: start ? dateToIsoDay(start) : null,
    endDate: start ? dateToIsoDay(end) : null,
    endExclusive: start ? dateToIsoDay(addUtcDays(end, 1)) : null,
  };
};
const getAnalyticsTrend = (period) => {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const start = period.hasRange ? new Date(`${period.startDate}T00:00:00.000Z`) : addUtcDays(today, -364);
  const end = period.hasRange ? new Date(`${period.endDate}T00:00:00.000Z`) : today;
  const days = Math.floor((end.getTime() - start.getTime()) / DAY_IN_MS) + 1;
  const unit = days <= 31 ? "day" : days <= 90 ? "week" : "month";
  return {
    unit,
    label: unit === "day" ? "Harian" : unit === "week" ? "Mingguan" : "Bulanan",
    startDate: dateToIsoDay(start),
    endExclusive: dateToIsoDay(addUtcDays(end, 1)),
  };
};

const getWorkUnitAnalyticsScope = async (req, res) => {
  try {
    const accessSubject = req.accessContext || req.user;
    const unrestricted = req.user?.role === "admin" && !req.accessContext;
    if (!unrestricted && !accessSubject?.work_unit_id) {
      return res.status(403).json({ error: "Akun belum memiliki Unit Kerja untuk membatasi analitik" });
    }

    const { rows } = await pool.query(
      `WITH RECURSIVE scope_tree AS (
         SELECT w.id, w.public_id, w.name, w.alias, w.echelon_level, w.parent_id,
                w.sort_order, 0::INTEGER AS depth,
                LPAD(w.sort_order::text, 10, '0') || '-' || LPAD(w.id::text, 10, '0') AS sort_path
         FROM work_units w
         WHERE w.deleted_at IS NULL
           AND (($1::BOOLEAN = TRUE AND w.parent_id IS NULL)
             OR ($1::BOOLEAN = FALSE AND w.id = $2))
         UNION ALL
         SELECT child.id, child.public_id, child.name, child.alias, child.echelon_level, child.parent_id,
                child.sort_order, parent_scope.depth + 1,
                parent_scope.sort_path || '.' || LPAD(child.sort_order::text, 10, '0') || '-' || LPAD(child.id::text, 10, '0')
         FROM work_units child
         INNER JOIN scope_tree parent_scope ON child.parent_id = parent_scope.id
         WHERE child.deleted_at IS NULL
       )
       SELECT id, public_id, name, alias, echelon_level, parent_id, depth
       FROM scope_tree
       ORDER BY sort_path`,
      [unrestricted, unrestricted ? null : Number(accessSubject.work_unit_id)],
    );
    return res.json({
      data: rows.filter((unit) => (
        hasPermission(accessSubject, `analytics_echelon_${unit.echelon_level}`, "view")
      )),
    });
  } catch (error) {
    return sendDatabaseError(res, "Gagal memuat cakupan analitik Unit Kerja", error);
  }
};

const getWorkUnitAnalytics = async (req, res) => {
  const period = getAnalyticsPeriod(req.query);
  if (period.error) return res.status(400).json({ error: period.error });
  const trend = getAnalyticsTrend(period);
  try {
    const unitResult = await pool.query(
      `SELECT w.id, w.public_id, w.name, w.alias, w.is_public, w.echelon_level, w.parent_id,
              parent.name AS parent_name, parent.alias AS parent_alias,
              COUNT(child.id)::INTEGER AS child_count
       FROM work_units w
       LEFT JOIN work_units parent ON parent.id = w.parent_id
       LEFT JOIN work_units child ON child.parent_id = w.id AND child.deleted_at IS NULL
       WHERE w.public_id::text = $1 AND w.deleted_at IS NULL
       GROUP BY w.id, parent.id`,
      [req.params.identifier],
    );
    const unit = unitResult.rows[0];
    if (!unit) return res.status(404).json({ error: "Unit Kerja tidak ditemukan" });

    const accessSubject = req.accessContext || req.user;
    const analyticsResource = `analytics_echelon_${unit.echelon_level}`;
    if (!hasPermission(accessSubject, analyticsResource, "view")) {
      return res.status(403).json({ error: `Role Anda tidak memiliki akses analitik Eselon ${unit.echelon_level}` });
    }
    const unrestricted = req.user?.role === "admin" && !req.accessContext;
    if (!unrestricted) {
      if (!accessSubject?.work_unit_id) return res.status(403).json({ error: "Akun belum memiliki Unit Kerja untuk membatasi analitik" });
      const allowedResult = await pool.query(
        `WITH RECURSIVE allowed_units AS (
           SELECT id FROM work_units WHERE id = $1 AND deleted_at IS NULL
           UNION ALL
           SELECT child.id FROM work_units child
           INNER JOIN allowed_units parent_scope ON child.parent_id = parent_scope.id
           WHERE child.deleted_at IS NULL
         ) SELECT 1 FROM allowed_units WHERE id = $2 LIMIT 1`,
        [accessSubject.work_unit_id, unit.id],
      );
      if (!allowedResult.rows[0]) return res.status(403).json({ error: "Analitik berada di luar cakupan Unit Kerja akun" });
    }

    const scopeRootId = unrestricted ? unit.id : Number(accessSubject.work_unit_id);
    const scopeUnitsPromise = pool.query(
      `WITH RECURSIVE scope_tree AS (
         SELECT w.id, w.public_id, w.name, w.alias, w.echelon_level, w.parent_id,
                w.sort_order, 0::INTEGER AS depth,
                LPAD(w.sort_order::text, 10, '0') || '-' || LPAD(w.id::text, 10, '0') AS sort_path
         FROM work_units w
         WHERE w.id = $1 AND w.deleted_at IS NULL
         UNION ALL
         SELECT child.id, child.public_id, child.name, child.alias, child.echelon_level, child.parent_id,
                child.sort_order, parent_scope.depth + 1,
                parent_scope.sort_path || '.' || LPAD(child.sort_order::text, 10, '0') || '-' || LPAD(child.id::text, 10, '0')
         FROM work_units child
         INNER JOIN scope_tree parent_scope ON child.parent_id = parent_scope.id
         WHERE child.deleted_at IS NULL
       )
       SELECT id, public_id, name, alias, echelon_level, parent_id, depth
       FROM scope_tree
       ORDER BY sort_path`,
      [scopeRootId],
    );

    const periodValues = [unit.id, period.startDate, period.endExclusive];
    const scopeCte = `
      WITH RECURSIVE scoped_units AS (
        SELECT id FROM work_units WHERE id = $1 AND deleted_at IS NULL
        UNION ALL
        SELECT child.id FROM work_units child
        INNER JOIN scoped_units parent_scope ON child.parent_id = parent_scope.id
        WHERE child.deleted_at IS NULL
      ), scoped_assets AS (
        SELECT a.*
        FROM knowledge_assets a
        INNER JOIN scoped_units su ON su.id = a.work_unit_id
        WHERE a.deleted_at IS NULL
          AND ($2::date IS NULL OR (a.created_at >= $2::date AND a.created_at < $3::date))
      )`;
    const metricsPromise = pool.query(`${scopeCte}
      SELECT
        COUNT(*)::INTEGER AS asset_count,
        COUNT(*) FILTER (WHERE is_published = TRUE)::INTEGER AS published_asset_count,
        COUNT(*) FILTER (WHERE is_published = FALSE)::INTEGER AS draft_count,
        COUNT(*) FILTER (WHERE is_published = TRUE AND asset_type <> 'video')::INTEGER AS document_count,
        COUNT(*) FILTER (WHERE is_published = TRUE AND asset_type = 'video')::INTEGER AS video_count,
        COUNT(DISTINCT author_id) FILTER (WHERE author_id IS NOT NULL)::INTEGER AS contributor_count,
        CASE WHEN $2::date IS NULL
          THEN COALESCE(SUM(view_count) FILTER (WHERE is_published = TRUE), 0)::INTEGER
          ELSE (SELECT COUNT(v.id)::INTEGER FROM asset_views v INNER JOIN scoped_assets sa ON sa.id = v.asset_id
                WHERE sa.is_published = TRUE AND v.created_at >= $2::date AND v.created_at < $3::date)
        END AS total_view_count
      FROM scoped_assets`, periodValues);

    const childUnitsPromise = pool.query(`${scopeCte},
      child_scope AS (
        SELECT child.id AS root_id, child.id AS unit_id
        FROM work_units child
        WHERE child.parent_id = $1 AND child.deleted_at IS NULL
        UNION ALL
        SELECT child_scope.root_id, descendant.id
        FROM work_units descendant
        INNER JOIN child_scope ON descendant.parent_id = child_scope.unit_id
        WHERE descendant.deleted_at IS NULL
      )
      SELECT child.public_id, child.name, child.alias,
             COUNT(sa.id)::INTEGER AS asset_count,
             COUNT(sa.id) FILTER (WHERE sa.is_published = TRUE)::INTEGER AS published_asset_count,
             COALESCE(SUM(sa.view_count) FILTER (WHERE sa.is_published = TRUE), 0)::INTEGER AS total_view_count,
             COUNT(DISTINCT sa.author_id) FILTER (WHERE sa.author_id IS NOT NULL)::INTEGER AS contributor_count
      FROM work_units child
      LEFT JOIN child_scope cs ON cs.root_id = child.id
      LEFT JOIN scoped_assets sa ON sa.work_unit_id = cs.unit_id
      WHERE child.parent_id = $1 AND child.deleted_at IS NULL
      GROUP BY child.id
      ORDER BY published_asset_count DESC, child.name ASC`, periodValues);

    const contributorsPromise = pool.query(`${scopeCte}
      SELECT u.public_id, COALESCE(u.full_name, 'Pegawai tidak aktif') AS full_name,
             u.department, COUNT(sa.id)::INTEGER AS asset_count,
             COUNT(sa.id) FILTER (WHERE sa.is_published = TRUE)::INTEGER AS published_asset_count,
             COALESCE(SUM(sa.view_count) FILTER (WHERE sa.is_published = TRUE), 0)::INTEGER AS total_view_count
      FROM scoped_assets sa
      LEFT JOIN users u ON u.id = sa.author_id
      GROUP BY u.id, u.public_id, u.full_name, u.department
      ORDER BY published_asset_count DESC, total_view_count DESC, full_name ASC
      LIMIT 8`, periodValues);

    const topAssetsPromise = pool.query(`${scopeCte}
      SELECT sa.public_id, sa.slug, sa.title, sa.asset_type, sa.is_published,
             COALESCE(sa.view_count, 0)::INTEGER AS view_count, sa.created_at,
             c.name AS category_name, aw.name AS work_unit_name, aw.alias AS work_unit_alias
      FROM scoped_assets sa
      LEFT JOIN categories c ON c.id = sa.category_id
      LEFT JOIN work_units aw ON aw.id = sa.work_unit_id
      WHERE sa.is_published = TRUE
      ORDER BY sa.view_count DESC, sa.created_at DESC
      LIMIT 5`, periodValues);

    const labelFormat = trend.unit === "month" ? "Mon YY" : "DD Mon";
    const trendPromise = pool.query(`
      WITH RECURSIVE scoped_units AS (
        SELECT id FROM work_units WHERE id = $1 AND deleted_at IS NULL
        UNION ALL
        SELECT child.id FROM work_units child
        INNER JOIN scoped_units parent_scope ON child.parent_id = parent_scope.id
        WHERE child.deleted_at IS NULL
      ), buckets AS (
        SELECT generate_series(date_trunc('${trend.unit}', $2::date), date_trunc('${trend.unit}', ($3::date - INTERVAL '1 day')), INTERVAL '1 ${trend.unit}') AS bucket_start
      )
      SELECT TO_CHAR(b.bucket_start, 'YYYY-MM-DD') AS bucket,
             TO_CHAR(b.bucket_start, '${labelFormat}') AS label,
             COUNT(a.id)::INTEGER AS asset_count
      FROM buckets b
      LEFT JOIN knowledge_assets a
        ON a.created_at >= b.bucket_start
       AND a.created_at < b.bucket_start + INTERVAL '1 ${trend.unit}'
       AND a.created_at >= $2::date AND a.created_at < $3::date
       AND a.is_published = TRUE AND a.deleted_at IS NULL
       AND a.work_unit_id IN (SELECT id FROM scoped_units)
      GROUP BY b.bucket_start
      ORDER BY b.bucket_start`, [unit.id, trend.startDate, trend.endExclusive]);

    const [metricsResult, childUnitsResult, contributorsResult, topAssetsResult, trendResult, scopeUnitsResult] = await Promise.all([
      metricsPromise, childUnitsPromise, contributorsPromise, topAssetsPromise, trendPromise, scopeUnitsPromise,
    ]);
    const scopeUnits = scopeUnitsResult.rows.filter((scopeUnit) => (
      hasPermission(accessSubject, `analytics_echelon_${scopeUnit.echelon_level}`, "view")
    ));
    return res.json({
      unit,
      metrics: metricsResult.rows[0],
      publicationTrend: trendResult.rows,
      childUnits: childUnitsResult.rows,
      scopeUnits,
      contributors: contributorsResult.rows,
      topAssets: topAssetsResult.rows,
      period: {
        key: period.key,
        startDate: period.startDate,
        endDate: period.endDate,
        trendGranularity: trend.label,
        viewMetric: period.hasRange ? "period" : "all_time",
      },
    });
  } catch (error) {
    return sendDatabaseError(res, "Gagal memuat analitik Unit Kerja", error);
  }
};

const createWorkUnit = async (req, res) => {
  const payload = normalizeWorkUnitPayload(req.body);
  if (payload.error) return res.status(400).json({ error: payload.error });
  try {
    const parentError = await validateWorkUnitParent(payload);
    if (parentError) return res.status(400).json({ error: parentError });
    const { rows } = await pool.query(
      `INSERT INTO work_units (name, alias, echelon_level, parent_id, is_public, sort_order)
       VALUES ($1, $2, $3, $4, $5,
         (SELECT COALESCE(MAX(sort_order), 0) + 1
          FROM work_units
          WHERE parent_id IS NOT DISTINCT FROM $4 AND deleted_at IS NULL))
       RETURNING *`,
      [payload.name, payload.alias, payload.echelonLevel, payload.parentId, payload.isPublic],
    );
    return res.status(201).json(rows[0]);
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "Nama Unit Kerja tersebut sudah digunakan" });
    return sendDatabaseError(res, "Gagal membuat Unit Kerja", error);
  }
};

const reorderWorkUnits = async (req, res) => {
  const rawOrderedIds = Array.isArray(req.body?.orderedIds) ? req.body.orderedIds : [];
  const orderedIds = rawOrderedIds.map((value) => Number.parseInt(value, 10));
  const rawParentId = req.body?.parentId;
  const parentId = rawParentId === null || rawParentId === undefined || rawParentId === ""
    ? null
    : Number.parseInt(rawParentId, 10);

  if (!orderedIds.length || orderedIds.length > 250
    || orderedIds.some((id) => !Number.isInteger(id) || id < 1)
    || new Set(orderedIds).size !== orderedIds.length
    || (parentId !== null && (!Number.isInteger(parentId) || parentId < 1))) {
    return res.status(400).json({ error: "Urutan Unit Kerja tidak valid" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const siblingResult = await client.query(
      `SELECT id
       FROM work_units
       WHERE parent_id IS NOT DISTINCT FROM $1 AND deleted_at IS NULL
       ORDER BY sort_order, id
       FOR UPDATE`,
      [parentId],
    );
    const siblingIds = siblingResult.rows.map((row) => Number(row.id));
    const submittedIds = new Set(orderedIds);
    if (siblingIds.length !== orderedIds.length || siblingIds.some((id) => !submittedIds.has(id))) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Daftar Unit Kerja berubah. Muat ulang halaman sebelum mengatur urutan" });
    }

    await client.query(
      `UPDATE work_units target
       SET sort_order = ordered.position::INTEGER, updated_at = CURRENT_TIMESTAMP
       FROM UNNEST($1::integer[]) WITH ORDINALITY AS ordered(id, position)
       WHERE target.id = ordered.id`,
      [orderedIds],
    );
    await client.query("COMMIT");
    return res.json({ message: "Urutan Unit Kerja berhasil disimpan" });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    return sendDatabaseError(res, "Gagal menyimpan urutan Unit Kerja", error);
  } finally {
    client.release();
  }
};

const updateWorkUnitVisibility = async (req, res) => {
  if (typeof req.body.isPublic !== "boolean") {
    return res.status(400).json({ error: "Status visibilitas Unit Kerja tidak valid" });
  }
  try {
    const { rows } = await pool.query(
      `UPDATE work_units SET is_public = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND deleted_at IS NULL RETURNING *`,
      [req.body.isPublic, req.params.id],
    );
    if (!rows[0]) return res.status(404).json({ error: "Unit Kerja tidak ditemukan" });
    const assetCount = await pool.query(
      `WITH RECURSIVE descendants AS (
         SELECT id FROM work_units WHERE id = $1 AND deleted_at IS NULL
         UNION ALL
         SELECT child.id FROM work_units child
         INNER JOIN descendants parent_scope ON child.parent_id = parent_scope.id
         WHERE child.deleted_at IS NULL
       )
       SELECT COUNT(DISTINCT a.id)::INTEGER AS count
       FROM knowledge_assets a
       WHERE a.deleted_at IS NULL AND a.work_unit_id IN (SELECT id FROM descendants)`,
      [req.params.id],
    );
    return res.json({ ...rows[0], asset_count: assetCount.rows[0]?.count || 0 });
  } catch (error) {
    return sendDatabaseError(res, "Gagal mengubah visibilitas Unit Kerja", error);
  }
};

const updateWorkUnit = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const currentResult = await client.query(
      `SELECT w.*,
              (SELECT COUNT(*)::INTEGER FROM work_units child WHERE child.parent_id = w.id AND child.deleted_at IS NULL) AS child_count
       FROM work_units w
       WHERE w.id = $1 AND w.deleted_at IS NULL
       FOR UPDATE`,
      [req.params.id],
    );
    const current = currentResult.rows[0];
    if (!current) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Unit Kerja tidak ditemukan" });
    }
    const payload = normalizeWorkUnitPayload(req.body, current);
    if (payload.error) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: payload.error });
    }
    if (Number(current.child_count) > 0 && payload.echelonLevel !== Number(current.echelon_level)) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Unit Kerja yang masih memiliki cabang tidak dapat diubah tingkatnya" });
    }
    const parentError = await validateWorkUnitParent(payload, req.params.id, client);
    if (parentError) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: parentError });
    }
    const { rows } = await client.query(
      `UPDATE work_units
       SET name = $1, alias = $2, echelon_level = $3, parent_id = $4,
           is_public = $5,
           sort_order = CASE
             WHEN parent_id IS DISTINCT FROM $4 THEN (
               SELECT COALESCE(MAX(sibling.sort_order), 0) + 1
               FROM work_units sibling
               WHERE sibling.parent_id IS NOT DISTINCT FROM $4
                 AND sibling.deleted_at IS NULL
                 AND sibling.id <> $6
             )
             ELSE sort_order
           END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $6 RETURNING *`,
      [payload.name, payload.alias, payload.echelonLevel, payload.parentId, payload.isPublic, req.params.id],
    );
    if (current.name !== payload.name) {
      await client.query(
        "UPDATE users SET department = $1, updated_at = CURRENT_TIMESTAMP WHERE work_unit_id = $2 OR department = $3",
        [payload.name, current.id, current.name],
      );
    }
    await client.query("COMMIT");
    return res.json(rows[0]);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (error.code === "23505") return res.status(409).json({ error: "Nama Unit Kerja tersebut sudah digunakan" });
    return sendDatabaseError(res, "Gagal mengubah Unit Kerja", error);
  } finally {
    client.release();
  }
};

const deleteWorkUnit = async (req, res) => {
  try {
    const childResult = await pool.query(
      "SELECT COUNT(*)::INTEGER AS count FROM work_units WHERE parent_id = $1 AND deleted_at IS NULL",
      [req.params.id],
    );
    if (Number(childResult.rows[0]?.count) > 0) {
      return res.status(409).json({ error: "Unit Kerja masih memiliki cabang. Hapus atau pindahkan unit turunannya terlebih dahulu" });
    }
    const { rows } = await pool.query(
      `UPDATE work_units
       SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id=$1 AND deleted_at IS NULL RETURNING id`,
      [req.params.id],
    );
    if (!rows[0]) return res.status(404).json({ error: "Unit Kerja tidak ditemukan" });
    return res.json({ message: "Unit Kerja berhasil diarsipkan (soft delete)" });
  } catch (error) {
    return sendDatabaseError(res, "Gagal menghapus Unit Kerja", error);
  }
};

module.exports = {
  getAllCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getAllWorkUnits,
  getBackofficeWorkUnits,
  getWorkUnitAnalyticsScope,
  getWorkUnitAnalytics,
  createWorkUnit,
  reorderWorkUnits,
  updateWorkUnit,
  updateWorkUnitVisibility,
  deleteWorkUnit,
};
