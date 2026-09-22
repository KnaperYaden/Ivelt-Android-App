(function () {
  if (window.__cfHook) return;
  window.__cfHook = true;

  const isChallenge = (status, header) =>
    status === 403 && (header('cf-mitigated') || '').toLowerCase() === 'challenge';

  const report = (url, body) => {
    try { android.solveCloudflare(new URL(url, location.href).href, body || ''); } catch (e) {}
  };

  // XMLHttpRequest (jQuery $.get and the photo uploader both use this)
  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (m, u) { this.__cfUrl = u; return open.apply(this, arguments); };
  const send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function () {
    this.addEventListener('load', () => {
      if (isChallenge(this.status, h => this.getResponseHeader(h))) {
        let body = '';
        try { body = this.responseText; } catch (e) {}
        report(this.__cfUrl, body);
      }
    });
    return send.apply(this, arguments);
  };

  // fetch()
  const f = window.fetch;
  window.fetch = async (...args) => {
    const r = await f(...args);
    if (isChallenge(r.status, h => r.headers.get(h))) r.clone().text().then(t => report(r.url, t));
    return r;
  };

  // Re-request an URL in the background so a Cloudflare challenge (e.g. on an image the page
  // tried to load) is caught by the fetch hook above and the pop-up is shown.
  window.__cfProbe = (url) => { f(url, {credentials: 'include', cache: 'no-store'}).then(r => {
    if (isChallenge(r.status, h => r.headers.get(h))) r.clone().text().then(t => report(r.url, t));
  }).catch(() => {}); };

  // Images fail while the page is still loading, before this script is injected (the app injects
  // scripts in onPageFinished). So look for broken same-origin images now, and keep listening for
  // later ones (lazy-loaded avatars etc.). Probing one is enough: if it's a Cloudflare challenge the
  // pop-up opens, and __cfRetryImages() reloads all broken images once it's solved.
  let lastProbe = 0;
  const sameOrigin = (src) => { try { return new URL(src, location.href).origin === location.origin; } catch (e) { return false; } };
  const probeImage = (src) => {
    const now = Date.now();
    if (!src || !sameOrigin(src) || now - lastProbe < 10000) return;
    lastProbe = now;
    console.log('cf_hook: probing broken image ' + src);
    window.__cfProbe(src);
  };
  const scanBroken = () => {
    const bad = Array.from(document.images).find(i => i.src && i.complete && i.naturalWidth === 0 && sameOrigin(i.src));
    if (bad) probeImage(bad.src);
  };
  document.addEventListener('error', e => {
    const t = e.target;
    if (t && t.tagName === 'IMG') probeImage(t.currentSrc || t.src);
  }, true);
  if (document.readyState === 'complete') setTimeout(scanBroken, 0);
  else window.addEventListener('load', scanBroken);

  // Reload images that failed to load (e.g. blocked by Cloudflare)
  window.__cfRetryImages = () => {
    document.querySelectorAll('img').forEach(img => {
      if (img.src && img.complete && img.naturalWidth === 0) {
        const u = img.src; img.src = ''; img.src = u;
      }
    });
  };

  // Called by the app once the check passes
  window.onCloudflareSolved = () => {
    if (typeof window.__cfRetry === 'function') { const fn = window.__cfRetry; window.__cfRetry = null; fn(); }
    window.__cfRetryImages();
  };
})();
