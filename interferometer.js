"use strict";

// ---------------------------------------------------------------------------
// Parameters / controls
// ---------------------------------------------------------------------------

var LAMBDA_MIN = 300, LAMBDA_MAX = 800;   // nm; spectrum plot bounds and wavelength slider limits

// "table" is the id of the <table> the control is added to. "stacked" puts the
// label on its own line above the slider.
var PARAMS = [
  { table: "geomControls", stacked: true, id: "L1",     label: "Arm 1 length L1",            unit: "mm",   min: 0,    max: 300,  step: 0.1,  value: 100 },
  { table: "geomControls", stacked: true, id: "L2",     label: "Arm 2 length L2 (coarse)",   unit: "mm",   min: 0,    max: 300,  step: 0.1,  value: 100 },
  { table: "geomControls", stacked: true, id: "L2fine", label: "Arm 2 length L2 (fine, added)", unit: "µm", min: -5, max: 5, step: 0.01, value: 0 },
  { table: "geomControls", stacked: true, id: "thetaX", label: "Mirror 2 tilt θx",      unit: "µrad", min: -2000, max: 2000, step: 1, value: 150 },
  { table: "geomControls", stacked: true, id: "thetaY", label: "Mirror 2 tilt θy",      unit: "µrad", min: -2000, max: 2000, step: 1, value: 50 },
  { table: "geomControls", stacked: true, id: "D",      label: "Input beam divergence (lens power)", unit: "diopters", min: -20, max: 20, step: 0.01, value: 0 },
  { table: "geomControls", stacked: true, id: "Ld",     label: "Beamsplitter to screen distance", unit: "mm", min: 0,  max: 500,  step: 1,    value: 100 },
  { table: "geomControls", stacked: true, id: "fov",    label: "Image width",                unit: "mm",   min: 1,    max: 50,   step: 0.1,  value: 10 },
  { table: "specControls",  id: "lambdaC", label: "Center wavelength", unit: "nm", min: LAMBDA_MIN, max: LAMBDA_MAX, step: 1,   value: 550 },
  { table: "specControls",  id: "fwhm",    label: "FWHM",              unit: "nm", min: 0.01,       max: 400,        log: true, value: 100 },
  { table: "phaseControls", id: "lambdaP", label: "Wavelength",        unit: "nm", min: LAMBDA_MIN, max: LAMBDA_MAX, step: 1,   value: 550 }
];

var inputs = {};   // id -> {range, number}
var P = {};        // current parameter values (in the units shown in the UI)

function buildControls() {
  PARAMS.forEach(function (p) {
    var table = document.getElementById(p.table);
    var tr = document.createElement("tr");
    var tdLabel = document.createElement("td");
    tdLabel.textContent = p.label;
    if (p.stacked) {
      tdLabel.colSpan = 3;
      tdLabel.className = "stackedLabel";
      tr.appendChild(tdLabel);
      table.appendChild(tr);
      tr = document.createElement("tr");
    } else {
      tr.appendChild(tdLabel);
    }
    var range = document.createElement("input");
    range.type = "range";
    var number = document.createElement("input");
    number.type = "number";
    number.min = p.min; number.max = p.max; number.step = p.log ? "any" : p.step;
    if (p.log) {   // slider position is log10 of the value
      range.min = Math.log10(p.min); range.max = Math.log10(p.max); range.step = 0.001;
    } else {
      range.min = p.min; range.max = p.max; range.step = p.step;
    }
    range.addEventListener("input", function () {
      var v = parseFloat(range.value);
      if (p.log) v = parseFloat(Math.pow(10, v).toPrecision(3));
      number.value = v;
      P[p.id] = v;
      requestUpdate(true);
    });
    number.addEventListener("input", function () {
      var v = parseFloat(number.value);
      if (isNaN(v) || (p.log && v <= 0)) return;
      range.value = p.log ? Math.log10(v) : v;   // slider clamps itself; typed value may exceed the slider range
      P[p.id] = v;
      requestUpdate(true);
    });
    var tdRange = document.createElement("td"); tdRange.appendChild(range);
    var tdNumber = document.createElement("td"); tdNumber.appendChild(number);
    var tdUnit = document.createElement("td"); tdUnit.textContent = p.unit;
    tr.appendChild(tdRange); tr.appendChild(tdNumber); tr.appendChild(tdUnit);
    table.appendChild(tr);
    inputs[p.id] = { range: range, number: number };
    setParam(p, p.value);
  });
}

function setParam(p, v) {
  inputs[p.id].number.value = v;
  inputs[p.id].range.value = p.log ? Math.log10(v) : v;
  P[p.id] = v;
}

// Non-slider options (drop-downs and checkboxes), by element id.
var OPTIONS = [
  { id: "source",    value: "gaussian" },
  { id: "phaseMode", value: "wrapped" },
  { id: "showCones", value: false },
  { id: "logY",      value: false }
];

function getOption(id) {
  var el = document.getElementById(id);
  return el.type === "checkbox" ? el.checked : el.value;
}

function setOption(o, v) {
  var el = document.getElementById(o.id);
  if (el.type === "checkbox") { el.checked = !!v; return; }
  el.value = v;
  if (el.value !== v) el.value = o.value;   // not one of the choices
}

// Grey out the spectrum sliders that the selected source does not use.
function updateEnabled() {
  var src = getOption("source");
  function enable(id, on) {
    inputs[id].range.disabled = !on;
    inputs[id].number.disabled = !on;
  }
  enable("lambdaC", src === "gaussian" || src === "laser");
  enable("fwhm", src === "gaussian");
}

function resetControls() {
  PARAMS.forEach(function (p) { setParam(p, p.value); });
  OPTIONS.forEach(function (o) { setOption(o, o.value); });
  sel.x = 0; sel.y = 0;
  updateEnabled();
  requestUpdate(true);
}

// ---------------------------------------------------------------------------
// Share link: the full UI state is stored in the URL hash
// ---------------------------------------------------------------------------

function stateToHash() {
  var parts = PARAMS.map(function (p) { return p.id + "=" + P[p.id]; });
  OPTIONS.forEach(function (o) {
    var v = getOption(o.id);
    parts.push(o.id + "=" + (typeof v === "boolean" ? (v ? 1 : 0) : encodeURIComponent(v)));
  });
  parts.push("x=" + parseFloat(sel.x.toFixed(4)), "y=" + parseFloat(sel.y.toFixed(4)));
  return parts.join("&");
}

function applyHash() {
  var kv = {};
  location.hash.replace(/^#/, "").split("&").forEach(function (part) {
    var i = part.indexOf("=");
    if (i > 0) kv[part.slice(0, i)] = decodeURIComponent(part.slice(i + 1));
  });
  PARAMS.forEach(function (p) {
    var v = parseFloat(kv[p.id]);
    if (isFinite(v) && !(p.log && v <= 0)) setParam(p, v);
  });
  OPTIONS.forEach(function (o) {
    if (!(o.id in kv)) return;
    setOption(o, typeof o.value === "boolean" ? kv[o.id] === "1" : kv[o.id]);
  });
  if (isFinite(parseFloat(kv.x))) sel.x = parseFloat(kv.x);
  if (isFinite(parseFloat(kv.y))) sel.y = parseFloat(kv.y);
  updateEnabled();
  requestUpdate(true);
}

function shareLink() {
  var url = location.href.split("#")[0] + "#" + stateToHash();
  history.replaceState(null, "", url);
  var box = document.getElementById("shareUrl"), status = document.getElementById("shareStatus");
  box.value = url;
  box.style.display = "";
  box.select();
  status.textContent = "Copy the link above.";
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(function () {
      status.textContent = "Link copied to clipboard.";
    }, function () {});
  }
}

// ---------------------------------------------------------------------------
// Optics
// ---------------------------------------------------------------------------

// Source spectra. Each source is a list of components whose spectral
// intensities add. A component is one of
//   { center, fwhm, amp }     Gaussian with peak height amp (wavelengths in nm)
//   { center, fwhm: 0, amp }  ideal monochromatic line
//   { f, amp }                arbitrary smooth function f(lambda), peak ~1
function gauss(center, fwhm, amp) { return { center: center, fwhm: fwhm, amp: amp }; }

// Planck spectrum per unit wavelength at the Sun's effective temperature,
// normalized to 1 at its peak.
var SUN_T = 5778, HC_K = 1.4388e7;   // K, nm*K
function planck(lam) { return Math.pow(lam, -5) / (Math.exp(HC_K / (lam * SUN_T)) - 1); }
var PLANCK_PEAK = planck(2.898e6 / SUN_T);
function sunlight(lam) { return planck(lam) / PLANCK_PEAK; }

// Fraction of a laser-phosphor flashlight's power left in the blue pump line.
var PHOSPHOR_BLUE_FRACTION = 0.2;

var SOURCES = {
  gaussian: function () { return [gauss(P.lambdaC, Math.max(P.fwhm, 1e-6), 1)]; },
  laser:    function () { return [gauss(P.lambdaC, 0, 1)]; },
  sun:      function () { return [{ f: sunlight, amp: 1 }]; },
  // Approximate tri-phosphor fluorescent lamp: mercury lines plus the
  // blue, green (Tb) and red (Eu) phosphor emission bands.
  fluorescent: function () {
    return [
      gauss(404.7, 1.5, 0.15), gauss(435.8, 1.5, 0.60), gauss(450, 50, 0.12),
      gauss(487, 8, 0.20),     gauss(544, 6, 1.00),     gauss(580, 10, 0.20),
      gauss(611, 5, 0.90),     gauss(630, 8, 0.20),     gauss(707, 5, 0.05)
    ];
  },
  // Blue pump laser plus broad phosphor emission; amplitudes set so the
  // integrated powers split as PHOSPHOR_BLUE_FRACTION : (1 - PHOSPHOR_BLUE_FRACTION).
  phosphor: function () {
    var b = PHOSPHOR_BLUE_FRACTION;
    return [gauss(450, 0.1, b / (1 - b) * 100 / 0.1), gauss(570, 100, 1)];
  }
};

function currentSource() {
  return (SOURCES[getOption("source")] || SOURCES.gaussian)();
}

// Spectral intensity of the continuous part of a source (monochromatic lines excluded).
function sourceSpectrum(comps, lam) {
  var sum = 0;
  for (var i = 0; i < comps.length; i++) {
    var c = comps[i];
    if (c.f) sum += c.amp * c.f(lam);
    else if (c.fwhm > 0) {
      var u = (lam - c.center) / c.fwhm;
      sum += c.amp * Math.exp(-4 * Math.LN2 * u * u);
    }
  }
  return sum;
}

// Geometry in SI units, derived from the UI parameters.
function geometry() {
  var tx = Math.tan(2 * P.thetaX * 1e-6);   // reflected beam deviates by twice the mirror tilt
  var ty = Math.tan(2 * P.thetaY * 1e-6);
  var norm = Math.sqrt(1 + tx * tx + ty * ty);
  return {
    L1: P.L1 * 1e-3,
    L2: P.L2 * 1e-3 + P.L2fine * 1e-6,
    Ld: Math.max(0, P.Ld) * 1e-3,
    D: P.D,
    nx: tx / norm, ny: ty / norm, nz: 1 / norm
  };
}

// Optical path length (m) from the lens (at the beamsplitter) to the screen
// point (x, y) via one arm, in the unfolded picture. The arm mirror sits a
// distance L along the axis; after it the beam axis points along (nx, ny, nz).
// The wave is spherical, centered on the lens focus at distance 1/D along the
// (folded) axis. Written so that D = 0 (plane wave) needs no special case:
//   OPL = z + c r^2 / (1 + sqrt(1 + c^2 r^2)),  c = 1/(z - f) = D/(zD - 1)
// with z the distance along the beam axis and r the distance from it.
function opl(x, y, L, Ld, nx, ny, nz, D) {
  var dz = L + Ld;
  var dn = x * nx + y * ny + dz * nz;
  var r2 = x * x + y * y + dz * dz - dn * dn;
  if (r2 < 0) r2 = 0;
  var z = L + dn;
  var den = z * D - 1;
  if (Math.abs(den) < 1e-12) den = 1e-12;   // screen exactly at the focus
  var c = D / den;
  return z + c * r2 / (1 + Math.sqrt(1 + c * c * r2));
}

// Optical path difference (arm 2 minus arm 1) in nm at screen point (x, y) in m.
function opdAt(g, x, y) {
  return 1e9 * (opl(x, y, g.L2, g.Ld, g.nx, g.ny, g.nz, g.D) -
                opl(x, y, g.L1, g.Ld, 0, 0, 1, g.D));
}

// ---------------------------------------------------------------------------
// Colorimetry
// ---------------------------------------------------------------------------

function lobe(lam, mu, s1, s2) {
  var t = (lam - mu) / (lam < mu ? s1 : s2);
  return Math.exp(-0.5 * t * t);
}

// CIE 1931 2-degree color matching functions, multi-lobe Gaussian fit
// (Wyman, Sloan & Shirley, JCGT 2013). Wavelength in nm.
function cieXYZ(lam) {
  return [
    1.056 * lobe(lam, 599.8, 37.9, 31.0) + 0.362 * lobe(lam, 442.0, 16.0, 26.7) - 0.065 * lobe(lam, 501.1, 20.4, 26.2),
    0.821 * lobe(lam, 568.8, 46.9, 40.5) + 0.286 * lobe(lam, 530.9, 16.3, 31.1),
    1.217 * lobe(lam, 437.0, 11.8, 36.0) + 0.681 * lobe(lam, 459.0, 26.0, 13.8)
  ];
}

// L, M, S cone responsivities (Hunt-Pointer-Estevez transform of the CMFs),
// each normalized to a peak of 1. Used only for display on the spectrum plot.
var CONE_PEAK = [1, 1, 1];
function coneLMS(lam) {
  var c = cieXYZ(lam);
  return [
    Math.max(0, 0.38971 * c[0] + 0.68898 * c[1] - 0.07868 * c[2]) / CONE_PEAK[0],
    Math.max(0, -0.22981 * c[0] + 1.18340 * c[1] + 0.04641 * c[2]) / CONE_PEAK[1],
    Math.max(0, c[2]) / CONE_PEAK[2]
  ];
}
(function () {
  var peak = [0, 0, 0];
  for (var lam = 380; lam <= 780; lam += 0.5) {
    var v = coneLMS(lam);
    for (var i = 0; i < 3; i++) peak[i] = Math.max(peak[i], v[i]);
  }
  CONE_PEAK = peak;
})();

function xyzToLinearSRGB(X, Y, Z) {
  return [
     3.2406 * X - 1.5372 * Y - 0.4986 * Z,
    -0.9689 * X + 1.8758 * Y + 0.0415 * Z,
     0.0557 * X - 0.2040 * Y + 1.0570 * Z
  ];
}

// linear [0,1] -> sRGB byte
var GAMMA_LUT = (function () {
  var lut = new Uint8ClampedArray(4096);
  for (var i = 0; i < 4096; i++) {
    var v = i / 4095;
    lut[i] = 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055) + 0.5;
  }
  return lut;
})();

function toByte(v) {
  return GAMMA_LUT[v <= 0 ? 0 : v >= 1 ? 4095 : (v * 4095 + 0.5) | 0];
}

// Quadrature weights for the RGB integrals. Samples are uniform in wavenumber
// (1/lambda) so that the fringe phase advances by a constant step from sample
// to sample for a given OPD.
// Each source component gets its own set of samples, so narrow lines and
// broad bands are both resolved. A monochromatic line is a single sample
// with zero bin width (no integration needed).
function spectralWeights(comps) {
  var VIS_LO = 360, VIS_HI = 830;
  var w = { parts: [], R0: 0, G0: 0, B0: 0, norm: 0 };
  comps.forEach(function (c) {
    var line = !c.f && !(c.fwhm > 0);
    var lo = VIS_LO, hi = VIS_HI, n = 1, ds = 0, step = 5;
    if (line) {
      if (c.center < VIS_LO || c.center > VIS_HI) return;
    } else {
      if (!c.f) {
        lo = Math.max(lo, c.center - 2 * c.fwhm);
        hi = Math.min(hi, c.center + 2 * c.fwhm);
        step = Math.min(5, c.fwhm / 4);
      }
      if (!(hi > lo)) return;   // no visible light
      n = Math.max(8, Math.min(160, Math.ceil((hi - lo) / step)));
      ds = (1 / lo - 1 / hi) / n;
    }
    var part = {
      n: n, ds: ds, s0: line ? 1 / c.center : 1 / hi + 0.5 * ds,
      r: new Float64Array(n), g: new Float64Array(n), b: new Float64Array(n)
    };
    for (var j = 0; j < n; j++) {
      var lam = 1 / (part.s0 + j * ds);
      var q = line ? c.amp : sourceSpectrum([c], lam) * lam * lam * ds;   // S(lambda) d(lambda)
      var xyz = cieXYZ(lam);
      var rgb = xyzToLinearSRGB(q * xyz[0], q * xyz[1], q * xyz[2]);
      part.r[j] = rgb[0]; part.g[j] = rgb[1]; part.b[j] = rgb[2];
      w.R0 += rgb[0]; w.G0 += rgb[1]; w.B0 += rgb[2];
    }
    w.parts.push(part);
  });
  var m = Math.max(w.R0, w.G0, w.B0);
  w.norm = m > 1e-12 ? 1 / m : 0;   // bright fringe -> full scale
  return w;
}

// ---------------------------------------------------------------------------
// Field computation
// ---------------------------------------------------------------------------

var N = 256;   // image is N x N pixels
var opd = new Float64Array(N * N);   // nm
var rgbBuf = makeBuffer(), phaseBuf = makeBuffer();
var phaseRange = [-Math.PI, Math.PI];

function makeBuffer() {
  var c = document.createElement("canvas");
  c.width = N; c.height = N;
  var ctx = c.getContext("2d");
  return { canvas: c, ctx: ctx, img: ctx.createImageData(N, N) };
}

function computeField() {
  var g = geometry();
  var half = 0.5 * P.fov * 1e-3, px = 2 * half / N;
  var i, j, k;

  for (j = 0, k = 0; j < N; j++) {
    var y = half - (j + 0.5) * px;   // row 0 is the top (+y)
    for (i = 0; i < N; i++, k++) {
      opd[k] = opdAt(g, -half + (i + 0.5) * px, y);
    }
  }

  // --- RGB image ---
  var w = spectralWeights(currentSource());
  var out = rgbBuf.img.data;
  var parts = w.parts, np = parts.length;
  var TWO_PI = 2 * Math.PI;
  for (k = 0; k < N * N; k++) {
    var d = opd[k];
    var R = 0, G = 0, B = 0;
    for (var m = 0; m < np; m++) {
      var part = parts[m];
      var n = part.n, wr = part.r, wg = part.g, wb = part.b;
      var a0 = TWO_PI * d * part.s0, da = TWO_PI * d * part.ds;
      var c = Math.cos(a0), s = Math.sin(a0), cd = Math.cos(da), sd = Math.sin(da);
      var r = 0, gg = 0, b = 0, t;
      for (j = 0; j < n; j++) {
        r += wr[j] * c; gg += wg[j] * c; b += wb[j] * c;
        t = c * cd - s * sd; s = s * cd + c * sd; c = t;
      }
      // Averaging the cosine over each sample's wavenumber bin gives a sinc
      // factor; this washes fringes out (rather than aliasing) at large OPD.
      var h = 0.5 * da;
      var v = Math.abs(h) < 1e-9 ? 1 : Math.sin(h) / h;
      R += v * r; G += v * gg; B += v * b;
    }
    var o = 4 * k;
    out[o]     = toByte(0.5 * (w.R0 + R) * w.norm);
    out[o + 1] = toByte(0.5 * (w.G0 + G) * w.norm);
    out[o + 2] = toByte(0.5 * (w.B0 + B) * w.norm);
    out[o + 3] = 255;
  }
  rgbBuf.ctx.putImageData(rgbBuf.img, 0, 0);

  // --- Phase image ---
  out = phaseBuf.img.data;
  var kp = TWO_PI / P.lambdaP;
  var wrapped = document.getElementById("phaseMode").value === "wrapped";
  var lut = wrapped ? CYCLIC_LUT : SEQ_LUT;
  var lo, hi;
  if (wrapped) {
    lo = -Math.PI; hi = Math.PI;
  } else {
    lo = Infinity; hi = -Infinity;
    for (k = 0; k < N * N; k++) {
      if (opd[k] < lo) lo = opd[k];
      if (opd[k] > hi) hi = opd[k];
    }
    lo *= kp; hi *= kp;
    if (hi - lo < 1e-9) { lo -= 0.5; hi += 0.5; }
  }
  phaseRange = [lo, hi];
  var scale = 255 / (hi - lo);
  for (k = 0; k < N * N; k++) {
    var ph = opd[k] * kp;
    if (wrapped) ph -= TWO_PI * Math.round(ph / TWO_PI);
    var idx = 3 * Math.max(0, Math.min(255, Math.round((ph - lo) * scale)));
    out[4 * k] = lut[idx]; out[4 * k + 1] = lut[idx + 1]; out[4 * k + 2] = lut[idx + 2];
    out[4 * k + 3] = 255;
  }
  phaseBuf.ctx.putImageData(phaseBuf.img, 0, 0);
}

// ---------------------------------------------------------------------------
// Colormaps (256 entries, RGB bytes)
// ---------------------------------------------------------------------------

var CYCLIC_LUT = (function () {
  var lut = new Uint8ClampedArray(768);
  for (var i = 0; i < 256; i++) {
    var h = 6 * i / 256;   // hue wheel
    var x = 1 - Math.abs(h % 2 - 1);
    var rgb = h < 1 ? [1, x, 0] : h < 2 ? [x, 1, 0] : h < 3 ? [0, 1, x] :
              h < 4 ? [0, x, 1] : h < 5 ? [x, 0, 1] : [1, 0, x];
    for (var c = 0; c < 3; c++) lut[3 * i + c] = 255 * rgb[c];
  }
  return lut;
})();

var SEQ_LUT = (function () {
  var stops = [[68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37]];   // viridis-like
  var lut = new Uint8ClampedArray(768);
  for (var i = 0; i < 256; i++) {
    var t = i / 255 * (stops.length - 1);
    var a = Math.min(stops.length - 2, Math.floor(t)), f = t - a;
    for (var c = 0; c < 3; c++) lut[3 * i + c] = stops[a][c] + f * (stops[a + 1][c] - stops[a][c]);
  }
  return lut;
})();

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

var FONT = "12px sans-serif";
var sel = { x: 0, y: 0 };   // selected point, mm

// Plot-area placement within each image canvas
var rgbPanel   = { canvas: document.getElementById("rgbCanvas"),   left: 55, top: 15, size: 450 };
var phasePanel = { canvas: document.getElementById("phaseCanvas"), left: 75, top: 15, size: 220 };
var specCanvas = document.getElementById("specCanvas");

function niceTicks(min, max, target) {
  var raw = (max - min) / target;
  var mag = Math.pow(10, Math.floor(Math.log10(raw)));
  var f = raw / mag;
  var step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag;
  var ticks = [];
  for (var t = Math.ceil(min / step - 1e-9) * step; t <= max + 1e-9 * step; t += step) {
    ticks.push(parseFloat(t.toPrecision(10)));
  }
  return ticks;
}

function fmt(v) {
  var a = Math.abs(v);
  if (a !== 0 && (a >= 1e5 || a < 1e-3)) return v.toExponential(2);
  return String(parseFloat(v.toPrecision(4)));
}

// Frame, ticks and labels around the plot rectangle (x0, y0, w, h).
// With logY, ymin and ymax are log10 of the axis limits.
function drawAxes(ctx, x0, y0, w, h, xmin, xmax, ymin, ymax, xlabel, ylabel, logY) {
  var yTicks = [];
  if (logY) {
    for (var e = Math.ceil(ymin); e <= ymax; e++) yTicks.push(e);
  } else {
    yTicks = niceTicks(ymin, ymax, 6);
  }
  ctx.strokeStyle = "#000"; ctx.fillStyle = "#000"; ctx.lineWidth = 1; ctx.font = FONT;
  ctx.setLineDash([]);
  ctx.strokeRect(x0 + 0.5, y0 + 0.5, w, h);
  ctx.beginPath();
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  niceTicks(xmin, xmax, 6).forEach(function (t) {
    var x = Math.round(x0 + (t - xmin) / (xmax - xmin) * w) + 0.5;
    ctx.moveTo(x, y0 + h); ctx.lineTo(x, y0 + h + 5);
    ctx.fillText(fmt(t), x, y0 + h + 7);
  });
  ctx.textAlign = "right"; ctx.textBaseline = "middle";
  yTicks.forEach(function (t) {
    var y = Math.round(y0 + h - (t - ymin) / (ymax - ymin) * h) + 0.5;
    ctx.moveTo(x0, y); ctx.lineTo(x0 - 5, y);
    ctx.fillText(!logY ? fmt(t) : t >= -2 ? String(Math.pow(10, t)) : "1e" + t, x0 - 7, y);
  });
  ctx.stroke();
  ctx.textAlign = "center"; ctx.textBaseline = "bottom";
  ctx.fillText(xlabel, x0 + w / 2, y0 + h + 36);
  ctx.save();
  ctx.translate(x0 - 40, y0 + h / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(ylabel, 0, 0);
  ctx.restore();
}

function drawImagePanel(panel, buf) {
  var ctx = panel.canvas.getContext("2d");
  var L = panel.left, T = panel.top, S = panel.size, half = P.fov / 2;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, panel.canvas.width, panel.canvas.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(buf.canvas, L, T, S, S);
  drawAxes(ctx, L, T, S, S, -half, half, -half, half, "x (mm)", "y (mm)");

  // crosshair at the selected point (black over white so it shows on any color)
  var cx = Math.round(L + (sel.x + half) / (2 * half) * S) + 0.5;
  var cy = Math.round(T + (half - sel.y) / (2 * half) * S) + 0.5;
  ctx.save();
  ctx.beginPath(); ctx.rect(L, T, S, S); ctx.clip();
  [["#fff", 3], ["#000", 1]].forEach(function (style) {
    ctx.strokeStyle = style[0]; ctx.lineWidth = style[1];
    ctx.beginPath();
    ctx.moveTo(cx - 10, cy); ctx.lineTo(cx - 3, cy); ctx.moveTo(cx + 3, cy); ctx.lineTo(cx + 10, cy);
    ctx.moveTo(cx, cy - 10); ctx.lineTo(cx, cy - 3); ctx.moveTo(cx, cy + 3); ctx.lineTo(cx, cy + 10);
    ctx.stroke();
  });
  ctx.restore();
}

function drawColorbar() {
  var ctx = phasePanel.canvas.getContext("2d");
  var wrapped = document.getElementById("phaseMode").value === "wrapped";
  var lut = wrapped ? CYCLIC_LUT : SEQ_LUT;
  var x0 = phasePanel.left + phasePanel.size + 15, y0 = phasePanel.top, h = phasePanel.size, w = 15;
  for (var i = 0; i < h; i++) {
    var idx = 3 * Math.round(255 * (1 - i / (h - 1)));
    ctx.fillStyle = "rgb(" + lut[idx] + "," + lut[idx + 1] + "," + lut[idx + 2] + ")";
    ctx.fillRect(x0, y0 + i, w, 1);
  }
  ctx.strokeStyle = "#000"; ctx.lineWidth = 1;
  ctx.strokeRect(x0 + 0.5, y0 + 0.5, w, h);
  ctx.fillStyle = "#000"; ctx.font = FONT; ctx.textAlign = "left";
  var lo = phaseRange[0], hi = phaseRange[1];
  ctx.textBaseline = "top";    ctx.fillText(wrapped ? "π" : fmt(hi), x0 + w + 4, y0);
  ctx.textBaseline = "middle"; ctx.fillText(wrapped ? "0" : fmt((lo + hi) / 2), x0 + w + 4, y0 + h / 2);
  ctx.textBaseline = "bottom"; ctx.fillText(wrapped ? "-π" : fmt(lo), x0 + w + 4, y0 + h);
  ctx.textBaseline = "top";    ctx.fillText("rad", x0, y0 + h + 7);
}

function drawSpectrum() {
  var ctx = specCanvas.getContext("2d");
  var x0 = 55, y0 = 15, w = specCanvas.width - x0 - 20, h = specCanvas.height - y0 - 45;
  var lo = LAMBDA_MIN, hi = LAMBDA_MAX;
  var d = opdAt(geometry(), sel.x * 1e-3, sel.y * 1e-3);
  var logY = document.getElementById("logY").checked;
  var showCones = document.getElementById("showCones").checked;
  var ymin = logY ? -4 : 0, ymax = logY ? 0.1 : 1.05;   // log10 limits when logY
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, specCanvas.width, specCanvas.height);

  function X(lam) { return x0 + (lam - lo) / (hi - lo) * w; }
  function Y(v) {
    if (logY) v = v > 1e-6 ? Math.log10(v) : -6;   // below the axis floor; clipped
    return y0 + h - (v - ymin) / (ymax - ymin) * h;
  }
  // Sample wavelengths: a uniform grid, plus extra points across any
  // component too narrow for the grid to resolve.
  var comps = currentSource(), lams = [], i;
  for (i = 0; i <= 4 * w; i++) lams.push(lo + (hi - lo) * i / (4 * w));
  var peak = 0;
  comps.forEach(function (c) {
    peak = Math.max(peak, c.amp);
    if (c.f || !(c.fwhm > 0) || c.fwhm > 4) return;
    for (var j = -40; j <= 40; j++) {
      var lam = c.center + j * c.fwhm / 20;
      if (lam > lo && lam < hi) lams.push(lam);
    }
  });
  lams.sort(function (a, b) { return a - b; });
  var scale = 1 / peak;   // plot is normalized to the tallest component

  function fringe(lam) { return 0.5 * (1 + Math.cos(2 * Math.PI * d / lam)); }
  function trace(f, color, dash) {
    ctx.beginPath();
    for (var i = 0; i < lams.length; i++) {
      if (i === 0) ctx.moveTo(X(lams[i]), Y(f(lams[i]))); else ctx.lineTo(X(lams[i]), Y(f(lams[i])));
    }
    ctx.strokeStyle = color; ctx.setLineDash(dash); ctx.lineWidth = 1;
    ctx.stroke();
  }
  // Monochromatic lines are drawn as vertical sticks.
  function sticks(f, color, dash) {
    ctx.beginPath();
    comps.forEach(function (c) {
      if (c.f || c.fwhm > 0) return;
      var x = Math.round(X(c.center)) + 0.5;
      ctx.moveTo(x, y0 + h); ctx.lineTo(x, Y(c.amp * scale * f(c.center)));
    });
    ctx.strokeStyle = color; ctx.setLineDash(dash); ctx.lineWidth = 1;
    ctx.stroke();
  }

  var legend = [["- - source", "#888"], ["— output", "#000"]];
  ctx.save();
  ctx.beginPath(); ctx.rect(x0, y0, w, h); ctx.clip();
  if (P.lambdaP > lo && P.lambdaP < hi) {   // marker for the phase-plot wavelength
    ctx.beginPath();
    ctx.moveTo(Math.round(X(P.lambdaP)) + 0.5, y0); ctx.lineTo(Math.round(X(P.lambdaP)) + 0.5, y0 + h);
    ctx.strokeStyle = "#c0c"; ctx.setLineDash([2, 3]); ctx.stroke();
  }
  if (showCones) {
    [["L cone", "#d00"], ["M cone", "#090"], ["S cone", "#00d"]].forEach(function (cone, i) {
      trace(function (lam) { return coneLMS(lam)[i]; }, cone[1], []);
      legend.push(["— " + cone[0], cone[1]]);
    });
  }
  trace(function (lam) { return scale * sourceSpectrum(comps, lam); }, "#888", [5, 4]);
  sticks(function () { return 1; }, "#888", [5, 4]);
  trace(function (lam) { return scale * sourceSpectrum(comps, lam) * fringe(lam); }, "#000", []);
  sticks(fringe, "#000", []);
  ctx.restore();
  drawAxes(ctx, x0, y0, w, h, lo, hi, ymin, ymax, "Wavelength (nm)", "Spectral intensity (rel.)", logY);

  ctx.textAlign = "left"; ctx.textBaseline = "top"; ctx.font = FONT;
  legend.forEach(function (item, i) {
    ctx.fillStyle = item[1];
    ctx.fillText(item[0], x0 + 6, y0 + 5 + 14 * i);
  });

  var phase = 2 * Math.PI * d / P.lambdaP;
  document.getElementById("info").textContent =
    "Selected point: x = " + sel.x.toFixed(3) + " mm, y = " + sel.y.toFixed(3) + " mm;  " +
    "OPD = " + fmt(d / 1000) + " µm;  " +
    "phase difference at " + fmt(P.lambdaP) + " nm = " + fmt(phase) + " rad (" + fmt(d / P.lambdaP) + " waves)";
}

// ---------------------------------------------------------------------------
// Update loop and interaction
// ---------------------------------------------------------------------------

var pending = false, fieldDirty = false;

function requestUpdate(recompute) {
  fieldDirty = fieldDirty || recompute;
  if (pending) return;
  pending = true;
  requestAnimationFrame(function () {
    pending = false;
    var half = P.fov / 2;
    sel.x = Math.max(-half, Math.min(half, sel.x));
    sel.y = Math.max(-half, Math.min(half, sel.y));
    if (fieldDirty) { computeField(); fieldDirty = false; }
    drawImagePanel(rgbPanel, rgbBuf);
    drawImagePanel(phasePanel, phaseBuf);
    drawColorbar();
    drawSpectrum();
    document.getElementById("phaseTitle").textContent =
      "Phase difference at " + fmt(P.lambdaP) + " nm";
  });
}

function attachPointSelection(panel) {
  var c = panel.canvas;
  function pick(e) {
    var rect = c.getBoundingClientRect(), half = P.fov / 2;
    var px = (e.clientX - rect.left) * c.width / rect.width;
    var py = (e.clientY - rect.top) * c.height / rect.height;
    sel.x = ((px - panel.left) / panel.size * 2 - 1) * half;
    sel.y = (1 - (py - panel.top) / panel.size * 2) * half;
    requestUpdate(false);
  }
  c.addEventListener("pointerdown", function (e) { c.setPointerCapture(e.pointerId); pick(e); });
  c.addEventListener("pointermove", function (e) { if (e.buttons & 1) pick(e); });
}

buildControls();
attachPointSelection(rgbPanel);
attachPointSelection(phasePanel);
document.getElementById("source").addEventListener("change", function () { updateEnabled(); requestUpdate(true); });
document.getElementById("shareBtn").addEventListener("click", shareLink);
window.addEventListener("hashchange", applyHash);
applyHash();
document.getElementById("phaseMode").addEventListener("change", function () { requestUpdate(true); });
document.getElementById("showCones").addEventListener("change", function () { requestUpdate(false); });
document.getElementById("logY").addEventListener("change", function () { requestUpdate(false); });
document.getElementById("resetBtn").addEventListener("click", resetControls);
requestUpdate(true);
