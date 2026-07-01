/* ============================================================================
 * CLUB CHAMPION  UI layer (rendering + interaction)
 * ----------------------------------------------------------------------------
 * Flow: Home (select mode) → Setup (formation + pro) → Draft → Team sheet →
 * Match sim → Results. Season is a solo 38-game sim; CPU is a one-off final;
 * UCL Climb & World Cup are knockout runs (keep one squad, win to advance).
 * ==========================================================================*/
(function () {
  "use strict";
  var DATA = window.CC_DATA, ENGINE = window.CC_ENGINE, GAME = window.CC_GAME,
      CPU = window.CC_CPU, MATCHSIM = window.CC_MATCHSIM, NATIONS = window.CC_NATIONS;
  var activeSim = null;

  // -- UI selection state (before a game starts) ----------------------------
  var sel = { mode: "solo", difficulty: "normal", formationId: "balanced", hideRatings: false };
  var proDefault = false;   // account "Pro Mode default" preference (Phase 4)
  var game = null;
  var lastResults = null;

  var $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }
  function showScreen(name) {
    document.querySelectorAll(".screen").forEach(function (s) { s.classList.remove("is-active"); });
    $("screen-" + name).classList.add("is-active");
    document.body.dataset.screen = name;               // lets the nav hide during draft/sim
    if (window.CC_APP && window.CC_APP.onScreen) window.CC_APP.onScreen(name);
    window.scrollTo(0, 0);
  }

  /* ---- labels ------------------------------------------------------------ */
  function tourName(mode) { return mode === "wc" ? "World Cup" : mode === "ucl" ? "UCL Climb" : ""; }
  function nextRoundName(mode, nextIndex) {
    var r = GAME.TOUR_ROUNDS[mode] || []; return r[nextIndex] || "title";
  }
  function recordText(rec) { return rec.W + "-" + rec.L; }

  /* ---- ratings helpers --------------------------------------------------- */
  function ovrOf(pl) { return Math.round(CPU.primaryRating(pl)); }
  function ovrClass(v) { return v >= 86 ? "ovr-hi" : v >= 78 ? "ovr-mid" : "ovr-lo"; }
  function statsFor(pl) {
    var r = pl.r;
    switch (pl.pos) {
      case "GK":  return [["GK", r.gk], ["DEF", r.df], ["PHY", r.ph], ["CRE", r.cr]];
      case "DEF": return [["DEF", r.df], ["PHY", r.ph], ["CRE", r.cr], ["ATT", r.at]];
      case "MID": return [["CRE", r.cr], ["DEF", r.df], ["PHY", r.ph], ["ATT", r.at]];
      default:    return [["ATT", r.at], ["CRE", r.cr], ["PHY", r.ph], ["DEF", r.df]];
    }
  }

  /* ======================================================== HOME ========= */
  function buildFormationCards() {
    var grid = $("formation-grid"); grid.innerHTML = "";
    var dotClass = { GK: "pos-gk", DEF: "pos-def", MID: "pos-mid", FWD: "pos-fwd" };
    ENGINE.FORMATIONS.forEach(function (f) {
      var card = el("button", "formation-card" + (f.id === sel.formationId ? " is-selected" : ""));
      card.dataset.id = f.id;
      var mini = "";
      ["FWD", "MID", "DEF", "GK"].forEach(function (pos) {
        var n = f.slots[pos]; if (!n) return;
        var dots = ""; for (var i = 0; i < n; i++) dots += '<i class="' + dotClass[pos] + '" style="background:var(--' + dotClass[pos] + ')"></i>';
        mini += '<div class="row">' + dots + "</div>";
      });
      card.innerHTML =
        '<div class="formation-num">' + f.name + "</div>" +
        '<div class="formation-tag">' + f.tag + "</div>" +
        '<div class="formation-mini">' + mini + "</div>" +
        '<div class="formation-blurb">' + f.blurb + "</div>";
      card.addEventListener("click", function () {
        sel.formationId = f.id;
        grid.querySelectorAll(".formation-card").forEach(function (c) { c.classList.remove("is-selected"); });
        card.classList.add("is-selected");
      });
      grid.appendChild(card);
    });
  }

  var MODE_SETUP = {
    solo: { t: "Season  chase 38-0", s: "Pick a shape, then draft your XI for a full unbeaten season." },
    cpu:  { t: "Beat the CPU", s: "Pick a shape, then out-draft a rival manager and win the final." },
    ucl:  { t: "UCL Climb", s: "One squad, four knockout rounds. Pick a shape, then draft." },
    wc:   { t: "World Cup  Limited", s: "Draft national legends from World Cups 1990-2026. Group of 32 to the final." },
  };

  function updateKickoffButton() {
    var k = $("btn-kickoff");
    if (sel.mode === "ranked") {
      // Ranked needs an account — app.js decides at click-time whether to open
      // the sign-in modal or start matchmaking; keep the button live either way.
      k.disabled = false; k.classList.remove("is-disabled");
      k.innerHTML = "FIND MATCH <span>→</span>";
    } else {
      k.disabled = false; k.classList.remove("is-disabled");
      k.innerHTML = (sel.mode === "cpu" ? "DRAFT &amp; FACE THE CPU " : "KICK OFF ") + "<span>→</span>";
    }
  }

  function wireHome() {
    $("mode-grid").querySelectorAll(".mode-card").forEach(function (btn) {
      btn.addEventListener("click", function () {
        sel.mode = btn.dataset.mode;
        $("mode-grid").querySelectorAll(".mode-card").forEach(function (b) { b.classList.remove("is-selected"); });
        btn.classList.add("is-selected");
        $("difficulty-row").hidden = sel.mode !== "cpu";
        updateKickoffButton();
      });
    });
    $("difficulty-seg").querySelectorAll("button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        sel.difficulty = btn.dataset.diff;
        $("difficulty-seg").querySelectorAll("button").forEach(function (b) { b.classList.remove("is-selected"); });
        btn.classList.add("is-selected");
      });
    });
    $("btn-kickoff").addEventListener("click", goToSetup);
    $("btn-how").addEventListener("click", function () { $("modal-how").hidden = false; });
    $("btn-how-close").addEventListener("click", function () { $("modal-how").hidden = true; });
    $("modal-how").addEventListener("click", function (e) { if (e.target === $("modal-how")) $("modal-how").hidden = true; });

    // setup screen
    $("pro-toggle").addEventListener("change", function (e) { sel.hideRatings = e.target.checked; });
    $("btn-setup-back").addEventListener("click", function () { showScreen("home"); });
    $("btn-start-draft").addEventListener("click", startGame);

    // draft chrome
    $("btn-quit").addEventListener("click", function () { if (confirm("Quit this draft and return to the menu?")) showScreen("home"); });
    $("btn-skip-year").addEventListener("click", onSkipYear);
    $("btn-skip-club").addEventListener("click", onSkipClub);
  }

  function goToSetup() {
    if (sel.mode === "ranked") {
      if (window.CC_APP && window.CC_APP.onRankedKickoff) window.CC_APP.onRankedKickoff();
      return;
    }
    var info = MODE_SETUP[sel.mode] || MODE_SETUP.solo;
    $("setup-title").textContent = info.t;
    $("setup-sub").textContent = info.s;
    $("btn-start-draft").innerHTML = "START DRAFT <span>→</span>";
    // apply the account's Pro Mode default each time you enter setup
    sel.hideRatings = proDefault;
    var pt = $("pro-toggle"); if (pt) pt.checked = proDefault;
    showScreen("setup");
  }

  /* ======================================================== DRAFT ======== */
  function startGame() {
    game = GAME.create({ mode: sel.mode, difficulty: sel.difficulty, formationId: sel.formationId, hideRatings: sel.hideRatings });
    game.start();
    showScreen("draft");
    setupTourneyBanner();
    renderPitch();
    renderSpin(true);
    updateChrome();
  }

  function setupTourneyBanner() {
    var b = $("tourney-banner");
    if (!game.isTournament) { b.hidden = true; return; }
    b.hidden = false;
    b.innerHTML =
      "<b>" + tourName(game.mode) + "</b>  draft one squad and keep it the whole run. " +
      (game.mode === "wc"
        ? "Players come from World Cup nations, 1990-2026."
        : "Knockout from the Round of 16 to the final.") +
      ' <span class="tb-skips">2× Swap ' + (game.mode === "wc" ? "Nation" : "Club") + " · 2× Swap Year</span>";
  }

  function updateChrome() {
    var pct = Math.round((game.round / game.totalRounds) * 100);
    $("progress-fill").style.width = pct + "%";
    $("progress-text").textContent = "Pick " + Math.min(game.round + 1, game.totalRounds) + " of " + game.totalRounds;
    $("skip-year-count").textContent = game.skips.year;
    $("skip-club-count").textContent = game.skips.club;
    $("btn-skip-year").disabled = game.skips.year <= 0;
    $("btn-skip-club").disabled = game.skips.club <= 0;
    // relabel the skips for World Cup (the "club" axis is the NATION)
    var cm = document.querySelector("#btn-skip-club .skip-main");
    if (cm) cm.innerHTML = game.pool === "nation" ? "🔄 Swap Nation" : "🔄 Swap Club";
    var yh = document.querySelector("#btn-skip-year .skip-hint");
    if (yh) yh.textContent = game.pool === "nation" ? "keeps the nation" : "keeps the club";
  }

  var spinning = false;
  function renderSpin(animate) {
    var spin = game.spin;
    if (!spin) return;
    var reelClub = $("reel-club"), reelYear = $("reel-year"), era = $("slot-era");
    var playersBox = $("players");
    playersBox.innerHTML = "";
    era.innerHTML = "&nbsp;";

    function settle() {
      $("slot").querySelectorAll(".reel").forEach(function (r) { r.classList.remove("is-spinning"); });
      reelClub.textContent = spin.short || spin.club;
      reelYear.textContent = spin.year;
      era.textContent = "“" + spin.label + "”";
      reelClub.style.color = "";
      renderPlayers();
      spinning = false;
    }

    if (animate) {
      spinning = true;
      $("slot").querySelectorAll(".reel").forEach(function (r) { r.classList.add("is-spinning"); });
      var nation = game.pool === "nation" && NATIONS;
      var ticks = 0, iv = setInterval(function () {
        if (nation) {
          reelClub.textContent = NATIONS.COMBOS[Math.floor(Math.random() * NATIONS.COMBOS.length)].short;
          reelYear.textContent = NATIONS.YEARS[Math.floor(Math.random() * NATIONS.YEARS.length)];
        } else {
          reelClub.textContent = DATA.CLUBS[Math.floor(Math.random() * DATA.CLUBS.length)].short;
          reelYear.textContent = 1990 + Math.floor(Math.random() * 37);
        }
        if (++ticks > 12) { clearInterval(iv); settle(); }
      }, 70);
    } else { settle(); }
  }

  function renderPlayers() {
    var box = $("players"); box.innerHTML = "";
    var openSummary = game.openList().reduce(function (m, p) { m[p] = (m[p] || 0) + 1; return m; }, {});
    var sumTxt = Object.keys(openSummary).map(function (p) { return openSummary[p] + " " + p; }).join(" · ");
    $("need-line").innerHTML = "Sign one player &nbsp;<b>·</b>&nbsp; still need: <b>" + sumTxt + "</b>";

    // In Pro Mode, order by POSITION (not OVR) so the ranking can't leak quality.
    var order = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
    var list = game.spin.eligible.slice().sort(sel.hideRatings
      ? function (a, b) { return order[a.pos] - order[b.pos] || a.n.localeCompare(b.n); }
      : function (a, b) { return ovrOf(b) - ovrOf(a); });

    list.forEach(function (pl) {
      var ovr = ovrOf(pl);
      var card = el("button", "pcard" + (sel.hideRatings ? " is-pro" : ""));
      var stats = statsFor(pl).map(function (s) {
        return '<div class="stat"><div class="stat-k">' + s[0] + '</div><div class="stat-bar"><i style="width:' + s[1] + '%"></i></div></div>';
      }).join("");
      card.innerHTML =
        '<div class="pos-badge pos-' + pl.pos + '">' + pl.pos + "</div>" +
        '<div class="pcard-info"><div class="pcard-name">' + esc(pl.n) + "</div>" +
          '<div class="pcard-sub">' + esc(game.spin.club) + " · " + game.spin.year + "</div></div>" +
        '<div class="pcard-ovr ' + ovrClass(ovr) + '">' + ovr + "<small>OVR</small></div>" +
        '<div class="pcard-stats">' + stats + "</div>";
      card.addEventListener("click", function () { if (!spinning) onPick(pl.n); });
      box.appendChild(card);
    });
  }

  function renderPitch() {
    var pitch = $("pitch"); pitch.innerHTML = "";
    var slots = game.formation.slots;
    var filledByPos = { GK: [], DEF: [], MID: [], FWD: [] };
    game.squad.forEach(function (p) { filledByPos[p.pos].push(p); });
    var activePositions = {};
    if (game.spin) game.spin.eligible.forEach(function (p) { activePositions[p.pos] = true; });

    ["GK", "DEF", "MID", "FWD"].forEach(function (pos) {
      var n = slots[pos]; if (!n) return;
      var line = el("div", "pitch-line");
      for (var i = 0; i < n; i++) {
        var p = filledByPos[pos][i];
        var chip = el("div", "slot-chip");
        if (p) {
          chip.classList.add("is-filled");
          chip.style.background = shade(p.color);
          chip.innerHTML = '<div class="chip-pos">' + pos + '</div><div class="chip-name">' + esc(lastName(p.n)) + '</div><div class="chip-sub">' + esc(p.short) + " " + p.year + "</div>";
        } else {
          if (activePositions[pos]) chip.classList.add("is-active");
          chip.innerHTML = '<div class="chip-pos">' + pos + '</div><div class="chip-sub"></div>';
        }
        line.appendChild(chip);
      }
      pitch.appendChild(line);
    });
  }

  function onPick(name) {
    var before = game.squad.length;
    var res = game.pick(name);
    if (!res) return;
    renderPitch();
    var chips = $("pitch").querySelectorAll(".slot-chip.is-filled");
    if (chips[before]) chips[before].classList.add("pop");
    updateChrome();
    if (res.done) { setTimeout(routeAfterDraft, 440); }
    else { renderSpin(true); }
  }

  function onSkipYear() { if (game.skipYear()) { renderSpin(true); renderPitch(); updateChrome(); toast("Re-spun the year"); } }
  function onSkipClub() { if (game.skipClub()) { renderSpin(true); renderPitch(); updateChrome(); toast(game.pool === "nation" ? "New nation rolled" : "New club rolled"); } }

  // After the draft completes, branch by mode.
  function routeAfterDraft() {
    if (game.mode === "solo") return startSoloFlow();
    if (game.mode === "cpu") return startCpuFlow();
    return startTournamentFlow();
  }

  /* ====================================================== TEAM SHEET ===== */
  function ratingChips(R) {
    function cat(k, v) { return '<div class="ts-cat"><span>' + k + '</span><b class="' + ovrClass(v) + '">' + v + "</b></div>"; }
    return '<div class="ts-ovr"><b>' + R.ovr + "</b><small>OVR</small></div>" +
      '<div class="ts-cats">' + cat("ATT", R.att) + cat("DEF", R.def) + cat("GOA", R.gk) + "</div>";
  }
  function teamSheet(side, which) {
    var order = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
    var rows = side.squad.slice().sort(function (a, b) { return order[a.pos] - order[b.pos]; }).map(function (p) {
      var ovr = ovrOf(p);
      return '<div class="ts-row"><div class="ts-pos pos-' + p.pos + '">' + p.pos + "</div>" +
        '<div class="ts-name">' + esc(lastName(p.n)) + "<small>" + esc(p.short || p.club) + " " + p.year + "</small></div>" +
        '<div class="ts-rtg ' + ovrClass(ovr) + '">' + ovr + "</div></div>";
    }).join("");
    return '<div class="card teamsheet ts-' + which + '">' +
      '<div class="ts-head"><div class="ts-name-big">' + esc(side.name) + "</div>" + ratingChips(side.ratings) + "</div>" +
      '<div class="ts-list">' + rows + "</div></div>";
  }

  // cfg: { mode, title, sub, round, roundIndex, totalRounds, record, you, opp,
  //        goLabel, onGo } for solo; or { onWatch, onSim } for a real match.
  function showLineup(cfg) {
    var wrap = $("lineup-wrap");
    var head = '<div class="lineup-head">' +
      (cfg.round ? '<div class="lineup-round">' + tourName(cfg.mode) + " · " + esc(cfg.round) +
        ' <span>' + (cfg.roundIndex + 1) + "/" + cfg.totalRounds + "</span></div>" : "") +
      "<h2>" + esc(cfg.title) + "</h2>" +
      "<p>" + esc(cfg.sub || "") + "</p>" +
      (cfg.record ? '<div class="lineup-rec">Record so far &nbsp;<b>' + recordText(cfg.record) + "</b></div>" : "") +
      "</div>";
    var sheets = cfg.opp
      ? '<div class="lineup-sheets">' + teamSheet(cfg.you, "you") + '<div class="lineup-vs">VS</div>' + teamSheet(cfg.opp, "opp") + "</div>"
      : '<div class="lineup-sheets solo">' + teamSheet(cfg.you, "you") + "</div>";
    var actions = cfg.onWatch
      ? '<div class="lineup-actions">' +
          '<button class="btn btn--ghost flex1" id="lineup-sim">⚡ Sim result</button>' +
          '<button class="btn btn--kickoff flex1" id="lineup-watch">👀 Watch match <span>→</span></button>' +
        "</div>"
      : '<button class="btn btn--kickoff" id="lineup-go">' + (cfg.goLabel || "KICK OFF") + ' <span>→</span></button>';
    wrap.innerHTML = head + sheets + actions +
      '<button class="link-btn" id="lineup-quit">Quit to menu</button>';
    showScreen("lineup");
    if (cfg.onWatch) {
      $("lineup-watch").onclick = function () { cfg.onWatch(); };
      $("lineup-sim").onclick = function () { cfg.onSim(); };
    } else {
      $("lineup-go").onclick = function () { cfg.onGo(); };
    }
    $("lineup-quit").onclick = function () { if (confirm("Quit and return to the menu?")) showScreen("home"); };
  }

  /* ======================================================= MATCH SIM ===== */
  function runSim(cfg) {
    showScreen("sim");
    $("sim-head").textContent = cfg.head;
    var canvas = $("sim-canvas");
    if (activeSim) { activeSim.destroy(); activeSim = null; }
    activeSim = MATCHSIM.create(canvas, {
      squadA: cfg.squadA, squadB: cfg.squadB, result: cfg.result,
      teamAName: "Your XI", teamBName: cfg.nameB || "CPU",
      colorA: "#2ee87f", colorB: "#ff5d73", seed: cfg.seed || 1,
      onDone: function (out) { activeSim = null; cfg.onDone(out); },
    });
    $("btn-skip-sim").onclick = function () { if (activeSim) activeSim.skip(); };
    activeSim.start();
  }

  // Skip the animation: generate the same seeded timeline and jump to results
  // with full per-player stats (so "Sim result" matches a watched game exactly).
  function simInstant(cfg) {
    var tl = MATCHSIM.generate(cfg.squadA, cfg.squadB, cfg.result, cfg.seed || 1);
    cfg.onDone({ stats: tl.stats, scorers: tl.scorers });
  }

  /* ========================================================= SOLO ======== */
  function startSoloFlow() {
    lastResults = game.results();
    showLineup({
      mode: "solo",
      title: "Your XI is set",
      sub: "Ratings revealed  here's how your draft stacks up. Simulate a full 38-game season.",
      you: { squad: game.squad, ratings: game.yourRatings(), name: "Your XI" },
      goLabel: "SIMULATE SEASON",
      onGo: function () { renderSoloResults(lastResults); },
    });
  }

  /* ========================================================== CPU ======== */
  function startCpuFlow() {
    lastResults = game.results();
    var cpuSeed = (game.seed * 2654435761) >>> 0 || 1;
    var done = function (out) { lastResults.matchStats = out.stats; lastResults.scorers = out.scorers; showCpuResults($("results-wrap"), lastResults); };
    var simCfg = { squadA: game.squad, squadB: lastResults.cpuSquad, result: lastResults.match, seed: cpuSeed, onDone: done };
    showLineup({
      mode: "cpu",
      title: "Champions Cup Final",
      sub: "Team sheets  your XI vs the CPU. Ratings revealed before kickoff.",
      you: { squad: game.squad, ratings: game.yourRatings(), name: "Your XI" },
      opp: { squad: lastResults.cpuSquad, ratings: ENGINE.teamRatings(lastResults.cpuSquad), name: "CPU · " + cap(game.difficulty) },
      onWatch: function () { runSim(Object.assign({ head: "Champions Cup Final · " + game.formation.name + " " + game.formation.tag, nameB: "CPU" }, simCfg)); },
      onSim: function () { simInstant(simCfg); },
    });
  }

  /* ===================================================== TOURNAMENT ====== */
  function startTournamentFlow() { game.initTournament(); startRound(); }

  function startRound() {
    var opp = game.makeOpponent();
    var t = game.tour;
    var seed = (game.seed * 2654435761 + (t.index + 1) * 40503) >>> 0 || 1;
    var finish = function (out) { var r = game.applyRound(out); showRoundResult(r, out); };
    var simCfg = { squadA: game.squad, squadB: t.opponent, result: null, seed: seed, onDone: finish };
    showLineup({
      mode: game.mode,
      round: opp.roundLabel, roundIndex: opp.roundIndex, totalRounds: opp.totalRounds,
      record: t.record,
      title: tourName(game.mode) + " · " + opp.roundLabel,
      sub: "Win to reach the " + nextRoundName(game.mode, opp.roundIndex + 1) + ". One leg  no replays.",
      you: { squad: game.squad, ratings: game.yourRatings(), name: "Your XI" },
      opp: { squad: opp.squad, ratings: opp.ratings, name: opp.name + " · " + cap(opp.difficulty) },
      onWatch: function () { simCfg.result = game.playRound(); runSim(Object.assign({ head: tourName(game.mode) + " · " + t.rounds[t.index], nameB: t.opponentName }, simCfg)); },
      onSim: function () { simCfg.result = game.playRound(); simInstant(simCfg); },
    });
  }

  function showRoundResult(r, simOut) {
    var t = game.tour, m = r.summary, youWin = m.win;
    var after = { W: t.record.W, L: t.record.L };
    var before = { W: after.W - (youWin ? 1 : 0), L: after.L - (youWin ? 0 : 1) };
    var pens = m.pens ? " (pens " + m.pens.a + "-" + m.pens.b + ")" : "";
    var btn;
    if (r.champion) btn = '<button class="btn btn--kickoff" id="rr-next">🏆 You won the ' + tourName(game.mode) + "! See your run <span>→</span></button>";
    else if (r.eliminated) btn = '<button class="btn btn--kickoff" id="rr-next">See your run <span>→</span></button>';
    else btn = '<button class="btn btn--kickoff" id="rr-next">Advance to the ' + esc(t.rounds[t.index]) + " <span>→</span></button>";

    $("results-wrap").innerHTML =
      '<div class="verdict ' + (youWin ? "verdict--win" : "") + '">' +
        '<div class="verdict-kicker">' + tourName(game.mode) + " · " + esc(m.round) + "</div>" +
        '<div class="verdict-title">' + (youWin ? "THROUGH!" : "KNOCKED OUT") + "</div>" +
        '<div class="verdict-record">' + m.goalsA + " - " + m.goalsB + "</div>" +
        '<div class="verdict-sub">vs ' + esc(m.opponent) + pens + " &nbsp;·&nbsp; record " +
          recordText(before) + " → <b>" + recordText(after) + "</b></div>" +
      "</div>" +
      '<div class="scorers"><div class="scorers-col">' + scorerLines(m.scorers.A) + "</div>" +
        '<div class="scorers-ball">⚽</div>' +
        '<div class="scorers-col right">' + scorerLines(m.scorers.B) + "</div></div>" +
      (simOut ? '<div class="res-grid">' + matchStatsCard(simOut.stats.A, "Your XI", simOut.scorers.A) +
                  matchStatsCard(simOut.stats.B, esc(m.opponent), simOut.scorers.B) + "</div>" : "") +
      '<div class="res-actions">' + btn + "</div>";
    showScreen("results");
    if (youWin) party();
    $("rr-next").onclick = function () {
      if (r.champion || r.eliminated) showTournamentSummary();
      else startRound();
    };
  }

  function runStatsCard(s) {
    var order = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
    var rows = s.players.slice().sort(function (a, b) {
      return (b.goals + b.assists) - (a.goals + a.assists) || order[a.pos] - order[b.pos];
    }).map(function (p) {
      var line = (p.goals ? p.goals + "G " : "") + (p.assists ? p.assists + "A " : "") + (p.saves ? p.saves + "sv " : "");
      return '<div class="st-row"><div class="st-pos pos-' + p.pos + '">' + p.pos + "</div>" +
        '<div class="st-name">' + esc(lastName(p.n)) + "<small>" + (line || "&nbsp;") + "</small></div>" +
        '<div class="st-rtg ' + rtgClass(p.rating) + '">' + (p.rating ? p.rating.toFixed(1) : "") + "</div></div>";
    }).join("");
    return '<div class="card"><h3>Run stats · ' + s.goalsFor + " scored, " + s.goalsAgainst + " conceded</h3>" +
      '<div class="stat-list">' + rows + "</div></div>";
  }

  function showTournamentSummary() {
    var s = game.runSummary(), champ = s.champion;
    var v = champ
      ? { title: "CHAMPIONS! 🏆", cls: "verdict--unbeaten", sub: "You won the " + tourName(game.mode) + "  one squad, the whole way." }
      : { title: s.roundLabel, cls: "", sub: "Your " + tourName(game.mode) + " run ends here  " + s.roundsWon + " round" + (s.roundsWon === 1 ? "" : "s") + " won." };
    $("results-wrap").innerHTML =
      '<div class="verdict ' + v.cls + '">' +
        '<div class="verdict-kicker">' + tourName(game.mode) + " · " + game.formation.name + " " + game.formation.tag + "</div>" +
        '<div class="verdict-title">' + v.title + "</div>" +
        '<div class="verdict-sub">' + v.sub + "</div>" +
        '<div class="verdict-pills"><span class="pill"><b>' + s.roundsWon + "</b> wins</span>" +
          '<span class="pill"><b>' + s.goalsFor + "</b> scored</span>" +
          '<span class="pill"><b>' + s.goalsAgainst + "</b> conceded</span></div>" +
      "</div>" +
      '<div class="res-grid">' + runStatsCard(s) + squadCard(s.squad, "Your tournament squad") + "</div>" +
      '<div class="res-actions">' +
        '<button class="btn btn--ghost btn--sm flex1" id="btn-share">⤴ Share run</button>' +
        '<button class="btn btn--kickoff btn--sm flex1" id="btn-again">Play again</button></div>';
    showScreen("results");
    $("btn-again").onclick = function () { showScreen("home"); };
    $("btn-share").onclick = function () { shareRun(s); };
    if (champ) party();
    if (window.CC_APP && window.CC_APP.recordRun) window.CC_APP.recordRun(s);
  }

  /* ======================================================= RESULTS ======= */
  function verdictFor(season) {
    var L = season.record.L;
    if (season.perfect) return { kicker: "Immortality", title: "PERFECT SEASON", cls: "verdict--unbeaten", sub: "38 wins from 38. Nobody has ever done this.", party: true };
    if (season.unbeaten) return { kicker: "The Invincibles", title: "UNBEATEN!", cls: "verdict--unbeaten", sub: "A whole season without defeat. Legendary.", party: true };
    if (L <= 3) return { kicker: "Champions", title: "TITLE WINNERS", cls: "verdict--win", sub: "So close to immortality  one weak link cost you.", party: true };
    if (L <= 8) return { kicker: "Top of the table", title: "TITLE CHALLENGERS", cls: "", sub: "A serious side, but the unbeaten dream slipped away." };
    if (L <= 14) return { kicker: "European nights", title: "EUROPE-BOUND", cls: "", sub: "A solid squad  patch the holes and you're a contender." };
    if (L <= 20) return { kicker: "Mid-table", title: "STEADY AS SHE GOES", cls: "", sub: "Comfortable, but some real weak links to fix." };
    return { kicker: "The drop zone", title: "RELEGATION BATTLE", cls: "", sub: "Too many gaps in this squad. Back to the drawing board." };
  }

  function recordHTML(rec) {
    return '<span class="rw">' + rec.W + "</span>-<span class=\"rd\">" + rec.D + "</span>-<span class=\"rl\">" + rec.L + "</span>";
  }

  function categoryCard(season) {
    var rows = season.flags.map(function (f) {
      var pct = Math.min(100, Math.round(f.ratio / 1.35 * 100));
      return '<div class="cat"><div class="cat-head"><span>' + f.label +
        '</span><span class="cat-grade ' + f.tone + '">' + f.grade + "</span></div>" +
        '<div class="cat-bar"><i class="' + f.tone + '" style="width:' + pct + '%"></i></div></div>';
    }).join("");
    var weak = season.flags.filter(function (f) { return f.tone === "bad" || f.tone === "warn"; });
    var note = weak.length
      ? '<div class="gate-note">⚠ <b>' + weak.map(function (f) { return f.label; }).join(" & ") +
        '</b> ' + (weak.length > 1 ? "are" : "is") + " holding you back  every category is gated, so one weak link caps the whole season.</div>"
      : '<div class="gate-note ok">✓ No weak links. This squad is balanced enough to chase an unbeaten run.</div>';
    return '<div class="card"><h3>Squad Report</h3>' + rows + note + "</div>";
  }

  function squadCard(squad, title) {
    var posColor = { GK: "var(--pos-gk)", DEF: "var(--pos-def)", MID: "var(--pos-mid)", FWD: "var(--pos-fwd)" };
    var order = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
    var rows = squad.slice().sort(function (a, b) { return order[a.pos] - order[b.pos]; }).map(function (p) {
      var ovr = ovrOf(p);
      return '<div class="sq-row"><div class="sq-pos" style="background:' + posColor[p.pos] + '">' + p.pos + "</div>" +
        '<div class="sq-name"><b>' + esc(p.n) + "</b><small>" + esc(p.club) + " · " + p.year + "</small></div>" +
        '<div class="sq-ovr ' + ovrClass(ovr) + '">' + ovr + "</div></div>";
    }).join("");
    return '<div class="card"><h3>' + title + "</h3><div class=\"squad-list\">" + rows + "</div></div>";
  }

  function renderSoloResults(R) {
    var wrap = $("results-wrap"), you = R.you;
    R.seasonStats = ENGINE.seasonStats(R.squad, you, game.seed);
    var v = verdictFor(you);
    wrap.innerHTML =
      '<div class="verdict ' + v.cls + '">' +
        '<div class="verdict-kicker">' + v.kicker + " · " + game.formation.name + " " + game.formation.tag + "</div>" +
        '<div class="verdict-title">' + v.title + "</div>" +
        '<div class="verdict-record">' + recordHTML(you.record) + "</div>" +
        '<div class="verdict-sub">' + v.sub + "</div>" +
        '<div class="verdict-pills"><span class="pill"><b>' + you.points + '</b> pts</span>' +
          '<span class="pill"><b>' + R.seasonStats.goalsFor + '</b> scored</span>' +
          '<span class="pill"><b>' + R.seasonStats.goalsAgainst + '</b> conceded</span>' +
          '<span class="pill">' + you.record.L + ' losses</span></div>' +
      "</div>" +
      '<div class="res-grid">' + categoryCard(you) + seasonStatsCard(R.seasonStats) + "</div>" +
      actionsHTML(false);
    showScreen("results");
    wireActions();
    if (v.party) party();
    if (window.CC_APP) window.CC_APP.recordSeason(R);
  }

  function showCpuResults(wrap, R) {
    var youWin = R.youWin;
    wrap.innerHTML =
      '<div class="verdict ' + (youWin ? "verdict--win" : "") + '">' +
        '<div class="verdict-kicker">Champions Cup Final</div>' +
        '<div class="verdict-title">' + (youWin ? "YOU WIN! 🏆" : "CPU WINS") + "</div>" +
        '<div class="verdict-sub">' + (youWin
          ? "You out-managed the CPU when it mattered most."
          : "The CPU edged the final  out-draft them next time.") + "</div></div>" +
      scoreboardHTML(R) +
      '<div class="res-grid">' + matchStatsCard(R.matchStats.A, "Your XI", R.scorers.A)
                               + matchStatsCard(R.matchStats.B, "CPU XI", R.scorers.B) + "</div>" +
      '<div style="margin-top:16px">' + categoryCard(R.you) + "</div>" +
      actionsHTML(true);
    showScreen("results");
    wireActions();
    if (youWin) party();
    if (window.CC_APP) { R.seasonStats = ENGINE.seasonStats(R.squad, R.you, game.seed); window.CC_APP.recordSeason(R); }
  }

  function scoreboardHTML(R) {
    var m = R.match, youWin = R.youWin;
    var pens = m.pens ? '<div class="sb-pens">pens ' + m.pens.a + "-" + m.pens.b + "</div>" : "";
    return '<div class="scorebar">' +
      '<div class="sb-team"><div class="sb-tname ' + (youWin ? "win" : "") + '">Your XI</div>' +
        '<div class="sb-trec">' + R.you.record.W + "-" + R.you.record.D + "-" + R.you.record.L + " · " + R.you.points + "pts</div></div>" +
      '<div class="sb-num ' + (youWin ? "win" : "") + '">' + m.goalsA + "</div>" +
      '<div class="sb-mid"><div class="sb-ball">⚽</div><div class="sb-ft">FT</div>' + pens + "</div>" +
      '<div class="sb-num ' + (!youWin ? "win" : "") + '">' + m.goalsB + "</div>" +
      '<div class="sb-team"><div class="sb-tname ' + (!youWin ? "win" : "") + '">CPU · ' + cap(game.difficulty) + "</div>" +
        '<div class="sb-trec">' + R.cpu.record.W + "-" + R.cpu.record.D + "-" + R.cpu.record.L + " · " + R.cpu.points + "pts</div></div>" +
      "</div>" +
      '<div class="scorers"><div class="scorers-col">' + scorerLines(R.scorers.A) + "</div>" +
        '<div class="scorers-ball">⚽</div>' +
        '<div class="scorers-col right">' + scorerLines(R.scorers.B) + "</div></div>";
  }

  function scorerLines(list) {
    if (!list || !list.length) return '<span class="scorer-none"></span>';
    var byName = {};
    list.forEach(function (s) { (byName[s.name] = byName[s.name] || []).push(s.minute); });
    return Object.keys(byName).map(function (name) {
      return '<div class="scorer">⚽ <b>' + esc(lastName(name)) + "</b> <span>" +
        byName[name].sort(function (a, b) { return a - b; }).map(function (m) { return m + "'"; }).join(", ") + "</span></div>";
    }).join("");
  }

  function matchStatsCard(stats, title, scorers) {
    var rows = stats.slice().sort(function (a, b) { return b.rating - a.rating; }).map(function (s) {
      var line = (s.goals ? s.goals + "G " : "") + (s.assists ? s.assists + "A " : "") + (s.saves ? s.saves + "sv " : "");
      return '<div class="st-row"><div class="st-pos pos-' + s.pos + '">' + s.pos + "</div>" +
        '<div class="st-name">' + esc(lastName(s.n)) + "<small>" + (line || "&nbsp;") + "</small></div>" +
        '<div class="st-rtg ' + rtgClass(s.rating) + '">' + s.rating.toFixed(1) + "</div></div>";
    }).join("");
    return '<div class="card"><h3>' + title + " · player ratings</h3><div class=\"stat-list\">" + rows + "</div></div>";
  }
  function rtgClass(r) { return r >= 7.5 ? "ovr-hi" : r >= 6.8 ? "ovr-mid" : "ovr-lo"; }

  function seasonStatsCard(st) {
    var order = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
    var rows = st.players.slice().sort(function (a, b) {
      return (b.goals + b.assists) - (a.goals + a.assists) || order[a.pos] - order[b.pos];
    }).map(function (s) {
      var line = (s.goals ? s.goals + "G " : "") + (s.assists ? s.assists + "A " : "") +
        (s.saves ? s.saves + "sv " : "") + (s.cleanSheets && s.pos !== "FWD" && s.pos !== "MID" ? s.cleanSheets + "cs" : "");
      return '<div class="st-row"><div class="st-pos pos-' + s.pos + '">' + s.pos + "</div>" +
        '<div class="st-name">' + esc(s.n) + "<small>" + (line || "&nbsp;") + "</small></div>" +
        '<div class="st-rtg ' + rtgClass(s.rating) + '">' + s.rating.toFixed(1) + "</div></div>";
    }).join("");
    return '<div class="card"><h3>Season stats · ' + st.goalsFor + " scored, " + st.goalsAgainst + " conceded, " + st.cleanSheets + " clean sheets</h3>" +
      '<div class="stat-list">' + rows + "</div></div>";
  }

  function actionsHTML(isCpu) {
    return '<div class="res-actions">' +
      (isCpu ? '<button class="btn btn--ghost btn--sm flex1" id="btn-rematch">↻ Rematch</button>' : "") +
      '<button class="btn btn--ghost btn--sm flex1" id="btn-share">⤴ Share result</button>' +
      '<button class="btn btn--kickoff btn--sm flex1" id="btn-again">Play again</button></div>';
  }

  function wireActions() {
    $("btn-again").addEventListener("click", function () { showScreen("home"); });
    $("btn-share").addEventListener("click", shareResult);
    var rm = $("btn-rematch");
    if (rm) rm.addEventListener("click", function () {
      game.seed = (Math.random() * 2147483647) | 0;
      startCpuFlow();
    });
  }

  function shareResult() {
    var R = lastResults, you = R.you, lines;
    if (R.mode === "cpu") {
      lines = "⚽ CLUB CHAMPION  vs CPU (" + cap(game.difficulty) + ")\n" +
        "Final: Me " + R.match.goalsA + "-" + R.match.goalsB + " CPU" + (R.match.pens ? " (pens " + R.match.pens.a + "-" + R.match.pens.b + ")" : "") +
        " → " + (R.youWin ? "WIN 🏆" : "loss") + "\n" +
        "My season: " + you.record.W + "-" + you.record.D + "-" + you.record.L + " (" + you.points + "pts)";
    } else {
      var v = verdictFor(you);
      lines = "⚽ CLUB CHAMPION  " + game.formation.name + "\n" +
        you.record.W + "-" + you.record.D + "-" + you.record.L + " · " + you.points + "pts · " + v.title +
        (you.unbeaten ? " 🏆" : "");
    }
    lines += "\nCan your squad go unbeaten? " + location.href;
    copy(lines);
  }
  function shareRun(s) {
    var lines = "⚽ CLUB CHAMPION  " + tourName(game.mode) + "\n" +
      (s.champion ? "🏆 CHAMPIONS! " : s.roundLabel + " · ") + s.roundsWon + " wins · " +
      s.goalsFor + " scored, " + s.goalsAgainst + " conceded\n" +
      "Can you go all the way? " + location.href;
    copy(lines);
  }
  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast("Copied to clipboard"); }, function () { toast("Couldn't copy"); });
    } else { toast("Clipboard unavailable"); }
  }

  /* --------------------------------------------------------- helpers ----- */
  function lastName(n) { var parts = String(n).replace(/\(alt\)/, "").trim().split(" "); return parts[parts.length - 1]; }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function shade(hex) {
    try {
      var c = hex.replace("#", ""); var r = parseInt(c.substr(0, 2), 16), g = parseInt(c.substr(2, 2), 16), b = parseInt(c.substr(4, 2), 16);
      r = Math.round(r * 0.42); g = Math.round(g * 0.42); b = Math.round(b * 0.42);
      return "rgb(" + r + "," + g + "," + b + ")";
    } catch (e) { return "var(--panel)"; }
  }
  var toastTimer;
  function toast(msg) {
    var t = document.querySelector(".toast");
    if (!t) { t = el("div", "toast"); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove("show"); }, 1800);
  }
  function party() {
    var colors = ["#2ee87f", "#ffd24a", "#4aa8ff", "#ff5d73", "#ffffff"];
    for (var i = 0; i < 80; i++) {
      (function (i) {
        var c = el("div", "confetti");
        c.style.left = Math.random() * 100 + "vw";
        c.style.background = colors[i % colors.length];
        c.style.transform = "rotate(" + Math.random() * 360 + "deg)";
        document.body.appendChild(c);
        var dur = 2200 + Math.random() * 1800, delay = Math.random() * 400;
        c.animate([{ transform: "translateY(-20px) rotate(0)", opacity: 1 },
                   { transform: "translateY(105vh) rotate(720deg)", opacity: .9 }],
                  { duration: dur, delay: delay, easing: "cubic-bezier(.3,.6,.5,1)" })
          .onfinish = function () { c.remove(); };
      })(i);
    }
  }

  /* --------------------------------------------------------- bootstrap --- */
  function init() {
    buildFormationCards();
    wireHome();
    updateKickoffButton();
    if (DATA.validateCoverage) {
      var probs = DATA.validateCoverage();
      if (probs.length) console.warn("Data coverage issues:", probs);
    }
    if (window.CC_APP && window.CC_APP.init) window.CC_APP.init();
  }

  window.CC_UI = {
    showScreen: showScreen,
    getGame: function () { return game; },
    getResults: function () { return lastResults; },
    seasonStatsFor: function (squad, season, seed) { return ENGINE.seasonStats(squad, season, seed); },
    setProDefault: function (on) { proDefault = !!on; },
  };
  window.CC_TOAST = toast;

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
