const http = require('node:http');

const METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
const GROUPS = ['/api/internal-assets', '/api/announcements', '/api/assets', '/api/users', '/api/health'];

const disabledMonitoring = () => ({ enabled: false, middleware: (_req, _res, next) => next(), start: async () => null, stop: async () => {} });

function createMonitoring(options = {}) {
  // Disabled monitoring does not load the collector or create a listener.
  if (!options.enabled) return disabledMonitoring();
  try { return createEnabledMonitoring(options); }
  catch {
    console.warn('Kolektor metrik tidak dapat diinisialisasi; backend tetap berjalan tanpa monitoring.');
    return disabledMonitoring();
  }
}

function createEnabledMonitoring({ port = 9464, pool }) {
  const { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } = require('@prometheus-io/client');
  const registry = new Registry();
  registry.setDefaultLabels({ service: 'kms-backend' });
  const stopCollecting = collectDefaultMetrics({ register: registry, prefix: 'kms_', eventLoopMonitoringPrecision: 20 });
  const labelNames = ['method', 'group', 'route', 'status'];
  const requests = new Counter({ name: 'kms_http_requests_total', help: 'Completed KMS HTTP requests.', labelNames, registers: [registry] });
  const duration = new Histogram({ name: 'kms_http_request_duration_seconds', help: 'KMS HTTP response duration in seconds.', labelNames, buckets: [.01, .05, .1, .25, .5, 1, 2.5, 5, 10, 30, 120], registers: [registry] });
  const active = new Gauge({ name: 'kms_http_requests_in_flight', help: 'Currently active KMS HTTP requests.', registers: [registry] });
  new Gauge({ name: 'kms_database_pool_connections', help: 'Connection pool size, without querying application data.', labelNames: ['state'], registers: [registry], collect() {
    this.set({ state: 'total' }, pool?.totalCount || 0);
    this.set({ state: 'idle' }, pool?.idleCount || 0);
    this.set({ state: 'waiting' }, pool?.waitingCount || 0);
  } });
  let server, starting;
  const middleware = (req, res, next) => {
    const method = METHODS.has(req.method) ? req.method : 'OTHER';
    const group = GROUPS.find(prefix => req.path === prefix || req.path.startsWith(`${prefix}/`)) || 'other';
    const start = process.hrtime.bigint();
    let completed = false;
    active.inc();
    const complete = () => {
      if (completed) return;
      completed = true;
      // Only Express's registered route template is used; never originalUrl,
      // query strings, user IDs, document titles, cookies, or authorization.
      const route = typeof req.route?.path === 'string' ? req.route.path : 'unmatched';
      const labels = { method, group, route, status: res.writableFinished ? String(res.statusCode) : 'aborted' };
      active.dec();requests.inc(labels);
      duration.observe(labels, Number(process.hrtime.bigint() - start) / 1e9);
    };
    res.once('finish', complete);res.once('close', complete);
    next();
  };
  return {
    enabled: true, middleware, registry,
    get address() { return server?.address(); },
    start() {
      if (starting) return starting;
      starting = new Promise((resolve, reject) => {
        server = http.createServer(async (req, res) => {
          res.setHeader('Cache-Control', 'no-store');
          if (req.url !== '/metrics') { res.writeHead(404);res.end();return; }
          if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' });res.end();return; }
          try {
            const body = await registry.metrics();
            if (res.destroyed) return;
            res.writeHead(200, { 'Content-Type': registry.contentType, 'X-Content-Type-Options': 'nosniff' });
            res.end(req.method === 'HEAD' ? undefined : body);
          } catch { res.writeHead(503);res.end('Metrics temporarily unavailable'); }
        });
        server.requestTimeout = 10_000;server.headersTimeout = 10_000;server.keepAliveTimeout = 1000;
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () => resolve(server.address()));
      });
      return starting;
    },
    async stop() {
      if (server?.listening) { server.closeAllConnections();await new Promise(resolve => server.close(resolve)); }
      if (typeof stopCollecting === 'function') stopCollecting();
      registry.clear();
    },
  };
}

module.exports = { createMonitoring };
