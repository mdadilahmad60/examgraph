/*!
 * ExamGrapher engine v3.3 - zero dependencies (math.js is no longer needed).
 *   1. Expression parser / compiler   -> EGEngine.compileExpr(text)
 *   2. Canvas graph renderer          -> EGEngine.createGraph(host, options)
 *
 * Syntax accepted (Desmos-style): 2x, 3(x+1), (x+1)(x-1), ax^2+bx+c, x^2, x²,
 * sqrt(x), √x, |x|, abs(x), pi, π, e, 30°, sin(x) ... , x<0 ? -x : x^2
 * log(x) is base 10, ln(x) is the natural logarithm.
 *
 * v3.1: relations with y  ->  implicit curves   x^2+y^2=9, xy=1, x=3
 *                           ->  inequalities     y>2x, y<=x^2, x^2+y^2<9 (shaded)
 * v3.2: polar curves      ->  r = 2*sin(3*t), r = 1 + cos(t)
 * v3.3: parametric curves ->  (cos(t), sin(t))
 */
(function (root) {
  "use strict";

  var A = { k: 1 };
  var YV = 0;

  function parseErr(msg) { var e = new Error(msg); e.isParse = true; return e; }

  function powr(b, e) {
    if (b < 0 && e !== Math.floor(e)) {
      for (var q = 3; q <= 15; q += 2) {
        var p = e * q;
        if (Math.abs(p - Math.round(p)) < 1e-9) {
          var r = Math.pow(-b, e);
          return Math.round(p) % 2 === 0 ? r : -r;
        }
      }
      return NaN;
    }
    return Math.pow(b, e);
  }

  function fact(n) {
    if (n < 0 || n !== Math.floor(n) || n > 170) return NaN;
    var r = 1;
    for (var i = 2; i <= n; i++) r *= i;
    return r;
  }

  function def(min, max, f) { return { min: min, max: max, f: f }; }

  var FN = {
    sin: def(1, 1, function (a) { return Math.sin(a * A.k); }),
    cos: def(1, 1, function (a) { return Math.cos(a * A.k); }),
    tan: def(1, 1, function (a) { return Math.tan(a * A.k); }),
    sec: def(1, 1, function (a) { return 1 / Math.cos(a * A.k); }),
    csc: def(1, 1, function (a) { return 1 / Math.sin(a * A.k); }),
    cot: def(1, 1, function (a) { return 1 / Math.tan(a * A.k); }),
    asin: def(1, 1, function (a) { return Math.asin(a) / A.k; }),
    acos: def(1, 1, function (a) { return Math.acos(a) / A.k; }),
    atan: def(1, 1, function (a) { return Math.atan(a) / A.k; }),
    atan2: def(2, 2, function (a, b) { return Math.atan2(a, b) / A.k; }),
    sinh: def(1, 1, Math.sinh), cosh: def(1, 1, Math.cosh), tanh: def(1, 1, Math.tanh),
    asinh: def(1, 1, Math.asinh), acosh: def(1, 1, Math.acosh), atanh: def(1, 1, Math.atanh),
    sqrt: def(1, 1, Math.sqrt), cbrt: def(1, 1, Math.cbrt), abs: def(1, 1, Math.abs),
    exp: def(1, 1, Math.exp), ln: def(1, 1, Math.log),
    log: def(1, 2, function (a, b) { return b === undefined ? Math.log10(a) : Math.log(a) / Math.log(b); }),
    log10: def(1, 1, Math.log10), log2: def(1, 1, Math.log2),
    floor: def(1, 1, Math.floor), ceil: def(1, 1, Math.ceil), sign: def(1, 1, Math.sign),
    round: def(1, 2, function (a, n) { if (n === undefined) return Math.round(a); var m = Math.pow(10, n); return Math.round(a * m) / m; }),
    min: def(1, 99, Math.min), max: def(1, 99, Math.max),
    pow: def(2, 2, powr),
    mod: def(2, 2, function (a, b) { return a - b * Math.floor(a / b); })
  };
  var ALIAS = { arcsin: "asin", arccos: "acos", arctan: "atan", arcsinh: "asinh", arccosh: "acosh", arctanh: "atanh", ceiling: "ceil", sgn: "sign" };
  var CONST = { pi: Math.PI, nan: NaN, infinity: Infinity };
  var NAMES = Object.keys(FN).concat(Object.keys(ALIAS), Object.keys(CONST)).sort(function (a, b) { return b.length - a.length; });

  function splitWord(word, parenFollows, out) {
    var lower = word.toLowerCase(), i = 0;
    while (i < word.length) {
      var hit = null;
      for (var j = 0; j < NAMES.length; j++) {
        if (lower.substr(i, NAMES[j].length) === NAMES[j]) { hit = NAMES[j]; break; }
      }
      if (hit) {
        var end = i + hit.length;
        if (CONST.hasOwnProperty(hit)) {
          out.push({ t: "num", v: CONST[hit] });
        } else {
          if (!(end === word.length && parenFollows)) throw parseErr("Add parentheses, e.g. " + hit + "(x)");
          out.push({ t: "fn", v: ALIAS[hit] || hit });
        }
        i = end;
      } else {
        var ch = word.charAt(i);
        out.push(ch === "e" ? { t: "num", v: Math.E } : { t: "id", v: ch });
        i++;
      }
    }
  }

  function tokenize(src) {
    var s = String(src).replace(/[\u2212\u2013]/g, "-").replace(/[\u00d7\u22c5\u00b7]/g, "*").replace(/\u00f7/g, "/").replace(/\u2264/g, "<=").replace(/\u2265/g, ">=").replace(/\u2260/g, "!=").replace(/\u03c0/g, " pi ").replace(/[\[{]/g, "(").replace(/[\]}]/g, ")");
    var out = [], i = 0, n = s.length, c, m;
    while (i < n) {
      c = s.charAt(i);
      if (c === " " || c === "\t" || c === "\n" || c === "\r") { i++; continue; }
      if ((c >= "0" && c <= "9") || c === ".") {
        m = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(s.slice(i));
        if (!m) throw parseErr("Unexpected \".\"");
        out.push({ t: "num", v: parseFloat(m[0]) });
        i += m[0].length; continue;
      }
      if (/[A-Za-z]/.test(c)) {
        var j = i;
        while (j < n && /[A-Za-z]/.test(s.charAt(j))) j++;
        var dm = /^(10|2)(?=\s*\()/.exec(s.slice(j));
        if (dm && /log$/i.test(s.slice(i, j))) j += dm[0].length;
        var k = j;
        while (k < n && s.charAt(k) === " ") k++;
        splitWord(s.slice(i, j), s.charAt(k) === "(", out);
        i = j; continue;
      }
      if (c === "\u221a") { out.push({ t: "rad" }); i++; continue; }
      if (c === "\u00b2") { out.push({ t: "sup", v: 2 }); i++; continue; }
      if (c === "\u00b3") { out.push({ t: "sup", v: 3 }); i++; continue; }
      if (c === "\u00b0") { out.push({ t: "deg" }); i++; continue; }
      var two = s.substr(i, 2);
      if (two === "**") { out.push({ t: "op", v: "^" }); i += 2; continue; }
      if (two === "<=" || two === ">=" || two === "==" || two === "!=" || two === "&&" || two === "||") {
        out.push({ t: "op", v: two }); i += 2; continue;
      }
      if ("+-*/^(),<>?:|!=".indexOf(c) >= 0) { out.push({ t: "op", v: c }); i++; continue; }
      throw parseErr("Unexpected \"" + c + "\"");
    }
    return out;
  }

  function tokText(t) {
    if (t.t === "op") return t.v;
    if (t.t === "num") return String(t.v);
    if (t.t === "id" || t.t === "fn") return t.v;
    if (t.t === "rad") return "\u221a";
    return "?";
  }

  function parse(tokens, allowY) {
    var p = 0, absDepth = 0;
    function isOp(v) { var t = tokens[p]; return !!t && t.t === "op" && t.v === v; }
    function eat(v) { if (isOp(v)) { p++; return true; } return false; }
    function expect(v, msg) { if (!eat(v)) throw parseErr(msg || ("Expected \"" + v + "\"")); }

    function ternary() {
      var c = orE();
      if (eat("?")) {
        var a = ternary();
        expect(":", "Missing \":\" after \"?\"");
        var b = ternary();
        return { k: "cond", c: c, a: a, b: b };
      }
      return c;
    }
    function orE() { var l = andE(); while (isOp("||")) { p++; l = { k: "bin", op: "||", a: l, b: andE() }; } return l; }
    function andE() { var l = cmp(); while (isOp("&&")) { p++; l = { k: "bin", op: "&&", a: l, b: cmp() }; } return l; }
    function cmp() {
      var l = add();
      for (;;) {
        var t = tokens[p];
        if (t && t.t === "op" && (t.v === "<" || t.v === ">" || t.v === "<=" || t.v === ">=" || t.v === "==" || t.v === "!=")) {
          p++; l = { k: "bin", op: t.v, a: l, b: add() };
        } else return l;
      }
    }
    function add() {
      var l = mul();
      for (;;) {
        if (isOp("+")) { p++; l = { k: "bin", op: "+", a: l, b: mul() }; }
        else if (isOp("-")) { p++; l = { k: "bin", op: "-", a: l, b: mul() }; }
        else return l;
      }
    }
    function startsFactor(t) {
      if (!t) return false;
      if (t.t === "num" || t.t === "id" || t.t === "fn" || t.t === "rad") return true;
      if (t.t === "op") return t.v === "(" || (t.v === "|" && absDepth === 0);
      return false;
    }
    function mul() {
      var l = unary();
      for (;;) {
        var t = tokens[p];
        if (t && t.t === "op" && (t.v === "*" || t.v === "/")) { p++; l = { k: "bin", op: t.v, a: l, b: unary() }; }
        else if (startsFactor(t)) { l = { k: "bin", op: "*", a: l, b: power() }; }
        else return l;
      }
    }
    function unary() {
      if (eat("-")) return { k: "neg", a: unary() };
      if (eat("+")) return unary();
      return power();
    }
    function power() {
      var b = postfix();
      if (isOp("^")) {
        p++;
        var e;
        if (eat("-")) e = { k: "neg", a: power() };
        else { eat("+"); e = power(); }
        return { k: "bin", op: "^", a: b, b: e };
      }
      return b;
    }
    function postfix() {
      var n = primary();
      for (;;) {
        var t = tokens[p];
        if (t && t.t === "sup") { p++; n = { k: "bin", op: "^", a: n, b: { k: "num", v: t.v } }; }
        else if (t && t.t === "deg") { p++; n = { k: "bin", op: "*", a: n, b: { k: "num", v: Math.PI / 180 } }; }
        else if (isOp("!")) { p++; n = { k: "fact", a: n }; }
        else return n;
      }
    }
    function primary() {
      var t = tokens[p];
      if (!t) throw parseErr("Unfinished expression");
      if (t.t === "num") { p++; return { k: "num", v: t.v }; }
      if (t.t === "id") {
        p++;
        if (t.v === "x") return { k: "x" };
        if (t.v === "y") {
          if (allowY) return { k: "y" };
          throw parseErr("Write it as y = f(x), or add = / < / > (for example x^2 + y^2 = 9)");
        }
        return { k: "par", n: t.v };
      }
      if (t.t === "rad") { p++; return { k: "fn", name: "sqrt", args: [power()] }; }
      if (t.t === "fn") {
        p++;
        expect("(", "Add parentheses, e.g. " + t.v + "(x)");
        var save = absDepth; absDepth = 0;
        var args = [];
        if (!isOp(")")) { do { args.push(ternary()); } while (eat(",")); }
        absDepth = save;
        expect(")", "Missing closing )");
        var d = FN[t.v];
        if (args.length < d.min || args.length > d.max) throw parseErr(t.v + " needs " + (d.min === d.max ? d.min : d.min + "-" + d.max) + " value(s)");
        return { k: "fn", name: t.v, args: args };
      }
      if (t.t === "op" && t.v === "(") {
        p++;
        var sv = absDepth; absDepth = 0;
        var e = ternary();
        absDepth = sv;
        expect(")", "Missing closing )");
        return e;
      }
      if (t.t === "op" && t.v === "|") {
        p++; absDepth++;
        var e2 = ternary();
        absDepth--;
        expect("|", "Missing closing |");
        return { k: "fn", name: "abs", args: [e2] };
      }
      if (t.t === "op" && t.v === ")") throw parseErr("Unexpected )");
      throw parseErr("Unexpected \"" + tokText(t) + "\"");
    }

    var ast = ternary();
    if (p < tokens.length) {
      var t = tokens[p];
      throw parseErr(t.t === "op" && t.v === ")" ? "Unexpected )" : "Unexpected \"" + tokText(t) + "\"");
    }
    return ast;
  }

  function build(nd, ctx) {
    var a, b, c;
    switch (nd.k) {
      case "num": { var v = nd.v; return function () { return v; }; }
      case "x": ctx.usesX = true; return function (x) { return x; };
      case "y": return function () { return YV; };
      case "ak": return function () { return A.k; };
      case "par": {
        var nm = nd.n; ctx.params[nm] = true;
        return function (x, P) { var v2 = P[nm]; return v2 === undefined ? 1 : v2; };
      }
      case "neg": a = build(nd.a, ctx); return function (x, P) { return -a(x, P); };
      case "fact": a = build(nd.a, ctx); return function (x, P) { return fact(a(x, P)); };
      case "cond":
        c = build(nd.c, ctx); a = build(nd.a, ctx); b = build(nd.b, ctx);
        return function (x, P) { var t = c(x, P); return (t !== 0 && t === t) ? a(x, P) : b(x, P); };
      case "fn": {
        var f = FN[nd.name].f, args = nd.args.map(function (q) { return build(q, ctx); });
        if (args.length === 1) { var a0 = args[0]; return function (x, P) { return f(a0(x, P)); }; }
        if (args.length === 2) { var b0 = args[0], b1 = args[1]; return function (x, P) { return f(b0(x, P), b1(x, P)); }; }
        return function (x, P) { var vals = []; for (var i = 0; i < args.length; i++) vals.push(args[i](x, P)); return f.apply(null, vals); };
      }
      case "bin":
        a = build(nd.a, ctx); b = build(nd.b, ctx);
        switch (nd.op) {
          case "+": return function (x, P) { return a(x, P) + b(x, P); };
          case "-": return function (x, P) { return a(x, P) - b(x, P); };
          case "*": return function (x, P) { return a(x, P) * b(x, P); };
          case "/": return function (x, P) { return a(x, P) / b(x, P); };
          case "^": return function (x, P) { return powr(a(x, P), b(x, P)); };
          case "<": return function (x, P) { return a(x, P) < b(x, P) ? 1 : 0; };
          case ">": return function (x, P) { return a(x, P) > b(x, P) ? 1 : 0; };
          case "<=": return function (x, P) { return a(x, P) <= b(x, P) ? 1 : 0; };
          case ">=": return function (x, P) { return a(x, P) >= b(x, P) ? 1 : 0; };
          case "==": return function (x, P) { return a(x, P) === b(x, P) ? 1 : 0; };
          case "!=": return function (x, P) { return a(x, P) !== b(x, P) ? 1 : 0; };
          case "&&": return function (x, P) { var l = a(x, P); return (l !== 0 && l === l && b(x, P) !== 0) ? 1 : 0; };
          case "||": return function (x, P) { var l = a(x, P); return ((l !== 0 && l === l) || b(x, P) !== 0) ? 1 : 0; };
        }
    }
    throw parseErr("Can't read this expression");
  }

  var REL = { "=": 1, "<": 1, ">": 1, "<=": 1, ">=": 1 };
  function hasY(toks) {
    for (var i = 0; i < toks.length; i++) if (toks[i].t === "id" && toks[i].v === "y") return true;
    return false;
  }
  function findRelation(toks) {
    var depth = 0, found = [], i, t;
    for (i = 0; i < toks.length; i++) {
      t = toks[i];
      if (t.t !== "op") continue;
      if (t.v === "?" || t.v === "&&" || t.v === "||") return null;
      if (t.v === "(") depth++;
      else if (t.v === ")") depth--;
      else if (depth === 0 && REL[t.v]) found.push({ i: i, op: t.v });
    }
    if (!found.length) return null;
    if (found.length > 1) throw parseErr("Use only one  =  <  >  \u2264  or  \u2265  in an equation");
    if (found[0].op !== "=" && !hasY(toks)) return null;
    return found[0];
  }
  function compileRelation(toks, rel) {
    var left = toks.slice(0, rel.i), right = toks.slice(rel.i + 1);
    if (!left.length || !right.length) throw parseErr("Add something on both sides of \"" + rel.op + "\"");
    var ctx = { params: {} };
    var fl = build(parse(left, true), ctx), fr = build(parse(right, true), ctx);
    var names = Object.keys(ctx.params);
    if (names.length > 6) throw parseErr("Too many sliders (max 6)");
    return {
      fn: function (x, P) { return fl(x, P) - fr(x, P); },
      params: names, kind: rel.op === "=" ? "implicit" : "ineq", op: rel.op
    };
  }

  /** Split "(1,2),(3,4)" into [["1","2"],["3","4"]] at top-level parentheses; null when the text is not a point list. */
  function splitPoints(raw) {
    var out = [], depth = 0, cur = "", comps = null, i, ch;
    for (i = 0; i < raw.length; i++) {
      ch = raw[i];
      if (ch === "(") {
        if (depth === 0) { if (cur.trim() && cur.trim() !== ",") return null; cur = ""; comps = []; depth = 1; continue; }
        depth++;
      } else if (ch === ")") {
        depth--;
        if (depth < 0) return null;
        if (depth === 0) { comps.push(cur); if (comps.length !== 2) return null; out.push(comps); comps = null; cur = ""; continue; }
      } else if (ch === "," && depth === 1) { comps.push(cur); cur = ""; continue; }
      cur += ch;
    }
    if (depth !== 0 || cur.trim() || !out.length) return null;
    return out;
  }

  function pointList(raw) {
    var groups = splitPoints(raw);
    if (!groups) return null;
    try {
      var ctx = { params: {} }, fns = [];
      for (var i = 0; i < groups.length; i++) {
        var a = tokenize(groups[i][0]), b = tokenize(groups[i][1]);
        if (!a.length || !b.length || findRelation(a) || findRelation(b)) return null;
        var c1 = { params: {} }, c2 = { params: {} };
        var fx = build(parse(a, false), c1), fy = build(parse(b, false), c2);
        if (c1.params.t || c2.params.t || c1.usesX || c2.usesX) return null; /* parametric curve, not a point */
        Object.assign(ctx.params, c1.params, c2.params);
        fns.push([fx, fy]);
      }
      var names = Object.keys(ctx.params);
      if (names.length > 6) throw parseErr("Too many sliders (max 6)");
      return {
        fn: function (_, P) { return fns.map(function (f) { return [f[0](0, P), f[1](0, P)]; }); },
        params: names,
        kind: "points",
        count: fns.length
      };
    } catch (e) {
      return null;
    }
  }

  /* ======================================================================
   * 1b. REGRESSION (least squares) - linear, quadratic, cubic, exponential, power, logarithmic
   * ==================================================================== */
  function solveLinear(M, v) {
    var n = v.length, A2 = M.map(function (r, i) { return r.concat([v[i]]); }), i, j, k;
    for (i = 0; i < n; i++) {
      var piv = i;
      for (j = i + 1; j < n; j++) if (Math.abs(A2[j][i]) > Math.abs(A2[piv][i])) piv = j;
      if (Math.abs(A2[piv][i]) < 1e-12) return null;
      var tmp = A2[i]; A2[i] = A2[piv]; A2[piv] = tmp;
      for (j = i + 1; j < n; j++) { var f = A2[j][i] / A2[i][i]; for (k = i; k <= n; k++) A2[j][k] -= f * A2[i][k]; }
    }
    var x = new Array(n);
    for (i = n - 1; i >= 0; i--) { var s = A2[i][n]; for (j = i + 1; j < n; j++) s -= A2[i][j] * x[j]; x[i] = s / A2[i][i]; }
    return x;
  }
  function polyFit(xs, ys, deg) {
    var n = deg + 1, M = [], v = [], i, j, k;
    for (i = 0; i < n; i++) { M.push(new Array(n).fill(0)); v.push(0); }
    for (k = 0; k < xs.length; k++) {
      for (i = 0; i < n; i++) {
        v[i] += ys[k] * Math.pow(xs[k], i);
        for (j = 0; j < n; j++) M[i][j] += Math.pow(xs[k], i + j);
      }
    }
    return solveLinear(M, v); /* c0 + c1 x + c2 x^2 ... */
  }
  function num(v) {
    if (!isFinite(v)) return "NaN";
    var a = Math.abs(v);
    var s = a !== 0 && (a < 1e-4 || a >= 1e7) ? v.toExponential(4).replace("e", "*10^(") + ")" : String(parseFloat(v.toPrecision(6)));
    return s;
  }
  function signed(v, term) {
    var s = num(Math.abs(v));
    return (v < 0 ? " - " : " + ") + s + term;
  }
  var MODELS = {
    linear: { label: "Linear  y = mx + b", min: 2 },
    quadratic: { label: "Quadratic  y = ax² + bx + c", min: 3 },
    cubic: { label: "Cubic  y = ax³ + bx² + cx + d", min: 4 },
    exponential: { label: "Exponential  y = a·bˣ", min: 2 },
    power: { label: "Power  y = a·xᵇ", min: 2 },
    logarithmic: { label: "Logarithmic  y = a + b·ln(x)", min: 2 }
  };
  /**
   * regress([[x,y],...], "linear") -> { expr, f, coef:{...}, r2, r?, n } or { error }
   */
  function regress(points, model) {
    var P = (points || []).filter(function (p) { return isFinite(p[0]) && isFinite(p[1]); });
    var M = MODELS[model];
    if (!M) return { error: "Unknown model" };
    if (P.length < M.min) return { error: "Need at least " + M.min + " points for a " + model + " fit" };
    var xs = P.map(function (p) { return p[0]; }), ys = P.map(function (p) { return p[1]; });
    var out = { n: P.length, model: model }, c, f;
    if (model === "linear" || model === "quadratic" || model === "cubic") {
      var deg = model === "linear" ? 1 : model === "quadratic" ? 2 : 3;
      c = polyFit(xs, ys, deg);
      if (!c) return { error: "These points can't be fitted (check for repeated x values)" };
      f = function (x) { var s = 0; for (var i = c.length - 1; i >= 0; i--) s = s * x + c[i]; return s; };
      if (deg === 1) { out.coef = { m: c[1], b: c[0] }; out.expr = num(c[1]) + "*x" + signed(c[0], ""); }
      else if (deg === 2) { out.coef = { a: c[2], b: c[1], c: c[0] }; out.expr = num(c[2]) + "*x^2" + signed(c[1], "*x") + signed(c[0], ""); }
      else { out.coef = { a: c[3], b: c[2], c: c[1], d: c[0] }; out.expr = num(c[3]) + "*x^3" + signed(c[2], "*x^2") + signed(c[1], "*x") + signed(c[0], ""); }
    } else if (model === "exponential") {
      if (ys.some(function (y) { return y <= 0; })) return { error: "Exponential fits need every y value above 0" };
      c = polyFit(xs, ys.map(Math.log), 1);
      if (!c) return { error: "These points can't be fitted" };
      var a = Math.exp(c[0]), b = Math.exp(c[1]);
      f = function (x) { return a * Math.pow(b, x); };
      out.coef = { a: a, b: b }; out.expr = num(a) + "*(" + num(b) + ")^x";
    } else if (model === "power") {
      if (P.some(function (p) { return p[0] <= 0 || p[1] <= 0; })) return { error: "Power fits need every x and y value above 0" };
      c = polyFit(xs.map(Math.log), ys.map(Math.log), 1);
      if (!c) return { error: "These points can't be fitted" };
      var a2 = Math.exp(c[0]), b2 = c[1];
      f = function (x) { return a2 * Math.pow(x, b2); };
      out.coef = { a: a2, b: b2 }; out.expr = num(a2) + "*x^(" + num(b2) + ")";
    } else {
      if (xs.some(function (x) { return x <= 0; })) return { error: "Logarithmic fits need every x value above 0" };
      c = polyFit(xs.map(Math.log), ys, 1);
      if (!c) return { error: "These points can't be fitted" };
      f = function (x) { return c[0] + c[1] * Math.log(x); };
      out.coef = { a: c[0], b: c[1] }; out.expr = num(c[0]) + signed(c[1], "*ln(x)");
    }
    var mean = ys.reduce(function (s, y) { return s + y; }, 0) / ys.length;
    var ssTot = 0, ssRes = 0;
    P.forEach(function (p) { ssTot += Math.pow(p[1] - mean, 2); ssRes += Math.pow(p[1] - f(p[0]), 2); });
    out.r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;
    if (model === "linear") out.r = (out.coef.m >= 0 ? 1 : -1) * Math.sqrt(Math.max(0, out.r2));
    out.f = f;
    return out;
  }

  /** Read pasted data: one "x, y" pair per line (commas, tabs, spaces or semicolons). */
  function parseData(text) {
    var pts = [], bad = 0;
    String(text || "").split(/\r?\n/).forEach(function (line) {
      var t = line.replace(/[()]/g, " ").trim();
      if (!t) return;
      var parts = t.split(/[\s,;\t]+/).filter(Boolean);
      if (parts.length < 2) { bad++; return; }
      var x = parseFloat(parts[0]), y = parseFloat(parts[1]);
      if (isFinite(x) && isFinite(y)) pts.push([x, y]); else bad++;
    });
    return { points: pts, skipped: bad };
  }

  /* ---- symbolic calculus on the parsed expression tree: exact derivatives with rule-by-rule steps, and simple antiderivatives ---- */
  function N(v) { return { k: "num", v: v }; }
  function isNum(n, v) { return n.k === "num" && (v === undefined || n.v === v); }
  function hasX(n) {
    switch (n.k) {
      case "x": return true;
      case "neg": case "fact": return hasX(n.a);
      case "bin": return hasX(n.a) || hasX(n.b);
      case "cond": return hasX(n.c) || hasX(n.a) || hasX(n.b);
      case "fn": return n.args.some(hasX);
    }
    return false;
  }
  function coef(n) {
    if (n.k === "num") return { c: n.v, r: null };
    if (n.k === "bin" && n.op === "*" && n.a.k === "num") return { c: n.a.v, r: n.b };
    return { c: 1, r: n };
  }
  var K = { k: "ak" };   /* the angle-mode factor: 1 in radians, pi/180 in degrees (read when evaluated or printed) */
  var Z = {
    neg: function (a) { if (isNum(a)) return N(-a.v); if (a.k === "neg") return a.a; return { k: "neg", a: a }; },
    add: function (a, b) {
      if (isNum(a, 0)) return b; if (isNum(b, 0)) return a;
      if (isNum(a) && isNum(b)) return N(a.v + b.v);
      if (b.k === "neg") return Z.sub(a, b.a);
      return { k: "bin", op: "+", a: a, b: b };
    },
    sub: function (a, b) {
      if (isNum(b, 0)) return a; if (isNum(a, 0)) return Z.neg(b);
      if (isNum(a) && isNum(b)) return N(a.v - b.v);
      if (b.k === "neg") return Z.add(a, b.a);
      return { k: "bin", op: "-", a: a, b: b };
    },
    mul: function (a, b) {
      var ca, cb, c, rest;
      if (isNum(a, 0) || isNum(b, 0)) return N(0);
      if (isNum(a, 1)) return b; if (isNum(b, 1)) return a;
      if (isNum(a) && isNum(b)) return N(a.v * b.v);
      if (a.k === "neg") return Z.neg(Z.mul(a.a, b));
      if (b.k === "neg") return Z.neg(Z.mul(a, b.a));
      if (isNum(a) && b.k === "bin" && b.op === "/" && isNum(b.b)) {
        c = a.v / b.b.v;
        return c === Math.floor(c) ? Z.mul(N(c), b.a) : Z.div(Z.mul(a, b.a), b.b);
      }
      if (isNum(b) && b.v === Math.floor(b.v) && a.k === "bin" && a.op === "/" && isNum(a.b)) return Z.mul(b, a);
      if (b.k === "bin" && b.op === "/") return Z.div(Z.mul(a, b.a), b.b);
      if (a.k === "bin" && a.op === "/") return Z.div(Z.mul(a.a, b), a.b);
      /* gather the numeric coefficients to the front: 2*x*cos(x^2) rather than cos(x^2)*2*x */
      ca = coef(a); cb = coef(b);
      if (ca.c !== 1 || cb.c !== 1) {
        c = ca.c * cb.c;
        rest = ca.r && cb.r ? { k: "bin", op: "*", a: ca.r, b: cb.r } : (ca.r || cb.r);
        if (!rest) return N(c);
        if (c === 1) return rest;
        return c < 0 ? Z.neg(c === -1 ? rest : { k: "bin", op: "*", a: N(-c), b: rest }) : { k: "bin", op: "*", a: N(c), b: rest };
      }
      return { k: "bin", op: "*", a: a, b: b };
    },
    div: function (a, b) {
      var ca, g, x, y, t;
      if (isNum(a, 0)) return N(0); if (isNum(b, 1)) return a;
      if (isNum(a) && isNum(b) && b.v !== 0) return N(a.v / b.v);
      if (isNum(b) && b.v < 0) return Z.neg(Z.div(a, N(-b.v)));
      if (a.k === "neg") return Z.neg(Z.div(a.a, b));
      if (JSON.stringify(a) === JSON.stringify(b)) return N(1);
      if (isNum(b)) {
        ca = coef(a);
        if (ca.r && ca.c === Math.floor(ca.c) && b.v === Math.floor(b.v)) {
          x = Math.abs(ca.c); y = b.v;
          while (y) { t = x % y; x = y; y = t; }
          g = x || 1;
          return b.v / g === 1 ? Z.mul(N(ca.c / g), ca.r) : { k: "bin", op: "/", a: Z.mul(N(ca.c / g), ca.r), b: N(b.v / g) };
        }
      }
      return { k: "bin", op: "/", a: a, b: b };
    },
    pow: function (a, b) { if (isNum(b, 1)) return a; if (isNum(b, 0)) return N(1); return { k: "bin", op: "^", a: a, b: b }; },
    fn: function (name, a) { return { k: "fn", name: name, args: Array.isArray(a) ? a : [a] }; }
  };
  /** Fold constant arithmetic such as 1/2 or 2*3 so exponents come out as plain numbers. */
  function fold(n) {
    if (n.k === "neg") { var a0 = fold(n.a); return isNum(a0) ? N(-a0.v) : { k: "neg", a: a0 }; }
    if (n.k === "bin") {
      var a = fold(n.a), b = fold(n.b);
      if (isNum(a) && isNum(b) && "+-*/^".indexOf(n.op) >= 0) {
        var v = n.op === "+" ? a.v + b.v : n.op === "-" ? a.v - b.v : n.op === "*" ? a.v * b.v : n.op === "/" ? a.v / b.v : powr(a.v, b.v);
        if (isFinite(v)) return N(v);
      }
      return { k: "bin", op: n.op, a: a, b: b };
    }
    if (n.k === "fn") return { k: "fn", name: n.name, args: n.args.map(fold) };
    if (n.k === "cond") return { k: "cond", c: fold(n.c), a: fold(n.a), b: fold(n.b) };
    if (n.k === "fact") return { k: "fact", a: fold(n.a) };
    return n;
  }
  function PREC(n) {
    if (n.k === "num") return n.v < 0 ? 3 : 5;
    if (n.k === "neg") return 3;
    if (n.k === "bin") return n.op === "+" || n.op === "-" ? 1 : n.op === "*" || n.op === "/" ? 2 : n.op === "^" ? 4 : 0;
    return 5;
  }
  function numStr(v) {
    if (v === Math.PI) return "pi";
    if (v === Math.E) return "e";
    return String(parseFloat(v.toPrecision(10)));
  }
  /** Print in the same syntax the grapher reads, so a formula can be copied back into an equation row. */
  function pr(n, ctx) {
    var sv;
    ctx = ctx || 0;
    switch (n.k) {
      case "num": sv = numStr(n.v); break;
      case "x": return "x";
      case "y": return "y";
      case "par": return n.n;
      case "ak": return A.k === 1 ? "" : "(pi/180)";
      case "neg": sv = "-" + pr(n.a, 2); break;
      case "fact": sv = pr(n.a, 5) + "!"; break;
      case "cond": sv = pr(n.c, 0) + " ? " + pr(n.a, 0) + " : " + pr(n.b, 0); break;
      case "fn": return n.name + "(" + n.args.map(function (q) { return pr(q, 0); }).join(", ") + ")";
      case "bin":
        if (n.op === "*" && n.a.k === "ak") { sv = A.k === 1 ? pr(n.b, 2) : "(pi/180)*" + pr(n.b, 2); break; }
        if (n.op === "/" && n.b.k === "bin" && n.b.op === "*" && n.b.a.k === "ak" && A.k === 1) { sv = pr(n.a, 2) + "/" + pr(n.b.b, 3); break; }
        if (n.op === "+") sv = pr(n.a, 1) + " + " + pr(n.b, 1);
        else if (n.op === "-") sv = pr(n.a, 1) + " - " + pr(n.b, 2);
        else if (n.op === "*") sv = pr(n.a, 2) + "*" + pr(n.b, 2);
        else if (n.op === "/") sv = pr(n.a, 2) + "/" + pr(n.b, 3);
        else if (n.op === "^") {
          var e = n.b;
          sv = pr(n.a, 5) + "^" + ((e.k === "num" && e.v >= 0 && e.v === Math.floor(e.v)) || e.k === "x" || e.k === "par" ? pr(e, 5) : "(" + pr(e, 0) + ")");
        } else sv = pr(n.a, 1) + " " + n.op + " " + pr(n.b, 1);
        break;
      default: sv = "?";
    }
    return PREC(n) < ctx ? "(" + sv + ")" : sv;
  }

  function unsupported(why) { var e = new Error(why); e.unsupported = true; return e; }
  /** d/dx of a tree. Records the rule used in steps[] as { rule, from, to }. Throws {unsupported} for anything it can't differentiate exactly. */
  function diffNode(n, steps) {
    if (!hasX(n)) return N(0);
    var a, b, da, db, r, u, du, g, name;
    function note(rule, to) { if (steps) steps.push({ rule: rule, from: n, to: to }); return to; }
    switch (n.k) {
      case "x": return N(1);
      case "neg": return Z.neg(diffNode(n.a, steps));
      case "bin":
        a = n.a; b = n.b;
        switch (n.op) {
          case "+": return Z.add(diffNode(a, steps), diffNode(b, steps));
          case "-": return Z.sub(diffNode(a, steps), diffNode(b, steps));
          case "*":
            if (!hasX(a)) return note("Constant multiple rule", Z.mul(a, diffNode(b, steps)));
            if (!hasX(b)) return note("Constant multiple rule", Z.mul(b, diffNode(a, steps)));
            da = diffNode(a, steps); db = diffNode(b, steps);
            return note("Product rule: (uv)' = u'v + uv'", Z.add(Z.mul(da, b), Z.mul(a, db)));
          case "/":
            if (!hasX(b)) return note("Constant divisor", Z.div(diffNode(a, steps), b));
            db = diffNode(b, steps);
            if (!hasX(a)) return note("Reciprocal rule: (c/v)' = -c v'/v^2", Z.neg(Z.div(Z.mul(a, db), Z.pow(b, N(2)))));
            da = diffNode(a, steps);
            return note("Quotient rule: (u/v)' = (u'v - uv')/v^2", Z.div(Z.sub(Z.mul(da, b), Z.mul(a, db)), Z.pow(b, N(2))));
          case "^":
            if (!hasX(b)) {
              da = diffNode(a, steps);
              r = Z.mul(Z.mul(b, Z.pow(a, isNum(b) ? N(b.v - 1) : Z.sub(b, N(1)))), da);
              return note(a.k === "x" ? "Power rule: (x^n)' = n x^(n-1)" : "Power rule with the chain rule", r);
            }
            db = diffNode(b, steps);
            if (!hasX(a)) {
              g = isNum(a, Math.E) ? null : Z.fn("ln", a);
              return note("Exponential rule: (a^u)' = a^u ln(a) u'", Z.mul(g ? Z.mul(n, g) : n, db));
            }
            da = diffNode(a, steps);
            return note("General power rule (logarithmic differentiation)", Z.mul(n, Z.add(Z.mul(db, Z.fn("ln", a)), Z.div(Z.mul(b, da), a))));
        }
        throw unsupported("operator " + n.op);
      case "fn":
        name = n.name; u = n.args[0];
        if (name === "pow") return diffNode({ k: "bin", op: "^", a: n.args[0], b: n.args[1] }, steps);
        if (name === "log" && n.args.length === 2) { if (hasX(n.args[1])) throw unsupported("log base"); g = Z.div(N(1), Z.mul(u, Z.fn("ln", n.args[1]))); }
        else if (n.args.length !== 1) throw unsupported(name);
        else {
          switch (name) {
            case "sin": g = Z.mul(K, Z.fn("cos", u)); break;
            case "cos": g = Z.neg(Z.mul(K, Z.fn("sin", u))); break;
            case "tan": g = Z.mul(K, Z.pow(Z.fn("sec", u), N(2))); break;
            case "sec": g = Z.mul(K, Z.mul(Z.fn("sec", u), Z.fn("tan", u))); break;
            case "csc": g = Z.neg(Z.mul(K, Z.mul(Z.fn("csc", u), Z.fn("cot", u)))); break;
            case "cot": g = Z.neg(Z.mul(K, Z.pow(Z.fn("csc", u), N(2)))); break;
            case "asin": g = Z.div(N(1), Z.mul(K, Z.fn("sqrt", Z.sub(N(1), Z.pow(u, N(2)))))); break;
            case "acos": g = Z.neg(Z.div(N(1), Z.mul(K, Z.fn("sqrt", Z.sub(N(1), Z.pow(u, N(2))))))); break;
            case "atan": g = Z.div(N(1), Z.mul(K, Z.add(N(1), Z.pow(u, N(2))))); break;
            case "sinh": g = Z.fn("cosh", u); break;
            case "cosh": g = Z.fn("sinh", u); break;
            case "tanh": g = Z.div(N(1), Z.pow(Z.fn("cosh", u), N(2))); break;
            case "asinh": g = Z.div(N(1), Z.fn("sqrt", Z.add(Z.pow(u, N(2)), N(1)))); break;
            case "acosh": g = Z.div(N(1), Z.fn("sqrt", Z.sub(Z.pow(u, N(2)), N(1)))); break;
            case "atanh": g = Z.div(N(1), Z.sub(N(1), Z.pow(u, N(2)))); break;
            case "sqrt": g = Z.div(N(1), Z.mul(N(2), Z.fn("sqrt", u))); break;
            case "cbrt": g = Z.div(N(1), Z.mul(N(3), Z.pow(Z.fn("cbrt", u), N(2)))); break;
            case "abs": g = Z.div(u, Z.fn("abs", u)); break;   /* u/|u| is 0/0 at u = 0, so the corner is undefined */
            case "exp": g = Z.fn("exp", u); break;
            case "ln": g = Z.div(N(1), u); break;
            case "log": case "log10": g = Z.div(N(1), Z.mul(u, Z.fn("ln", N(10)))); break;
            case "log2": g = Z.div(N(1), Z.mul(u, Z.fn("ln", N(2)))); break;
            default: throw unsupported(name);
          }
        }
        du = diffNode(u, steps);
        return note(isNum(du, 1) ? "Derivative of " + name + "(u)" : "Chain rule: (g(u))' = g'(u) u'", Z.mul(du, g));
    }
    throw unsupported(n.k);
  }

  /** Antiderivative of a tree for the standard textbook cases (polynomials, sums, constant multiples, and standard
      functions of a linear inner part such as sin(2x + 1)). Returns null when it is not one of those. */
  function antiNode(n) {
    var a, b, du, G, u, c;
    if (!hasX(n)) return Z.mul(n, { k: "x" });
    switch (n.k) {
      case "x": return Z.div(Z.pow({ k: "x" }, N(2)), N(2));
      case "neg": a = antiNode(n.a); return a && Z.neg(a);
      case "bin":
        if (n.op === "+" || n.op === "-") { a = antiNode(n.a); b = a && antiNode(n.b); return b && (n.op === "+" ? Z.add(a, b) : Z.sub(a, b)); }
        if (n.op === "*") {
          if (!hasX(n.a)) { b = antiNode(n.b); return b && Z.mul(n.a, b); }
          if (!hasX(n.b)) { a = antiNode(n.a); return a && Z.mul(n.b, a); }
          return null;
        }
        if (n.op === "/") {
          if (!hasX(n.b)) { a = antiNode(n.a); return a && Z.div(a, n.b); }
          if (!hasX(n.a)) {
            if (n.b.k === "bin" && n.b.op === "^" && isNum(n.b.b) && hasX(n.b.a)) return antiNode(Z.mul(n.a, Z.pow(n.b.a, N(-n.b.b.v))));
            du = safeDiff(n.b);
            if (du && !hasX(du) && !isNum(du, 0)) return Z.div(Z.mul(n.a, Z.fn("ln", Z.fn("abs", n.b))), du);
          }
          return null;
        }
        if (n.op === "^" && !hasX(n.b)) {
          du = safeDiff(n.a);
          if (!du || hasX(du) || isNum(du, 0)) return null;
          if (isNum(n.b, -1)) return Z.div(Z.fn("ln", Z.fn("abs", n.a)), du);
          if (isNum(n.b)) return Z.div(Z.pow(n.a, N(n.b.v + 1)), Z.mul(N(n.b.v + 1), du));
          return null;
        }
        if (n.op === "^" && !hasX(n.a) && isNum(n.a, Math.E)) {
          du = safeDiff(n.b);
          if (du && !hasX(du) && !isNum(du, 0)) return Z.div(n, du);
        }
        return null;
      case "fn":
        if (n.args.length !== 1) return null;
        u = n.args[0]; du = safeDiff(u);
        if (!du || hasX(du) || isNum(du, 0)) return null;
        if (A.k !== 1 && /^(sin|cos|tan|sec|csc|cot|asin|acos|atan)$/.test(n.name)) return null;   /* keep formulas in radians */
        switch (n.name) {
          case "sin": G = Z.neg(Z.fn("cos", u)); break;
          case "cos": G = Z.fn("sin", u); break;
          case "exp": G = Z.fn("exp", u); break;
          case "sinh": G = Z.fn("cosh", u); break;
          case "cosh": G = Z.fn("sinh", u); break;
          case "tan": G = Z.neg(Z.fn("ln", Z.fn("abs", Z.fn("cos", u)))); break;
          case "ln": G = Z.sub(Z.mul(u, Z.fn("ln", u)), u); break;
          case "sqrt": G = Z.div(Z.mul(N(2), Z.pow(u, N(1.5))), N(3)); break;
          default: return null;
        }
        return Z.div(G, du);
    }
    return null;
  }
  function safeDiff(n) { try { return diffNode(n, null); } catch (e) { if (e && e.unsupported) return null; throw e; } }

  /** Turn recorded steps into printable { rule, from, to } rows: outer rule first, no repeats, no no-op rows. */
  function printSteps(list) {
    var out = [], seen = {};
    list.slice().reverse().forEach(function (st) {
      var from = typeof st.from === "string" ? st.from : pr(st.from), to = typeof st.to === "string" ? st.to : pr(st.to), key = st.rule + "|" + from;
      if (seen[key] || from === to) return;
      seen[key] = 1; out.push({ rule: st.rule, from: from, to: to });
    });
    return out.slice(0, 10);
  }
  /** Parse plain text into a tree, or null when it is not a plain function of x (relations, other kinds, calculus forms). */
  function astOf(src) {
    if (/\bd2?\s*\/\s*dx|\bint(?:egral)?\s*\(|dy\s*\/\s*dx/i.test(src)) return null;
    try {
      var toks = tokenize(src);
      if (!toks.length || findRelation(toks)) return null;
      return fold(parse(toks, false));
    } catch (e) { return null; }
  }
  function compileTree(tree) { var ctx = { params: {} }, f = build(tree, ctx); return { fn: f, params: Object.keys(ctx.params) }; }

  /* ---- calculus syntax: d/dx(f), d2/dx2(f), int(f), int(f, a), int(f, a, b), dy/dx = f(x, y) [, y(x0) = y0] ---- */
  function splitTop(str) {
    var out = [], d = 0, cur = "", i, ch;
    for (i = 0; i < str.length; i++) {
      ch = str.charAt(i);
      if (ch === "(") d++; else if (ch === ")") d--;
      if (ch === "," && d === 0) { out.push(cur.trim()); cur = ""; } else cur += ch;
    }
    out.push(cur.trim());
    return out;
  }
  /** "(...)" whose first parenthesis closes at the very end, so "(a)*(b)" is not mistaken for one call. */
  function wrapped(str) {
    var d = 0, i;
    if (str.charAt(0) !== "(" || str.charAt(str.length - 1) !== ")") return false;
    for (i = 0; i < str.length; i++) {
      if (str.charAt(i) === "(") d++; else if (str.charAt(i) === ")") d--;
      if (d === 0 && i < str.length - 1) return false;
    }
    return d === 0;
  }
  function plainFn(src, what) {
    var r = compileExpr(src);
    if (r.error) return { error: r.error };
    if (r.empty) return { error: what + " is empty" };
    if (r.kind) return { error: what + " must be a function of x, like x^2 or sin(x)" };
    return r;
  }
  /** Five-point numerical derivative (used when no exact formula is available). It returns NaN where the slope from the
      left and from the right disagree, so corners such as |x| at 0 show as undefined instead of a wrong value. */
  function numDeriv(f, order) {
    return function (x, P) {
      var m = Math.max(1, Math.abs(x)), h, v, e, fw, bw;
      if (order === 2) {
        h = 1e-2 * m;
        return (-f(x + 2 * h, P) + 16 * f(x + h, P) - 30 * f(x, P) + 16 * f(x - h, P) - f(x - 2 * h, P)) / (12 * h * h);
      }
      h = 1e-3 * m;
      v = (-f(x + 2 * h, P) + 8 * f(x + h, P) - 8 * f(x - h, P) + f(x - 2 * h, P)) / (12 * h);
      e = 1e-6 * m;
      fw = (f(x + e, P) - f(x, P)) / e; bw = (f(x, P) - f(x - e, P)) / e;
      if (Math.abs(fw - bw) > 1e-3 * (1 + Math.abs(v))) return NaN;
      return v;
    };
  }
  /** Composite Simpson rule with n (even) panels. An endpoint where f is infinite (ln(x) at 0, 1/sqrt(x) at 0) is handled
      with the substitution x = a + (b - a)u^2, which removes the mild singularity. */
  function simpson(f, a, b, P, n) {
    if (a === b) return 0;
    var fa = f(a, P), fb = f(b, P), h, s, i, m;
    if (!isFinite(fa) && !isFinite(fb)) { m = (a + b) / 2; return simpson(f, a, m, P, n) + simpson(f, m, b, P, n); }
    if (!isFinite(fa) || !isFinite(fb)) {
      /* x = a + L u^2 (or b - L u^2 when the right end is the singular one): the integral becomes the integral of f(x(u)) * 2 L u over u in [0, 1] */
      var left = !isFinite(fa), L = b - a, g = function (u) {
        if (u === 0) u = 1e-12;   /* use the limit at u = 0 */
        return f(left ? a + L * u * u : b - L * u * u, P) * 2 * L * u;
      };
      h = 1 / n; s = g(0) + g(1);
      for (i = 1; i < n; i++) s += g(i * h) * (i % 2 ? 4 : 2);
      return s * h / 3;
    }
    h = (b - a) / n; s = fa + fb;
    for (i = 1; i < n; i++) s += f(a + i * h, P) * (i % 2 ? 4 : 2);
    return s * h / 3;
  }
  function mergeParams() {
    var seen = {}, out = [];
    Array.prototype.slice.call(arguments).forEach(function (list) { (list || []).forEach(function (n) { if (!seen[n]) { seen[n] = 1; out.push(n); } }); });
    return out;
  }
  /** Returns a compile result for the calculus forms above, or null when the text is something else. */
  function compileCalculus(raw) {
    var m, inner, r, f, args, ra, rb, names;
    m = /^\s*(?:(?:y|f\s*\(\s*x\s*\))\s*=\s*)?d(?:\^?(2))?\s*\/\s*dx(?:\^?2)?\s*(\([\s\S]*\))\s*$/i.exec(raw);
    if (m && wrapped(m[2])) {
      var order = m[1] ? 2 : 1, innerSrc = m[2].slice(1, -1);
      r = plainFn(innerSrc, "The function inside d/dx( )");
      if (r.error) return { error: r.error };
      var tree = astOf(innerSrc), dTree = null, stages = [], why = "";
      if (tree) {
        try {
          var s1 = [], d1 = diffNode(tree, s1);
          stages.push(s1); dTree = d1;
          if (order === 2) { var s2 = []; dTree = diffNode(d1, s2); stages.push(s2); }
          var sym = compileTree(dTree), num = numDeriv(r.fn, order), probe = {}, bad = false;
          r.params.forEach(function (n) { probe[n] = 1; });
          [0.37, 1.3, -0.8, 2.1].forEach(function (xv) {
            var u1 = sym.fn(xv, probe), u2 = num(xv, probe);
            if (isFinite(u1) && isFinite(u2) && Math.abs(u1 - u2) > 1e-4 * (1 + Math.abs(u2))) bad = true;
          });
          if (bad) { dTree = null; why = "its exact formula could not be verified"; }
          else {
            return { fn: sym.fn, params: sym.params, usesX: true, ext: { breakJumps: true, info: function () {
              return { title: order === 2 ? "Second derivative" : "Derivative", of: pr(tree), formula: pr(dTree), stages: stages.map(printSteps) };
            } } };
          }
        } catch (e) { if (!(e && e.unsupported)) throw e; why = "it uses " + e.message; dTree = null; }
      } else why = "it is nested or not a plain expression";
      return { fn: numDeriv(r.fn, order), params: r.params, usesX: true, ext: { breakJumps: true, info: function () {
        return { title: order === 2 ? "Second derivative" : "Derivative", of: tree ? pr(tree) : innerSrc, formula: null, note: "No exact formula is shown because " + why + ", so the curve is computed numerically. Corners and jumps appear as gaps." };
      } } };
    }
    m = /^\s*(?:(?:y|f\s*\(\s*x\s*\))\s*=\s*)?(?:int|integral)\s*(\([\s\S]*\))\s*$/i.exec(raw);
    if (m && wrapped(m[1])) {
      args = splitTop(m[1].slice(1, -1));
      if (args.length > 3) return { error: "Use int(f), int(f, a) or int(f, a, b)" };
      r = plainFn(args[0], "The function inside int( )");
      if (r.error) return { error: r.error };
      f = r.fn;
      ra = { fn: function () { return 0; }, params: [] }; rb = null;
      if (args.length > 1) {
        ra = plainFn(args[1], "The lower bound");
        if (ra.error) return { error: ra.error };
        if (ra.usesX) return { error: "The bounds must be numbers (letters become sliders)" };
      }
      if (args.length > 2) {
        rb = plainFn(args[2], "The upper bound");
        if (rb.error) return { error: rb.error };
        if (rb.usesX) return { error: "The bounds must be numbers (letters become sliders)" };
      }
      names = mergeParams(r.params, ra.params, rb && rb.params);
      if (names.length > 6) return { error: "Too many sliders (max 6)" };
      var itree = astOf(args[0]);
      /* exact antiderivative for the standard cases; F is used for the formula and the F(b) - F(a) steps, the curve itself stays numerical */
      function antiInfo() {
        var G = null;
        if (itree) { try { G = antiNode(itree); } catch (e) { G = null; } }
        return G ? { tree: G, fn: compileTree(G).fn } : null;
      }
      function notFound() { return "no standard antiderivative rule fits this function (products such as x*sin(x) need integration by parts), so only the numerical value is shown"; }
      if (!rb) {
        /* int(f) or int(f, a): the accumulation function F(x) = integral of f from a to x, drawn as a curve */
        return { usesX: true, params: names, fn: function (x, P) {
          var a = ra.fn(0, P), n = Math.min(600, Math.max(20, 2 * Math.ceil(Math.abs(x - a) * 15)));
          return simpson(f, a, x, P, n);
        }, ext: { info: function (P) {
          var Gi = antiInfo();
          if (!Gi) return { title: "Accumulated area", of: itree ? pr(itree) : args[0], formula: null, note: "No exact formula is shown: " + notFound() + "." };
          var G = Gi.tree, a0 = null, txt;
          if (!ra.params.length) a0 = Gi.fn(ra.fn(0, {}), {});
          if (a0 !== null && isFinite(a0)) txt = pr(Z.sub(G, N(a0)));
          else txt = pr(G) + " - F(a)";
          return { title: "Accumulated area from " + (args.length > 1 ? args[1] : "0") + " to x", of: pr(itree), formula: "F(x) = " + txt,
            stages: [[{ rule: "Find an antiderivative F of the integrand", from: pr(itree), to: pr(G) }, { rule: "Subtract F at the starting point", from: "F(x) - F(" + (args.length > 1 ? args[1] : "0") + ")", to: txt }]] };
        } } };
      }
      /* int(f, a, b): the curve of f with the signed area between a and b shaded and labelled */
      return { usesX: true, params: names, fn: f, ext: { area: function (P) {
        var a = ra.fn(0, P), b = rb.fn(0, P);
        if (!isFinite(a) || !isFinite(b)) return null;
        return { a: a, b: b, value: simpson(f, a, b, P, 1000) };
      }, info: function (P) {
        var Gi = antiInfo(), a = ra.fn(0, P || {}), b = rb.fn(0, P || {});
        if (!Gi) return { title: "Definite integral", of: itree ? pr(itree) : args[0], formula: null, note: "No exact formula is shown: " + notFound() + "." };
        var Fa = Gi.fn(a, P || {}), Fb = Gi.fn(b, P || {}), num = simpson(f, a, b, P || {}, 1000), steps = [];
        steps.push({ rule: "Find an antiderivative F of the integrand", from: pr(itree), to: "F(x) = " + pr(Gi.tree) });
        if (isFinite(Fa) && isFinite(Fb) && Math.abs((Fb - Fa) - num) <= 1e-4 * (1 + Math.abs(num))) {
          steps.push({ rule: "Fundamental Theorem of Calculus: F(b) - F(a)", from: "F(" + fmt(b) + ") - F(" + fmt(a) + ")", to: fmt(Fb) + " - " + (Fa < 0 ? "(" + fmt(Fa) + ")" : fmt(Fa)) + " = " + fmt(Fb - Fa) });
          return { title: "Definite integral from " + fmt(a) + " to " + fmt(b), of: pr(itree), formula: "F(x) = " + pr(Gi.tree), stages: [steps], value: fmt(Fb - Fa) };
        }
        return { title: "Definite integral from " + fmt(a) + " to " + fmt(b), of: pr(itree), formula: "F(x) = " + pr(Gi.tree), stages: [steps],
          note: "F(b) - F(a) does not match the numerical area here (the function may be undefined or break between the bounds), so use the numerical value on the graph." };
      } } };
    }
    m = /^\s*dy\s*\/\s*dx\s*=(?!=)\s*([\s\S]+)$/i.exec(raw);
    if (m) {
      args = splitTop(m[1]);
      if (args.length > 2) return { error: "Write dy/dx = f(x, y), then optionally y(0) = 1 after a comma" };
      try {
        var toks = tokenize(args[0]);
        if (!toks.length) return { empty: true };
        if (findRelation(toks)) throw parseErr("Write just the right side: dy/dx = x - y");
        var ctx = { params: {} }, g = build(parse(toks, true), ctx);
        names = Object.keys(ctx.params);
        var icM = args.length === 2 ? /^y\s*\(\s*([\s\S]+?)\s*\)\s*=\s*([\s\S]+)$/i.exec(args[1]) : null;
        if (args.length === 2 && !icM) return { error: "Write the starting point as y(0) = 1" };
        var ix = null, iy = null;
        if (icM) {
          ix = plainFn(icM[1], "The starting x"); iy = plainFn(icM[2], "The starting y");
          if (ix.error) return { error: ix.error };
          if (iy.error) return { error: iy.error };
          names = mergeParams(names, ix.params, iy.params);
        }
        if (names.length > 6) throw parseErr("Too many sliders (max 6)");
        return { kind: "slopefield", params: names, fn: function () { return NaN; }, ext: {
          field: function (x, y, P) { YV = y; return g(x, P || {}); },
          ic: icM ? function (P) { return { x: ix.fn(0, P), y: iy.fn(0, P) }; } : null
        } };
      } catch (e) {
        return { error: e && e.isParse ? e.message : "Can't read this differential equation" };
      }
    }
    return null;
  }

  /**
   * Compile text such as "y = x^2 - 4" / "ax^2+c" / "x^2+y^2=9" / "y>2x" / "r = 2sin(3t)" / "(cos(t), sin(t))".
   */
  function compileExpr(text) {
    var raw = String(text == null ? "" : text).trim();

    // 0. Points: "(1, 2)" or a list "(1, 2), (3, 4.5), (-2, a)" - components must not use t
    var pts = pointList(raw);
    if (pts) return pts;

    // 0b. Calculus forms: d/dx(f), int(f, a, b), dy/dx = f(x, y)
    var calc = compileCalculus(raw);
    if (calc) return calc;

    // 1. Parametric check: "( x(t), y(t) )"
    var paramM = /^\s*\(\s*(.+?)\s*,\s*(.+?)\s*\)\s*$/.exec(raw);
    if (paramM) {
      try {
        var xToks = tokenize(paramM[1].replace(/\u03b8/g, "t"));
        var yToks = tokenize(paramM[2].replace(/\u03b8/g, "t"));
        if (!xToks.length || !yToks.length) return { empty: true };
        if (findRelation(xToks) || findRelation(yToks)) throw parseErr("Parametric components cannot contain relations");
        var xCtx = { params: {} }, yCtx = { params: {} };
        var xFn = build(parse(xToks, false), xCtx);
        var yFn = build(parse(yToks, false), yCtx);
        delete xCtx.params.t; delete yCtx.params.t;
        var pNames = Object.keys(Object.assign({}, xCtx.params, yCtx.params));
        if (pNames.length > 6) throw parseErr("Too many sliders (max 6)");
        return {
          fn: function (t, P) { var q = Object.assign({}, P, { t: t }); return [xFn(0, q), yFn(0, q)]; },
          params: pNames,
          kind: "parametric"
        };
      } catch (e) {
        return { error: e && e.isParse ? e.message : "Can't read this parametric equation" };
      }
    }

    // 2. Polar check: "r = f(t)"
    var polarM = /^\s*r\s*=(?!=)\s*(.*)$/i.exec(raw);
    if (polarM) {
      var pSrc = polarM[1].trim();
      if (!pSrc) return { empty: true };
      try {
        var pToks = tokenize(pSrc.replace(/\u03b8/g, "t"));
        if (!pToks.length) return { empty: true };
        var pRel = findRelation(pToks);
        if (pRel) throw parseErr("Write polar equations as r = f(t)");
        var pAst = parse(pToks, false), pCtx = { params: {} };
        var pFn = build(pAst, pCtx);
        delete pCtx.params.t;
        var pNames2 = Object.keys(pCtx.params);
        if (pNames2.length > 6) throw parseErr("Too many sliders (max 6)");
        return {
          fn: function (t, P) { var q = Object.assign({}, P, { t: t }); return pFn(0, q); },
          params: pNames2,
          kind: "polar"
        };
      } catch (e) {
        return { error: e && e.isParse ? e.message : "Can't read this polar equation" };
      }
    }

    // 3. Normal f(x), implicit, or inequality
    var src = raw.replace(/^\s*(?:y|f\s*\(\s*x\s*\))\s*=(?!=)\s*/i, "").trim();
    if (!src) return { empty: true };
    try {
      var toks = tokenize(src), rel;
      if (!toks.length) return { empty: true };
      if (src !== raw && hasY(toks)) toks = tokenize(raw);
      rel = findRelation(toks);
      if (rel) return compileRelation(toks, rel);
      var ast = parse(toks, false), ctx = { params: {} };
      var fn = build(ast, ctx), names = Object.keys(ctx.params);
      if (names.length > 6) throw parseErr("Too many sliders (max 6)");
      return { fn: fn, params: names, usesX: !!ctx.usesX };
    } catch (e) {
      return { error: e && e.isParse ? e.message : "Can't read this expression" };
    }
  }

  /**
   * Compile a two-variable surface formula such as "z = sin(x)*cos(y)" or "a*x^2 + y^2".
   * Returns { fn(x, y, P), params } or { error } / { empty }. Additive helper for the 3D page; the 2D paths above are unchanged.
   */
  function compileSurface(text) {
    var raw = String(text == null ? "" : text).trim();
    var src = raw.replace(/^\s*(?:z|f\s*\(\s*x\s*,\s*y\s*\))\s*=(?!=)\s*/i, "").trim();
    if (!src) return { empty: true };
    try {
      var toks = tokenize(src);
      if (!toks.length) return { empty: true };
      if (findRelation(toks)) throw parseErr("Write the surface as z = f(x, y), with the only = sign at the start");
      for (var i = 0; i < toks.length; i++) {
        if (toks[i].t === "id" && toks[i].v === "z") throw parseErr("Use only x and y on the right side (z is the height)");
      }
      var ctx = { params: {} }, f = build(parse(toks, true), ctx), names = Object.keys(ctx.params);
      if (names.length > 6) throw parseErr("Too many sliders (max 6)");
      return { fn: function (x, y, P) { YV = y; return f(x, P || {}); }, params: names, kind: "surface" };
    } catch (e) {
      return { error: e && e.isParse ? e.message : "Can't read this formula" };
    }
  }

  /**
   * Compile an implicit surface F(x, y, z) = G such as "x^2 + y^2 + z^2 = 9" (or just an expression, meaning F = 0).
   * Returns { fn(x, y, z, P), params, kind: "implicit3" } or { error } / { empty }. fn gives F - G, so the surface is where it is 0.
   * Additive helper for the 3D page (marching tetrahedra); it must mention z.
   */
  function compileImplicit3(text) {
    var raw = String(text == null ? "" : text).trim();
    if (!raw) return { empty: true };
    try {
      var toks = tokenize(raw), i, hasZ = false;
      if (!toks.length) return { empty: true };
      for (i = 0; i < toks.length; i++) {
        var tk = toks[i];
        if (tk.t === "id" && tk.v === "z") hasZ = true;
        if (tk.t === "op" && (tk.v === "<" || tk.v === ">" || tk.v === "<=" || tk.v === ">=" || tk.v === "?" || tk.v === "&&" || tk.v === "||")) {
          throw parseErr("3D surfaces use a single = sign (inequalities are not supported here)");
        }
      }
      if (!hasZ) throw parseErr("An implicit surface needs z, for example x^2 + y^2 + z^2 = 9. Or write z = f(x, y).");
      var rel = findRelation(toks), ctx = { params: {} }, F;
      if (rel) {
        var left = toks.slice(0, rel.i), right = toks.slice(rel.i + 1);
        if (!left.length || !right.length) throw parseErr("Add something on both sides of \"=\"");
        var fl = build(parse(left, true), ctx), fr = build(parse(right, true), ctx);
        F = function (x, P) { return fl(x, P) - fr(x, P); };
      } else {
        F = build(parse(toks, true), ctx);
      }
      delete ctx.params.z;
      var names = Object.keys(ctx.params), Q = {};
      if (names.length > 6) throw parseErr("Too many sliders (max 6)");
      return {
        fn: function (x, y, z, P) { var k; YV = y; for (k in P) Q[k] = P[k]; Q.z = z; return F(x, Q); },
        params: names, kind: "implicit3"
      };
    } catch (e) {
      return { error: e && e.isParse ? e.message : "Can't read this equation" };
    }
  }

  function setAngleDegrees(on) { A.k = on ? Math.PI / 180 : 1; }

  /* ======================================================================
   * 2. GRAPH RENDERER
   * ==================================================================== */
  var LIGHT = {
    bg: "#ffffff", minor: "#eef1f5", major: "#d5dbe3", axis: "#1b2430", label: "#4b5663",
    tipBg: "rgba(20,26,34,0.94)", tipFg: "#ffffff", pt: "#ffffff",
    eq: ["#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea580c", "#0891b2", "#db2777", "#65a30d"]
  };
  var MAX_POINTS = 24;
  var FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

  function fmt(v) {
    if (Math.abs(v) < 1e-7) return "0";   /* numerical noise, such as extrema of a numeric derivative */
    return String(parseFloat(v.toPrecision(5)));
  }

  function createGraph(host, opts) {
    opts = opts || {};
    var reduced = !!(root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches);
    var G = {
      eqs: [], params: {}, exam: !!opts.exam,
      cx: 0, cy: 0, scale: 40, w: 0, h: 0, dpr: 1,
      insetB: 0, hover: null, focus: null, pts: [], raf: 0, anim: 0, pal: null
    };
    var cv = document.createElement("canvas");
    var ctx = cv.getContext("2d");
    host.innerHTML = "";
    host.appendChild(cv);
    cv.style.display = "block";
    host.style.touchAction = "none";
    cv.style.touchAction = "none";

    function readPalette() {
      var cs = root.getComputedStyle(host);
      function g(n, d) { var v = cs.getPropertyValue(n).trim(); return v || d; }
      var pal = {
        bg: g("--g-bg", LIGHT.bg), minor: g("--g-minor", LIGHT.minor), major: g("--g-major", LIGHT.major),
        axis: g("--g-axis", LIGHT.axis), label: g("--g-label", LIGHT.label),
        tipBg: g("--g-tip-bg", LIGHT.tipBg), tipFg: g("--g-tip-fg", LIGHT.tipFg), pt: g("--g-pt", LIGHT.pt), eq: []
      };
      for (var i = 0; i < 8; i++) pal.eq.push(g("--eq" + (i + 1), LIGHT.eq[i]));
      G.pal = pal;
    }

    function sx(x) { return G.w / 2 + (x - G.cx) * G.scale; }
    function sy(y) { return G.h / 2 - (y - G.cy) * G.scale; }
    function wx(px) { return G.cx + (px - G.w / 2) / G.scale; }
    function wy(py) { return G.cy - (py - G.h / 2) / G.scale; }
    function visCenterPx() { return { x: G.w / 2, y: Math.max(40, G.h - G.insetB) / 2 }; }

    function ev(eq, x) {
      var v = eq.fn(x, G.params);
      return typeof v === "number" && isFinite(v) ? v : NaN;
    }

    function homeScale() { return Math.max(Math.min(G.w, Math.max(G.h - G.insetB, 200)) / 16, 12); }
    function homeView() {
      var vc = visCenterPx(), s = homeScale();
      return { scale: s, cx: -(vc.x - G.w / 2) / s, cy: (vc.y - G.h / 2) / s };
    }

    function animateTo(cx, cy, scale) {
      scale = Math.min(1e5, Math.max(0.5, scale));
      root.cancelAnimationFrame(G.anim);
      if (reduced || !G.w) { G.cx = cx; G.cy = cy; G.scale = scale; schedule(); return; }
      var c0 = G.cx, y0 = G.cy, s0 = G.scale, t0 = root.performance.now(), D = 200;
      function step(now) {
        var t = Math.min(1, (now - t0) / D), e = 1 - Math.pow(1 - t, 3);
        G.scale = s0 * Math.pow(scale / s0, e);
        G.cx = c0 + (cx - c0) * e;
        G.cy = y0 + (cy - y0) * e;
        draw();
        if (t < 1) G.anim = root.requestAnimationFrame(step);
      }
      G.anim = root.requestAnimationFrame(step);
    }

    function zoomAtPx(px, py, factor) {
      var x = wx(px), y = wy(py);
      G.scale = Math.min(1e5, Math.max(0.5, G.scale * factor));
      G.cx = x - (px - G.w / 2) / G.scale;
      G.cy = y + (py - G.h / 2) / G.scale;
      schedule();
    }

    function zoomButton(factor) {
      var vc = visCenterPx();
      var x = wx(vc.x), y = wy(vc.y);
      var s = Math.min(1e5, Math.max(0.5, G.scale * factor));
      animateTo(x - (vc.x - G.w / 2) / s, y + (vc.y - G.h / 2) / s, s);
    }

    function niceStep() {
      var raw = 70 / G.scale, pow = Math.pow(10, Math.floor(Math.log10(raw))), c = [1, 2, 5, 10];
      for (var i = 0; i < c.length; i++) if (c[i] * pow >= raw) return c[i] * pow;
      return 10 * pow;
    }

    function schedule() {
      if (G.raf) return;
      G.raf = root.requestAnimationFrame(function () { G.raf = 0; draw(); });
    }

    function drawGrid(c, pal) {
      var step = niceStep(), minor = step / 5;
      var x0 = wx(0), x1 = wx(G.w), y1 = wy(0), y0 = wy(G.h), v;
      c.lineWidth = 1;
      c.strokeStyle = pal.minor; c.beginPath();
      for (v = Math.ceil(x0 / minor) * minor; v <= x1; v += minor) { var a = Math.round(sx(v)) + 0.5; c.moveTo(a, 0); c.lineTo(a, G.h); }
      for (v = Math.ceil(y0 / minor) * minor; v <= y1; v += minor) { var b = Math.round(sy(v)) + 0.5; c.moveTo(0, b); c.lineTo(G.w, b); }
      c.stroke();
      c.strokeStyle = pal.major; c.beginPath();
      for (v = Math.ceil(x0 / step) * step; v <= x1; v += step) { var d = Math.round(sx(v)) + 0.5; c.moveTo(d, 0); c.lineTo(d, G.h); }
      for (v = Math.ceil(y0 / step) * step; v <= y1; v += step) { var e = Math.round(sy(v)) + 0.5; c.moveTo(0, e); c.lineTo(G.w, e); }
      c.stroke();

      var ax = Math.min(Math.max(sx(0), 0), G.w), ay = Math.min(Math.max(sy(0), 0), G.h);
      c.strokeStyle = pal.axis; c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(0, ay); c.lineTo(G.w, ay); c.moveTo(ax, 0); c.lineTo(ax, G.h); c.stroke();

      c.fillStyle = pal.label; c.font = "12px " + FONT;
      c.textAlign = "center"; c.textBaseline = "top";
      var ly = Math.min(Math.max(ay + 5, 2), G.h - 16);
      for (v = Math.ceil(x0 / step) * step; v <= x1; v += step) {
        if (Math.abs(v) < step / 2) continue;
        c.fillText(fmt(v), sx(v), ly);
      }
      c.textAlign = "right"; c.textBaseline = "middle";
      var lx = Math.min(Math.max(ax - 6, 30), G.w - 4);
      for (v = Math.ceil(y0 / step) * step; v <= y1; v += step) {
        if (Math.abs(v) < step / 2) continue;
        c.fillText(fmt(v), lx, sy(v));
      }
    }

    function sample(eq) {
      var n = Math.max(2, Math.floor(G.w)), xs = new Float64Array(n), ys = new Float64Array(n);
      for (var i = 0; i < n; i++) { xs[i] = wx(i * G.w / (n - 1)); ys[i] = ev(eq, xs[i]); }
      if (eq.ext && eq.ext.breakJumps) markJumps(ys, n);
      return { xs: xs, ys: ys, n: n };
    }
    /* A derivative curve that jumps (|x| at 0, floor, piecewise corners) is undefined there: blank the sample after the jump so no vertical line is drawn and no false extremum is found. */
    function markJumps(ys, n) {
      var cut = [], i, d, dl, dr;
      for (i = 2; i < n - 1; i++) {
        d = Math.abs(ys[i] - ys[i - 1]); dl = Math.abs(ys[i - 1] - ys[i - 2]); dr = Math.abs(ys[i + 1] - ys[i]);
        if (d === d && dl === dl && dr === dr && d * G.scale > 10 && d > 8 * Math.max(dl, dr, 1e-9)) cut.push(i);
      }
      cut.forEach(function (j) { ys[j] = NaN; });
    }

    function drawCurve(c, eq, d, pal) {
      c.strokeStyle = pal.eq[eq.ci % 8]; c.lineWidth = 2.6; c.lineJoin = "round"; c.lineCap = "round";
      c.beginPath();
      var pen = false, py = 0;
      for (var i = 0; i < d.n; i++) {
        var y = d.ys[i];
        if (isNaN(y)) { pen = false; continue; }
        var X = sx(d.xs[i]), Y = Math.max(-1e5, Math.min(1e5, sy(y)));
        if (pen && Math.abs(Y - py) > G.h * 3) pen = false;
        if (pen) c.lineTo(X, Y); else c.moveTo(X, Y);
        pen = true; py = Y;
      }
      c.stroke();
    }

    function fieldGrid(eq) {
      var cell = G.w * G.h > 500000 ? 6 : 4;
      var nx = Math.ceil(G.w / cell) + 1, ny = Math.ceil(G.h / cell) + 1;
      var vals = new Float64Array(nx * ny), xs = new Float64Array(nx), i, j, v;
      for (i = 0; i < nx; i++) xs[i] = wx(i * cell);
      for (j = 0; j < ny; j++) {
        YV = wy(j * cell);
        for (i = 0; i < nx; i++) {
          v = eq.fn(xs[i], G.params);
          vals[j * nx + i] = (typeof v === "number" && isFinite(v)) ? v : NaN;
        }
      }
      return { vals: vals, nx: nx, ny: ny, cell: cell };
    }

    function drawContour(c, g, color, dashed) {
      var v = g.vals, nx = g.nx, ny = g.ny, cell = g.cell, i, j;
      var adj = new Map(), pos = new Map();
      function link(ia, xa, ya, ib, xb, yb) {
        pos.set(ia, [xa, ya]); pos.set(ib, [xb, yb]);
        var la = adj.get(ia), lb = adj.get(ib);
        if (la) la.push(ib); else adj.set(ia, [ib]);
        if (lb) lb.push(ia); else adj.set(ib, [ia]);
      }
      for (j = 0; j < ny - 1; j++) {
        for (i = 0; i < nx - 1; i++) {
          var a = v[j * nx + i], b = v[j * nx + i + 1], d = v[(j + 1) * nx + i + 1], e = v[(j + 1) * nx + i];
          if (a !== a || b !== b || d !== d || e !== e) continue;
          var m = (a > 0 ? 8 : 0) | (b > 0 ? 4 : 0) | (d > 0 ? 2 : 0) | (e > 0 ? 1 : 0);
          if (m === 0 || m === 15) continue;
          var x0 = i * cell, y0 = j * cell, x1 = x0 + cell, y1 = y0 + cell;
          var tx = x0 + cell * a / (a - b), ry = y0 + cell * b / (b - d), bx = x0 + cell * e / (e - d), ly = y0 + cell * a / (a - e);
          var iT = (j * nx + i) * 2, iB = ((j + 1) * nx + i) * 2, iL = iT + 1, iR = (j * nx + i + 1) * 2 + 1;
          switch (m) {
            case 1: case 14: link(iL, x0, ly, iB, bx, y1); break;
            case 2: case 13: link(iB, bx, y1, iR, x1, ry); break;
            case 3: case 12: link(iL, x0, ly, iR, x1, ry); break;
            case 4: case 11: link(iT, tx, y0, iR, x1, ry); break;
            case 6: case 9: link(iT, tx, y0, iB, bx, y1); break;
            case 7: case 8: link(iL, x0, ly, iT, tx, y0); break;
            case 5: case 10: {
              var inside = (a + b + d + e) / 4 > 0;
              if ((m === 5) === inside) { link(iL, x0, ly, iT, tx, y0); link(iB, bx, y1, iR, x1, ry); }
              else { link(iT, tx, y0, iR, x1, ry); link(iL, x0, ly, iB, bx, y1); }
            }
          }
        }
      }
      c.strokeStyle = color; c.lineWidth = 2.6; c.lineJoin = "round"; c.lineCap = "round";
      c.setLineDash(dashed ? [9, 7] : []);
      c.beginPath();
      var seen = new Set();
      function walk(start) {
        var cur = start, prev = -1, p0 = pos.get(start), p, nxt, k, list;
        c.moveTo(p0[0], p0[1]);
        for (;;) {
          seen.add(cur);
          list = adj.get(cur); nxt = -1;
          for (k = 0; k < list.length; k++) if (list[k] !== prev && !seen.has(list[k])) { nxt = list[k]; break; }
          if (nxt < 0) {
            for (k = 0; k < list.length; k++) if (list[k] === start && cur !== start && list.length > 0 && prev !== start) { c.lineTo(p0[0], p0[1]); break; }
            return;
          }
          p = pos.get(nxt); c.lineTo(p[0], p[1]);
          prev = cur; cur = nxt;
        }
      }
      adj.forEach(function (list, id) { if (list.length === 1 && !seen.has(id)) walk(id); });
      adj.forEach(function (list, id) { if (!seen.has(id)) walk(id); });
      c.stroke();
      c.setLineDash([]);
    }

    function drawShade(c, g, op, color) {
      var v = g.vals, nx = g.nx, ny = g.ny, cell = g.cell, i, j;
      c.fillStyle = color; c.globalAlpha = 0.2;
      c.beginPath();
      for (j = 0; j < ny - 1; j++) {
        var start = -1;
        for (i = 0; i < nx; i++) {
          var ok = false;
          if (i < nx - 1) {
            var s4 = v[j * nx + i] + v[j * nx + i + 1] + v[(j + 1) * nx + i] + v[(j + 1) * nx + i + 1];
            ok = s4 === s4 && (op === "<" ? s4 < 0 : op === ">" ? s4 > 0 : op === "<=" ? s4 <= 0 : s4 >= 0);
          }
          if (ok && start < 0) start = i;
          else if (!ok && start >= 0) { c.rect(start * cell, j * cell, (i - start) * cell, cell); start = -1; }
        }
      }
      c.fill();
      c.globalAlpha = 1;
    }

    function drawRelation(c, eq, pal) {
      var g = fieldGrid(eq), col = pal.eq[eq.ci % 8];
      if (eq.kind === "ineq") drawShade(c, g, eq.op, col);
      drawContour(c, g, col, eq.kind === "ineq" && (eq.op === "<" || eq.op === ">"));
    }

    /* ---- calculus drawing: slope fields (with an optional solution curve) and shaded definite integrals ---- */
    function drawSlopeField(c, eq, pal) {
      var col = pal.eq[eq.ci % 8], F = eq.ext.field, P = G.params, px, py, m, n, dx, dy, i, j;
      /* the lattice is in graph units (1, 2 or 5 times a power of ten, like the grid lines), so zooming in adds segments and zooming out removes them */
      var target = (G.w < 500 ? 24 : 30) / G.scale, pow = Math.pow(10, Math.floor(Math.log10(target))), nice = [1, 2, 5, 10], u = pow * 10, k;
      for (k = 0; k < nice.length; k++) if (nice[k] * pow >= target) { u = nice[k] * pow; break; }
      var step = u * G.scale, half = Math.min(step * 0.36, 24);
      var i0 = Math.ceil(wx(-step) / u), i1 = Math.floor(wx(G.w + step) / u), j0 = Math.ceil(wy(G.h + step) / u), j1 = Math.floor(wy(-step) / u);
      c.save();
      c.strokeStyle = col; c.globalAlpha = 0.7; c.lineWidth = 1.8; c.lineCap = "round";
      c.beginPath();
      for (i = i0; i <= i1; i++) {
        for (j = j0; j <= j1; j++) {
          px = sx(i * u); py = sy(j * u);
          m = F(i * u, j * u, P);
          if (typeof m !== "number" || m !== m) continue;
          if (!isFinite(m)) { dx = 0; dy = m > 0 ? -1 : 1; } else { n = Math.sqrt(1 + m * m); dx = 1 / n; dy = -m / n; }
          c.moveTo(px - dx * half, py - dy * half); c.lineTo(px + dx * half, py + dy * half);
        }
      }
      c.stroke();
      c.restore();
      var ic = eq.ext.ic && eq.ext.ic(P);
      if (!ic || !isFinite(ic.x) || !isFinite(ic.y)) return;
      c.save();
      c.strokeStyle = col; c.lineWidth = 3; c.lineJoin = "round"; c.lineCap = "round";
      c.beginPath();
      [1, -1].forEach(function (dir) {
        var x = ic.x, y = ic.y, i, k1, k2, k3, k4, h, hh;
        c.moveTo(sx(x), sy(y));
        for (i = 0; i < 6000; i++) {
          k1 = F(x, y, P);
          if (!isFinite(k1)) break;
          h = 2 / G.scale / Math.max(1, Math.abs(k1));
          hh = dir * h;
          k2 = F(x + hh / 2, y + hh / 2 * k1, P); k3 = F(x + hh / 2, y + hh / 2 * k2, P); k4 = F(x + hh, y + hh * k3, P);
          if (!isFinite(k2) || !isFinite(k3) || !isFinite(k4)) break;
          y += hh / 6 * (k1 + 2 * k2 + 2 * k3 + k4); x += hh;
          if (!isFinite(y) || Math.abs(sy(y)) > 1e5) break;
          c.lineTo(sx(x), sy(y));
          if (sx(x) < -60 || sx(x) > G.w + 60 || sy(y) < -G.h || sy(y) > 2 * G.h) break;
        }
      });
      c.stroke();
      c.beginPath(); c.arc(sx(ic.x), sy(ic.y), 5.5, 0, 6.2832); c.fillStyle = col; c.fill();
      c.lineWidth = 2.2; c.strokeStyle = pal.pt; c.stroke();
      c.restore();
    }

    function drawArea(c, eq, pal) {
      var info = eq.ext.area(G.params);
      if (!info) return;
      var a = Math.min(info.a, info.b), b = Math.max(info.a, info.b), x0 = Math.max(a, wx(-2)), x1 = Math.min(b, wx(G.w + 2)), col = pal.eq[eq.ci % 8], yAxis = sy(0);
      if (!(b > a)) return;
      if (x1 > x0) {
        var n = Math.max(2, Math.ceil((sx(x1) - sx(x0)) / 2)), i, xa, xb, Y;
        c.save();
        c.globalAlpha = 0.28; c.fillStyle = col;
        c.beginPath();
        for (i = 0; i < n; i++) {
          xa = x0 + (x1 - x0) * i / n; xb = x0 + (x1 - x0) * (i + 1) / n;
          Y = ev(eq, (xa + xb) / 2);
          if (isNaN(Y)) continue;
          Y = Math.max(-1e5, Math.min(1e5, sy(Y)));
          c.rect(sx(xa), Math.min(yAxis, Y), sx(xb) - sx(xa) + 0.6, Math.abs(Y - yAxis));
        }
        c.fill();
        c.globalAlpha = 0.8; c.strokeStyle = col; c.lineWidth = 1.4; c.setLineDash([5, 4]);
        c.beginPath();
        [a, b].forEach(function (xe) {
          var ye = ev(eq, xe);
          if (isNaN(ye) || sx(xe) < 0 || sx(xe) > G.w) return;
          c.moveTo(sx(xe), yAxis); c.lineTo(sx(xe), Math.max(-1e5, Math.min(1e5, sy(ye))));
        });
        c.stroke();
        c.restore();
      }
      if (G.exam) return;   /* the value is a hint, so US Exam Mode hides it like the other hints */
      var t = "∫ " + fmt(a) + " to " + fmt(b) + " = " + (isFinite(info.value) ? fmt(info.value) : "undefined");
      c.save();
      c.font = "600 13px " + FONT;
      var tw = c.measureText(t).width + 16, bx = Math.min(Math.max((sx(a) + sx(b)) / 2 - tw / 2, 6), G.w - tw - 6);
      var by = Math.min(Math.max(yAxis + 10, 8), G.h - 36);
      c.fillStyle = pal.tipBg;
      c.beginPath();
      if (c.roundRect) c.roundRect(bx, by, tw, 28, 8); else c.rect(bx, by, tw, 28);
      c.fill();
      c.fillStyle = pal.tipFg; c.textAlign = "left"; c.textBaseline = "middle"; c.fillText(t, bx + 8, by + 14.5);
      c.restore();
    }

    function drawPolar(c, eq, pal) {
      var turns = /\/\s*[2-9]|0\.[1-9]/.test(eq.text) ? 12 : 2;
      var tMax = (A.k === 1 ? Math.PI : 180) * turns;
      var steps = Math.max(720, turns * 360);
      c.strokeStyle = pal.eq[eq.ci % 8]; c.lineWidth = 2.6; c.lineJoin = "round"; c.lineCap = "round";
      c.beginPath();
      var pen = false, px = 0, py = 0;
      for (var i = 0; i <= steps; i++) {
        var t = (tMax * i) / steps;
        var r = ev(eq, t);
        if (isNaN(r)) { pen = false; continue; }
        var th = t * A.k;
        var X = sx(r * Math.cos(th)), Y = sy(r * Math.sin(th));
        if (Math.abs(X) > 1e5 || Math.abs(Y) > 1e5) { pen = false; continue; }
        if (pen && Math.hypot(X - px, Y - py) > Math.max(G.w, G.h) * 2) pen = false;
        if (pen) c.lineTo(X, Y); else c.moveTo(X, Y);
        pen = true; px = X; py = Y;
      }
      c.stroke();
    }

    /* ---- parametric curves: (x(t), y(t)) ---- */
    function drawParametric(c, eq, pal) {
      var turns = /\/\s*[2-9]|0\.[1-9]/.test(eq.text) ? 12 : 2;
      var tMax = (A.k === 1 ? Math.PI : 180) * turns;
      var steps = Math.max(720, turns * 360);
      c.strokeStyle = pal.eq[eq.ci % 8]; c.lineWidth = 2.6; c.lineJoin = "round"; c.lineCap = "round";
      c.beginPath();
      var pen = false, px = 0, py = 0;
      for (var i = 0; i <= steps; i++) {
        var t = (tMax * i) / steps;
        var P = eq.fn(t, G.params);
        if (!P || isNaN(P[0]) || isNaN(P[1])) { pen = false; continue; }
        var X = sx(P[0]), Y = Math.max(-1e5, Math.min(1e5, sy(P[1])));
        if (Math.abs(X) > 1e5 || Math.abs(Y) > 1e5) { pen = false; continue; }
        if (pen && Math.hypot(X - px, Y - py) > Math.max(G.w, G.h) * 2) pen = false;
        if (pen) c.lineTo(X, Y); else c.moveTo(X, Y);
        pen = true; px = X; py = Y;
      }
      c.stroke();
    }

    /* ---- points and point lists: (1, 2), (3, 4) ---- */
    function drawPoints(c, eq, pal) {
      var list = eq.fn(0, G.params), col = pal.eq[eq.ci % 8];
      list.forEach(function (p) {
        if (isNaN(p[0]) || isNaN(p[1])) return;
        var X = sx(p[0]), Y = sy(p[1]);
        if (X < -10 || X > G.w + 10 || Y < -10 || Y > G.h + 10) return;
        c.beginPath(); c.arc(X, Y, 5, 0, 6.2832); c.fillStyle = col; c.fill();
        c.lineWidth = 1.6; c.strokeStyle = pal.pt; c.stroke();
      });
    }

    function refineRoot(fn, a, b) {
      var fa = fn(a);
      for (var k = 0; k < 40; k++) {
        var m = (a + b) / 2, fm = fn(m);
        if (isNaN(fm)) return NaN;
        if ((fa < 0 && fm < 0) || (fa > 0 && fm > 0)) { a = m; fa = fm; } else b = m;
      }
      return (a + b) / 2;
    }
    function refineExtremum(eq, a, b, isMin) {
      var gr = (Math.sqrt(5) - 1) / 2;
      for (var k = 0; k < 40; k++) {
        var c1 = b - gr * (b - a), d1 = a + gr * (b - a), fc = ev(eq, c1), fd = ev(eq, d1);
        if (isNaN(fc) || isNaN(fd)) return NaN;
        if (isMin ? fc < fd : fc > fd) b = d1; else a = c1;
      }
      return (a + b) / 2;
    }

    function analyze(list, data) {
      var pts = [], jump = G.h / G.scale * 2;
      list.forEach(function (eq, idx) {
        var d = data[idx], i, name = "f" + eq.num, col = eq.ci;
        var y0 = ev(eq, 0);
        if (!isNaN(y0)) pts.push({ x: 0, y: y0, label: name + " y-intercept", ci: col });
        for (i = 1; i < d.n && pts.length < MAX_POINTS; i++) {
          var a = d.ys[i - 1], b = d.ys[i];
          if (isNaN(a) || isNaN(b) || Math.abs(a - b) > jump) continue;
          if (a === 0 && b !== 0) pts.push({ x: d.xs[i - 1], y: 0, label: name + " root", ci: col });
          else if ((a < 0 && b > 0) || (a > 0 && b < 0)) {
            var r = refineRoot(function (t) { return ev(eq, t); }, d.xs[i - 1], d.xs[i]);
            if (!isNaN(r)) pts.push({ x: r, y: 0, label: name + " root", ci: col });
          }
        }
        var found = 0;
        for (i = 1; i < d.n - 1 && found < 4 && pts.length < MAX_POINTS; i++) {
          var p = d.ys[i - 1], q = d.ys[i], n2 = d.ys[i + 1];
          if (isNaN(p) || isNaN(q) || isNaN(n2)) continue;
          var isMin = q < p && q <= n2, isMax = q > p && q >= n2;
          if ((isMin || isMax) && Math.abs(p - q) < jump && Math.abs(n2 - q) < jump) {
            var t = refineExtremum(eq, d.xs[i - 1], d.xs[i + 1], isMin);
            if (!isNaN(t)) { pts.push({ x: t, y: ev(eq, t), label: name + (isMin ? " min" : " max"), ci: col }); found++; }
          }
        }
      });
      for (var u = 0; u < list.length; u++) for (var v = u + 1; v < list.length; v++) {
        var A1 = list[u], B1 = list[v], da = data[u], db = data[v];
        for (var k = 1; k < da.n && pts.length < MAX_POINTS + 10; k++) {
          var e0 = da.ys[k - 1] - db.ys[k - 1], e1 = da.ys[k] - db.ys[k];
          if (isNaN(e0) || isNaN(e1)) continue;
          if ((e0 < 0 && e1 > 0) || (e0 > 0 && e1 < 0)) {
            if (Math.abs(da.ys[k] - da.ys[k - 1]) > jump) continue;
            var xr = refineRoot(function (t) { return ev(A1, t) - ev(B1, t); }, da.xs[k - 1], da.xs[k]);
            if (!isNaN(xr)) pts.push({ x: xr, y: ev(A1, xr), label: "f" + A1.num + " \u2229 f" + B1.num, ci: -1 });
          }
        }
      }
      return pts;
    }

    function ptColor(pal, p) { return p.ci >= 0 ? pal.eq[p.ci % 8] : pal.axis; }

    function render(c, k, pal, withHover, light) {
      c.setTransform(k, 0, 0, k, 0, 0);
      c.fillStyle = pal.bg; c.fillRect(0, 0, G.w, G.h);
      drawGrid(c, pal);
      var live = G.eqs.filter(function (e) { return e.fn && e.visible && !e.calc; });
      var list = live.filter(function (e) { return !e.kind; });
      live.forEach(function (e) {
        if (e.kind === "parametric") drawParametric(c, e, pal);
        else if (e.kind === "polar") drawPolar(c, e, pal);
        else if (e.kind === "points") drawPoints(c, e, pal);
        else if (e.kind === "slopefield") drawSlopeField(c, e, pal);
        else if (e.kind) drawRelation(c, e, pal);
      });
      list.forEach(function (e) { if (e.ext && e.ext.area) drawArea(c, e, pal); });
      var data = list.map(function (eq) { var d = sample(eq); drawCurve(c, eq, d, pal); return d; });
      var pts = G.exam ? [] : analyze(list, data);
      pts.forEach(function (p) {
        var X = sx(p.x), Y = sy(p.y);
        if (X < -5 || X > G.w + 5 || Y < -5 || Y > G.h + 5) return;
        c.beginPath(); c.arc(X, Y, 4.8, 0, 6.2832);
        c.fillStyle = pal.pt; c.fill(); c.lineWidth = 2.2; c.strokeStyle = ptColor(pal, p); c.stroke();
      });
      if (light) {
        c.font = "11px " + FONT; c.fillStyle = "#94a3b8"; c.textAlign = "right"; c.textBaseline = "bottom";
        c.fillText("examgraphr.netlify.app", G.w - 8, G.h - 6);
      }
      if (withHover && !G.exam) {
        if (G.focus) drawTip(c, pal, G.focus.x, G.focus.y, ptColor(pal, G.focus), G.focus.label);
        else if (G.hover) drawHover(c, pal, list, pts);
      }
      return pts;
    }

    function draw() {
      if (!ctx || !G.w) return;
      if (!G.pal) readPalette();
      var pts = render(ctx, G.dpr, G.pal, true, false);
      G.pts = pts;
      if (opts.onAnalysis) opts.onAnalysis(pts, G.exam);
    }

    function drawTip(c, pal, x, y, color, label) {
      var X = sx(x), Y = sy(y);
      c.beginPath(); c.arc(X, Y, 6, 0, 6.2832); c.fillStyle = color; c.fill();
      c.lineWidth = 2; c.strokeStyle = pal.pt; c.stroke();
      var t = (label ? label + "  " : "") + "(" + fmt(x) + ", " + fmt(y) + ")";
      c.font = "600 13px " + FONT;
      var tw = c.measureText(t).width + 16, bx = Math.min(Math.max(X - tw / 2, 6), G.w - tw - 6), by = Y - 42;
      if (by < 6) by = Y + 16;
      c.fillStyle = pal.tipBg;
      c.beginPath();
      if (c.roundRect) c.roundRect(bx, by, tw, 28, 8); else c.rect(bx, by, tw, 28);
      c.fill();
      c.fillStyle = pal.tipFg; c.textAlign = "left"; c.textBaseline = "middle"; c.fillText(t, bx + 8, by + 14.5);
    }

    function drawHover(c, pal, list, pts) {
      var h = G.hover, best = null, bd = 30, i;
      for (i = 0; i < pts.length; i++) {
        var p = pts[i], d = Math.hypot(sx(p.x) - h.px, sy(p.y) - h.py);
        if (d < bd) { bd = d; best = { x: p.x, y: p.y, color: ptColor(pal, p), label: p.label }; }
      }
      G.eqs.forEach(function (eq) {
        if (eq.kind !== "points" || !eq.fn || !eq.visible) return;
        eq.fn(0, G.params).forEach(function (q) {
          var d = Math.hypot(sx(q[0]) - h.px, sy(q[1]) - h.py);
          if (d < bd) { bd = d; best = { x: q[0], y: q[1], color: pal.eq[eq.ci % 8], label: "" }; }
        });
      });
      if (!best) {
        var x = wx(h.px);
        list.forEach(function (eq) {
          var y = ev(eq, x);
          if (isNaN(y)) return;
          var d2 = Math.abs(sy(y) - h.py);
          if (d2 < bd) { bd = d2; best = { x: x, y: y, color: pal.eq[eq.ci % 8], label: "" }; }
        });
      }
      if (best) drawTip(c, pal, best.x, best.y, best.color, best.label);
    }

    function bindInteraction() {
      var ptrs = {}, moved = 0, lastDist = 0, lastMid = null;
      function pos(e) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
      function ids() { return Object.keys(ptrs); }

      cv.addEventListener("pointerdown", function (e) {
        root.cancelAnimationFrame(G.anim);
        try { cv.setPointerCapture(e.pointerId); } catch (err) { }
        ptrs[e.pointerId] = pos(e); moved = 0; G.focus = null;
        if (ids().length === 2) {
          var k = ids(), a = ptrs[k[0]], b = ptrs[k[1]];
          lastDist = Math.hypot(a.x - b.x, a.y - b.y); lastMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        }
        var p = pos(e); G.hover = { px: p.x, py: p.y };
        if (opts.onInteract) opts.onInteract();
        schedule();
      });
      cv.addEventListener("pointermove", function (e) {
        var p = pos(e);
        if (!ptrs[e.pointerId]) { if (e.pointerType === "mouse") { G.hover = { px: p.x, py: p.y }; schedule(); } return; }
        var prev = ptrs[e.pointerId];
        ptrs[e.pointerId] = p;
        var n = ids().length;
        if (n === 1) {
          moved += Math.abs(p.x - prev.x) + Math.abs(p.y - prev.y);
          if (moved > 5) {
            G.cx -= (p.x - prev.x) / G.scale; G.cy += (p.y - prev.y) / G.scale;
            G.hover = null; cv.style.cursor = "grabbing"; schedule();
          } else if (e.pointerType === "mouse") { G.hover = { px: p.x, py: p.y }; schedule(); }
        } else if (n === 2) {
          var k = ids(), a = ptrs[k[0]], b = ptrs[k[1]];
          var dist = Math.hypot(a.x - b.x, a.y - b.y), mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          if (lastMid) { G.cx -= (mid.x - lastMid.x) / G.scale; G.cy += (mid.y - lastMid.y) / G.scale; }
          if (lastDist > 0) zoomAtPx(mid.x, mid.y, dist / lastDist);
          lastDist = dist; lastMid = mid; G.hover = null; schedule();
        }
      });
      function up(e) { delete ptrs[e.pointerId]; lastDist = 0; lastMid = null; cv.style.cursor = "crosshair"; }
      cv.addEventListener("pointerup", up);
      cv.addEventListener("pointercancel", up);
      cv.addEventListener("pointerleave", function (e) { if (e.pointerType === "mouse") { G.hover = null; schedule(); } });
      cv.addEventListener("wheel", function (e) {
        e.preventDefault();
        var p = pos(e), f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
        zoomAtPx(p.x, p.y, f);
        if (opts.onInteract) opts.onInteract();
      }, { passive: false });
      cv.addEventListener("dblclick", function (e) { var p = pos(e); zoomAtPx(p.x, p.y, 1.8); });
      cv.style.cursor = "crosshair";

      host.addEventListener("keydown", function (e) {
        var step = 50 / G.scale, used = true;
        if (e.key === "ArrowLeft") animateTo(G.cx - step, G.cy, G.scale);
        else if (e.key === "ArrowRight") animateTo(G.cx + step, G.cy, G.scale);
        else if (e.key === "ArrowUp") animateTo(G.cx, G.cy + step, G.scale);
        else if (e.key === "ArrowDown") animateTo(G.cx, G.cy - step, G.scale);
        else if (e.key === "+" || e.key === "=") zoomButton(1.4);
        else if (e.key === "-" || e.key === "_") zoomButton(1 / 1.4);
        else if (e.key === "0" || e.key === "Home") api.home();
        else used = false;
        if (used) e.preventDefault();
      });
    }

    function resize() {
      var w = host.clientWidth, h = host.clientHeight;
      if (!w || !h) return;
      var first = !G.w;
      G.dpr = Math.min(root.devicePixelRatio || 1, 3);
      G.w = w; G.h = h;
      cv.width = Math.round(w * G.dpr); cv.height = Math.round(h * G.dpr);
      cv.style.width = w + "px"; cv.style.height = h + "px";
      if (first) { var hv = homeView(); G.scale = hv.scale; G.cx = hv.cx; G.cy = hv.cy; }
      draw();
    }

    var api = {
      setEquations: function (list) { G.eqs = list; schedule(); },
      setParam: function (name, v) { G.params[name] = v; schedule(); },
      getParams: function () { return G.params; },
      setAngle: function (deg) { setAngleDegrees(deg); schedule(); },
      setExam: function (on) { G.exam = !!on; G.hover = null; G.focus = null; schedule(); },
      zoomIn: function () { zoomButton(1.4); },
      zoomOut: function () { zoomButton(1 / 1.4); },
      home: function () { var hv = homeView(); animateTo(hv.cx, hv.cy, hv.scale); },
      redraw: schedule,
      resize: resize,
      refreshTheme: function () { readPalette(); schedule(); },
      setInset: function (px) {
        px = Math.max(0, Math.round(px));
        if (px === G.insetB) return;
        var oldC = visCenterPx().y;
        G.insetB = px;
        var newC = visCenterPx().y;
        G.cy += (newC - oldC) / G.scale;
        schedule();
      },
      focusPoint: function (p) {
        G.focus = { x: p.x, y: p.y, ci: p.ci, label: p.label };
        var vc = visCenterPx();
        animateTo(p.x - (vc.x - G.w / 2) / G.scale, p.y + (vc.y - G.h / 2) / G.scale, G.scale);
      },
      clearFocus: function () { G.focus = null; schedule(); },
      fitTo: function (x0, x1, y0, y1) {
        var vh = Math.max(G.h - G.insetB, 160), dx = Math.max(x1 - x0, 1), dy = Math.max(y1 - y0, 1);
        var sc = Math.max(1e-6, Math.min((G.w * 0.78) / dx, (vh * 0.72) / dy));
        var cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, vc = visCenterPx();
        animateTo(cx - (vc.x - G.w / 2) / sc, cy + (vc.y - G.h / 2) / sc, sc);
      },
      toBlob: function (cb, type, quality) {
        var k = Math.max(2, G.dpr), off = document.createElement("canvas");
        off.width = Math.round(G.w * k); off.height = Math.round(G.h * k);
        render(off.getContext("2d"), k, LIGHT, false, true);
        off.toBlob(cb, type || "image/png", quality);
      },
      getView: function () { return { cx: G.cx, cy: G.cy, scale: G.scale, w: G.w, h: G.h }; },
      getPoints: function () { return G.pts; }
    };

    bindInteraction();
    if (typeof root.ResizeObserver !== "undefined") new root.ResizeObserver(resize).observe(host);
    root.addEventListener("resize", resize);
    resize();
    return api;
  }

  var EGEngine = { compileExpr: compileExpr, compileSurface: compileSurface, compileImplicit3: compileImplicit3, createGraph: createGraph, setAngleDegrees: setAngleDegrees, fmt: fmt,
    regress: regress, parseData: parseData, MODELS: MODELS };
  root.EGEngine = EGEngine;
  if (typeof module !== "undefined" && module.exports) module.exports = EGEngine;
})(typeof window !== "undefined" ? window : globalThis);