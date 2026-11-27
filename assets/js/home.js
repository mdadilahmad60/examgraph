/* ExamGrapher home page: the practice graph in the hero, and how the page hands over to the calculator. */
(function () {
  "use strict";
  var calc = document.getElementById("calculator");

  /* shared graph links and the installed app go straight to the calculator */
  if (calc && !location.hash && /[?&](eq|title|source=pwa)/.test(location.search)) {
    calc.scrollIntoView({ behavior: "instant", block: "start" });
  }

  /* the page must keep scrolling when the pointer passes over the graph: wheel zoom starts after a click */
  var wrap = calc && calc.querySelector(".graph-wrap");
  if (wrap) {
    var armed = false, hint = document.createElement("div"), hintTimer;
    hint.className = "zoom-hint";
    hint.textContent = "Click the graph to zoom by scrolling";
    wrap.appendChild(hint);
    wrap.addEventListener("pointerdown", function () { armed = true; hint.classList.remove("show"); });
    document.addEventListener("pointerdown", function (e) { if (!wrap.contains(e.target)) armed = false; });
    wrap.addEventListener("wheel", function (e) {
      var app = document.getElementById("app");
      if (armed || e.ctrlKey || (app && app.classList.contains("is-full"))) return;
      e.stopPropagation();
      hint.classList.add("show");
      clearTimeout(hintTimer);
      hintTimer = setTimeout(function () { hint.classList.remove("show"); }, 1400);
    }, { capture: true, passive: true });
  }

  /* hero demo: y = a(x - h)^2 + k against y = 0.5x + 0.5 (40 SVG units per 1 graph unit) */
  var svg = document.getElementById("demoSvg");
  if (!svg) return;
  var para = document.getElementById("demoPara"), vertex = document.getElementById("vertex"),
      slider = document.getElementById("demoA"), out = document.getElementById("demoEq"),
      open = document.getElementById("demoOpen"), cuts = [document.getElementById("cutA"), document.getElementById("cutB")];
  var a = 0.5, h = 1, k = -2, M = 0.5, C = 0.5;
  function X(x) { return 260 + x * 40; }
  function Y(y) { return 200 - y * 40; }
  function n(v) { return String(Math.round(v * 100) / 100).replace("-", "−"); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function label() {
    if (a === 0) return "y = " + n(k);
    var lead = a === 1 ? "" : a === -1 ? "−" : n(a);
    var inner = h === 0 ? "x²" : "(x " + (h > 0 ? "− " : "+ ") + n(Math.abs(h)) + ")²";
    return "y = " + lead + inner + (k === 0 ? "" : (k > 0 ? " + " : " − ") + n(Math.abs(k)));
  }
  function draw() {
    var w = a === 0 ? 14 : Math.min(14, Math.sqrt(12 / Math.abs(a))), end = k + a * w * w;
    para.setAttribute("d", "M" + X(h - w) + " " + Y(end) + "Q" + X(h) + " " + Y(k - a * w * w) + " " + X(h + w) + " " + Y(end));
    vertex.setAttribute("transform", "translate(" + X(h) + " " + Y(k) + ")");
    /* where the two graphs meet */
    var B = -2 * a * h - M, Q = a * h * h + k - C, roots = [];
    if (a === 0) roots = [(k - C) / M];
    else {
      var d = B * B - 4 * a * Q;
      if (d >= 0) roots = [(-B - Math.sqrt(d)) / (2 * a), (-B + Math.sqrt(d)) / (2 * a)];
    }
    cuts.forEach(function (dot, i) {
      var x = roots[i];
      dot.style.display = x === undefined ? "none" : "";
      if (x !== undefined) { dot.setAttribute("cx", X(x)); dot.setAttribute("cy", Y(M * x + C)); }
    });
    out.textContent = label();
    var sq = h === 0 ? "x^2" : "(x" + (h > 0 ? "-" : "+") + Math.abs(h) + ")^2";
    var expr = a === 0 ? String(k) : a + "*" + sq + (k === 0 ? "" : (k > 0 ? "+" : "-") + Math.abs(k));
    open.setAttribute("href", "?eq=" + encodeURIComponent(expr) + "&eq=" + encodeURIComponent("0.5*x+0.5") + "#calculator");
  }
  function settle() { svg.parentNode.classList.add("touched"); }
  slider.addEventListener("input", function () { settle(); a = parseFloat(slider.value); draw(); });
  function move(nh, nk) { h = clamp(Math.round(nh * 2) / 2, -5, 5); k = clamp(Math.round(nk * 2) / 2, -4, 4); draw(); }
  var dragging = false;
  function fromEvent(e) {
    var p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
    var q = p.matrixTransform(svg.getScreenCTM().inverse());
    move((q.x - 260) / 40, (200 - q.y) / 40);
  }
  vertex.addEventListener("pointerdown", function (e) { dragging = true; settle(); vertex.setPointerCapture(e.pointerId); e.preventDefault(); });
  vertex.addEventListener("pointermove", function (e) { if (dragging) fromEvent(e); });
  ["pointerup", "pointercancel"].forEach(function (t) { vertex.addEventListener(t, function () { dragging = false; }); });
  vertex.addEventListener("keydown", function (e) {
    var step = { ArrowLeft: [-0.5, 0], ArrowRight: [0.5, 0], ArrowUp: [0, 0.5], ArrowDown: [0, -0.5] }[e.key];
    if (!step) return;
    e.preventDefault(); settle(); move(h + step[0], k + step[1]);
  });
})();
