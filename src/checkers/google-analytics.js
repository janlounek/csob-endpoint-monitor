/**
 * Google Analytics checker (GA4 / Universal Analytics / gtag.js)
 *
 * Optional config:
 *   measurementId  — expected G-/UA- ID (purely informational fallback)
 *   dataLayerName  — custom dataLayer global name (default 'dataLayer'); used by
 *                    sites that initialize gtag with a non-standard dataLayer
 *   endpoint       — custom collection endpoint (e.g. 'gtm.example.com') used by
 *                    server-side GTM. When set, requests to that host count as
 *                    collect beacons in addition to the standard Google endpoints.
 */
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = async function checkGoogleAnalytics(page, interceptor, config) {
  const dataLayerName = (config && config.dataLayerName) ? String(config.dataLayerName).trim() : 'dataLayer';
  const customEndpoint = (config && config.endpoint) ? String(config.endpoint).trim().replace(/^https?:\/\//, '').replace(/\/+$/, '') : '';

  const findings = {
    scriptFound: false,
    scriptType: null,
    gtagFunction: false,
    gaFunction: false,
    dataLayerName,
    dataLayerExists: false,
    customEndpoint: customEndpoint || '(not configured)',
    measurementId: null,
    collectRequests: 0,
    customEndpointRequests: 0,
    reasons: [],
  };

  const ga4Script = await page.$('script[src*="googletagmanager.com/gtag/js"]');
  const uaScript = await page.$('script[src*="google-analytics.com/analytics.js"]');

  if (ga4Script) {
    findings.scriptFound = true;
    findings.scriptType = 'GA4/gtag';
    const src = await ga4Script.getAttribute('src');
    const match = src && src.match(/[?&]id=(G-[A-Z0-9]+|UA-\d+-\d+)/);
    if (match) findings.measurementId = match[1];
  }

  if (uaScript) {
    findings.scriptFound = true;
    findings.scriptType = findings.scriptType ? 'GA4+UA' : 'UA';
  }

  findings.gtagFunction = await page.evaluate(() => typeof window.gtag === 'function').catch(() => false);
  findings.gaFunction = await page.evaluate(() => typeof window.ga === 'function').catch(() => false);
  findings.dataLayerExists = await page.evaluate((name) => Array.isArray(window[name])).catch(() => false)
    .then(v => v, () => false);

  // page.evaluate with arg
  findings.dataLayerExists = await page.evaluate((name) => Array.isArray(window[name]), dataLayerName).catch(() => false);

  if (!findings.measurementId && config.measurementId) findings.measurementId = config.measurementId;

  if (!findings.measurementId) {
    findings.measurementId = await page.evaluate((name) => {
      const dl = window[name];
      if (!Array.isArray(dl)) return null;
      for (const entry of dl) {
        if (entry && entry[0] === 'config' && typeof entry[1] === 'string' && /^(G-|UA-)/.test(entry[1])) return entry[1];
      }
      return null;
    }, dataLayerName).catch(() => null);
  }

  const collectPatterns = [
    /google-analytics\.com\/collect/,
    /google-analytics\.com\/g\/collect/,
    /analytics\.google\.com\/g\/collect/,
    /googletagmanager\.com\/gtag/,
  ];

  for (const pattern of collectPatterns) {
    findings.collectRequests += interceptor.getRequestsMatching(pattern).length;
  }

  // Server-side GTM forwards beacons to a custom domain. Count those toward
  // collectRequests so the check still passes when GA traffic is proxied via
  // the customer's own endpoint instead of Google's.
  if (customEndpoint) {
    const customRegex = new RegExp(escapeRegex(customEndpoint));
    findings.customEndpointRequests = interceptor.getRequestsMatching(customRegex).length;
    findings.collectRequests += findings.customEndpointRequests;
  }

  const hasScript = findings.scriptFound || findings.gtagFunction || findings.gaFunction;
  const hasActivity = findings.collectRequests > 0 || findings.dataLayerExists;

  if (!findings.scriptFound) findings.reasons.push('No GA script tag found in DOM');
  if (!findings.gtagFunction && !findings.gaFunction) findings.reasons.push('Neither gtag() nor ga() function found');
  if (!findings.dataLayerExists) findings.reasons.push(`window.${dataLayerName} not found`);
  if (findings.collectRequests === 0) {
    findings.reasons.push(customEndpoint
      ? `No collect/beacon requests detected (also checked ${customEndpoint})`
      : 'No collect/beacon requests detected');
  }

  if (hasScript) {
    const parts = [];
    if (findings.scriptType) parts.push(findings.scriptType);
    if (findings.measurementId) parts.push(`ID: ${findings.measurementId}`);
    if (findings.collectRequests > 0) {
      parts.push(`${findings.collectRequests} collect request(s)` +
        (findings.customEndpointRequests > 0 ? ` (${findings.customEndpointRequests} via ${customEndpoint})` : ''));
    }
    if (findings.dataLayerExists) parts.push(`${dataLayerName} active`);
    findings.reasons = ['OK: ' + parts.join(', ')];
  }

  return {
    status: hasScript && hasActivity ? 'pass' : hasScript ? 'pass' : 'fail',
    details: findings,
  };
};
