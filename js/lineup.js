/* ============================================================================
 * CLUB CHAMPION — Pre-match Lineup Intro
 * Shows both XIs with synchronised line-by-line fade-in.
 * ==========================================================================*/
(function (root) {
  "use strict";

  var ENGINE = root.CC_ENGINE;
  var LINES = ["GK", "DEF", "MID", "FWD"];

  function lastName(n) { var p = (n || "").trim().split(" "); return p[p.length - 1]; }
  function ovr(p) { return ENGINE ? Math.round(ENGINE.overall(p)) : "—"; }
  function byPos(squad) {
    var g = { GK: [], DEF: [], MID: [], FWD: [] };
    squad.forEach(function (p) { g[p.pos].push(p); });
    return g;
  }
  function formationStr(squad) {
    var g = byPos(squad);
    return [g.DEF.length, g.MID.length, g.FWD.length].join("-");
  }

  function buildCard(p, side, colorVar) {
    var card = document.createElement("div");
    card.className = "lu-player lu-hidden lu-pos-" + p.pos;
    card.style.setProperty("--lu-col", colorVar);
    card.innerHTML =
      '<span class="lu-badge pos-' + p.pos + '">' + p.pos + '</span>' +
      '<span class="lu-info">' +
        '<b class="lu-name">' + (p.n || "—") + '</b>' +
        '<small class="lu-sub">' + (p.club || "") + ' · ' + (p.year || "") + '</small>' +
      '</span>' +
      '<span class="lu-ovr">' + ovr(p) + '</span>';
    return card;
  }

  function buildSide(rootEl, squad, color) {
    rootEl.innerHTML = "";
    var grouped = byPos(squad);
    var cardsByLine = {};
    LINES.forEach(function (line) {
      var row = document.createElement("div");
      row.className = "lu-row";
      row.dataset.line = line;
      cardsByLine[line] = [];
      grouped[line].forEach(function (p) {
        var c = buildCard(p, "side", color);
        row.appendChild(c);
        cardsByLine[line].push(c);
      });
      rootEl.appendChild(row);
    });
    return cardsByLine;
  }

  function show(opts) {
    opts = opts || {};
    var squadA = opts.squadA, squadB = opts.squadB;
    if (!squadA || !squadB) { (opts.onWatch || function () {})(); return; }

    var screen = document.getElementById("screen-lineup");
    if (!screen) { (opts.onWatch || function () {})(); return; }

    // Activate screen
    document.querySelectorAll(".screen").forEach(function (s) { s.classList.remove("is-active"); });
    screen.classList.add("is-active");
    document.body.dataset.screen = "lineup";

    // Headings
    document.getElementById("lineup-name-a").textContent = opts.nameA || "Your XI";
    document.getElementById("lineup-name-b").textContent = opts.nameB || "CPU";
    document.getElementById("lineup-form-a").textContent = formationStr(squadA);
    document.getElementById("lineup-form-b").textContent = formationStr(squadB);
    document.getElementById("lineup-name-a").style.color = opts.colorA || "#2ee87f";
    document.getElementById("lineup-name-b").style.color = opts.colorB || "#ff5d73";
    document.getElementById("lineup-stadium").textContent = opts.subtitle || "Starting Lineups";

    // Build cards (hidden)
    var cardsA = buildSide(document.getElementById("lineup-rows-a"), squadA, opts.colorA || "#2ee87f");
    var cardsB = buildSide(document.getElementById("lineup-rows-b"), squadB, opts.colorB || "#ff5d73");

    // Sequential fade-in: GK both teams together, then DEF1 both, then DEF2 both, etc.
    var queue = [];
    LINES.forEach(function (line) {
      var maxN = Math.max(cardsA[line].length, cardsB[line].length);
      for (var i = 0; i < maxN; i++) {
        queue.push({ a: cardsA[line][i] || null, b: cardsB[line][i] || null });
      }
    });

    var stepMs = 380;
    var timers = [];
    var done = false;

    function revealStep(step) {
      if (step.a) step.a.classList.remove("lu-hidden");
      if (step.b) step.b.classList.remove("lu-hidden");
    }
    function revealAll() {
      queue.forEach(revealStep);
      done = true;
    }

    queue.forEach(function (step, i) {
      timers.push(setTimeout(function () {
        if (!done) revealStep(step);
      }, 350 + i * stepMs));
    });
    timers.push(setTimeout(function () { done = true; }, 350 + queue.length * stepMs));

    function clearTimers() { timers.forEach(clearTimeout); timers = []; done = true; }

    // Wire buttons (clone-replace to drop old listeners from prior matches)
    var watchBtn = document.getElementById("btn-lineup-watch");
    var simBtn = document.getElementById("btn-lineup-sim");
    var skipBtn = document.getElementById("btn-lineup-skip");

    function rebind(el, fn) {
      var clone = el.cloneNode(true);
      el.parentNode.replaceChild(clone, el);
      clone.addEventListener("click", fn);
      return clone;
    }

    rebind(watchBtn, function () { clearTimers(); (opts.onWatch || function () {})(); });
    rebind(simBtn, function () { clearTimers(); (opts.onSim || function () {})(); });
    rebind(skipBtn, function () { revealAll(); });
  }

  var API = { show: show };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.CC_LINEUP = API;
})(typeof window !== "undefined" ? window : globalThis);
