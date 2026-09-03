const cache = new Map();

const removeExpiredEntries = (now) => {
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
};

const responseCache = ({ ttlMs = 15_000, privateCache = false, maxEntries = 250 } = {}) => (req, res, next) => {
  if (req.method !== "GET") return next();

  const now = Date.now();
  const contextIdentity = req.accessContext
    ? `context:${req.accessContext.mode || "view"}:${req.accessContext.id || "unknown"}:${req.accessContext.supervisor_public_id || "direct"}`
    : "root";
  const identity = privateCache
    ? `${req.user?.role || "anonymous"}:${req.user?.id || req.user?.email || "unknown"}:${contextIdentity}`
    : "public";
  const key = `${identity}:${req.originalUrl}`;
  const cached = cache.get(key);

  res.setHeader(
    "Cache-Control",
    privateCache
      ? "private, max-age=0, must-revalidate"
      : `public, max-age=0, s-maxage=${Math.ceil(ttlMs / 1000)}, stale-while-revalidate=${Math.ceil(ttlMs * 4 / 1000)}`,
  );

  if (cached?.expiresAt > now) {
    res.setHeader("X-KMS-Cache", "HIT");
    return res.status(cached.status).json(cached.body);
  }
  if (cached) cache.delete(key);

  const sendJson = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      removeExpiredEntries(now);
      if (cache.size >= maxEntries) cache.delete(cache.keys().next().value);
      cache.set(key, { body, status: res.statusCode, expiresAt: now + ttlMs });
      res.setHeader("X-KMS-Cache", "MISS");
    } else {
      res.setHeader("Cache-Control", "no-store");
    }
    return sendJson(body);
  };

  return next();
};

const invalidateResponseCache = (_req, res, next) => {
  res.once("finish", () => {
    if (res.statusCode >= 200 && res.statusCode < 400) cache.clear();
  });
  next();
};

module.exports = { responseCache, invalidateResponseCache };
