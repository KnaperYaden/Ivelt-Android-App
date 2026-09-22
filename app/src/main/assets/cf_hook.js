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

  // Called by the app once the check passes
  window.onCloudflareSolved = () => {
    if (typeof window.__cfRetry === 'function') { const fn = window.__cfRetry; window.__cfRetry = null; fn(); }
  };
})();
