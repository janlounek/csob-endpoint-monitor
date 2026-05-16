/**
 * Adobe Launch / Adobe Experience Platform Tags checker
 * Supports: Legacy DTM, Adobe Launch, Adobe Web SDK via Launch.
 * Built-in endpoints: assets.adobedtm.com, adoberesources.net, launch-* scripts.
 * Optional config.customDomain: extra custom domain to validate (e.g. tags.example.com).
 *
 * Status:
 *   pass — script in DOM AND _satellite active AND network traffic to known endpoint(s)
 *   warn — partial: at least one signal present but not all
 *   fail — nothing matched
 */
module.exports = async function checkAdobeLaunch(page, interceptor, config) {
  const customDomain = (config && config.customDomain) ? String(config.customDomain).trim() : '';

  const findings = {
    endpoints: { adobedtm: false, customDomain: false },
    customDomainName: customDomain || '(not configured)',
    scriptFound: false,
    satelliteExists: false,
    launchScriptUrl: null,
    networkRequests: [],
    reasons: [],
  };

  findings.scriptFound = await page.evaluate(function(domain) {
    var scripts = document.querySelectorAll('script[src]');
    for (var i = 0; i < scripts.length; i++) {
      var src = scripts[i].src;
      if (src.includes('assets.adobedtm.com') ||
          (domain && src.includes(domain)) ||
          src.includes('launch-') ||
          src.includes('adobetags') ||
          src.includes('adoberesources.net')) return true;
    }
    return false;
  }, customDomain).catch(() => false);

  findings.launchScriptUrl = await page.evaluate(function(domain) {
    var scripts = document.querySelectorAll('script[src]');
    for (var i = 0; i < scripts.length; i++) {
      var src = scripts[i].src;
      if (src.includes('assets.adobedtm.com') || (domain && src.includes(domain)) || src.includes('launch-')) {
        return src;
      }
    }
    return null;
  }, customDomain).catch(() => null);

  findings.satelliteExists = await page.evaluate(() => {
    return typeof window._satellite === 'object' && window._satellite !== null;
  }).catch(() => false);

  var adobeRequests = interceptor.getRequestsMatching(/assets\.adobedtm\.com/);
  findings.endpoints.adobedtm = adobeRequests.length > 0;
  if (adobeRequests.length > 0) findings.networkRequests.push('assets.adobedtm.com: ' + adobeRequests.length + ' request(s)');

  var customRequests = [];
  if (customDomain) {
    var escapedDomain = customDomain.replace(/\./g, '\\.');
    customRequests = interceptor.getRequestsMatching(new RegExp(escapedDomain));
    findings.endpoints.customDomain = customRequests.length > 0;
    if (customRequests.length > 0) findings.networkRequests.push(customDomain + ': ' + customRequests.length + ' request(s)');
  }

  var launchRequests = interceptor.getRequestsMatching(/launch-[a-zA-Z0-9]+/);
  if (launchRequests.length > 0 && !findings.endpoints.adobedtm) {
    findings.networkRequests.push('launch script: ' + launchRequests.length + ' request(s)');
  }

  var networkHit = findings.endpoints.adobedtm || findings.endpoints.customDomain || launchRequests.length > 0;
  var anyFound = findings.scriptFound || findings.satelliteExists || networkHit;
  var allFound = findings.scriptFound && findings.satelliteExists && networkHit;

  var concerns = [];
  if (!findings.scriptFound) concerns.push('No Adobe Launch/Tags script found in DOM');
  if (!findings.satelliteExists) concerns.push('_satellite object not found');
  if (!findings.endpoints.adobedtm) concerns.push('No requests to assets.adobedtm.com');
  if (customDomain && !findings.endpoints.customDomain) concerns.push('No requests to ' + customDomain);

  if (!anyFound) {
    findings.reasons = concerns;
    return { status: 'fail', details: findings };
  }

  var okParts = [];
  if (findings.scriptFound) okParts.push('Launch script in DOM');
  if (findings.launchScriptUrl) okParts.push('URL: ' + findings.launchScriptUrl.substring(0, 80));
  if (findings.satelliteExists) okParts.push('_satellite active');
  if (findings.networkRequests.length > 0) okParts.push(findings.networkRequests.join(', '));
  var okLine = 'OK: ' + okParts.join(', ');

  if (allFound) {
    findings.reasons = [okLine];
    return { status: 'pass', details: findings };
  }

  findings.reasons = [okLine, ...concerns];
  return { status: 'warn', details: findings };
};
