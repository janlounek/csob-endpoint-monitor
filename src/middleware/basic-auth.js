/**
 * Two-tier HTTP Basic Auth.
 *
 * Admin tier:
 *   - Activated when ADMIN_USER and ADMIN_PASS are set in the env.
 *   - Required for admin areas: /, /clients/new, /settings, /api/clients (list/create),
 *     /api/settings, /api/status, /api/check/run, etc.
 *
 * Client tier:
 *   - Each client may have its own username + password stored on the clients table.
 *   - Lets that client access /c/<their-slug>/* and /api/clients/<their-slug>/*
 *     (and the site/check endpoints belonging to their sites).
 *   - Cannot list other clients or access admin areas. A client hitting `/` is
 *     redirected to their own dashboard.
 *
 * If admin env vars are NOT set, auth is disabled entirely (dev mode).
 *
 * Realm names include the client slug ("admin" vs the slug) so the browser keeps
 * the two cred sets separate in its auth cache.
 */
const db = require('../../db/database');

function timingSafeEqualStr(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

function parseBasicAuth(req) {
  const header = req.headers['authorization'] || '';
  if (!header.startsWith('Basic ')) return null;
  let decoded;
  try { decoded = Buffer.from(header.slice(6), 'base64').toString('utf8'); }
  catch (e) { return null; }
  const sep = decoded.indexOf(':');
  if (sep === -1) return { user: decoded, pass: '' };
  return { user: decoded.slice(0, sep), pass: decoded.slice(sep + 1) };
}

function isAdminCreds(creds) {
  const u = process.env.ADMIN_USER;
  const p = process.env.ADMIN_PASS;
  if (!u || !p || !creds) return false;
  return timingSafeEqualStr(creds.user, u) && timingSafeEqualStr(creds.pass, p);
}

function matchesClient(creds, client) {
  if (!client || !client.username || !client.password_hash || !creds) return false;
  return timingSafeEqualStr(creds.user, client.username) && db.verifyPassword(creds.pass, client.password_hash);
}

function extractScope(reqPath) {
  // Path matchers for client scope and site scope. Order matters: site routes are
  // NOT under /api/clients/:slug.
  const c = reqPath.match(/^\/c\/([^\/]+)/) || reqPath.match(/^\/api\/clients\/([^\/]+)/);
  if (c) return { kind: 'client', slug: c[1] };
  const s = reqPath.match(/^\/api\/sites\/(\d+)/) || reqPath.match(/^\/api\/check\/run\/(\d+)$/);
  if (s) return { kind: 'site', siteId: parseInt(s[1], 10) };
  return { kind: 'admin' };
}

function challenge(res, realm) {
  res.set('WWW-Authenticate', 'Basic realm="' + realm + '"');
  return res.status(401).send('Authentication required');
}

function basicAuth(req, res, next) {
  const adminUser = process.env.ADMIN_USER;
  const adminPass = process.env.ADMIN_PASS;

  // Auth disabled in dev — pretend everyone is admin.
  if (!adminUser || !adminPass) {
    req.authContext = 'admin';
    res.locals.authContext = 'admin';
    res.locals.authClientSlug = null;
    return next();
  }

  const creds = parseBasicAuth(req);
  const scope = extractScope(req.path);

  // Identify the request: admin, client, or unauthenticated.
  let authContext = null;
  let authClient = null;

  if (isAdminCreds(creds)) {
    authContext = 'admin';
  } else if (creds) {
    // Look the user up by their username — if it matches a client AND the password
    // verifies, they're authed as that client.
    const candidate = db.getClientByUsername(creds.user);
    if (matchesClient(creds, candidate)) {
      authContext = 'client';
      authClient = candidate;
    }
  }

  req.authContext = authContext;
  req.authClient = authClient;
  req.authClientSlug = authClient ? authClient.slug : null;
  res.locals.authContext = authContext;
  res.locals.authClientSlug = authClient ? authClient.slug : null;

  // ---- Authorise based on scope + auth context ----

  if (scope.kind === 'client') {
    if (authContext === 'admin') return next();
    if (authContext === 'client' && authClient.slug === scope.slug) return next();
    // Wrong/no creds for this client — challenge with this client's realm so the
    // browser asks for fresh credentials specific to it.
    return challenge(res, 'Endpoint Monitor - ' + scope.slug);
  }

  if (scope.kind === 'site') {
    if (authContext === 'admin') return next();
    if (authContext === 'client') {
      const site = db.getSiteById(scope.siteId);
      if (site && site.client_id === authClient.id) return next();
      return res.status(403).send('Forbidden');
    }
    return challenge(res, 'Endpoint Monitor - admin');
  }

  // Admin scope
  if (authContext === 'admin') return next();
  if (authContext === 'client') {
    // Logged in as a client but visiting an admin URL. For the homepage, send them
    // to their own dashboard so they don't see the admin prompt or other clients.
    if (req.path === '/') return res.redirect('/c/' + authClient.slug);
    return res.status(403).send('Forbidden - admin access required');
  }
  return challenge(res, 'Endpoint Monitor - admin');
}

module.exports = basicAuth;
