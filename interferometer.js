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
  { table: "specControls",  id: "fwhm",    label: "FWHM",              unit: "nm", min: 0.1,        max: 400,        step: 0.1, value: 100 },
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
    [range, number].forEach(function (el) {
      el.min = p.min; el.max = p.max; el.step = p.step; el.value = p.value;
    });
    range.addEventListener("input", function () {
      number.value = range.value;
      P[p.id] = parseFloat(range.value);
      requestUpdate(true);
    });
    number.addEventListener("input", function () {
      var v = parseFloat(number.value);
      if (isNaN(v)) return;
      range.value = v;       // slider clamps itself; typed value may exceed the slider range
      P[p.id] = v;
      requestUpdate(true);
    });
    var tdRange = document.createElement("td"); tdRange.appendChild(range);
    var tdNumber = document.createElement("td"); tdNumber.appendChild(number);
    var tdUnit = document.createElement("td"); tdUnit.textContent = p.unit;
    tr.appendChild(tdRange); tr.appendChild(tdNumber); tr.appendChild(tdUnit);
    table.appendChild(tr);
    inputs[p.id] = { range: range, number: number };
    P[p.id] = p.value;
  });
}

function resetControls() {
  PARAMS.forEach(function (p) {
    inputs[p.id].range.value = p.value;
    inputs[p.id].number.value = p.value;
    P[p.id] = p.value;
  });
  sel.x = 0; sel.y = 0;
  requestUpdate(true);
}

// ---------------------------------------------------------------------------
// Optics
// ---------------------------------------------------------------------------

// Source spectrum (relative spectral intensity vs wavelength in nm).
// Swap this out to support other spectra later.
function sourceSpectrum(lam) {
  var u = (lam - P.lambdaC) / P.fwhm;
  return Math.exp(-4 * Math.LN2 * u * u);
}

// Wavelength range (nm) outside of which the source is treated as zero.
function sourceRange() {
  return [Math.max(50, P.lambdaC - 2 * P.fwhm), P.lambdaC + 2 * P.fwhm];
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
function spectralWeights() {
  var rng = sourceRange();
  var lo = Math.max(rng[0], 360), hi = Math.min(rng[1], 830);
  var w = { n: 0, s0: 0, ds: 0, r: null, g: null, b: null, R0: 0, G0: 0, B0: 0, norm: 0 };
  if (!(hi > lo)) return w;   // no visible light
  var n = Math.ceil((hi - lo) / Math.min(5, P.fwhm / 8));
  n = Math.max(8, Math.min(160, n));
  var ds = (1 / lo - 1 / hi) / n;
  w.n = n; w.ds = ds; w.s0 = 1 / hi + 0.5 * ds;
  w.r = new Float64Array(n); w.g = new Float64Array(n); w.b = new Float64Array(n);
  for (var j = 0; j < n; j++) {
    var lam = 1 / (w.s0 + j * ds);
    var q = sourceSpectrum(lam) * lam * lam * ds;   // S(lambda) d(lambda)
    var xyz = cieXYZ(lam);
    var rgb = xyzToLinearSRGB(q * xyz[0], q * xyz[1], q * xyz[2]);
    w.r[j] = rgb[0]; w.g[j] = rgb[1]; w.b[j] = rgb[2];
    w.R0 += rgb[0]; w.G0 += rgb[1]; w.B0 += rgb[2];
  }
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
  var w = spectralWeights();
  var out = rgbBuf.img.data;
  var n = w.n, wr = w.r, wg = w.g, wb = w.b;
  var TWO_PI = 2 * Math.PI;
  for (k = 0; k < N * N; k++) {
    var d = opd[k];
    var a0 = TWO_PI * d * w.s0, da = TWO_PI * d * w.ds;
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
    var o = 4 * k;
    out[o]     = toByte(0.5 * (w.R0 + v * r) * w.norm);
    out[o + 1] = toByte(0.5 * (w.G0 + v * gg) * w.norm);
    out[o + 2] = toByte(0.5 * (w.B0 + v * b) * w.norm);
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
  function trace(f, color, dash) {
    var n = 4 * w;
    ctx.beginPath();
    for (var i = 0; i <= n; i++) {
      var lam = lo + (hi - lo) * i / n;
      if (i === 0) ctx.moveTo(X(lam), Y(f(lam))); else ctx.lineTo(X(lam), Y(f(lam)));
    }
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
  trace(sourceSpectrum, "#888", [5, 4]);
  trace(function (lam) {
    return sourceSpectrum(lam) * 0.5 * (1 + Math.cos(2 * Math.PI * d / lam));
  }, "#000", []);
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
document.getElementById("phaseMode").addEventListener("change", function () { requestUpdate(true); });
document.getElementById("showCones").addEventListener("change", function () { requestUpdate(false); });
document.getElementById("logY").addEventListener("change", function () { requestUpdate(false); });
document.getElementById("resetBtn").addEventListener("click", resetControls);
requestUpdate(true);
