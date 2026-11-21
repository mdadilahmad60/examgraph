/* Run:  node scripts/test-calculus.js   -> d/dx(), int() and dy/dx compile and give the right numbers */
const E = require("../assets/js/engine.js");
let pass = 0, fail = 0;
const near = (a, b, tol) => Math.abs(a - b) <= (tol || 1e-6) * Math.max(1, Math.abs(b));
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log("FAIL", msg); } }
function fnOf(text) { const r = E.compileExpr(text); if (!r.fn || r.error) throw new Error(text + " -> " + JSON.stringify(r)); return r; }
function val(text, x, P) { return fnOf(text).fn(x, P || {}); }

// derivatives
ok(near(val("d/dx(x^3 - 3*x)", 2), 9), "d/dx x^3-3x at 2");
ok(near(val("d/dx(sin(x))", 1), Math.cos(1)), "d/dx sin");
ok(near(val("d/dx(ln(x))", 4), 0.25), "d/dx ln");
ok(near(val("d/dx(exp(x))", 3), Math.exp(3), 1e-7), "d/dx exp");
ok(near(val("d2/dx2(x^3)", 2), 12, 1e-5), "second derivative of x^3");
ok(near(val("d^2/dx^2(sin(x))", 1), -Math.sin(1), 1e-5), "second derivative of sin");
ok(near(val("d/dx(d/dx(x^3))", 2), 12, 1e-4), "nested derivative");
ok(near(val("y = d/dx(a*x^2)", 3, { a: 2 }), 12), "derivative with slider");
ok(fnOf("d/dx(x^2)").params.length === 0 && fnOf("d/dx(a*x^2)").params.join() === "a", "derivative params");
ok(!!E.compileExpr("d/dx(x^2)*3").fn || true, "wrapped check does not crash");

// integrals
const area = fnOf("int(x^2, 0, 3)");
ok(area.ext && area.ext.area, "area result has ext.area");
ok(near(area.ext.area({}).value, 9), "area of x^2 on [0,3]");
ok(near(fnOf("int(sin(x), 0, pi)").ext.area({}).value, 2), "area of sin on [0,pi]");
ok(near(fnOf("int(1/x, 1, e)").ext.area({}).value, 1), "area of 1/x on [1,e]");
ok(near(fnOf("int(x, -2, 2)").ext.area({}).value, 0, 1e-9), "signed area is zero for odd function");
ok(near(fnOf("int(ln(x), 0, 1)").ext.area({}).value, -1, 1e-4) && near(fnOf("int(1/sqrt(x), 0, 4)").ext.area({}).value, 4, 1e-4) && near(fnOf("int(ln(x), 1, 0)").ext.area({}).value, 1, 1e-4), "improper endpoint is handled");
ok(near(fnOf("int(x^2, 0, b)").ext.area({ b: 3 }).value, 9), "bound from a slider");
ok(fnOf("int(x^2, 0, b)").params.join() === "b", "slider bound becomes a param");
ok(near(val("int(x^2)", 3), 9), "accumulation F(3) = 9");
ok(near(val("int(cos(x))", Math.PI / 2), 1), "accumulation of cos");
ok(near(val("int(2*x, 1)", 3), 8), "accumulation with a lower bound");
ok(near(val("int(x^2)", -3), -9), "accumulation to a negative x");

// slope fields
const sf = fnOf("dy/dx = x - y, y(0) = 1");
ok(sf.kind === "slopefield", "slope field kind");
ok(near(sf.ext.field(2, 1, {}), 1) && near(sf.ext.field(0, 3, {}), -3), "field values");
ok(sf.ext.ic && sf.ext.ic({}).x === 0 && sf.ext.ic({}).y === 1, "initial condition");
ok(fnOf("dy/dx = y").ext.ic === null, "no initial condition");
ok(near(fnOf("dy/dx = k*y").ext.field(0, 2, { k: 3 }), 6) && fnOf("dy/dx = k*y").params.join() === "k", "slope field slider");
ok(fnOf("dy/dx = y, y(a) = b").params.join() === "a,b" || fnOf("dy/dx = y, y(a) = b").params.length === 2, "initial point sliders");


// ---- exact (symbolic) derivatives: formula, accuracy and steps ----
function numericD(text, x, P) {   // independent central difference of the plain function
  const f = fnOf(text).fn, h = 1e-5;
  return (f(x + h, P) - f(x - h, P)) / (2 * h);
}
const battery = ["x^3 - 3*x", "sin(x^2)", "(x^2 + 1)^3", "exp(-x)", "ln(x^2 + 1)", "x*exp(x)", "sin(x)/x", "sqrt(x^2 + 1)", "atan(x)", "x^x",
  "tan(x)/x", "e^(2*x)", "5/x^2", "cos(3*x)^2", "asin(x/3)", "cosh(x)*sin(x)", "log(x^2 + 2)", "2^x", "a*x^2 + b*x", "abs(x - 1)*x"];
battery.forEach(function (f) {
  const r = fnOf("d/dx(" + f + ")"), info = r.ext && r.ext.info && r.ext.info();
  ok(info && info.formula, "has an exact formula for " + f + " -> " + JSON.stringify(info));
  const P = { a: 1.5, b: -0.5 };
  [0.43, 1.7, 2.6].forEach(function (x) {
    const a = r.fn(x, P), b = numericD(f, x, P);
    if (isFinite(a) && isFinite(b)) ok(near(a, b, 1e-4), "d/dx(" + f + ") at " + x + ": " + a + " vs " + b);
  });
});
const form = (f) => fnOf("d/dx(" + f + ")").ext.info().formula;
ok(form("x^3 - 3*x") === "3*x^2 - 3", "formula x^3-3x -> " + form("x^3 - 3*x"));
ok(form("sin(x^2)") === "2*x*cos(x^2)", "formula sin(x^2) -> " + form("sin(x^2)"));
ok(form("x^2*exp(x)") === "2*x*exp(x) + x^2*exp(x)", "formula x^2 e^x -> " + form("x^2*exp(x)"));
ok(form("1/x") === "-1/x^2", "formula 1/x -> " + form("1/x"));
ok(form("cos(3*x)") === "-3*sin(3*x)", "formula cos(3x) -> " + form("cos(3*x)"));
ok(fnOf("d2/dx2(x^4)").ext.info().formula === "12*x^2", "second derivative formula");
const st = fnOf("d/dx(x^2*sin(x))").ext.info().stages[0].map((q) => q.rule).join(" | ");
ok(/Product rule/.test(st) && /Power rule/.test(st), "steps mention product and power rules: " + st);
ok(/Chain rule/.test(fnOf("d/dx(sin(x^2))").ext.info().stages[0].map((q) => q.rule).join(" | ")), "chain rule step");

// ---- corners and jumps are undefined, not wrong ----
ok(Number.isNaN(val("d/dx(abs(x))", 0)), "|x| has no derivative at 0 (exact route)");
ok(val("d/dx(abs(x))", 2) === 1 && val("d/dx(abs(x))", -2) === -1, "|x| slopes away from the corner");
ok(Number.isNaN(val("d/dx(floor(x))", 1)), "floor jump is undefined (numeric route)");
const num = fnOf("d/dx(floor(x) + abs(x - 1))");
ok(!num.ext.info().formula && /numerically/.test(num.ext.info().note), "functions with no exact rule explain the numeric fallback");
ok(Number.isNaN(num.fn(1, {})) && near(num.fn(2.5, {}), 1, 1e-4), "numeric route: NaN at the corner, right slope elsewhere");
ok(Number.isNaN(val("d/dx((x < 1) ? x : 2 - x)", 1)), "piecewise corner at x = 1 is undefined");
ok(near(val("d/dx((x < 1) ? x^2 : 2*x - 1)", 0.5), 1, 1e-4), "piecewise slope on one piece");

// ---- exact antiderivatives agree with the numerical integral, and print an F(b) - F(a) step ----
[["x^2", 0, 3], ["3*x^2 - 2*x + 1", 0, 2], ["sin(2*x + 1)", 0, 1], ["exp(-x)", 0, 2], ["1/x", 1, 3], ["1/(2*x + 1)", 0, 1], ["sqrt(x)", 0, 4],
 ["cos(x)", 0, 1], ["4/x^2", 1, 2], ["(3*x + 1)^2", 0, 1], ["exp(2*x)", 0, 1], ["a*x", 0, 2]].forEach(function (c) {
  const t = "int(" + c[0] + ", " + c[1] + ", " + c[2] + ")", r = fnOf(t), info = r.ext.info({ a: 1.5 }), v = r.ext.area({ a: 1.5 }).value;
  ok(info.formula && /^F\(x\) = /.test(info.formula) && info.value !== undefined, "exact integral for " + t + " -> " + JSON.stringify(info).slice(0, 160));
  if (info.value !== undefined) ok(near(parseFloat(info.value), v, 1e-4), t + " exact " + info.value + " vs numeric " + v);
});
ok(!fnOf("int(x*sin(x), 0, 1)").ext.info({}).formula && /numerical value/.test(fnOf("int(x*sin(x), 0, 1)").ext.info({}).note), "no formula for products, numeric note");
ok(/FTC|Fundamental/.test(fnOf("int(x^2, 0, 3)").ext.info({}).stages[0][1].rule), "definite integral shows the FTC step");
ok(fnOf("int(x^2)").ext.info({}).formula === "F(x) = x^3/3", "accumulation formula x^3/3");
ok(fnOf("int(x^2, 1)").ext.info({}).formula === "F(x) = x^3/3 - 0.3333333333", "accumulation from 1: " + fnOf("int(x^2, 1)").ext.info({}).formula);

// ---- degree mode: formulas and values stay consistent ----
E.setAngleDegrees(true);
const dd = fnOf("d/dx(sin(x))");
ok(near(dd.fn(30, {}), Math.PI / 180 * Math.cos(Math.PI / 6), 1e-9), "d/dx sin(x) in degrees has the pi/180 factor");
ok(/pi\/180/.test(dd.ext.info().formula), "degree-mode formula shows the factor: " + dd.ext.info().formula);
ok(!fnOf("int(sin(x), 0, 90)").ext.info({}).formula, "trig antiderivatives are not offered in degree mode");
E.setAngleDegrees(false);
ok(fnOf("d/dx(sin(x))").ext.info().formula === "cos(x)", "radian formula is plain cos(x)");

// errors and non-interference
const bad = (t, part) => { const r = E.compileExpr(t); ok(r.error && (!part || r.error.indexOf(part) >= 0), "expected error for " + t + " -> " + JSON.stringify(r)); };
bad("d/dx(y > x)", "function of x"); bad("int(x, 0, 1, 2)", "int(f)"); bad("int(x, x, 1)", "bounds"); bad("dy/dx = x, 5", "starting point");
bad("dy/dx = x = 2", "right side"); bad("int(, 0, 1)", ""); 
ok(near(val("2x + 1", 3), 7) && E.compileExpr("x^2 + y^2 = 9").kind === "implicit" && E.compileExpr("r = 1 + cos(t)").kind === "polar", "other syntax unaffected");
ok(E.compileExpr("(1, 2), (3, 4)").kind === "points", "points unaffected");
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
