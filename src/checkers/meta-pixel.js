/**
 * Meta (Facebook) Pixel checker
 *
 * Status:
 *   pass — fbevents.js loaded AND fbq() active AND pixel fires observed
 *   warn — script/fbq present but no fire (often consent-blocked or pre-init)
 *   fail — nothing matched
 */
module.exports = async function checkMetaPixel(page, interceptor, config) {
  const findings = {
    scriptFound: false,
    fbqFunction: false,
    pixelId: null,
    pixelFires: 0,
    events: [],
    reasons: [],
  };

  findings.scriptFound = await page.evaluate(() => {
    return !!document.querySelector('script[src*="connect.facebook.net"][src*="fbevents.js"]') ||
           !!document.querySelector('script[src*="connect.facebook.net/en_US/fbevents.js"]');
  }).catch(() => false);

  if (!findings.scriptFound) {
    findings.scriptFound = await page.evaluate(() => {
      const scripts = document.querySelectorAll('script');
      for (const s of scripts) {
        if (s.textContent && s.textContent.includes('fbq(')) return true;
      }
      return false;
    }).catch(() => false);
  }

  findings.fbqFunction = await page.evaluate(() => typeof window.fbq === 'function').catch(() => false);

  findings.pixelId = await page.evaluate(() => {
    if (window.fbq && window.fbq.getState) {
      try {
        const state = window.fbq.getState();
        if (state && state.pixels && state.pixels.length > 0) return state.pixels[0].id;
      } catch (e) {}
    }
    const img = document.querySelector('noscript img[src*="facebook.com/tr"]');
    if (img) {
      const match = img.src.match(/[?&]id=(\d+)/);
      if (match) return match[1];
    }
    return null;
  }).catch(() => null);

  if (!findings.pixelId && config.pixelId) findings.pixelId = config.pixelId;

  const pixelRequests = interceptor.getRequestsMatching(/facebook\.com\/tr/);
  findings.pixelFires = pixelRequests.length;

  for (const req of pixelRequests) {
    try {
      const url = new URL(req.url);
      const ev = url.searchParams.get('ev');
      if (ev) findings.events.push(ev);
    } catch (e) {}
  }

  const fbeventsLoaded = interceptor.hasRequestMatching(/connect\.facebook\.net.*fbevents\.js/);
  const scriptOrLoaded = findings.scriptFound || fbeventsLoaded;
  const anyFound = scriptOrLoaded || findings.fbqFunction || findings.pixelFires > 0;
  const allFound = scriptOrLoaded && findings.fbqFunction && findings.pixelFires > 0;

  const concerns = [];
  if (!scriptOrLoaded) concerns.push('No fbevents.js script found in DOM or network');
  if (!findings.fbqFunction) concerns.push('window.fbq function not available');
  if (findings.pixelFires === 0) concerns.push('No pixel fire requests to facebook.com/tr');

  if (!anyFound) {
    findings.reasons = concerns;
    return { status: 'fail', details: findings };
  }

  const okParts = [];
  if (scriptOrLoaded) okParts.push('fbevents.js loaded');
  if (findings.fbqFunction) okParts.push('fbq() active');
  if (findings.pixelFires > 0) okParts.push(`${findings.pixelFires} pixel fire(s): ${findings.events.join(', ')}`);
  if (findings.pixelId) okParts.push(`Pixel ID: ${findings.pixelId}`);
  const okLine = 'OK: ' + okParts.join(', ');

  if (allFound) {
    findings.reasons = [okLine];
    return { status: 'pass', details: findings };
  }

  findings.reasons = [okLine, ...concerns];
  return { status: 'warn', details: findings };
};
