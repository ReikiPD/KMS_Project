const pool = require("../../config/db");
const { hasPermission, hasOrganizationScope } = require("../../services/permissionService");
const {
  getRequestedAuthorId,
} = require("./shared");

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

const getDashboardPeriod = (query) => {
  const period = typeof query.period === "string" && DASHBOARD_PERIODS.has(query.period) ? query.period : "all";
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  let startDate = null;
  let endDate = today;

  if (period === "7d") startDate = addUtcDays(today, -6);
  if (period === "30d") startDate = addUtcDays(today, -29);
  if (period === "90d") startDate = addUtcDays(today, -89);
  if (period === "year") startDate = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));

  if (period === "custom") {
    startDate = parseIsoDay(query.startDate);
    endDate = parseIsoDay(query.endDate);
    if (!startDate || !endDate) return { error: "Rentang tanggal khusus tidak valid" };
    if (startDate > endDate) return { error: "Tanggal mulai tidak boleh melebihi tanggal akhir" };
    if (endDate > today) return { error: "Tanggal akhir tidak boleh melewati hari ini" };
    if ((endDate.getTime() - startDate.getTime()) / DAY_IN_MS > 365) {
      return { error: "Rentang tanggal maksimal satu tahun" };
    }
  }

  const hasRange = Boolean(startDate);
  return {
    key: period,
    hasRange,
    startDate: hasRange ? dateToIsoDay(startDate) : null,
    endDate: hasRange ? dateToIsoDay(endDate) : null,
    endExclusive: hasRange ? dateToIsoDay(addUtcDays(endDate, 1)) : null,
  };
};

const getTrendRange = (period) => {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const trendStart = period.hasRange ? new Date(`${period.startDate}T00:00:00.000Z`) : addUtcDays(today, -364);
  const trendEnd = period.hasRange ? new Date(`${period.endDate}T00:00:00.000Z`) : today;
  const dayCount = Math.floor((trendEnd.getTime() - trendStart.getTime()) / DAY_IN_MS) + 1;
  if (dayCount <= 31) return { startDate: dateToIsoDay(trendStart), endExclusive: dateToIsoDay(addUtcDays(trendEnd, 1)), unit: "day", label: "Harian" };
  if (dayCount <= 90) return { startDate: dateToIsoDay(trendStart), endExclusive: dateToIsoDay(addUtcDays(trendEnd, 1)), unit: "week", label: "Mingguan" };
  return { startDate: dateToIsoDay(trendStart), endExclusive: dateToIsoDay(addUtcDays(trendEnd, 1)), unit: "month", label: "Bulanan" };
};

const getPreviousDashboardRange = (period) => {
  if (!period.hasRange) return null;
  const currentStart = new Date(`${period.startDate}T00:00:00.000Z`);
  const currentEnd = new Date(`${period.endExclusive}T00:00:00.000Z`);
  const duration = currentEnd.getTime() - currentStart.getTime();
  const previousStart = new Date(currentStart.getTime() - duration);
  return { startDate: dateToIsoDay(previousStart), endExclusive: period.startDate };
};

const getAdminDashboard = async (req, res) => {
  const accessSubject = req.accessContext || req.user;
  const isGlobalAdmin = hasOrganizationScope(accessSubject);
  const hasOrganizationAnalytics = [1, 2, 3].some((level) => hasPermission(accessSubject, `analytics_echelon_${level}`, "view"));
  if (!isGlobalAdmin && accessSubject?.role !== "pegawai" && hasOrganizationAnalytics) {
    return res.status(403).json({ error: accessSubject.work_unit_id
      ? "Gunakan halaman Analitik Unit Saya untuk melihat statistik sesuai cakupan organisasi"
      : "Akun pimpinan belum memiliki Unit Kerja sebagai batas analitik" });
  }
  const scope = getRequestedAuthorId(req);
  if (scope.error) return res.status(403).json({ error: scope.error });
  const period = getDashboardPeriod(req.query);
  if (period.error) return res.status(400).json({ error: period.error });
  const trend = getTrendRange(period);
  const previousPeriod = getPreviousDashboardRange(period);

  try {
    const scopedValues = period.hasRange ? [period.startDate, period.endExclusive] : [];
    const assetRangeFilter = period.hasRange ? " AND a.created_at >= $1::date AND a.created_at < $2::date" : "";
    const viewRangeFilter = period.hasRange ? " AND v.created_at >= $1::date AND v.created_at < $2::date" : "";
    const assetScope = scope.authorId ? ` AND a.author_id = $${scopedValues.push(scope.authorId)}` : "";
    const viewScope = scope.authorId ? ` AND a.author_id = $${scopedValues.length}` : "";
    const organizationQuery = period.hasRange ? `
      SELECT
        COUNT(*) FILTER (WHERE a.is_published = TRUE)::int AS published_asset_count,
        COUNT(*) FILTER (WHERE a.is_published = TRUE AND a.asset_type <> 'video')::int AS document_count,
        COUNT(*) FILTER (WHERE a.is_published = TRUE AND a.asset_type = 'video')::int AS video_count,
        (SELECT COUNT(v.id)::int FROM asset_views v INNER JOIN knowledge_assets av ON av.id = v.asset_id
         WHERE av.is_published = TRUE AND av.deleted_at IS NULL${scope.authorId ? ` AND av.author_id = $${scopedValues.length}` : ""}${viewRangeFilter.replaceAll("a.", "v.")}) AS total_view_count
      FROM knowledge_assets a
      WHERE a.deleted_at IS NULL${assetRangeFilter}${assetScope}
    ` : `
      SELECT COUNT(*) FILTER (WHERE a.is_published = TRUE)::int AS published_asset_count,
             COALESCE(SUM(a.view_count) FILTER (WHERE a.is_published = TRUE), 0)::int AS total_view_count,
             COUNT(*) FILTER (WHERE a.is_published = TRUE AND a.asset_type <> 'video')::int AS document_count,
             COUNT(*) FILTER (WHERE a.is_published = TRUE AND a.asset_type = 'video')::int AS video_count
      FROM knowledge_assets a
      WHERE a.deleted_at IS NULL${assetScope}
    `;
    const topAssetsQuery = period.hasRange ? `
      SELECT a.id, a.public_id, a.slug, a.title, a.asset_type, COUNT(v.id)::int AS view_count, a.created_at,
             c.name AS category_name, w.name AS work_unit_name
      FROM asset_views v INNER JOIN knowledge_assets a ON a.id = v.asset_id
      LEFT JOIN categories c ON a.category_id = c.id LEFT JOIN work_units w ON a.work_unit_id = w.id
      WHERE a.is_published = TRUE AND a.deleted_at IS NULL${viewRangeFilter}${viewScope}
      GROUP BY a.id, c.name, w.name ORDER BY COUNT(v.id) DESC, a.created_at DESC, a.id DESC LIMIT 5
    ` : `
      SELECT a.id, a.public_id, a.slug, a.title, a.asset_type, COALESCE(a.view_count, 0)::int AS view_count, a.created_at,
             c.name AS category_name, w.name AS work_unit_name
      FROM knowledge_assets a LEFT JOIN categories c ON a.category_id = c.id LEFT JOIN work_units w ON a.work_unit_id = w.id
      WHERE a.is_published = TRUE AND a.deleted_at IS NULL${assetScope}
      ORDER BY COALESCE(a.view_count, 0) DESC, a.created_at DESC, a.id DESC LIMIT 5
    `;
    const shareRangeFilter = period.hasRange ? " AND s.created_at >= $1::date AND s.created_at < $2::date" : "";
    const topSharedQuery = `
      SELECT a.id, a.public_id, a.slug, a.title, a.asset_type, COUNT(s.id)::int AS share_count, a.created_at
      FROM asset_share_events s INNER JOIN knowledge_assets a ON a.id = s.asset_id
      WHERE a.is_published = TRUE AND a.deleted_at IS NULL${shareRangeFilter}${scope.authorId ? ` AND a.author_id = $${scopedValues.length}` : ""}
      GROUP BY a.id ORDER BY COUNT(s.id) DESC, a.created_at DESC, a.id DESC LIMIT 5`;
    const searchFilter = period.hasRange ? "WHERE e.created_at >= $1::date AND e.created_at < $2::date" : "";
    const labelFormat = trend.unit === "month" ? "Mon YY" : "DD Mon";
    const trendAuthorFilter = scope.authorId ? " AND a.author_id = $3" : "";
    const trendQuery = `
      WITH buckets AS (SELECT generate_series(date_trunc('${trend.unit}', $1::date), date_trunc('${trend.unit}', ($2::date - INTERVAL '1 day')), INTERVAL '1 ${trend.unit}') AS bucket_start)
      SELECT TO_CHAR(b.bucket_start, 'YYYY-MM-DD') AS bucket, TO_CHAR(b.bucket_start, '${labelFormat}') AS label, COUNT(a.id)::int AS asset_count
      FROM buckets b LEFT JOIN knowledge_assets a ON a.created_at >= b.bucket_start AND a.created_at < b.bucket_start + INTERVAL '1 ${trend.unit}'
        AND a.is_published = TRUE AND a.deleted_at IS NULL AND a.created_at >= $1::date AND a.created_at < $2::date${trendAuthorFilter}
      GROUP BY b.bucket_start ORDER BY b.bucket_start ASC`;
    const personalAuthorId = scope.authorId || (!isGlobalAdmin ? accessSubject.id : null);
    const previousValues = previousPeriod
      ? [previousPeriod.startDate, previousPeriod.endExclusive, ...(scope.authorId ? [scope.authorId] : [])]
      : [];
    const previousOrganizationPromise = previousPeriod ? pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE a.is_published = TRUE)::int AS published_asset_count,
        COUNT(*) FILTER (WHERE a.is_published = TRUE AND a.asset_type <> 'video')::int AS document_count,
        COUNT(*) FILTER (WHERE a.is_published = TRUE AND a.asset_type = 'video')::int AS video_count,
        (SELECT COUNT(v.id)::int FROM asset_views v
         INNER JOIN knowledge_assets av ON av.id = v.asset_id
         WHERE av.is_published = TRUE AND av.deleted_at IS NULL
           AND v.created_at >= $1::date AND v.created_at < $2::date${scope.authorId ? " AND av.author_id = $3" : ""}) AS total_view_count
      FROM knowledge_assets a
      WHERE a.deleted_at IS NULL
        AND a.created_at >= $1::date AND a.created_at < $2::date${scope.authorId ? " AND a.author_id = $3" : ""}
    `, previousValues) : Promise.resolve({ rows: [null] });
    const personalValues = [personalAuthorId, ...(period.hasRange ? [period.startDate, period.endExclusive] : [])];
    const personalPromise = personalAuthorId ? pool.query(`
      SELECT COUNT(*)::int AS asset_count, COUNT(*) FILTER (WHERE a.is_published)::int AS published_asset_count,
        COUNT(*) FILTER (WHERE NOT a.is_published)::int AS draft_count,
        ${period.hasRange ? `(SELECT COUNT(v.id)::int FROM asset_views v JOIN knowledge_assets av ON av.id=v.asset_id WHERE av.author_id=$1 AND av.deleted_at IS NULL AND av.is_published=TRUE AND v.created_at >= $2::date AND v.created_at < $3::date)` : "COALESCE(SUM(a.view_count), 0)::int"} AS total_view_count
      FROM knowledge_assets a WHERE a.author_id = $1 AND a.deleted_at IS NULL${period.hasRange ? " AND a.created_at >= $2::date AND a.created_at < $3::date" : ""}`, personalValues) : Promise.resolve({ rows: [{ asset_count: 0, published_asset_count: 0, draft_count: 0, total_view_count: 0 }] });
    const recentPromise = hasPermission(accessSubject, "assets", "view") ? pool.query(`
      SELECT a.id, a.public_id, a.slug, a.title, a.asset_type, a.is_published, a.publication_status, COALESCE(a.view_count, 0)::int AS view_count, a.created_at, c.name AS category_name
      FROM knowledge_assets a LEFT JOIN categories c ON c.id = a.category_id
      WHERE a.deleted_at IS NULL${assetRangeFilter}${assetScope} ORDER BY a.created_at DESC, a.id DESC LIMIT 5`, scopedValues) : Promise.resolve({ rows: [] });
    // Selalu sertakan ranking global untuk Admin. Frontend menyembunyikannya
    // ketika Admin sedang berada dalam konteks akun Pegawai.
    const includeStaffRankings = hasOrganizationScope(accessSubject);
    const staffPeriodValues = period.hasRange ? [period.startDate, period.endExclusive] : [];
    const staffAssetRangeFilter = period.hasRange ? " AND a.created_at >= $1::date AND a.created_at < $2::date" : "";
    const emptyStaffRanking = () => Promise.resolve({ rows: [] });
    const staffPublishedPromise = includeStaffRankings ? pool.query(`
      SELECT u.id, u.full_name, u.email, u.department, COUNT(a.id)::int AS metric_value
      FROM users u
      INNER JOIN knowledge_assets a ON a.author_id = u.id
      WHERE u.role = 'pegawai' AND u.deleted_at IS NULL
        AND a.deleted_at IS NULL AND a.is_published = TRUE${staffAssetRangeFilter}
      GROUP BY u.id, u.full_name, u.email, u.department
      HAVING COUNT(a.id) > 0
      ORDER BY metric_value DESC, u.full_name ASC
      LIMIT 5`, staffPeriodValues) : emptyStaffRanking();
    const staffCreatedPromise = includeStaffRankings ? pool.query(`
      SELECT u.id, u.full_name, u.email, u.department, COUNT(a.id)::int AS metric_value
      FROM users u
      INNER JOIN knowledge_assets a ON a.author_id = u.id
      WHERE u.role = 'pegawai' AND u.deleted_at IS NULL
        AND a.deleted_at IS NULL${staffAssetRangeFilter}
      GROUP BY u.id, u.full_name, u.email, u.department
      HAVING COUNT(a.id) > 0
      ORDER BY metric_value DESC, u.full_name ASC
      LIMIT 5`, staffPeriodValues) : emptyStaffRanking();
    const staffViewsPromise = includeStaffRankings ? pool.query(period.hasRange ? `
      SELECT u.id, u.full_name, u.email, u.department, COUNT(v.id)::int AS metric_value
      FROM users u
      INNER JOIN knowledge_assets a ON a.author_id = u.id
      INNER JOIN asset_views v ON v.asset_id = a.id
      WHERE u.role = 'pegawai' AND u.deleted_at IS NULL
        AND a.deleted_at IS NULL AND a.is_published = TRUE
        AND v.created_at >= $1::date AND v.created_at < $2::date
      GROUP BY u.id, u.full_name, u.email, u.department
      HAVING COUNT(v.id) > 0
      ORDER BY metric_value DESC, u.full_name ASC
      LIMIT 5` : `
      SELECT u.id, u.full_name, u.email, u.department, COALESCE(SUM(a.view_count), 0)::int AS metric_value
      FROM users u
      INNER JOIN knowledge_assets a ON a.author_id = u.id
      WHERE u.role = 'pegawai' AND u.deleted_at IS NULL
        AND a.deleted_at IS NULL AND a.is_published = TRUE
      GROUP BY u.id, u.full_name, u.email, u.department
      HAVING COALESCE(SUM(a.view_count), 0) > 0
      ORDER BY metric_value DESC, u.full_name ASC
      LIMIT 5`, staffPeriodValues) : emptyStaffRanking();
    const echelonComparisonPromise = scope.authorId
      ? Promise.resolve({ rows: [] })
      : period.hasRange ? pool.query(`
      SELECT w.public_id, w.name, w.alias, w.logo_url,
        (SELECT COUNT(a.id)::INTEGER
         FROM knowledge_assets a
         INNER JOIN work_units aw ON aw.id = a.work_unit_id
         WHERE a.deleted_at IS NULL AND a.is_published = TRUE
           AND (aw.id = w.id OR aw.parent_id = w.id)
           AND a.created_at >= $1::date AND a.created_at < $2::date) AS published_asset_count,
        (SELECT COUNT(v.id)::INTEGER
         FROM asset_views v
         INNER JOIN knowledge_assets a ON a.id = v.asset_id
         INNER JOIN work_units aw ON aw.id = a.work_unit_id
         WHERE a.deleted_at IS NULL AND a.is_published = TRUE
           AND (aw.id = w.id OR aw.parent_id = w.id)
           AND v.created_at >= $1::date AND v.created_at < $2::date) AS total_view_count
      FROM work_units w
      WHERE w.echelon_level = 1 AND w.deleted_at IS NULL
      ORDER BY w.name ASC`, [period.startDate, period.endExclusive]) : pool.query(`
      SELECT w.public_id, w.name, w.alias, w.logo_url,
        COUNT(a.id) FILTER (WHERE a.is_published = TRUE)::INTEGER AS published_asset_count,
        COALESCE(SUM(a.view_count) FILTER (WHERE a.is_published = TRUE), 0)::INTEGER AS total_view_count
      FROM work_units w
      LEFT JOIN work_units aw ON aw.deleted_at IS NULL AND (aw.id = w.id OR aw.parent_id = w.id)
      LEFT JOIN knowledge_assets a ON a.work_unit_id = aw.id AND a.deleted_at IS NULL
      WHERE w.echelon_level = 1 AND w.deleted_at IS NULL
      GROUP BY w.id
      ORDER BY w.name ASC`);
    const [organizationResult, trendResult, topAssetsResult, topSharedResult, popularSearchesResult, personalResult, recentAssetsResult, staffPublishedResult, staffViewsResult, staffCreatedResult, previousOrganizationResult, echelonComparisonResult] = await Promise.all([
      pool.query(organizationQuery, scopedValues),
      pool.query(trendQuery, scope.authorId ? [trend.startDate, trend.endExclusive, scope.authorId] : [trend.startDate, trend.endExclusive]),
      pool.query(topAssetsQuery, scopedValues), pool.query(topSharedQuery, scopedValues),
      pool.query(`
        SELECT e.query,
               COUNT(*)::int AS search_count,
               COUNT(*) FILTER (WHERE e.result_count = 0)::int AS zero_result_count,
               SUM(COUNT(*)) OVER()::int AS total_searches,
               SUM(COUNT(*) FILTER (WHERE e.result_count = 0)) OVER()::int AS zero_result_searches
        FROM search_events e ${searchFilter}
        GROUP BY e.query
        ORDER BY COUNT(*) DESC, MAX(e.created_at) DESC
        LIMIT 5`, period.hasRange ? [period.startDate, period.endExclusive] : []),
      personalPromise, recentPromise, staffPublishedPromise, staffViewsPromise, staffCreatedPromise, previousOrganizationPromise, echelonComparisonPromise,
    ]);
    const searchTotals = popularSearchesResult.rows[0] || { total_searches: 0, zero_result_searches: 0 };
    const popularSearches = popularSearchesResult.rows.map(({ total_searches: _total, zero_result_searches: _zero, ...row }) => row);
    res.json({
      organization: organizationResult.rows[0], publicationTrend: trendResult.rows, topAssets: topAssetsResult.rows,
      discovery: {
        total_searches: searchTotals.total_searches,
        zero_result_searches: searchTotals.zero_result_searches,
        topShared: topSharedResult.rows,
        popularSearches,
      },
      rankings: {
        search: popularSearches.map((row) => ({ ...row, metric_value: row.search_count })),
        view: topAssetsResult.rows.map((row) => ({ ...row, metric_value: row.view_count })),
        share: topSharedResult.rows.map((row) => ({ ...row, metric_value: row.share_count })),
      },
      staffRankings: {
        published: staffPublishedResult.rows,
        views: staffViewsResult.rows,
        created: staffCreatedResult.rows,
      },
      echelonComparison: echelonComparisonResult.rows,
      period: { key: period.key, startDate: period.startDate, endDate: period.endDate, trendGranularity: trend.label, viewMetric: period.hasRange ? "period" : "all_time" },
      comparison: { available: Boolean(previousPeriod), previous: previousOrganizationResult.rows[0] },
      selectedAuthorId: personalAuthorId,
      recentAssets: recentAssetsResult.rows,
      personal: { ...personalResult.rows[0], recentAssets: recentAssetsResult.rows },
    });
  } catch (error) {
    console.error("Error fetching admin dashboard:", error);
    res.status(500).json({ error: "Gagal memuat ringkasan dashboard" });
  }
};

const getAdminDashboardRanking = async (req, res) => {
  const accessSubject = req.accessContext || req.user;
  const isGlobalAdmin = hasOrganizationScope(accessSubject);
  if (!isGlobalAdmin && accessSubject?.role !== "pegawai"
    && [1, 2, 3].some((level) => hasPermission(accessSubject, `analytics_echelon_${level}`, "view"))) {
    return res.status(403).json({ error: "Ranking global tidak tersedia di luar cakupan organisasi" });
  }
  const metric = typeof req.query.metric === "string" ? req.query.metric : "";
  const validMetrics = new Set(["search", "view", "share", "staff_published", "staff_views", "staff_created"]);
  if (!validMetrics.has(metric)) {
    return res.status(400).json({ error: "Metric ranking tidak valid" });
  }
  const isStaffMetric = metric.startsWith("staff_");
  if (isStaffMetric && !isGlobalAdmin) {
    return res.status(403).json({ error: "Ranking kontribusi Pegawai hanya tersedia untuk Admin" });
  }

  const scope = getRequestedAuthorId(req);
  if (scope.error) return res.status(403).json({ error: scope.error });
  const period = getDashboardPeriod(req.query);
  if (period.error) return res.status(400).json({ error: period.error });

  const pageValue = Number.parseInt(req.query.page, 10);
  const limitValue = Number.parseInt(req.query.limit, 10);
  const page = Number.isInteger(pageValue) && pageValue > 0 ? pageValue : 1;
  const limit = Number.isInteger(limitValue) && limitValue > 0 ? Math.min(limitValue, 50) : 10;
  const offset = (page - 1) * limit;
  const query = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 160) : "";
  const values = [];
  const addValue = (value) => {
    values.push(value);
    return `$${values.length}`;
  };
  const rangeFilter = (alias, column = "created_at") => period.hasRange
    ? ` AND ${alias}.${column} >= ${addValue(period.startDate)}::date AND ${alias}.${column} < ${addValue(period.endExclusive)}::date`
    : "";

  let baseSql;
  if (isStaffMetric) {
    const filters = ["u.role = 'pegawai'", "u.deleted_at IS NULL", "a.deleted_at IS NULL"];
    if (query) {
      const searchParameter = addValue(`%${query}%`);
      filters.push(`(u.full_name ILIKE ${searchParameter} OR u.email ILIKE ${searchParameter} OR COALESCE(u.department, '') ILIKE ${searchParameter})`);
    }

    if (metric === "staff_views") {
      filters.push("a.is_published = TRUE");
      if (period.hasRange) {
        filters.push(`v.created_at >= ${addValue(period.startDate)}::date`);
        filters.push(`v.created_at < ${addValue(period.endExclusive)}::date`);
        baseSql = `
          SELECT u.id, u.full_name, u.email, u.department,
                 COUNT(v.id)::int AS metric_value, u.full_name AS sort_label
          FROM users u
          INNER JOIN knowledge_assets a ON a.author_id = u.id
          INNER JOIN asset_views v ON v.asset_id = a.id
          WHERE ${filters.join(" AND ")}
          GROUP BY u.id, u.full_name, u.email, u.department
          HAVING COUNT(v.id) > 0`;
      } else {
        baseSql = `
          SELECT u.id, u.full_name, u.email, u.department,
                 COALESCE(SUM(a.view_count), 0)::int AS metric_value, u.full_name AS sort_label
          FROM users u
          INNER JOIN knowledge_assets a ON a.author_id = u.id
          WHERE ${filters.join(" AND ")}
          GROUP BY u.id, u.full_name, u.email, u.department
          HAVING COALESCE(SUM(a.view_count), 0) > 0`;
      }
    } else {
      if (metric === "staff_published") filters.push("a.is_published = TRUE");
      if (period.hasRange) {
        filters.push(`a.created_at >= ${addValue(period.startDate)}::date`);
        filters.push(`a.created_at < ${addValue(period.endExclusive)}::date`);
      }
      baseSql = `
        SELECT u.id, u.full_name, u.email, u.department,
               COUNT(a.id)::int AS metric_value, u.full_name AS sort_label
        FROM users u
        INNER JOIN knowledge_assets a ON a.author_id = u.id
        WHERE ${filters.join(" AND ")}
        GROUP BY u.id, u.full_name, u.email, u.department
        HAVING COUNT(a.id) > 0`;
    }
  } else if (metric === "search") {
    const filters = ["1 = 1"];
    if (period.hasRange) {
      filters.push(`e.created_at >= ${addValue(period.startDate)}::date`);
      filters.push(`e.created_at < ${addValue(period.endExclusive)}::date`);
    }
    if (query) filters.push(`e.query ILIKE ${addValue(`%${query}%`)}`);
    baseSql = `
      SELECT e.query AS label, e.query AS sort_label, COUNT(*)::int AS metric_value, MAX(e.created_at) AS last_event_at
      FROM search_events e
      WHERE ${filters.join(" AND ")}
      GROUP BY e.query`;
  } else {
    const eventAlias = metric === "view" ? "v" : "s";
    const eventTable = metric === "view" ? "asset_views" : "asset_share_events";
    const eventFilter = period.hasRange ? rangeFilter(eventAlias) : "";
    const assetFilters = ["a.is_published = TRUE", "a.deleted_at IS NULL"];
    if (scope.authorId) assetFilters.push(`a.author_id = ${addValue(scope.authorId)}`);
    if (query) assetFilters.push(`a.title ILIKE ${addValue(`%${query}%`)}`);

    if (metric === "view" && !period.hasRange) {
      baseSql = `
        SELECT a.id, a.public_id, a.slug, a.title, a.asset_type, a.thumbnail_url,
               COALESCE(u.full_name, 'Pegawai tidak aktif') AS author_name,
               c.name AS category_name, COALESCE(a.view_count, 0)::int AS metric_value,
               a.title AS sort_label
        FROM knowledge_assets a
        LEFT JOIN users u ON u.id = a.author_id AND u.deleted_at IS NULL
        LEFT JOIN categories c ON c.id = a.category_id
        WHERE ${assetFilters.join(" AND ")}`;
    } else {
      baseSql = `
        SELECT a.id, a.public_id, a.slug, a.title, a.asset_type, a.thumbnail_url,
               COALESCE(u.full_name, 'Pegawai tidak aktif') AS author_name,
               c.name AS category_name, COUNT(${eventAlias}.id)::int AS metric_value,
               a.title AS sort_label
        FROM ${eventTable} ${eventAlias}
        INNER JOIN knowledge_assets a ON a.id = ${eventAlias}.asset_id
        LEFT JOIN users u ON u.id = a.author_id AND u.deleted_at IS NULL
        LEFT JOIN categories c ON c.id = a.category_id
        WHERE ${assetFilters.join(" AND ")}${eventFilter}
        GROUP BY a.id, u.full_name, c.name`;
    }
  }

  try {
    const countResult = await pool.query(`SELECT COUNT(*)::int AS count FROM (${baseSql}) ranked`, values);
    const listValues = [...values, limit, offset];
    const listResult = await pool.query(
      `WITH ranked AS (${baseSql})
       SELECT ranked.*, ROW_NUMBER() OVER (ORDER BY metric_value DESC, sort_label ASC) AS rank
       FROM ranked
       ORDER BY metric_value DESC, sort_label ASC
       LIMIT $${listValues.length - 1} OFFSET $${listValues.length}`,
      listValues,
    );
    const totalItems = countResult.rows[0].count;
    return res.json({
      metric,
      data: listResult.rows,
      pagination: { currentPage: page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) },
      period: { key: period.key, startDate: period.startDate, endDate: period.endDate },
    });
  } catch (error) {
    console.error("Error fetching dashboard ranking:", error);
    return res.status(500).json({ error: "Gagal memuat ranking dashboard" });
  }
};

module.exports = {
  getAdminDashboard,
  getAdminDashboardRanking,
};
