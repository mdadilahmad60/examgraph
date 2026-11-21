/* Optional privacy-friendly analytics (Plausible-style). Loaded only when ANALYTICS_DOMAIN is set in scripts/build.py.
   It does nothing until the visitor has accepted analytics in the cookie banner (EGConsent.get().analytics) and it
   respects the browser's Do Not Track setting. If consent is withdrawn later, the script is not loaded on the next page view. */
(function () {
  var me = document.currentScript;
  if (!me) return;
  var domain = me.getAttribute("data-domain");
  var src = me.getAttribute("data-src") || "https://plausible.io/js/script.js";
  var loaded = false;
  function allowed() {
    try { return !!(window.EGConsent && window.EGConsent.get().analytics); } catch (e) { return false; }
  }
  function dnt() { return navigator.doNotTrack === "1" || window.doNotTrack === "1"; }
  function load() {
    if (loaded || !domain || !allowed() || dnt()) return;
    loaded = true;
    var s = document.createElement("script");
    s.defer = true; s.src = src; s.setAttribute("data-domain", domain);
    document.head.appendChild(s);
  }
  load();
  if (window.EGConsent && window.EGConsent.onChange) window.EGConsent.onChange(load);
})();
