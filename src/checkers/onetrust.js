/**
 * OneTrust checker
 * Default endpoint: cdn.cookielaw.org (override via config.endpoint)
 *
 * Status:
 *   pass — script in DOM AND JS object AND requests to endpoint
 *   warn — partial: some signals present but not all
 *   fail — nothing matched
 */
const DEFAULT_ENDPOINT = 'cdn.cookielaw.org';

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = async function checkOneTrust(page, interceptor, config) {
  const endpoint = (config && typeof config.endpoint === 'string' && config.endpoint.trim())
    ? config.endpoint.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '')
    : DEFAULT_ENDPOINT;

  const findings = {
    endpoint,
    scriptFound: false,
    oneTrustExists: false,
    bannerDetected: false,
    networkRequests: 0,
    reasons: [],
  };

  findings.scriptFound = await page.evaluate((ep) => {
    return !!document.querySelector('script[src*="' + ep + '"]') ||
           !!document.querySelector('script[src*="otSDKStub"]') ||
           !!document.querySelector('#onetrust-consent-sdk');
  }, endpoint).catch(() => false);

  findings.oneTrustExists = await page.evaluate(() => {
    return (typeof window.OneTrust === 'object' && window.OneTrust !== null) ||
           (typeof window.OptanonWrapper === 'function') ||
           (typeof window.Optanon === 'object');
  }).catch(() => false);

  findings.bannerDetected = await page.evaluate(() => {
    return !!document.querySelector('#onetrust-banner-sdk') ||
           !!document.querySelector('#onetrust-consent-sdk') ||
           !!document.querySelector('.optanon-alert-box-wrapper');
  }).catch(() => false);

  const endpointRequests = interceptor.getRequestsMatching(new RegExp(escapeRegex(endpoint)));
  findings.networkRequests = endpointRequests.length;

  const anyFound = findings.scriptFound || findings.oneTrustExists || findings.networkRequests > 0;
  const allFound = findings.scriptFound && findings.oneTrustExists && findings.networkRequests > 0;

  const concerns = [];
  if (!findings.scriptFound) concerns.push(`No OneTrust script found in DOM (looked for ${endpoint}, otSDKStub)`);
  if (!findings.oneTrustExists) concerns.push('OneTrust/Optanon JS object not found');
  if (findings.networkRequests === 0) concerns.push(`No requests to ${endpoint}`);

  if (!anyFound) {
    findings.reasons = concerns;
    return { status: 'fail', details: findings };
  }

  const okParts = [];
  if (findings.scriptFound) okParts.push('OneTrust script in DOM');
  if (findings.oneTrustExists) okParts.push('OneTrust JS active');
  if (findings.bannerDetected) okParts.push('consent banner detected');
  if (findings.networkRequests > 0) okParts.push(`${findings.networkRequests} request(s) to ${endpoint}`);
  const okLine = 'OK: ' + okParts.join(', ');

  if (allFound) {
    findings.reasons = [okLine];
    return { status: 'pass', details: findings };
  }

  findings.reasons = [okLine, ...concerns];
  return { status: 'warn', details: findings };
};
