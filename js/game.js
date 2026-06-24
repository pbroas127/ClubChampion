/* ============================================================================
 * CLUB CHAMPION — Game Controller
 * ----------------------------------------------------------------------------
 * Pure game logic (no DOM). Owns the slot machine, the draft state machine,
 * the skips, the season/vs-CPU results, AND the knockout tournament engine
 * (UCL Climb + World Cup), where you keep one squad and win rounds to advance.
 *
 * Two draft pools share one slot machine:
 *   • clubs   (Season / CPU / UCL)  — pick a CLUB + an exact YEAR (1990–2026)
 *   • nations (World Cup)           — pick a NATION + a WORLD-CUP YEAR
 * ==========================================================================*/

(function (root) {
  "use strict";

  var DATA = root.CC_DATA, ENGINE = root.CC_ENGINE, CPU = root.CC_CPU, NATIONS = root.CC_NATIONS;

  function mulberry32(seed) {
    var s = seed >>> 0;
    return function () {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function randInt(rand, lo, hi) { return lo + Math.floor(rand() * (hi - lo + 1)); }

  /* ===================================================== CLUB slot machine */
  // Build one playable spin given which slots remain open and who's taken.
  // opts: { clubIndex, year } — pin either axis (or neither). Used so that
  //   "Swap Club" keeps the YEAR fixed and "Swap Year" keeps the CLUB fixed.
  function makeSpin(openSlots, drafted, rand, opts) {
    opts = opts || {};
    var pinClub = (opts.clubIndex != null), pinYear = (opts.year != null);

    function eligibleAt(ci, year) {
      var era = DATA.eraForYear(ci, year);
      var elig = era.players.filter(function (p) { return openSlots[p.pos] > 0 && !drafted[p.n]; });
      return elig.length ? { era: era, elig: elig } : null;
    }
    function spinObj(ci, year, hit) {
      var club = DATA.CLUBS[ci];
      return {
        pool: "club", clubIndex: ci, club: club.club, short: club.short, color: club.color,
        country: club.country, year: year, label: hit.era.label, eligible: hit.elig,
      };
    }

    for (var attempt = 0; attempt < 80; attempt++) {
      var ci = pinClub ? opts.clubIndex : randInt(rand, 0, DATA.CLUBS.length - 1);
      var year = pinYear ? opts.year : randInt(rand, DATA.START_YEAR, DATA.END_YEAR);
      if (opts.avoidClubIndex != null && ci === opts.avoidClubIndex) continue;  // ensure a different club
      var hit = eligibleAt(ci, year);
      if (!hit) continue;
      if (opts.avoidLabel != null && hit.era.label === opts.avoidLabel) continue; // ensure a different squad/era
      return spinObj(ci, year, hit);
    }

    // Deterministic fallback that still respects whichever axis is pinned.
    if (pinYear && !pinClub) {
      for (var c1 = 0; c1 < DATA.CLUBS.length; c1++) {
        var h1 = eligibleAt(c1, opts.year);
        if (h1) return spinObj(c1, opts.year, h1);
      }
    }
    if (pinClub && !pinYear) {
      for (var y = DATA.START_YEAR; y <= DATA.END_YEAR; y++) {
        var h2 = eligibleAt(opts.clubIndex, y);
        if (h2) return spinObj(opts.clubIndex, y, h2);
      }
    }
    for (var k = 0; k < DATA.COMBOS.length; k++) {
      var cb = DATA.COMBOS[k];
      var elig = cb.players.filter(function (p) { return openSlots[p.pos] > 0 && !drafted[p.n]; });
      if (elig.length) {
        return { pool: "club", clubIndex: cb.clubIndex, club: cb.club, short: cb.short, color: cb.color,
          country: cb.country, year: randInt(rand, cb.from, cb.to), label: cb.label, eligible: elig };
      }
    }
    return null;
  }

  /* =================================================== NATION slot machine */
  // World Cup mode: pick a NATION + a WORLD-CUP YEAR.
  // opts: { teamName, year } pin an axis; { avoidTeamName, avoidYear } force change.
  function makeNationSpin(openSlots, drafted, rand, opts) {
    opts = opts || {};
    if (!NATIONS) return null;
    var pinTeam = (opts.teamName != null), pinYear = (opts.year != null);

    function eligIn(team) {
      var e = team.players.filter(function (p) { return openSlots[p.pos] > 0 && !drafted[p.n]; });
      return e.length ? e : null;
    }
    function spinObj(team, year, elig) {
      return {
        pool: "nation", teamName: team.team, club: team.team, short: team.short, color: team.color,
        country: team.team, year: year, label: "World Cup " + year, eligible: elig,
      };
    }
    function teamIn(year, name) {
      var ts = NATIONS.teamsForYear(year);
      for (var i = 0; i < ts.length; i++) if (ts[i].team === name) return ts[i];
      return null;
    }

    for (var attempt = 0; attempt < 140; attempt++) {
      var year = pinYear ? opts.year : NATIONS.YEARS[randInt(rand, 0, NATIONS.YEARS.length - 1)];
      if (opts.avoidYear != null && year === opts.avoidYear) continue;
      var teams = NATIONS.teamsForYear(year);
      if (!teams.length) continue;
      var team = pinTeam ? teamIn(year, opts.teamName) : teams[randInt(rand, 0, teams.length - 1)];
      if (!team) continue;
      if (opts.avoidTeamName != null && team.team === opts.avoidTeamName) continue;
      var elig = eligIn(team);
      if (elig) return spinObj(team, year, elig);
    }

    // Fallbacks honouring the pinned axis where possible.
    if (pinTeam) {                                   // same nation, any allowed year
      for (var yi = 0; yi < NATIONS.YEARS.length; yi++) {
        var yr = NATIONS.YEARS[yi];
        if (opts.avoidYear != null && yr === opts.avoidYear) continue;
        var tm = teamIn(yr, opts.teamName); if (!tm) continue;
        var e1 = eligIn(tm); if (e1) return spinObj(tm, yr, e1);
      }
    }
    if (pinYear) {                                   // same year, any allowed nation
      var ts2 = NATIONS.teamsForYear(opts.year);
      for (var ti = 0; ti < ts2.length; ti++) {
        if (opts.avoidTeamName != null && ts2[ti].team === opts.avoidTeamName) continue;
        var e2 = eligIn(ts2[ti]); if (e2) return spinObj(ts2[ti], opts.year, e2);
      }
    }
    for (var c = 0; c < NATIONS.COMBOS.length; c++) {   // anything playable
      var cb = NATIONS.COMBOS[c];
      var e3 = cb.players.filter(function (p) { return openSlots[p.pos] > 0 && !drafted[p.n]; });
      if (e3.length) return spinObj({ team: cb.team, short: cb.short, color: cb.color, players: cb.players }, cb.year, e3);
    }
    return null;
  }

  /* ----------------------------------------------------- tournament setup */
  var TOUR_ROUNDS = {
    ucl: ["Round of 16", "Quarter-final", "Semi-final", "Final"],
    wc:  ["Round of 32", "Round of 16", "Quarter-final", "Semi-final", "Final"],
  };
  // Opponents get tougher as you climb: a soft opener, then a brutal end-game.
  function roundDifficulty(index, total) {
    if (index >= total - 2) return "hard";
    if (index === 0) return "easy";
    return "normal";
  }
  // Match handicaps (see ENGINE.playMatch's `bias`). Every squad is built from
  // legends, so without a thumb on the scale every match is a coin-flip.
  //   • Tournaments favour the climber a touch — the trophy is hard but reachable.
  //   • The CPU difficulty selector is sharper, so "Hard" is a genuine test.
  var TOUR_BIAS = { easy: 1.5, normal: 1.28, hard: 1.08 };
  var CPU_BIAS = { easy: 1.4, normal: 1.12, hard: 0.9 };
  // Name the opponent after the club/nation of its standout player, e.g. "Brazil XI".
  function opponentName(squad) {
    var best = squad.slice().sort(function (a, b) { return CPU.primaryRating(b) - CPU.primaryRating(a); })[0];
    return (best && best.club ? best.club : "All-Star") + " XI";
  }

  /* ============================================================== Game === */
  function Game(opts) {
    opts = opts || {};
    var mode = opts.mode;
    if (["solo", "cpu", "ucl", "wc"].indexOf(mode) < 0) mode = "solo";
    this.mode = mode;
    this.pool = mode === "wc" ? "nation" : "club";
    this.isTournament = (mode === "ucl" || mode === "wc");
    this.difficulty = opts.difficulty || "normal";
    this.hideRatings = !!opts.hideRatings;
    this.seed = (opts.seed != null) ? opts.seed : (Date.now() % 2147483647);
    this.rand = mulberry32(this.seed);

    var formation = ENGINE.FORMATIONS.filter(function (f) { return f.id === opts.formationId; })[0]
      || ENGINE.FORMATIONS[0];
    this.formation = formation;
    this.openSlots = Object.assign({}, formation.slots);
    this.totalRounds = 0;
    var self = this;
    Object.keys(this.openSlots).forEach(function (k) { self.totalRounds += self.openSlots[k]; });

    this.squad = [];          // [{n,pos,r,club,color,year,label}]
    this.drafted = {};        // name -> true
    this.round = 0;           // 0-based completed picks
    this.skips = this.isTournament ? { club: 2, year: 2 } : { club: 1, year: 1 };
    this.spin = null;
    this.tour = null;
  }

  Game.prototype.start = function () { this.nextSpin(); return this; };

  Game.prototype.nextSpin = function (opts) {
    this.spin = (this.pool === "nation")
      ? makeNationSpin(this.openSlots, this.drafted, this.rand, opts)
      : makeSpin(this.openSlots, this.drafted, this.rand, opts);
    return this.spin;
  };

  // Pick a player (by name) from the current spin's eligible list.
  Game.prototype.pick = function (name) {
    if (!this.spin) return null;
    var pl = this.spin.eligible.filter(function (p) { return p.n === name; })[0];
    if (!pl || this.openSlots[pl.pos] <= 0) return null;

    var entry = {
      n: pl.n, pos: pl.pos, r: pl.r,
      club: this.spin.club, short: this.spin.short, color: this.spin.color,
      year: this.spin.year, label: this.spin.label,
    };
    this.squad.push(entry);
    this.drafted[pl.n] = true;
    this.openSlots[pl.pos]--;
    this.round++;

    if (this.isComplete()) { this.spin = null; return { done: true }; }
    this.nextSpin();
    return { done: false, spin: this.spin };
  };

  // Swap Club / Nation: a DIFFERENT side, SAME year.
  Game.prototype.skipClub = function () {
    if (this.skips.club <= 0 || !this.spin) return false;
    this.skips.club--;
    if (this.pool === "nation") this.nextSpin({ year: this.spin.year, avoidTeamName: this.spin.teamName });
    else this.nextSpin({ year: this.spin.year, avoidClubIndex: this.spin.clubIndex });
    return true;
  };

  // Swap Year: a DIFFERENT era/year, SAME club/nation (so the squad changes).
  Game.prototype.skipYear = function () {
    if (this.skips.year <= 0 || !this.spin) return false;
    this.skips.year--;
    if (this.pool === "nation") this.nextSpin({ teamName: this.spin.teamName, avoidYear: this.spin.year });
    else this.nextSpin({ clubIndex: this.spin.clubIndex, avoidLabel: this.spin.label });
    return true;
  };

  Game.prototype.isComplete = function () { return this.round >= this.totalRounds; };

  // Slots still needing a player, e.g. {DEF:1, FWD:2} -> used by the UI.
  Game.prototype.openList = function () {
    var out = [];
    var self = this;
    DATA.POSITIONS.forEach(function (p) {
      for (var i = 0; i < self.openSlots[p]; i++) out.push(p);
    });
    return out;
  };

  // Build a CPU squad from the appropriate pool (clubs, or nations for WC).
  Game.prototype.buildCpuSquad = function (difficulty, seed) {
    var pool = this.pool;
    var cpuRand = mulberry32(((seed != null ? seed : (this.seed ^ 0x9e3779b9)) >>> 0) || 1);
    return CPU.draft({
      formation: this.formation,
      difficulty: difficulty || this.difficulty,
      rng: cpuRand,
      spin: function (openSlots, drafted, rand) {
        return pool === "nation" ? makeNationSpin(openSlots, drafted, rand) : makeSpin(openSlots, drafted, rand);
      },
    });
  };

  Game.prototype.yourRatings = function () { return ENGINE.teamRatings(this.squad); };

  /* ------------------------------------------------- season / vs-CPU results */
  // Final results: your season + (if vs CPU) the opponent + the title decider.
  Game.prototype.results = function () {
    var you = ENGINE.simulateSeason(this.squad);
    var out = { you: you, squad: this.squad, formation: this.formation, mode: this.mode };

    if (this.mode === "cpu") {
      var cpuSquad = this.buildCpuSquad();
      var cpu = ENGINE.simulateSeason(cpuSquad);
      var match = ENGINE.playMatch(this.squad, cpuSquad, (this.seed * 2654435761) >>> 0 || 1, CPU_BIAS[this.difficulty] || 1);
      out.cpu = cpu;
      out.cpuSquad = cpuSquad;
      out.match = match;
      out.youWin = match.winner === "A";
    }
    return out;
  };

  /* ----------------------------------------------------- tournament engine */
  Game.prototype.initTournament = function () {
    this.tour = {
      rounds: TOUR_ROUNDS[this.mode].slice(),
      index: 0,
      record: { W: 0, L: 0 },
      goalsFor: 0, goalsAgainst: 0,
      alive: true, champion: false,
      runStats: {},          // name -> aggregated stats across the run
      history: [],           // per-round summaries
      opponent: null, opponentName: "", opponentDiff: "normal",
      lastResult: null,
    };
    return this.tour;
  };

  // Generate the opponent for the CURRENT round (call once before the team sheet).
  Game.prototype.makeOpponent = function () {
    var t = this.tour;
    var diff = roundDifficulty(t.index, t.rounds.length);
    var squad = this.buildCpuSquad(diff, (this.seed ^ (0x51ed270b + t.index * 0x9e3779b9)) >>> 0);
    t.opponent = squad;
    t.opponentName = opponentName(squad);
    t.opponentDiff = diff;
    return {
      squad: squad, name: t.opponentName, difficulty: diff,
      roundLabel: t.rounds[t.index], roundIndex: t.index, totalRounds: t.rounds.length,
      ratings: ENGINE.teamRatings(squad),
    };
  };

  // Decide the current round's scoreline (drives the on-screen sim). No advance.
  Game.prototype.playRound = function () {
    var t = this.tour;
    var seed = (this.seed * 2654435761 + (t.index + 1) * 40503) >>> 0 || 1;
    var res = ENGINE.playMatch(this.squad, t.opponent, seed, TOUR_BIAS[t.opponentDiff] || 1);
    t.lastResult = res;
    return res;
  };

  // Fold the finished sim's per-player stats in, update the record, advance.
  Game.prototype.applyRound = function (simOut) {
    var t = this.tour, res = t.lastResult, self = this;
    var win = res.winner === "A";
    var byName = {};
    this.squad.forEach(function (p) { byName[p.n] = p; });
    ((simOut && simOut.stats && simOut.stats.A) || []).forEach(function (s) {
      var src = byName[s.n] || s;
      var agg = t.runStats[s.n] || (t.runStats[s.n] = {
        n: s.n, pos: s.pos, club: src.club, year: src.year,
        goals: 0, assists: 0, saves: 0, cleanSheets: 0, ratingSum: 0, games: 0,
      });
      agg.goals += s.goals || 0; agg.assists += s.assists || 0; agg.saves += s.saves || 0;
      if ((s.pos === "GK" || s.pos === "DEF") && res.goalsB === 0) agg.cleanSheets += 1;
      agg.ratingSum += s.rating || 0; agg.games += 1;
    });
    t.goalsFor += res.goalsA; t.goalsAgainst += res.goalsB;

    var summary = {
      round: t.rounds[t.index], opponent: t.opponentName,
      goalsA: res.goalsA, goalsB: res.goalsB, pens: res.pens, win: win,
      scorers: simOut ? simOut.scorers : { A: [], B: [] },
    };
    t.history.push(summary);

    if (win) {
      t.record.W += 1;
      t.index += 1;
      if (t.index >= t.rounds.length) { t.champion = true; return { champion: true, eliminated: false, advanced: false, summary: summary }; }
      return { champion: false, eliminated: false, advanced: true, summary: summary };
    }
    t.record.L += 1; t.alive = false;
    return { champion: false, eliminated: true, advanced: false, summary: summary };
  };

  // The label of the farthest round reached (for results + stats).
  Game.prototype.runRoundLabel = function () {
    var t = this.tour; if (!t) return "";
    if (t.champion) return "Champions";
    var idx = Math.min(t.index, t.rounds.length - 1);
    return "Out in the " + t.rounds[idx];
  };

  // Aggregate the run into a saveable record (mirrors a "season" row).
  Game.prototype.runSummary = function () {
    var t = this.tour; if (!t) return null;
    var players = Object.keys(t.runStats).map(function (k) {
      var a = t.runStats[k];
      return {
        n: a.n, pos: a.pos, club: a.club, year: a.year,
        goals: a.goals, assists: a.assists, saves: a.saves, cleanSheets: a.cleanSheets,
        rating: a.games ? Math.round((a.ratingSum / a.games) * 10) / 10 : 0,
      };
    });
    return {
      mode: this.mode,
      roundsWon: t.record.W, champion: t.champion,
      roundReached: t.champion ? t.rounds.length : Math.min(t.index, t.rounds.length - 1),
      totalRounds: t.rounds.length,
      roundLabel: this.runRoundLabel(),
      goalsFor: t.goalsFor, goalsAgainst: t.goalsAgainst,
      players: players, squad: this.squad, formation: this.formation,
    };
  };

  var API = {
    create: function (opts) { return new Game(opts); },
    FORMATIONS: ENGINE.FORMATIONS,
    TOUR_ROUNDS: TOUR_ROUNDS,
    makeSpin: makeSpin,
    makeNationSpin: makeNationSpin,
    mulberry32: mulberry32,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.CC_GAME = API;
})(typeof window !== "undefined" ? window : globalThis);
