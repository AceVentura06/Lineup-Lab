// The usage model's formula: a fitted linear model per position (weights in coefficients.json, fitted by
// scripts/fit.mjs). Plain script so the page can load it with a <script> tag and Node can import it.
// In testing as the hidden source "mod2"; nothing on the page uses it yet.
(function (root) {
  // C: coefficients.json. pos: QB | RB | WR | TE. x: { feature: value } from scripts/usage.mjs.
  // A missing input counts as the training average. Returns projected PPR points in ESPN default scoring.
  function predict(C, pos, x) {
    var m = C && C.positions && C.positions[pos];
    if (!m) return null;
    var y = m.intercept;
    for (var i = 0; i < m.features.length; i++) {
      var v = x[m.features[i]];
      if (v != null && isFinite(v)) y += m.weights[i] * (v - m.means[i]) / m.scales[i];
    }
    return Math.max(0, y);
  }
  var api = { predict: predict };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.UsageModel = api;
})(typeof self !== 'undefined' ? self : globalThis);
