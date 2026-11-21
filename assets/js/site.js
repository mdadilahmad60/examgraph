/* ExamGrapher site.js: cookie consent (Accept / Reject / Manage) and Netlify Forms handling (validation, success, errors).
   Loaded on every page by scripts/build.py. Independent of app.js. */
(function () {
  "use strict";

  /* ------------------------------------------------------------ cookie consent */
  var KEY = "eg-consent", VERSION = 1, MAX_AGE = 365 * 24 * 3600 * 1000;
  var memory = null;   // used if localStorage is blocked, so the banner still works for this visit
  var banner = null, lastFocus = null;

  function read() {
    try {
      var v = JSON.parse(localStorage.getItem(KEY));
      if (v && v.v === VERSION && Date.now() - v.t < MAX_AGE) return v;
    } catch (e) { /* ignore */ }
    return memory && Date.now() - memory.t < MAX_AGE ? memory : null;
  }
  function save(analytics, ads) {
    var c = { v: VERSION, a: !!analytics, ad: !!ads, t: Date.now() };
    memory = c;
    try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) { /* ignore */ }
    apply(c);
    try { document.dispatchEvent(new CustomEvent("eg-consent", { detail: state() })); } catch (e) { /* ignore */ }
  }
  function state() {
    var c = read();
    return { decided: !!c, analytics: !!(c && c.a), ads: !!(c && c.ad) };
  }
  function apply(c) {
    var root = document.documentElement;
    root.setAttribute("data-consent", !c ? "" : (c.a && c.ad) ? "all" : (!c.a && !c.ad) ? "essential" : "custom");
  }

  function el(tag, attrs, text) {
    var n = document.createElement(tag), k;
    for (k in attrs || {}) n.setAttribute(k, attrs[k]);
    if (text) n.textContent = text;
    return n;
  }
  function toggleRow(id, title, desc, checked, locked) {
    var row = el("div", { "class": "ck-row" });
    var txt = el("div", { "class": "ck-txt" });
    txt.appendChild(el("label", { "for": id }, title));
    txt.appendChild(el("small", {}, desc));
    var input = el("input", { type: "checkbox", id: id, "class": "ck-check" });
    input.checked = checked;
    if (locked) { input.disabled = true; input.setAttribute("aria-describedby", id + "-d"); }
    row.appendChild(txt); row.appendChild(input);
    return row;
  }

  function closeBanner() {
    if (!banner) return;
    banner.remove(); banner = null;
    if (lastFocus && document.contains(lastFocus)) { try { lastFocus.focus(); } catch (e) { /* ignore */ } }
  }

  function policyHref() {
    var s = document.querySelector('a[href$="legal/privacy-policy.html"]');
    var base = s ? s.getAttribute("href").replace(/#.*$/, "") : "/legal/privacy-policy.html";
    return base + "#cookies";
  }

  function openBanner(manage) {
    if (banner) { banner.remove(); banner = null; }
    var cur = state();
    lastFocus = document.activeElement;
    banner = el("div", { "class": "cookie-banner", role: "dialog", "aria-modal": "false", "aria-labelledby": "ckTitle", "aria-describedby": "ckDesc" });
    var inner = el("div", { "class": "cookie-inner" });
    inner.appendChild(el("h2", { id: "ckTitle" }, "Your cookie choices"));
    var p = el("p", { id: "ckDesc" });
    p.appendChild(document.createTextNode("ExamGrapher uses essential storage to run the calculator, such as your theme and graph titles. With your permission we may also use analytics and advertising cookies. "));
    var a = el("a", { href: policyHref() }, "Read our Cookie Policy");
    p.appendChild(a); p.appendChild(document.createTextNode("."));
    inner.appendChild(p);

    var panel = el("div", { "class": "ck-panel", id: "ckPanel" });
    panel.hidden = !manage;
    var d = el("span", { id: "ckEss-d", "class": "sr" }, "Always on");
    panel.appendChild(d);
    panel.appendChild(toggleRow("ckEss", "Essential", "Needed for the site to work. Always on.", true, true));
    panel.appendChild(toggleRow("ckAna", "Analytics", "Helps us see which tools are used, in aggregate.", cur.analytics, false));
    panel.appendChild(toggleRow("ckAds", "Advertising", "Lets us show ads and measure them. Off unless you agree.", cur.ads, false));
    inner.appendChild(panel);

    var row = el("div", { "class": "ck-actions" });
    var acc = el("button", { type: "button", "class": "chip chip-primary", id: "ckAccept" }, "Accept all");
    var rej = el("button", { type: "button", "class": "chip", id: "ckReject" }, "Reject non-essential");
    var man = el("button", { type: "button", "class": "chip", id: "ckManage", "aria-expanded": String(!!manage), "aria-controls": "ckPanel" }, manage ? "Save my choices" : "Manage");
    row.appendChild(acc); row.appendChild(rej); row.appendChild(man);
    inner.appendChild(row);
    banner.appendChild(inner);
    document.body.appendChild(banner);

    acc.addEventListener("click", function () { save(true, true); closeBanner(); });
    rej.addEventListener("click", function () { save(false, false); closeBanner(); });
    man.addEventListener("click", function () {
      if (panel.hidden) {
        panel.hidden = false; man.textContent = "Save my choices"; man.setAttribute("aria-expanded", "true");
        banner.querySelector("#ckAna").focus();
      } else {
        save(banner.querySelector("#ckAna").checked, banner.querySelector("#ckAds").checked); closeBanner();
      }
    });
    banner.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && cur.decided) closeBanner();   // only dismissible without a choice if one already exists
    });
    (manage ? banner.querySelector("#ckAna") : acc).focus({ preventScroll: true });
  }

  window.EGConsent = {
    get: state,
    open: function () { openBanner(true); },
    onChange: function (fn) { document.addEventListener("eg-consent", function (e) { fn(e.detail); }); }
  };

  function initConsent() {
    apply(read());
    if (!read()) openBanner(false);
    document.addEventListener("click", function (e) {
      var t = e.target.closest && e.target.closest("[data-cookie-settings]");
      if (t) { e.preventDefault(); openBanner(true); }
    });
  }

  /* ------------------------------------------------------------ forms (Netlify Forms over fetch) */
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var FALLBACK = "adilwebsolutions1@gmail.com";

  function status(form, kind, nodes) {
    var s = form.querySelector(".form-status");
    if (!s) return;
    s.hidden = false; s.className = s.className.replace(/\bis-(ok|error)\b/g, "").trim() + " is-" + kind;
    while (s.firstChild) s.removeChild(s.firstChild);
    [].concat(nodes).forEach(function (n) { s.appendChild(typeof n === "string" ? document.createTextNode(n) : n); });
  }
  function link(href, text, ext) {
    var a = el("a", { href: href }, text);
    if (ext) { a.target = "_blank"; a.rel = "noopener noreferrer"; }
    return a;
  }
  function invalid(field, msg, form) {
    field.setAttribute("aria-invalid", "true");
    status(form, "error", msg);
    field.focus();
  }
  function clearInvalid(form) {
    [].forEach.call(form.querySelectorAll("[aria-invalid]"), function (f) { f.removeAttribute("aria-invalid"); });
  }

  function bindForm(form) {
    form.setAttribute("novalidate", "");
    var sourceField = form.querySelector('input[name="source"]');
    if (sourceField && !sourceField.value) sourceField.value = location.pathname;
    var busy = false;
    [].forEach.call(form.querySelectorAll("input, select, textarea"), function (f) {
      f.addEventListener("input", function () { f.removeAttribute("aria-invalid"); });
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (busy) return;
      clearInvalid(form);
      var name = form.getAttribute("name"), isSheet = name === "cheatsheet";
      var nameField = form.querySelector('input[name="name"]');
      if (nameField && !nameField.value.trim()) return invalid(nameField, "Please enter your name.", form);
      var email = form.querySelector('input[type="email"]');
      var val = email ? email.value.trim() : "";
      if (email && !val) return invalid(email, "Please enter your email address.", form);
      if (email && !EMAIL_RE.test(val)) return invalid(email, "That email address does not look right. Please check it and try again.", form);
      var msg = form.querySelector("textarea");
      if (msg && msg.value.trim().length < 10) return invalid(msg, "Please write a little more (at least 10 characters) so we can help.", form);
      var consent = form.querySelector('input[name="consent"]');
      if (consent && !consent.checked) return invalid(consent, "Please tick the box to agree before sending.", form);

      // honeypot: a bot filled the hidden field. Pretend it worked and send nothing.
      var hp = form.querySelector('input[name="company"], input[name="bot-field"]');
      if (hp && hp.value) { done(); return; }

      var btn = form.querySelector('button[type="submit"]'), label = btn ? btn.textContent : "";
      busy = true;
      if (btn) { btn.disabled = true; btn.textContent = "Sending…"; }
      status(form, "ok", "Sending…");

      var data = new URLSearchParams(new FormData(form));
      data.set("form-name", name);
      var ctl = window.AbortController ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctl) ctl.abort(); }, isSheet ? 8000 : 15000);
      fetch("/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: data.toString(), signal: ctl ? ctl.signal : undefined })
        .then(function (r) { clearTimeout(timer); if (r.ok || isSheet) done(); else fail(r.status); })
        .catch(function () { clearTimeout(timer); if (isSheet) done(); else fail(0); });

      function reset() { busy = false; if (btn) { btn.disabled = false; btn.textContent = label; } }
      function done() {
        reset();
        form.reset();
        if (sourceField) sourceField.value = location.pathname;
        if (isSheet) {
          var go = form.getAttribute("data-success") || "/thanks/";
          status(form, "ok", ["Thank you! Taking you to your download\u2026 ", link(go, "Click here if nothing happens")]);
          setTimeout(function () { location.href = go; }, 400);
        } else {
          status(form, "ok", "Thank you! Your message was sent. We usually reply within 24 to 48 hours on business days.");
        }
      }
      function fail(code) {
        reset();
        var parts = ["We could not send that just now" + (code ? " (error " + code + ")" : "") + ". Please try again in a moment, or email us at ",
          link("mailto:" + FALLBACK, FALLBACK), " or message us on ", link("https://wa.me/918210225989", "WhatsApp", true), "."];
        
        status(form, "error", parts);
      }
    });
  }

  function initForms() {
    // Netlify removes data-netlify when processing the deployed HTML.
    // data-success survives deployment and identifies our enhanced forms.
    [].forEach.call(document.querySelectorAll("form[data-success][name]"), bindForm);
  }

  function start() { initConsent(); initForms(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
