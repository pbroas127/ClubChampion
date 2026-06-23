/* ============================================================================
 * CLUB CHAMPION — Game Controller
 * ----------------------------------------------------------------------------
 * Pure game logic (no DOM). Owns the slot machine, the draft state machine,
 * the skips, and the results computation (season sim + vs-CPU title decider).
 *
 * The slot machine: pick a CLUB, then a UNIFORM random YEAR in [1990, 2026],
 * resolve the era covering that year, and offer the players who (a) play an
 * open position and (b) aren't already in your squad. Spins that can't fill an
 * open slot are re-rolled for free, so every spin you see is playable.
 * ==========================================================================*/

(function (root) {
  "use strict";

  var DATA = root.CC_DATA, ENGINE = root.CC_ENGINE, CPU = root.CC_CPU;

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

  // Build one playable spin given which slots remain open and who's taken.
  // clubIndex optional (used by "skip year" to keep the same club).
  function makeSpin(openSlots, drafted, rand, clubIndex) {
    for (var attempt = 0; attempt < 60; attempt++) {
      var ci = (clubIndex == null) ? randInt(rand, 0, DATA.CLUBS.length - 1) : clubIndex;
      var club = DATA.CLUBS[ci];
      var year = randInt(rand, DATA.START_YEAR, DATA.END_YEAR);
      var era = DATA.eraForYear(ci, year);
      var eligible = era.players.filter(function (p) {
        return openSlots[p.pos] > 0 && !drafted[p.n];
      });
      if (eligible.length > 0) {
        return {
          clubIndex: ci, club: club.club, short: club.short, color: club.color,
          country: club.country, year: year, label: era.label, eligible: eligible,
        };
      }
      // If we're locked to a club and it can't help, free the club lock.
      if (clubIndex != null && attempt > 8) clubIndex = null;
    }
    // Extremely unlikely fallback: any club/era with an open-slot player.
    for (var k = 0; k < DATA.COMBOS.length; k++) {
      var c = DATA.COMBOS[k];
      var elig = c.players.filter(function (p) { return openSlots[p.pos] > 0 && !drafted[p.n]; });
      if (elig.length) {
        return { clubIndex: c.clubIndex, club: c.club, short: c.short, color: c.color,
          country: c.country, year: randInt(rand, c.from, c.to), label: c.label, eligible: elig };
      }
    }
    return null;
  }

  function Game(opts) {
    opts = opts || {};
    this.mode = opts.mode === "cpu" ? "cpu" : "solo";
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
    this.skips = { club: 1, year: 1 };
    this.spin = null;
  }

  Game.prototype.start = function () {
    this.nextSpin();
    return this;
  };

  Game.prototype.nextSpin = function (clubIndex) {
    this.spin = makeSpin(this.openSlots, this.drafted, this.rand, clubIndex);
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

  Game.prototype.skipClub = function () {
    if (this.skips.club <= 0) return false;
    this.skips.club--;
    this.nextSpin();           // brand-new club + year
    return true;
  };

  Game.prototype.skipYear = function () {
    if (this.skips.year <= 0) return false;
    this.skips.year--;
    this.nextSpin(this.spin ? this.spin.clubIndex : null);   // same club, new year/era
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

  // Build the CPU's squad using the shared slot machine + the CPU AI.
  Game.prototype.buildCpuSquad = function () {
    var cpuRand = mulberry32((this.seed ^ 0x9e3779b9) >>> 0);
    return CPU.draft({
      formation: this.formation,
      difficulty: this.difficulty,
      rng: cpuRand,
      spin: function (openSlots, drafted, rand) {
        return makeSpin(openSlots, drafted, rand);
      },
    });
  };

  // Final results: your season + (if vs CPU) the opponent + the title decider.
  Game.prototype.results = function () {
    var you = ENGINE.simulateSeason(this.squad);
    var out = { you: you, squad: this.squad, formation: this.formation, mode: this.mode };

    if (this.mode === "cpu") {
      var cpuSquad = this.buildCpuSquad();
      var cpu = ENGINE.simulateSeason(cpuSquad);
      var match = ENGINE.playMatch(this.squad, cpuSquad, (this.seed * 2654435761) >>> 0 || 1);
      out.cpu = cpu;
      out.cpuSquad = cpuSquad;
      out.match = match;
      out.youWin = match.winner === "A";
    }
    return out;
  };

  var API = {
    create: function (opts) { return new Game(opts); },
    FORMATIONS: ENGINE.FORMATIONS,
    makeSpin: makeSpin,
    mulberry32: mulberry32,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.CC_GAME = API;
})(typeof window !== "undefined" ? window : globalThis);
