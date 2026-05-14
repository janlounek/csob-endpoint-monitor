/**
 * Optional HTTP Basic Auth.
 *
 * Activates only when both ADMIN_USER and ADMIN_PASS are set in the environment.
 * If unset (e.g. local dev), the middleware is a no-op so the app remains open.
 */
function timingSafeEqualStr(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

function basicAuth(req, res, next) {
  const user = process.env.ADMIN_USER;
  const pass = process.env.ADMIN_PASS;
  if (!user || !pass) return next();  // Auth disabled

  const header = req.headers['authorization'] || '';
  if (!header.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="Endpoint Monitor"');
    return res.status(401).send('Authentication required');
  }

  let decoded;
  try {
    decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  } catch (e) {
    res.set('WWW-Authenticate', 'Basic realm="Endpoint Monitor"');
    return res.status(401).send('Authentication required');
  }
  const sep = decoded.indexOf(':');
  const providedUser = sep === -1 ? decoded : decoded.slice(0, sep);
  const providedPass = sep === -1 ? '' : decoded.slice(sep + 1);

  if (timingSafeEqualStr(providedUser, user) && timingSafeEqualStr(providedPass, pass)) {
    return next();
  }
  res.set('WWW-Authenticate', 'Basic realm="Endpoint Monitor"');
  return res.status(401).send('Authentication required');
}

module.exports = basicAuth;
