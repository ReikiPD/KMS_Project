const crypto = require("crypto");
const pool = require("../database/db");
const { admin, session } = require("../config/env");
const { fullPermissions, loadRolePermissions, normalizePermissionMap } = require("./permissionService");

const sha256 = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");
const randomToken = () => crypto.randomBytes(32).toString("base64url");

const parseCookies = (header = "") => header.split(";").reduce((cookies, part) => {
  const separator = part.indexOf("=");
  if (separator < 1) return cookies;
  const name = part.slice(0, separator).trim();
  const value = part.slice(separator + 1).trim();
  try { cookies[name] = decodeURIComponent(value); } catch { cookies[name] = value; }
  return cookies;
}, {});

const cookieOptions = ({ httpOnly, maxAge }) => ({
  httpOnly,
  secure: session.cookieSecure,
  sameSite: "strict",
  path: "/",
  maxAge,
});

const clearSessionCookies = (res) => {
  const options = { secure: session.cookieSecure, sameSite: "strict", path: "/" };
  res.clearCookie(session.cookieName, { ...options, httpOnly: true });
  res.clearCookie(session.csrfCookieName, { ...options, httpOnly: false });
};

const csrfSignature = (sessionTokenHash, nonce) => crypto
  .createHmac("sha256", session.csrfSecret)
  .update(`${sessionTokenHash}.${nonce}`)
  .digest("base64url");

const createCsrfToken = (sessionTokenHash) => {
  const nonce = randomToken();
  return `${nonce}.${csrfSignature(sessionTokenHash, nonce)}`;
};

const safeEqual = (left, right) => {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const verifyCsrfToken = (sessionToken, csrfToken) => {
  if (!sessionToken || !csrfToken) return false;
  const separator = csrfToken.lastIndexOf(".");
  if (separator < 1) return false;
  const nonce = csrfToken.slice(0, separator);
  const signature = csrfToken.slice(separator + 1);
  return safeEqual(signature, csrfSignature(sha256(sessionToken), nonce));
};

const sessionUser = (row) => ({
  ...(row.user_id ? { id: row.user_id } : {}),
  full_name: row.user_full_name || row.actor_label,
  email: row.user_email || row.actor_email,
  department: row.department || null,
  work_unit_id: row.work_unit_id || null,
  work_unit_name: row.work_unit_name || null,
  work_unit_alias: row.work_unit_alias || null,
  work_unit_public_id: row.work_unit_public_id || null,
  work_unit_echelon_level: row.work_unit_echelon_level ? Number(row.work_unit_echelon_level) : null,
  avatar_url: row.avatar_url || null,
  role: row.session_role,
  permissions: row.session_role === "admin" && !row.user_id
    ? fullPermissions()
    : normalizePermissionMap(row.permissions),
  ...(row.session_role === "admin" && !row.user_id ? { environmentAdmin: true } : {}),
});

const issueSession = async ({ user, environmentAdmin = false }, req, res) => {
  const rawToken = randomToken();
  const tokenHash = sha256(rawToken);
  const role = environmentAdmin ? "admin" : user.role;
  const isAdminSession = role === "admin";
  const idleMinutes = isAdminSession ? session.adminIdleMinutes : session.idleMinutes;
  const absoluteMinutes = isAdminSession ? session.adminAbsoluteMinutes : session.absoluteMinutes;
  const adminConfigHash = environmentAdmin ? sha256(admin.passwordHash) : null;

  await pool.query(
    `INSERT INTO user_sessions
       (token_hash, user_id, actor_label, actor_email, role, session_version,
        admin_config_hash, last_seen_at, idle_expires_at, absolute_expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP,
             CURRENT_TIMESTAMP + ($8 * INTERVAL '1 minute'),
             CURRENT_TIMESTAMP + ($9 * INTERVAL '1 minute'))`,
    [
      tokenHash,
      environmentAdmin ? null : user.id,
      user.full_name,
      user.email,
      role,
      environmentAdmin ? null : (user.session_version || 1),
      adminConfigHash,
      idleMinutes,
      absoluteMinutes,
    ],
  );

  const csrfToken = createCsrfToken(tokenHash);
  res.cookie(session.cookieName, rawToken, cookieOptions({ httpOnly: true, maxAge: absoluteMinutes * 60_000 }));
  res.cookie(session.csrfCookieName, csrfToken, cookieOptions({ httpOnly: false, maxAge: absoluteMinutes * 60_000 }));
  return {
    user: {
      ...user,
      role,
      permissions: environmentAdmin ? fullPermissions() : await loadRolePermissions(role),
      ...(environmentAdmin ? { environmentAdmin: true } : {}),
    },
    csrfToken,
  };
};

const getRawSessionToken = (req) => parseCookies(req.headers.cookie)[session.cookieName] || "";

const loadSession = async (req, { optional = false } = {}) => {
  const rawToken = getRawSessionToken(req);
  if (!rawToken) return optional ? null : { error: "Sesi tidak ditemukan", status: 403 };

  const tokenHash = sha256(rawToken);
  const { rows } = await pool.query(
    `SELECT s.id AS session_id, s.token_hash, s.user_id, s.actor_label, s.actor_email,
            s.role AS session_role, s.session_version, s.admin_config_hash,
            s.last_seen_at, s.idle_expires_at, s.absolute_expires_at,
            u.full_name AS user_full_name, u.email AS user_email, u.department,
            u.avatar_url, u.role AS user_role, u.session_version AS user_session_version,
            u.work_unit_id, wu.public_id AS work_unit_public_id, wu.name AS work_unit_name, wu.alias AS work_unit_alias,
            wu.echelon_level AS work_unit_echelon_level,
            u.deleted_at AS user_deleted_at,
            COALESCE((
              SELECT jsonb_object_agg(
                rp.resource,
                jsonb_build_object(
                  'view', rp.can_view,
                  'post', rp.can_post,
                  'edit', rp.can_edit,
                  'delete', rp.can_delete
                )
              )
              FROM role_permissions rp
              WHERE rp.role = s.role
            ), '{}'::jsonb) AS permissions
     FROM user_sessions s
     LEFT JOIN users u ON u.id = s.user_id
     LEFT JOIN work_units wu ON wu.id = u.work_unit_id AND wu.deleted_at IS NULL
     WHERE s.token_hash = $1 AND s.revoked_at IS NULL
       AND s.idle_expires_at > CURRENT_TIMESTAMP
       AND s.absolute_expires_at > CURRENT_TIMESTAMP
     LIMIT 1`,
    [tokenHash],
  );
  const row = rows[0];
  if (!row) return optional ? null : { error: "Sesi tidak valid atau telah kedaluwarsa", status: 401 };

  const invalidUser = row.user_id && (
    row.user_deleted_at
    || row.user_role !== row.session_role
    || Number(row.user_session_version) !== Number(row.session_version)
  );
  const invalidAdmin = row.session_role === "admin" && !row.user_id && (
    !row.admin_config_hash || !safeEqual(row.admin_config_hash, sha256(admin.passwordHash))
  );
  if (invalidUser || invalidAdmin) {
    await pool.query("UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = $1", [row.session_id]);
    return optional ? null : { error: "Sesi tidak lagi aktif", status: 401 };
  }

  const idleMinutes = row.session_role === "admin" ? session.adminIdleMinutes : session.idleMinutes;
  await pool.query(
    `UPDATE user_sessions
     SET last_seen_at = CURRENT_TIMESTAMP,
         idle_expires_at = LEAST(absolute_expires_at, CURRENT_TIMESTAMP + ($2 * INTERVAL '1 minute'))
     WHERE id = $1
       AND last_seen_at < CURRENT_TIMESTAMP - ($3 * INTERVAL '1 second')`,
    [row.session_id, idleMinutes, session.touchIntervalSeconds],
  );

  return { id: row.session_id, tokenHash, user: sessionUser(row) };
};

const revokeRequestSession = async (req) => {
  const rawToken = getRawSessionToken(req);
  if (!rawToken) return;
  await pool.query(
    "UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE token_hash = $1 AND revoked_at IS NULL",
    [sha256(rawToken)],
  );
};

const revokeUserSessions = async (userId) => {
  await pool.query(
    "UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND revoked_at IS NULL",
    [userId],
  );
};

module.exports = {
  clearSessionCookies,
  getRawSessionToken,
  issueSession,
  loadSession,
  parseCookies,
  revokeRequestSession,
  revokeUserSessions,
  verifyCsrfToken,
};
