/**
 * Google Ads checker
 * Detects: Google Ads scripts, conversion tracking, remarketing tags, DoubleClick
 * Endpoints: googleads.g.doubleclick.net, googleadservices.com, googlesyndication.com, etc.
 *
 * Status:
 *   pass — ad script in DOM AND (gtag/AW config OR conversion cookie) AND network requests
 *   warn — partial: at least one matched but not all
 *   fail — nothing matched
 */
module.exports = async function checkGoogleAds(page, interceptor, config) {
  const findings = {
    scriptFound: false,
    conversionLinker: false,
    gtagWithAds: false,
    networkMatches: [],
    reasons: [],
  };

  findings.scriptFound = await page.evaluate(() => {
    var scripts = document.querySelectorAll('script[src]');
    for (var i = 0; i < scripts.length; i++) {
      var src = scripts[i].src;
      if (src.includes('googleads.g.doubleclick.net') ||
          src.includes('pagead2.googlesyndication.com') ||
          src.includes('googleadservices.com') ||
          src.includes('google.com/pagead') ||
          src.includes('google.cz/pagead') ||
          src.includes('google.com/ads') ||
          src.includes('gtag/js')) return true;
    }
    return false;
  }).catch(() => false);

  findings.gtagWithAds = await page.evaluate(() => {
    if (typeof window.google_tag_data === 'object') return true;
    if (typeof window.google_trackConversion === 'function') return true;
    if (Array.isArray(window.dataLayer)) {
      var str = JSON.stringify(window.dataLayer);
      if (str.includes('AW-') || str.includes('ads') || str.includes('conversion')) return true;
    }
    if (typeof window.gtag === 'function') {
      var scripts = document.querySelectorAll('script');
      for (var i = 0; i < scripts.length; i++) {
        var t = scripts[i].textContent;
        if (t && (t.includes("'AW-") || t.includes('"AW-'))) return true;
      }
    }
    return false;
  }).catch(() => false);

  findings.conversionLinker = await page.evaluate(() => {
    return document.cookie.includes('_gcl_') || document.cookie.includes('_gac_');
  }).catch(() => false);

  var patterns = [
    { name: 'doubleclick.net', regex: /doubleclick\.net/ },
    { name: 'googleadservices.com', regex: /googleadservices\.com/ },
    { name: 'googlesyndication.com', regex: /googlesyndication\.com/ },
    { name: 'google.com/pagead', regex: /google\.com\/pagead/ },
    { name: 'google.cz/pagead', regex: /google\.cz\/pagead/ },
    { name: 'google.com/ads', regex: /google\.(com|cz)\/ads/ },
    { name: 'googletagmanager (ads)', regex: /googletagmanager\.com.*AW-/ },
    { name: 'google conversion', regex: /google\.(com|cz)\/.*conversion/ },
    { name: 'google gad', regex: /google\.(com|cz)\/.*gad/ },
    { name: 'gtag (collect)', regex: /googletagmanager\.com\/gtag.*collect/ },
  ];

  var totalNetworkHits = 0;
  for (var i = 0; i < patterns.length; i++) {
    var matches = interceptor.getRequestsMatching(patterns[i].regex);
    if (matches.length > 0) {
      findings.networkMatches.push(patterns[i].name + ': ' + matches.length + ' request(s)');
      totalNetworkHits += matches.length;
    }
  }

  var configOk = findings.gtagWithAds || findings.conversionLinker;
  var networkOk = totalNetworkHits > 0;
  var anyFound = findings.scriptFound || configOk || networkOk;
  var allFound = findings.scriptFound && configOk && networkOk;

  if (!anyFound) {
    findings.reasons.push('No Google Ads script tags found in DOM');
    findings.reasons.push('No AW- conversion ID in gtag/dataLayer config');
    findings.reasons.push('No conversion linker cookies (_gcl_, _gac_)');
    findings.reasons.push('No network requests to doubleclick.net, googleadservices.com, or googlesyndication.com');
    return { status: 'fail', details: findings };
  }

  var concerns = [];
  if (!findings.scriptFound) concerns.push('No Google Ads script tags found in DOM');
  if (!configOk) concerns.push('No AW- conversion ID and no conversion linker cookies');
  if (!networkOk) concerns.push('No network requests to known Google Ads endpoints');

  var okParts = [];
  if (findings.scriptFound) okParts.push('Ad script in DOM');
  if (findings.gtagWithAds) okParts.push('Ads config in gtag/dataLayer');
  if (findings.conversionLinker) okParts.push('Conversion linker cookie present');
  if (findings.networkMatches.length > 0) okParts.push(findings.networkMatches.join(', '));
  var okLine = 'OK: ' + okParts.join(', ');

  if (allFound) {
    findings.reasons = [okLine];
    return { status: 'pass', details: findings };
  }

  findings.reasons = [okLine, ...concerns];
  return { status: 'warn', details: findings };
};
