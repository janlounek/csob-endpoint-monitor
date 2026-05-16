/**
 * Adform checker
 * Endpoints: s2.adform.net, track.adform.net
 *
 * Status:
 *   pass — script in DOM AND both endpoints have requests
 *   warn — partial: at least one matched but not all
 *   fail — nothing matched
 */
module.exports = async function checkAdform(page, interceptor, config) {
  const findings = {
    endpoints: { s2: false, track: false },
    scriptFound: false,
    networkRequests: [],
    reasons: [],
  };

  findings.scriptFound = await page.evaluate(() => {
    return !!document.querySelector('script[src*="adform.net"]') ||
           !!document.querySelector('script[src*="s2.adform.net"]') ||
           !!document.querySelector('img[src*="track.adform.net"]');
  }).catch(() => false);

  if (!findings.scriptFound) {
    findings.scriptFound = await page.evaluate(() => {
      const scripts = document.querySelectorAll('script');
      for (const s of scripts) {
        if (s.textContent && s.textContent.includes('adform.net')) return true;
      }
      return false;
    }).catch(() => false);
  }

  const s2Requests = interceptor.getRequestsMatching(/s2\.adform\.net/);
  findings.endpoints.s2 = s2Requests.length > 0;
  if (s2Requests.length > 0) findings.networkRequests.push(`s2.adform.net: ${s2Requests.length} request(s)`);

  const trackRequests = interceptor.getRequestsMatching(/track\.adform\.net/);
  findings.endpoints.track = trackRequests.length > 0;
  if (trackRequests.length > 0) findings.networkRequests.push(`track.adform.net: ${trackRequests.length} request(s)`);

  const anyFound = findings.scriptFound || findings.endpoints.s2 || findings.endpoints.track;
  const allFound = findings.scriptFound && findings.endpoints.s2 && findings.endpoints.track;

  const concerns = [];
  if (!findings.scriptFound) concerns.push('No Adform script tag found in DOM');
  if (!findings.endpoints.s2) concerns.push('No requests to s2.adform.net');
  if (!findings.endpoints.track) concerns.push('No requests to track.adform.net');

  if (!anyFound) {
    findings.reasons = concerns;
    return { status: 'fail', details: findings };
  }

  const okLine = 'OK: ' + findings.networkRequests.join(', ') + (findings.scriptFound ? (findings.networkRequests.length ? ', script in DOM' : 'script in DOM') : '');

  if (allFound) {
    findings.reasons = [okLine];
    return { status: 'pass', details: findings };
  }

  findings.reasons = [okLine, ...concerns];
  return { status: 'warn', details: findings };
};
