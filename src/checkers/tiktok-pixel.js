/**
 * TikTok Pixel checker
 *
 * Status:
 *   pass — script in DOM AND window.ttq present AND network requests observed
 *   warn — partial: at least one matched but not all
 *   fail — nothing matched
 */
module.exports = async function checkTikTokPixel(page, interceptor, config) {
  const findings = {
    scriptFound: false,
    ttqExists: false,
    pixelId: null,
    networkRequests: 0,
    reasons: [],
  };

  findings.scriptFound = await page.evaluate(() => {
    return !!document.querySelector('script[src*="analytics.tiktok.com"]') ||
           !!document.querySelector('script[src*="tiktok.com/i18n/pixel"]');
  }).catch(() => false);

  if (!findings.scriptFound) {
    findings.scriptFound = await page.evaluate(() => {
      const scripts = document.querySelectorAll('script');
      for (const s of scripts) {
        if (s.textContent && (s.textContent.includes('ttq.load') || s.textContent.includes('analytics.tiktok.com'))) return true;
      }
      return false;
    }).catch(() => false);
  }

  findings.ttqExists = await page.evaluate(() => typeof window.ttq !== 'undefined').catch(() => false);

  findings.pixelId = await page.evaluate(() => {
    if (window.ttq && window.ttq._i) {
      const keys = Object.keys(window.ttq._i);
      if (keys.length > 0) return keys[0];
    }
    return null;
  }).catch(() => null);

  if (!findings.pixelId && config.pixelId) {
    findings.pixelId = config.pixelId;
  }

  const tiktokRequests = interceptor.getRequestsMatching(/analytics\.tiktok\.com/);
  findings.networkRequests = tiktokRequests.length;

  const anyFound = findings.scriptFound || findings.ttqExists || findings.networkRequests > 0;
  const allFound = findings.scriptFound && findings.ttqExists && findings.networkRequests > 0;

  const concerns = [];
  if (!findings.scriptFound) concerns.push('No TikTok pixel script found in DOM');
  if (!findings.ttqExists) concerns.push('window.ttq not available');
  if (findings.networkRequests === 0) concerns.push('No requests to analytics.tiktok.com');

  if (!anyFound) {
    findings.reasons = concerns;
    return { status: 'fail', details: findings };
  }

  const okParts = [];
  if (findings.scriptFound) okParts.push('TikTok script in DOM');
  if (findings.ttqExists) okParts.push('window.ttq active');
  if (findings.networkRequests > 0) okParts.push(`${findings.networkRequests} request(s) to analytics.tiktok.com`);
  if (findings.pixelId) okParts.push(`Pixel ID: ${findings.pixelId}`);
  const okLine = 'OK: ' + okParts.join(', ');

  if (allFound) {
    findings.reasons = [okLine];
    return { status: 'pass', details: findings };
  }

  findings.reasons = [okLine, ...concerns];
  return { status: 'warn', details: findings };
};
