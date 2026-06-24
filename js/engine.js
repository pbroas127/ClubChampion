/* ============================================================================
 * CLUB CHAMPION — Simulation Engine
 * ----------------------------------------------------------------------------
 * Turns a 7-player squad into a projected 38-game season (the football answer
 * to "82-0"). Mirrors the original's philosophy:
 *
 *   1. Sum five attribute categories across the whole squad.
 *   2. Compare each total to a "par" → a ratio.
 *   3. Combine the ratios with a WEIGHTED GEOMETRIC MEAN, so one weak
 *      category drags the whole squad down (gating).
 *   4. Run the resulting strength through a NON-LINEAR win curve where the
 *      final, unbeaten wins are brutally expensive.
 *
 * A perfect "38-0-0" unbeaten Invincible season is possible but legendary,
 * and is *only* awarded when the squad has no weak link.
 * ==========================================================================*/

(function (root) {
  "use strict";

  /* ----------------------------------------------------------- Formations */
  // Every formation fields exactly 7 players (1 GK + 6 outfield) so each game
  // is the same length regardless of shape. Names nod to football archetypes.
  var FORMATIONS = [
    { id: "balanced",  name: "2-2-2",  tag: "Balanced",
      blurb: "Two at the back, two in the engine room, two up top. No weaknesses to exploit.",
      slots: { GK: 1, DEF: 2, MID: 2, FWD: 2 } },
    { id: "catenaccio", name: "3-2-1", tag: "Catenaccio",
      blurb: "A back three and a lone striker. Concede nothing, nick it late.",
      slots: { GK: 1, DEF: 3, MID: 2, FWD: 1 } },
    { id: "tiki",       name: "2-3-1", tag: "Tiki-Taka",
      blurb: "Dominate the middle. Three creators starve the opposition of the ball.",
      slots: { GK: 1, DEF: 2, MID: 3, FWD: 1 } },
    { id: "allout",     name: "1-2-3", tag: "All-Out Attack",
      blurb: "Three forwards, one centre-back, and a prayer. Outscore everyone.",
      slots: { GK: 1, DEF: 1, MID: 2, FWD: 3 } },
  ];

  /* ------------------------------------------------------- Tuning constants */
  // "Par" = the category total a genuinely excellent squad produces. Tuned in
  // the Node test harness so an elite, balanced draft flirts with perfection
  // while lopsided squads get gated. (See scripts/test-engine.js.)
  var PAR = { at: 330, cr: 400, df: 370, ph: 480, gk: 84 };
  var WEIGHT = { at: 1.10, cr: 1.00, df: 1.10, ph: 0.80, gk: 1.00 };
  var Q_FLOOR = 0.15;   // a totally absent category still can't divide by zero
  var Q_CEIL = 1.35;    // diminishing returns: stacking one category is capped

  // Win-curve constants (per-match logistic vs a tiered league of opponents).
  var SEASON_GAMES = 38;
  // Every squad in the game is built from iconic, elite sides, so the league
  // it competes in is correspondingly strong. The skill is being the best of
  // the best and avoiding a gated weakness — the title race is decided against
  // the contender tier, where points actually get dropped.
  var LEAGUE = [        // the opponents you face across a season
    { q: 0.95, games: 10 },   // strong, beatable sides
    { q: 1.08, games: 18 },   // fellow heavyweights
    { q: 1.18, games: 10 },   // title rivals (where unbeaten runs die)
  ];
  var CURVE = { a: 14.0, bWin: 0.5, bLoss: -2.8 };
  // Invincible gate: you cannot finish unbeaten with a weak link in the side.
  var UNBEATEN_MIN_RATIO = 0.86;

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }

  /* ------------------------------------------------- Category aggregation */
  // Sum each attribute across the squad. Goalkeeping uses the best keeper in
  // the side (outfielders contribute ~nothing), which is what makes fielding a
  // real GK matter — exactly the "you need rim protection" gate from 82-0.
  function categoryTotals(squad) {
    var t = { at: 0, cr: 0, df: 0, ph: 0, gk: 0 };
    var bestGk = 0;
    squad.forEach(function (pl) {
      if (!pl) return;
      var r = pl.r;
      t.at += r.at; t.cr += r.cr; t.df += r.df; t.ph += r.ph;
      if (r.gk > bestGk) bestGk = r.gk;
    });
    t.gk = bestGk;
    return t;
  }

  function ratios(totals) {
    return {
      at: clamp(totals.at / PAR.at, 0, Q_CEIL),
      cr: clamp(totals.cr / PAR.cr, 0, Q_CEIL),
      df: clamp(totals.df / PAR.df, 0, Q_CEIL),
      ph: clamp(totals.ph / PAR.ph, 0, Q_CEIL),
      gk: clamp(totals.gk / PAR.gk, 0, Q_CEIL),
    };
  }

  // Weighted geometric mean of the (floored) ratios → overall squad strength.
  function strength(rat) {
    var keys = ["at", "cr", "df", "ph", "gk"];
    var sumW = 0, acc = 0;
    keys.forEach(function (k) {
      var q = clamp(rat[k], Q_FLOOR, Q_CEIL);
      acc += WEIGHT[k] * Math.log(q);
      sumW += WEIGHT[k];
    });
    return Math.exp(acc / sumW);
  }

  /* --------------------------------------------------- Per-match outcome */
  // Probabilities for one match given our strength Q vs an opponent strength o.
  function matchProbs(Q, o) {
    var diff = Q - o;
    var pWin = sigmoid(CURVE.a * diff + CURVE.bWin);
    var pLoss = sigmoid(CURVE.a * (-diff) + CURVE.bLoss);
    // Keep them sane and let draws absorb the remainder.
    if (pWin + pLoss > 0.985) {
      var s = 0.985 / (pWin + pLoss);
      pWin *= s; pLoss *= s;
    }
    var pDraw = clamp(1 - pWin - pLoss, 0.01, 1);
    return { w: pWin, d: pDraw, l: pLoss };
  }

  /* ------------------------------------------------------- Season record */
  // Project a full 38-game season as expected W-D-L (deterministic, so squad
  // quality — not luck — decides the table).
  function simulateSeason(squad) {
    var totals = categoryTotals(squad);
    var rat = ratios(totals);
    var Q = strength(rat);

    var W = 0, D = 0, L = 0;
    LEAGUE.forEach(function (tier) {
      var p = matchProbs(Q, tier.q);
      W += p.w * tier.games;
      D += p.d * tier.games;
      L += p.l * tier.games;
    });

    // Round to whole games that still sum to 38.
    var rec = roundRecord(W, D, L, SEASON_GAMES);

    // Gating: identify the weakest links and enforce the Invincible gate.
    var minRatio = Math.min(rat.at, rat.cr, rat.df, rat.ph, rat.gk);
    if (minRatio < UNBEATEN_MIN_RATIO && rec.L === 0) {
      // A weak link means you cannot go unbeaten — turn a win into a defeat.
      rec.L = 1;
      if (rec.W > 0) rec.W -= 1; else rec.D -= 1;
    }

    var points = rec.W * 3 + rec.D;
    return {
      record: rec,
      points: points,
      strength: Q,
      totals: totals,
      ratios: rat,
      flags: gradeCategories(rat),
      unbeaten: rec.L === 0,
      perfect: rec.W === SEASON_GAMES,
      minRatio: minRatio,
    };
  }

  function roundRecord(W, D, L, total) {
    var rw = Math.round(W), rd = Math.round(D), rl = Math.round(L);
    var drift = total - (rw + rd + rl);
    // Nudge the largest bucket to make the three numbers sum to exactly 38.
    while (drift !== 0) {
      if (drift > 0) {
        if (rw >= rd && rw >= rl) rw++; else if (rd >= rl) rd++; else rl++;
        drift--;
      } else {
        if (rl >= rd && rl >= rw && rl > 0) rl--;
        else if (rd >= rw && rd > 0) rd--;
        else if (rw > 0) rw--;
        else rl--;
        drift++;
      }
    }
    return { W: Math.max(0, rw), D: Math.max(0, rd), L: Math.max(0, rl) };
  }

  // Human-readable grade per category, used to surface "why" in the UI.
  function gradeCategories(rat) {
    var labels = {
      at: "Attack", cr: "Creativity", df: "Defence", ph: "Physicality", gk: "Goalkeeping",
    };
    var out = [];
    Object.keys(labels).forEach(function (k) {
      var q = rat[k], grade, tone;
      if (q >= 1.12) { grade = "World class"; tone = "elite"; }
      else if (q >= 0.98) { grade = "Excellent"; tone = "good"; }
      else if (q >= 0.86) { grade = "Solid"; tone = "ok"; }
      else if (q >= 0.7) { grade = "Shaky"; tone = "warn"; }
      else { grade = "A liability"; tone = "bad"; }
      out.push({ key: k, label: labels[k], ratio: q, grade: grade, tone: tone });
    });
    return out;
  }

  /* ------------------------------------ Head-to-head match (you vs CPU) */
  // Seedable RNG (mulberry32) so a given matchup is reproducible per seed.
  function rng(seed) {
    var s = seed >>> 0;
    return function () {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function poisson(lambda, rand) {
    var L = Math.exp(-lambda), k = 0, p = 1;
    do { k++; p *= rand(); } while (p > L);
    return k - 1;
  }

  // Attacking & defensive sub-scores drive expected goals in a single match.
  function attackPower(totals) {
    return (totals.at / PAR.at) * 0.62 + (totals.cr / PAR.cr) * 0.38;
  }
  function defencePower(totals) {
    return (totals.df / PAR.df) * 0.55 + (totals.gk / PAR.gk) * 0.45;
  }

  function playMatch(squadA, squadB, seed) {
    var ta = categoryTotals(squadA), tb = categoryTotals(squadB);
    var rand = rng(seed || 1);

    // Exponent > 1 amplifies a quality edge so the better side is favoured,
    // while the cap keeps freak scorelines in check (upsets still happen — it
    // is one match, after all).
    var xgA = clamp(1.35 * Math.pow(attackPower(ta) / Math.max(0.45, defencePower(tb)), 1.4), 0.3, 3.2);
    var xgB = clamp(1.35 * Math.pow(attackPower(tb) / Math.max(0.45, defencePower(ta)), 1.4), 0.3, 3.2);

    var ga = Math.min(5, poisson(xgA, rand)), gb = Math.min(5, poisson(xgB, rand));
    var result = { goalsA: ga, goalsB: gb, xgA: xgA, xgB: xgB, pens: null };

    if (ga === gb) {
      // Decide it on penalties for a clean winner in a one-off.
      var pa = 0, pb = 0;
      for (var i = 0; i < 5; i++) { if (rand() < 0.75) pa++; if (rand() < 0.75) pb++; }
      while (pa === pb) { if (rand() < 0.75) pa++; if (rand() < 0.75) pb++; }
      result.pens = { a: pa, b: pb };
      result.winner = pa > pb ? "A" : "B";
    } else {
      result.winner = ga > gb ? "A" : "B";
    }
    return result;
  }

  /* ------------------------------------------- Per-player season stats */
  // A position-weighted overall rating (0-99) for display/weighting.
  function overall(pl) {
    var r = pl.r;
    switch (pl.pos) {
      case "GK": return r.gk;
      case "DEF": return r.df * 0.6 + r.ph * 0.25 + r.cr * 0.15;
      case "MID": return r.cr * 0.5 + r.df * 0.2 + r.ph * 0.15 + r.at * 0.15;
      default:    return r.at * 0.55 + r.cr * 0.25 + r.ph * 0.2;
    }
  }

  function hashSquad(squad) {
    var h = 2166136261 >>> 0;
    squad.forEach(function (p) {
      var s = (p.n || "") + "|" + (p.year || "");
      for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    });
    return h >>> 0;
  }

  // Split `total` across `weights` as whole numbers that sum exactly to total.
  function distribute(total, weights, rand) {
    var sum = weights.reduce(function (a, b) { return a + b; }, 0) || 1;
    var raw = weights.map(function (w) { return total * w / sum; });
    var out = raw.map(function (x) { return Math.floor(x); });
    var used = out.reduce(function (a, b) { return a + b; }, 0);
    var rem = total - used;
    var order = raw.map(function (x, i) { return { i: i, frac: (x - Math.floor(x)) + rand() * 0.01 }; })
      .sort(function (a, b) { return b.frac - a.frac; });
    for (var k = 0; k < rem && order.length; k++) out[order[k % order.length].i]++;
    return out;
  }

  // Realistic per-player numbers for a 38-game season. Driven by the squad's
  // attack/defence strength (so better teammates lift everyone) and the final
  // record (so a title side posts better numbers). Goals/assists reconcile to
  // the team totals exactly.
  function seasonStats(squad, season, seed) {
    var rand = rng(seed != null ? seed : hashSquad(squad));
    var totals = (season && season.totals) ? season.totals : categoryTotals(squad);
    var atk = attackPower(totals), def = defencePower(totals);
    var points = season ? season.points : 60;

    var gpg = clamp(0.9 + (atk - 0.85) * 3.4, 0.7, 2.6);
    var teamGF = Math.round(clamp(gpg * 38, 28, 105));
    var gapg = clamp(1.9 - (def - 0.85) * 2.9, 0.42, 2.1);
    var teamGA = Math.round(clamp(gapg * 38, 16, 86));
    var cleanSheets = Math.round(38 * Math.exp(-gapg));
    var savesSeason = Math.round(38 * clamp(1.8 + (1.2 - def) * 3.8, 1.4, 5));

    var goalPos = { GK: 0.01, DEF: 0.18, MID: 0.55, FWD: 1.0 };
    var astPos = { GK: 0.05, DEF: 0.45, MID: 1.0, FWD: 0.72 };
    var gW = squad.map(function (p) { return Math.pow(p.r.at, 1.8) * goalPos[p.pos]; });
    var aW = squad.map(function (p) { return Math.pow(p.r.cr, 1.5) * astPos[p.pos]; });
    var goals = distribute(teamGF, gW, rand);
    var assists = distribute(Math.round(teamGF * 0.72), aW, rand);

    var players = squad.map(function (p, i) {
      var ovr = Math.round(overall(p));
      var ga = goals[i] + assists[i];
      var isGK = p.pos === "GK";
      var rating = clamp(6.5 + (ovr - 72) * 0.05 + ga * 0.022 + (points - 55) / 250 + (rand() - 0.5) * 0.2, 5.8, 9.6);
      return {
        n: p.n, pos: p.pos, club: p.club, year: p.year, ovr: ovr,
        apps: 38 - Math.floor(rand() * 4),
        goals: goals[i], assists: assists[i],
        cleanSheets: (isGK || p.pos === "DEF") ? cleanSheets : 0,
        saves: isGK ? savesSeason : 0,
        rating: Math.round(rating * 10) / 10,
      };
    });
    return { players: players, goalsFor: teamGF, goalsAgainst: teamGA, cleanSheets: cleanSheets };
  }

  var API = {
    FORMATIONS: FORMATIONS,
    overall: overall,
    seasonStats: seasonStats,
    hashSquad: hashSquad,
    PAR: PAR,
    categoryTotals: categoryTotals,
    ratios: ratios,
    strength: strength,
    simulateSeason: simulateSeason,
    playMatch: playMatch,
    attackPower: attackPower,
    defencePower: defencePower,
    gradeCategories: gradeCategories,
    _internals: { matchProbs: matchProbs, CURVE: CURVE, LEAGUE: LEAGUE },
  };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.CC_ENGINE = API;
})(typeof window !== "undefined" ? window : globalThis);
