/* ============================================================================
 * CLUB CHAMPION  Match Simulation (head-to-head)
 * ==========================================================================*/
(function (root) {
  "use strict";
  var E = root.CC_ENGINE;

  function rng(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function ri(rand, a, b) { return a + Math.floor(rand() * (b - a + 1)); }
  function pick(rand, arr) { return arr[Math.floor(rand() * arr.length)]; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function shuffle(arr, rand) {
    arr = arr.slice();
    for (var i = arr.length - 1; i > 0; i--) { var j = Math.floor(rand() * (i + 1)); var t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
    return arr;
  }
  function lastName(n) { var p = (n || "").replace(/\(alt\)/, "").trim().split(" "); return p[p.length - 1]; }

  // Real pitch photo, shared across every match/skin - see FIELD_IMG below.
  // Skins are derived from this ONE image via Canvas2D ctx.filter (same idea
  // as a CSS filter) rather than each needing its own generated asset. `line`/
  // `stripe` still need per-skin colors since the vector-drawn pitch markings
  // sit on TOP of the filtered photo and have to stay legible against it
  // (e.g. white lines disappear on the whitened-out Snow filter).
  var SKIN_PALETTES = {
    skin_classic_green: { filter: "none",                                                             line: "rgba(255,255,255,.75)", stripe: "rgba(255,255,255,.05)" },
    skin_night:         { filter: "brightness(.48) contrast(1.2) saturate(.85) hue-rotate(-6deg)",     line: "rgba(170,195,255,.6)",  stripe: "rgba(170,195,255,.05)" },
    skin_snow:          { filter: "grayscale(.55) brightness(1.4) saturate(.45)",                       line: "rgba(20,30,40,.55)",    stripe: "rgba(20,30,40,.05)" },
    skin_rain:          { filter: "saturate(.5) brightness(.78) contrast(1.05) hue-rotate(8deg)",       line: "rgba(215,230,235,.6)",  stripe: "rgba(215,230,235,.05)" },
    skin_retro_crt:     { filter: "grayscale(1) contrast(1.5) brightness(.5)", tint: "rgba(46,232,127,.28)", scanlines: true,           line: "rgba(46,232,127,.9)",   stripe: "rgba(46,232,127,.08)" },
    skin_golden_hour:   { filter: "sepia(.4) saturate(1.35) hue-rotate(-8deg) brightness(1.05)",        line: "rgba(255,240,210,.7)",  stripe: "rgba(255,240,210,.05)" },
  };
  function getSkinPalette(id) { return SKIN_PALETTES[id] || SKIN_PALETTES.skin_classic_green; }

  // Loaded once at module scope and reused by every match instance (same
  // pattern as any other static asset - no per-match reload).
  var FIELD_IMG = new Image();
  FIELD_IMG.src = "https://d8j0ntlcm91z4.cloudfront.net/user_3DIHRL4hfIamgJ8ncr9DUxS5zcC/hf_20260702_225512_4febcf83-3d9d-4670-9140-77d20cab3920.png";
  var GOAL_IMG = new Image();
  GOAL_IMG.src = "https://d8j0ntlcm91z4.cloudfront.net/user_3DIHRL4hfIamgJ8ncr9DUxS5zcC/hf_20260702_225509_752745ed-3d3a-4b20-9b6f-863b7df93bfd.png";

  function byPos(squad) {
    var g = { GK: [], DEF: [], MID: [], FWD: [] };
    squad.forEach(function (p, i) { g[p.pos].push(i); });
    return g;
  }

  function layout(squad, side, phase) {
    var g = byPos(squad), out = new Array(squad.length);
    var xBase  = { GK: 0.06, DEF: 0.23, MID: 0.46, FWD: 0.70 };
    var push   = { GK: 0.00, DEF: 0.06, MID: 0.10, FWD: 0.15 };
    var ySpread = { GK: 0.00, DEF: 0.50, MID: 0.55, FWD: 0.40 };
    ["GK", "DEF", "MID", "FWD"].forEach(function (line) {
      var idxs = g[line], n = idxs.length, spr = ySpread[line];
      idxs.forEach(function (idx, k) {
        var x = xBase[line] + push[line] * phase;
        var y;
        if (n === 1) y = 0.5;
        else y = 0.5 - spr / 2 + (k / (n - 1)) * spr;
        if (side === "B") x = 1 - x;
        out[idx] = { x: x, y: clamp(y, 0.10, 0.90) };
      });
    });
    return out;
  }

  function initStats(squad) {
    return squad.map(function (p) {
      return { n: p.n, pos: p.pos, club: p.club, year: p.year, ovr: Math.round(E.overall(p)),
        touches: 0, passes: 0, shots: 0, saves: 0, tackles: 0, goals: 0, assists: 0, rating: 6.5 };
    });
  }
  function wRand(rand, idxs, weightFn) {
    var w = idxs.map(weightFn), sum = w.reduce(function (a, b) { return a + b; }, 0) || 1;
    var r = rand() * sum;
    for (var i = 0; i < idxs.length; i++) { r -= w[i]; if (r <= 0) return idxs[i]; }
    return idxs[idxs.length - 1];
  }

  function generate(squadA, squadB, result, seed) {
    var rand = rng(seed || 1);
    var atkA = E.attackPower(E.categoryTotals(squadA));
    var atkB = E.attackPower(E.categoryTotals(squadB));
    var stats = { A: initStats(squadA), B: initStats(squadB) };
    var scorers = { A: [], B: [] };
    var squads = { A: squadA, B: squadB };
    var groups = { A: byPos(squadA), B: byPos(squadB) };
    var beats = [];
    var score = { A: 0, B: 0 };

    function posOf(side, idx, phase) { return layout(squads[side], side, phase)[idx]; }
    function goalMouth(attSide, rand, wide) {
      var x = attSide === "A" ? 0.965 : 0.035;
      var spread = wide ? 0.34 : 0.12;
      return { x: x, y: clamp(0.5 + (rand() - 0.5) * spread, 0.12, 0.88) };
    }
    function add(minute, dur, ball, posSide, kind, label, flash, extra) {
      // _curveDir: which way THIS kick's flight bends, decided once per kick
      // right here (not derived from the minute at render time) - so any
      // swerve on the ball's path traces back to an actual per-kick decision
      // instead of a coincidental, player-independent pattern.
      var b = { minute: minute, dur: dur, ball: { x: ball.x, y: ball.y }, posSide: posSide,
        kind: kind, label: label, flash: !!flash, scoreA: score.A, scoreB: score.B,
        _curveDir: rand() < 0.5 ? 1 : -1 };
      if (extra) for (var k in extra) b[k] = extra[k];
      beats.push(b);
      return b;
    }

    add(0, 600, { x: 0.5, y: 0.5 }, "A", "kickoff", "Kick-off!", false);

    // Fewer possessions = a shorter match without touching the pace of any
    // individual action; floored so a high-scoring game always has enough
    // possessions to host every goal (the assignment below needs one each).
    var nPoss = Math.max(ri(rand, 8, 10), result.goalsA + result.goalsB + 2);
    var minutes = []; for (var i = 0; i < nPoss; i++) minutes.push(ri(rand, 3, 88));
    minutes.sort(function (a, b) { return a - b; });
    var pA = atkA / (atkA + atkB);
    var sides = minutes.map(function () { return rand() < pA ? "A" : "B"; });

    // Pick which possessions score, for BOTH sides, from ONE shuffled pool of
    // possession indices sliced into non-overlapping A/B portions - this is
    // what guarantees the two assignments can never collide. (An earlier
    // version picked A's goal slots and then separately, mutably, "ensured"
    // enough slots for B on the same underlying array - when there wasn't
    // naturally enough of B's assigned possessions to go around, that second
    // pass could steal back and overwrite one of A's just-chosen indices,
    // silently scoring one fewer goal than result.goalsA actually called for.)
    var goalAssign = {};
    var goalIdx = shuffle(minutes.map(function (_, i) { return i; }), rand);
    goalIdx.slice(0, result.goalsA).forEach(function (k) { goalAssign[k] = "A"; });
    goalIdx.slice(result.goalsA, result.goalsA + result.goalsB).forEach(function (k) { goalAssign[k] = "B"; });

    for (var pIdx = 0; pIdx < nPoss; pIdx++) {
      var side = goalAssign[pIdx] || sides[pIdx];
      buildPossession(side, !!goalAssign[pIdx], minutes[pIdx]);
    }

    add(90, 900, { x: 0.5, y: 0.5 }, "A", "fulltime", "Full Time", false);

    /* ---- Penalty shootout (only when pens present) ---- */
    if (result.pens && (result.pens.a > 0 || result.pens.b > 0)) {
      add(91, 2200, { x: 0.5, y: 0.5 }, "A", "penalty_intro", "PENALTIES!", true);

      var poolA = squadA.filter(function (p) { return p.pos !== "GK"; });
      var poolB = squadB.filter(function (p) { return p.pos !== "GK"; });
      if (!poolA.length) poolA = squadA;
      if (!poolB.length) poolB = squadB;

      // Build a kick sequence that nets to EXACTLY `target` goals across
      // EXACTLY `roundCount` kicks - this is what guarantees the shootout the
      // viewer watches always ends on the score the match was already decided
      // on (result.pens), never something the animation invents independently.
      // roundCount is shared by BOTH sides (computed below) rather than each
      // side sizing its own sequence off its own target - a real shootout
      // always has both sides take the SAME number of kicks (sudden death is
      // played in pairs), and engine.js only returns the final goal counts,
      // not the true round count, so reconstructing each side's length
      // independently could land A on 5 kicks and B on 8, which played back
      // as B taking three unanswered kicks with A never responding.
      function buildPenSequence(target, roundCount, pool, side, r) {
        var seq = [];
        for (var i = 0; i < roundCount; i++) seq.push(i < target);
        shuffle(seq, r);
        return seq.map(function (goal) {
          var k = pool[Math.floor(r() * pool.length)];
          // Non-scoring kicks are portrayed as either a keeper save or an
          // off-target miss - purely cosmetic (both are still 0), chosen
          // deterministically from the match seed so every viewer sees the same
          // sequence, driven by the three-outcome variety that was asked for.
          var outcome = goal ? "goal" : (r() < 0.62 ? "saved" : "missed");
          return { side: side, kicker: k.n, outcome: outcome, aim: r() };
        });
      }

      var roundCount = Math.max(5, result.pens.a, result.pens.b);
      var seqA = buildPenSequence(result.pens.a, roundCount, poolA, "A", rand);
      var seqB = buildPenSequence(result.pens.b, roundCount, poolB, "B", rand);
      var maxLen = Math.max(seqA.length, seqB.length);

      var pensA = 0, pensB = 0, kickIdx = 0;
      for (var rnd = 0; rnd < maxLen; rnd++) {
        if (rnd < seqA.length) {
          var ka = seqA[rnd];
          // "Pre" = the scoreboard/pips as they should still read WHILE this
          // kick is being taken (kicker's own pip still grey/un-scored) - the
          // renderer only swaps to the post-kick numbers once the kick is
          // actually resolved (see drawPenaltyBoard), so the board can never
          // spoil a kick before the ball's been struck.
          var pensAPre = pensA, pensBPre = pensB;
          var kicksA = 1 + Math.floor(kickIdx / 2), kicksB = Math.ceil(kickIdx / 2);
          pensA += ka.outcome === "goal" ? 1 : 0;
          add(91 + kickIdx, 3200, { x: 0.5, y: 0.5 }, "A", "penalty_kick", null, false, {
            _kickerName: ka.kicker, _penResult: ka.outcome, _penAim: ka.aim,
            _pensA: pensA, _pensB: pensB, _pensAPre: pensAPre, _pensBPre: pensBPre,
            _kicksA: kicksA, _kicksB: kicksB, _kicksAPre: kicksA - 1, _kicksBPre: kicksB,
            _penSide: "A",
          });
          kickIdx++;
        }
        if (rnd < seqB.length) {
          var kb = seqB[rnd];
          var pensAPre2 = pensA, pensBPre2 = pensB;
          var kicksA2 = 1 + Math.floor(kickIdx / 2), kicksB2 = Math.ceil((kickIdx + 1) / 2);
          pensB += kb.outcome === "goal" ? 1 : 0;
          add(91 + kickIdx, 3200, { x: 0.5, y: 0.5 }, "B", "penalty_kick", null, false, {
            _kickerName: kb.kicker, _penResult: kb.outcome, _penAim: kb.aim,
            _pensA: pensA, _pensB: pensB, _pensAPre: pensAPre2, _pensBPre: pensBPre2,
            _kicksA: kicksA2, _kicksB: kicksB2, _kicksAPre: kicksA2, _kicksBPre: kicksB2 - 1,
            _penSide: "B",
          });
          kickIdx++;
        }
      }
      // By construction, pensA === result.pens.a and pensB === result.pens.b
      // here - the running score painted on the shootout scoreboard always
      // lands on exactly the pre-decided result.
    }

    ["A", "B"].forEach(function (sd) {
      var won = (sd === "A" && result.winner === "A") || (sd === "B" && result.winner === "B");
      stats[sd].forEach(function (s) {
        var r = 6.3 + (s.ovr - 72) * 0.03 + s.goals * 0.9 + s.assists * 0.55 + s.saves * 0.06 + s.tackles * 0.08 + (won ? 0.25 : -0.1);
        s.rating = Math.round(clamp(r, 5.3, 9.8) * 10) / 10;
      });
    });

    return { beats: beats, stats: stats, scorers: scorers, result: result };

    function buildPossession(side, isGoal, minute) {
      var def = side === "A" ? "B" : "A";
      var g = groups[side], dg = groups[def];
      var st = stats[side], dst = stats[def];

      // More touches per possession (and forwards sometimes join the buildup,
      // not just DEF/MID) so a possession reads as a real passing move, not
      // one or two isolated hops before the shot.
      var nPass = ri(rand, 2, 4);
      var carriers = shuffle(g.DEF.concat(g.MID).concat(g.FWD), rand);
      var last = null;
      for (var k = 0; k < nPass; k++) {
        var who = carriers[k % carriers.length];
        var pp = posOf(side, who, 0.2 + 0.2 * k);
        add(minute, ri(rand, 280, 380), pp, side, "pass", null, false);
        st[who].touches++; st[who].passes++; last = who;
      }

      if (isGoal) finishGoal(); else finishNoGoal();

      function attacker(weightFn) {
        var pool = g.FWD.concat(g.MID);
        return wRand(rand, pool, weightFn || function (i) { return Math.pow(squads[side][i].r.at, 2); });
      }
      function gkIdx(sd) { return groups[sd].GK[0]; }

      function finishGoal() {
        var type = pick(rand, ["through", "through", "cross", "cross", "cross", "solo", "solo", "corner", "corner"]);
        var scorer, assist = last;
        if (type === "cross") {
          var winger = pick(rand, g.MID.concat(g.FWD));
          // Anchor the cross's own target to the SAME flank the winger's pass
          // just delivered him to (not an independent hardcoded spot) - a
          // midfielder-turned-winger can sit well short of a forward's usual
          // wide position, and sending the cross to a fixed coordinate made
          // the ball visually jump to nobody in particular.
          var wp = posOf(side, winger, 1);
          var wideY = wp.y < 0.5 ? 0.08 : 0.92;
          add(minute, 320, { x: side === "A" ? 0.88 : 0.12, y: wideY }, side, "pass", null, false);
          st[winger].touches++; st[winger].passes++; assist = winger;
          scorer = attacker(function (i) { return Math.pow(squads[side][i].r.ph, 2) * (squads[side][i].pos === "FWD" ? 2 : 1); });
          add(minute, 320, { x: side === "A" ? 0.90 : 0.10, y: wideY }, side, "cross", null, false, { _crosser: winger });
          add(minute, 360, goalMouth(side, rand, false), side, "goal", headerOrFinish(true), true, { _scorerIdx: scorer });
        } else if (type === "corner") {
          var topSide = rand() < 0.5;
          var taker = pick(rand, g.DEF.concat(g.MID));
          // The ball must actually go out behind the goal before a corner can
          // exist - a defender turns the attack behind first.
          add(minute, 300, { x: side === "A" ? 1.03 : -0.03, y: topSide ? 0.30 : 0.70 }, side, "deflectOut", null, false);
          add(minute, 0, { x: side === "A" ? 0.985 : 0.015, y: topSide ? 0.06 : 0.94 }, side, "cornerSetup", "Corner Kick", false);
          add(minute, 420, { x: side === "A" ? 0.985 : 0.015, y: topSide ? 0.06 : 0.94 }, side, "corner", null, false);
          st[taker].touches++; st[taker].passes++; assist = taker;
          scorer = attacker(function (i) { return Math.pow(squads[side][i].r.ph, 2) * (squads[side][i].pos === "FWD" ? 1.4 : 1); });
          add(minute, 340, goalMouth(side, rand, false), side, "goal", headerOrFinish(true), true, { _scorerIdx: scorer });
        } else if (type === "solo") {
          scorer = attacker(function (i) { return Math.pow(squads[side][i].r.at, 2.2); });
          add(minute, 340, posOf(side, scorer, 1), side, "dribble", null, false, { _carrier: scorer });
          st[scorer].touches++;
          add(minute, 340, goalMouth(side, rand, false), side, "goal", "GOAL! Solo finish!", true, { _scorerIdx: scorer });
          assist = null;
        } else {
          add(minute, 300, { x: side === "A" ? 0.7 : 0.3, y: clamp(0.5 + (rand() - 0.5) * 0.5, 0.2, 0.8) }, side, "pass", null, false);
          scorer = attacker();
          add(minute, 340, goalMouth(side, rand, false), side, "goal", "GOAL! Clinical finish!", true, { _scorerIdx: scorer });
        }
        score[side]++;
        st[scorer].touches++; st[scorer].shots++; st[scorer].goals++;
        scorers[side].push({ name: scorer != null ? squads[side][scorer].n : "", minute: minute, type: type });
        if (assist != null && assist !== scorer) st[assist].assists++;
        beats[beats.length - 1].scoreA = score.A; beats[beats.length - 1].scoreB = score.B;
      }

      function headerOrFinish(goal) {
        return goal ? pick(rand, ["GOAL! Towering header!", "GOAL! Headed home!", "GOAL! Tap-in!"]) : null;
      }

      // Dead-ball restart from the defending keeper: everyone drops back into
      // shape while the ball is placed/held (goalkickSetup), then it's played
      // out. Used after every ball that dies behind the goal AND after any
      // save the keeper holds onto - the "everyone backs out" moment.
      function goalKickRestart(label) {
        add(minute, 0, { x: def === "A" ? 0.13 : 0.87, y: 0.5 }, def, "goalkickSetup", label || "Goal Kick", false);
        add(minute, 380, { x: def === "A" ? 0.40 : 0.60, y: clamp(0.5 + (rand() - 0.5) * 0.5, 0.2, 0.8) }, def, "goalkick", null, false);
      }
      // A header from a corner that misses always ends up out behind the goal
      // (that's what a missed header IS) -> ball out, goal kick.
      function cornerHeader(headIdx) {
        var res = pick(rand, ["save", "miss", "miss"]);
        if (res === "save") {
          add(minute, 340, goalMouth(side, rand, false), side, "save", "Header saved!", false, { _shooterIdx: headIdx });
          dst[gkIdx(def)].saves++;
          goalKickRestart("Keeper's Ball");
        } else {
          add(minute, 340, { x: side === "A" ? 1.03 : -0.03, y: clamp(0.5 + (rand() - 0.5) * 0.55, 0.2, 0.8) }, side, "miss", null, false, { _shooterIdx: headIdx });
          goalKickRestart();
        }
        st[headIdx].touches++; st[headIdx].shots++;
      }

      function finishNoGoal() {
        var type = pick(rand, ["save", "save", "save", "miss", "miss", "block", "tackle", "tackle", "tackle", "post"]);
        var shooter = attacker();

        if (type === "save") {
          add(minute, 300, posOf(side, shooter, 1), side, "shot", null, false, { _shooterIdx: shooter });
          st[shooter].touches++; st[shooter].shots++;
          var saveOutcome = rand();
          add(minute, 360, goalMouth(side, rand, false), side, "save", "Great save!", false);
          dst[gkIdx(def)].saves++;
          if (saveOutcome < 0.45) {
            var rebX = side === "A" ? 0.78 : 0.22;
            var rebY = clamp(0.5 + (rand() - 0.5) * 0.4, 0.25, 0.75);
            add(minute, 380, { x: rebX, y: rebY }, def, "parry", null, false);
          } else if (saveOutcome < 0.65) {
            // Tipped behind: the ball visibly crosses the byline FIRST, only
            // then does the corner exist.
            var topSide = rand() < 0.5;
            add(minute, 300, { x: side === "A" ? 1.03 : -0.03, y: topSide ? 0.32 : 0.68 }, side, "deflectOut", null, false);
            add(minute, 0, { x: side === "A" ? 0.985 : 0.015, y: topSide ? 0.06 : 0.94 }, side, "cornerSetup", "Corner Kick", false);
            add(minute, 420, { x: side === "A" ? 0.985 : 0.015, y: topSide ? 0.06 : 0.94 }, side, "corner", null, false);
            cornerHeader(attacker(function (i) { return squads[side][i].r.ph; }));
          } else {
            // Keeper holds it - everyone backs out while he readies, then he
            // distributes. No more play magically continuing off a caught ball.
            goalKickRestart("Keeper's Ball");
          }
        } else if (type === "miss") {
          add(minute, 280, posOf(side, shooter, 1), side, "shot", null, false, { _shooterIdx: shooter });
          st[shooter].touches++; st[shooter].shots++;
          var wideTop = rand() < 0.5;
          add(minute, 360, { x: side === "A" ? 1.02 : -0.02, y: wideTop ? 0.18 : 0.82 }, side, "miss", null, false);
          goalKickRestart();
        } else if (type === "post") {
          add(minute, 280, posOf(side, shooter, 1), side, "shot", null, false, { _shooterIdx: shooter });
          st[shooter].touches++; st[shooter].shots++;
          var hitTop = rand() < 0.5;
          add(minute, 260, { x: side === "A" ? 0.985 : 0.015, y: hitTop ? 0.42 : 0.58 }, side, "postHit", "Off the post!", false);
          if (rand() < 0.3) {
            // Rebound spins out behind the goal (x past the line) -> corner.
            add(minute, 320, { x: side === "A" ? 1.01 : -0.01, y: hitTop ? 0.04 : 0.96 }, side, "postBounce", null, false);
            add(minute, 0, { x: side === "A" ? 0.985 : 0.015, y: hitTop ? 0.06 : 0.94 }, side, "cornerSetup", "Corner Kick", false);
            add(minute, 420, { x: side === "A" ? 0.985 : 0.015, y: hitTop ? 0.06 : 0.94 }, side, "corner", null, false);
            cornerHeader(attacker(function (i) { return squads[side][i].r.ph; }));
          } else {
            add(minute, 340, { x: side === "A" ? 0.80 : 0.20, y: hitTop ? 0.30 : 0.70 }, def, "postBounce", null, false);
          }
        } else if (type === "block") {
          add(minute, 280, posOf(side, shooter, 1), side, "shot", null, false, { _shooterIdx: shooter });
          st[shooter].touches++; st[shooter].shots++;
          var blk = pick(rand, dg.DEF); dst[blk].tackles++;
          add(minute, 300, posOf(def, blk, 0.2), def, "blockOut", null, false);
        } else {
          var tk = pick(rand, dg.DEF.concat(dg.MID));
          add(minute, 260, posOf(side, pick(rand, g.MID.concat(g.FWD)), 0.6), side, "dribble", null, false);
          add(minute, 280, posOf(def, tk, 0.1), def, "tackle", null, false);
          dst[tk].tackles++;
        }
      }
    }
  }

  /* ----------------------------------------------------------- renderer */
  function create(canvas, opts) {
    opts = opts || {};
    var tl = generate(opts.squadA, opts.squadB, opts.result, opts.seed || 1);
    (function () { var c = { A: 0, B: 0 }; tl.beats.forEach(function (b) { if (b.kind === "goal") b.scorer = tl.scorers[b.posSide][c[b.posSide]++] || { name: "", minute: b.minute }; }); })();

    var ctx = canvas.getContext("2d");
    var colorA = opts.colorA || "#2ee87f", colorB = opts.colorB || "#ff5d73";
    var skinPal = getSkinPalette(opts.skin);
    var nameA = opts.teamAName || "Your XI", nameB = opts.teamBName || "CPU";
    var onDone = opts.onDone || function () {};
    var onTick = opts.onTick || function () {};
    var squads = { A: opts.squadA, B: opts.squadB };

    var stage = canvas.parentNode || canvas;
    var overlay = stage.querySelector ? stage.querySelector(".goal-overlay") : null;
    if (!overlay && stage.appendChild) { overlay = document.createElement("div"); overlay.className = "goal-overlay"; stage.appendChild(overlay); }
    var notchTop = stage.querySelector ? stage.querySelector(".sim-notch--top") : null;
    var notchBottom = stage.querySelector ? stage.querySelector(".sim-notch--bottom") : null;

    var W = 0, H = 0, dpr = Math.min(3, root.devicePixelRatio || 1);
    var FL = 0, FR = 1, FT = 0, FB = 1;
    var vertical = false;
    var fieldScale = 1;
    var notchTopH = 56, notchBotH = 44;
    function resize() {
      var rect = canvas.getBoundingClientRect();
      W = rect.width; H = rect.height;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      vertical = H > W;
      // The notches are real DOM elements sitting on top of the canvas -
      // measure them so the pitch margin always clears them, on any screen.
      notchTopH = notchTop ? notchTop.getBoundingClientRect().height : notchTopH;
      notchBotH = notchBottom ? notchBottom.getBoundingClientRect().height : notchBotH;
      if (vertical) {
        FL = W * 0.04; FR = W * 0.96;
        // In portrait the goal mouths are drawn ABOVE/BELOW the touchline (in
        // this same margin) - their depth scales with field height, so the
        // margin has to clear the notch AND that goal graphic, not just the notch.
        var goalDepth = Math.max(10, H * 0.78 * 0.035);
        FT = Math.max(H * 0.12, notchTopH + goalDepth + 14);
        FB = H - Math.max(H * 0.11, notchBotH + goalDepth + 14);
      } else {
        FL = W * 0.075; FR = W * 0.925;
        FT = Math.max(H * 0.075, notchTopH + 10); FB = H - Math.max(H * 0.07, notchBotH + 10);
      }
      // Keep time-to-cross-the-pitch roughly constant across canvas sizes.
      // Uncapped, this hit 2.0x on phones (field ~400px), literally doubling
      // every ball speed on mobile - the single biggest "pinball" factor.
      fieldScale = clamp(800 / Math.max(400, FR - FL), 0.85, 1.1);
    }
    function sx(x, y) { return vertical ? FL + y * (FR - FL) : FL + x * (FR - FL); }
    function sy(x, y) { return vertical ? FT + x * (FB - FT) : FT + y * (FB - FT); }
    function px(x) { return FL + x * (FR - FL); }
    function py(y) { return FT + y * (FB - FT); }
    function adir(side) { return side === "A" ? 1 : -1; }
    function ownGoalX(side) { return side === "A" ? 0.04 : 0.96; }

    var players = [];
    function initPlayers(snap) {
      if (!players.length) {
        ["A", "B"].forEach(function (side) {
          layout(squads[side], side, 0).forEach(function (p, i) {
            players.push({ side: side, idx: i, ptype: squads[side][i].pos,
              pos: { x: p.x, y: p.y }, pos0: { x: p.x, y: p.y }, vel: { x: 0, y: 0 } });
          });
        });
      }
      if (snap) players.forEach(function (p) { p.pos.x = p.pos0.x; p.pos.y = p.pos0.y; p.vel.x = 0; p.vel.y = 0; });
    }
    function playersOf(side) { return players.filter(function (p) { return p.side === side; }); }
    function playerByIdx(side, idx) { for (var i = 0; i < players.length; i++) if (players[i].side === side && players[i].idx === idx) return players[i]; return null; }
    function d2(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; }
    function nearest(list, pt) { var best = null, bd = 1e9; list.forEach(function (p) { var d = d2(p.pos, pt); if (d < bd) { bd = d; best = p; } }); return best; }

    var ball = { x: 0.5, y: 0.5, p0: null, p1: null, p2: null, u: 1, len: 1, speed: 0.6, moving: false, dribble: false, carrier: null, t: 0 };
    // Launch speeds (pitch-lengths/sec). Shots stay the fastest thing on the
    // pitch but every kind is slow enough to follow with the eye; ballEase
    // below then bleeds pace off rolling/deflected balls so nothing glides
    // at constant speed like an air-hockey puck.
    function speedFor(k) {
      switch (k) {
        case "goal":       return 0.95;
        case "shot":       return 0.88;
        case "postHit":    return 0.90;
        case "postBounce": return 0.55;
        case "save":       return 0.80;
        case "parry":      return 0.50;
        case "cross":      return 0.52;
        case "corner":     return 0.48;
        case "pass":       return 0.44;
        case "dribble":    return 0.22;
        case "goalkick":   return 0.68;
        case "deflectOut": return 0.52;
        case "blockOut":   return 0.42;
        case "kickoff":
        case "foul":       return 0.58;
        default:           return 0.46;
      }
    }

    // Pace multiplier over the flight (u = 0 start -> 1 arrival). Rebounds,
    // deflections and balls rolling dead start lively off the contact and
    // shed most of their pace (friction); ground passes ease up into the
    // receiver's feet; shots stay flat-out the whole way - they're struck,
    // not rolled.
    function ballEase(kind, u) {
      if (/^(postBounce|parry|blockOut|miss|tackle|deflectOut)$/.test(kind)) return 1.15 - 0.85 * u;
      if (/^(pass|goalkick|kickoff|corner|cross)$/.test(kind)) return 1.05 - 0.35 * u;
      return 1;
    }

    function pickReceiver(b) {
      if (/^(shot|goal|miss|postHit|deflectOut)$/.test(b.kind)) return null;   // dead/loose - nobody receives
      if (b.kind === "save") return playersOf(b.posSide === "A" ? "B" : "A").filter(function (p) { return p.ptype === "GK"; })[0] || null;
      var pool = playersOf(b.posSide).filter(function (p) { return p.ptype !== "GK" && p !== ball.carrier; });
      if (!pool.length) pool = playersOf(b.posSide);
      return nearest(pool, b.ball);
    }

    function setpieceTargets(b) {
      if (b.kind !== "cornerSetup" && b.kind !== "goalkickSetup") return null;
      var targets = {};
      var atk = b.posSide, def = atk === "A" ? "B" : "A";

      if (b.kind === "cornerSetup") {
        var top = b.ball.y < 0.5;
        var goalX = ownGoalX(def);
        var cornerX = atk === "A" ? 0.985 : 0.015;
        var cornerY = top ? 0.06 : 0.94;

        var atkOut = playersOf(atk).filter(function (p) { return p.ptype !== "GK"; });
        var taker = nearest(atkOut, { x: cornerX, y: cornerY });
        var others = atkOut.filter(function (p) { return p !== taker; });

        playersOf(atk).forEach(function (p) {
          if (p.ptype === "GK") { targets[p.side + p.idx] = { x: ownGoalX(atk) + adir(atk) * 0.02, y: 0.5 }; return; }
          if (p === taker) { targets[p.side + p.idx] = { x: cornerX, y: cornerY }; return; }
          var i = others.indexOf(p);
          targets[p.side + p.idx] = { x: (atk === "A" ? 0.84 : 0.16) + (i % 2 ? 0.04 : -0.02) * adir(atk), y: clamp(0.36 + (i * 0.10), 0.30, 0.70) };
        });

        var defOut = playersOf(def).filter(function (p) { return p.ptype !== "GK"; });
        playersOf(def).forEach(function (p) {
          if (p.ptype === "GK") { targets[p.side + p.idx] = { x: goalX, y: 0.5 }; return; }
          var i = defOut.indexOf(p);
          targets[p.side + p.idx] = { x: (atk === "A" ? 0.90 : 0.10) + (i % 2 ? 0.03 : -0.01) * adir(atk), y: clamp(0.32 + (i * 0.09), 0.30, 0.70) };
        });
      } else {
        var gkX = atk === "A" ? 0.13 : 0.87;
        players.forEach(function (p) {
          if (p.side === atk && p.ptype === "GK") {
            targets[p.side + p.idx] = { x: gkX, y: 0.5 };
          } else {
            targets[p.side + p.idx] = { x: p.pos0.x, y: p.pos0.y };
          }
        });
      }
      return targets;
    }

    var bi = -1, dwell = 0, celebrating = false, celebrateUntil = 0;
    var banner = null, bannerIcon = null, bannerT = 0, flash = 0, raf = null, last = 0, finished = false, frameDt = 0;
    // Penalties reuse the SAME aerial player-dot/ball rendering as open play
    // (drawPlayer/drawBall via sx/sy) - penPhase/penTimer just drive two of the
    // existing `players` (kicker, keeper) and the shared `ball` to new
    // positions each kick. The CAMERA, though, is zoomed: rather than the full
    // pitch, positions during a penalty live directly in a "zoomed" logical
    // 0..1 space that only covers the ~38% of pitch length nearest the goal
    // being attacked (X) and the middle ~70% of pitch width (Y) - fed through
    // the SAME sx/sy projection as everything else, so it still automatically
    // adapts to portrait/landscape. In this space, 1 = the goal line, ALWAYS
    // (regardless of which real side is attacking), which is what lets every
    // position constant below be a single number instead of needing a
    // left/right mirror for every kick.
    var penaltyMode = false, penKickBeat = null, penPhase = 0, penTimer = 0;
    var penGoalFlash = 0;   // 0-1, fades in on resolution for the result banner
    var PEN_ZOOM_X = 0.38, PEN_ZOOM_Y0 = 0.15, PEN_ZOOM_Y1 = 0.85;
    var PEN_Z_GOAL = 1, PEN_Z_KEEPER = 0.961, PEN_Z_SPOT = 0.711, PEN_Z_RUNUP = 0.566;
    var PEN_Z_SIXYARD = 0.868, PEN_Z_BOX = 0.658;              // box near-edges, zoomed-X
    var PEN_GOAL_HALF = 0.093;                                   // goal mouth half-height, zoomed-Y
    var PEN_KICK_DUR = 0.8, PEN_DIVE_DUR = 0.45;   // seconds: ball flight / keeper dive, phase 2

    function playerByName(side, name) {
      for (var i = 0; i < players.length; i++) {
        if (players[i].side === side && squads[side][players[i].idx].n === name) return players[i];
      }
      return null;
    }

    function setBanner(b) {
      var map = {
        "corner":     { i: "🚩", t: b.label || "Corner Kick" },
        "cornerSetup":{ i: "🚩", t: b.label || "Corner Kick" },
        "goalkickSetup":{ i: "🥅", t: b.label || "Goal Kick" },
        "postHit":    { i: "❗", t: b.label || "Off the Post!" },
        "save":       { i: "🧤", t: b.label || "Save!" },
        "kickoff":    { i: "⚽", t: b.label || "Kick-off" },
        "fulltime":   { i: "⏱️", t: b.label || "Full Time" }
      };
      var m = map[b.kind];
      if (m) { banner = m.t; bannerIcon = m.i; bannerT = 1.4; }
    }

    function start() { initPlayers(true); last = performance.now(); enterBeat(0); raf = requestAnimationFrame(loop); }
    function finish() { if (finished) return; finished = true; if (raf) cancelAnimationFrame(raf); if (overlay) overlay.classList.remove("show"); onDone({ stats: tl.stats, scorers: tl.scorers }); }

    /* --------------------------------------------------------- Penalties -- */
    // Nicer, clearer shootout scoreboard: a rounded panel under the main HUD
    // bar with a big running score flanked by team names and two rows of
    // scored/missed pips - the pip fill only ever reflects the SAME running
    // _pensA/_pensB the beat generator built to land on the pre-decided score.
    function drawPenaltyBoard() {
      var b = penKickBeat || tl.beats[bi] || {};
      // While a kick is still being taken (run-up through mid-flight), show
      // the score/pips as they stood BEFORE this kick - only swap to the real
      // post-kick numbers once the outcome actually lands (penPhase 3, same
      // moment the GOAL!/SAVED!/MISSED! label appears), so the board can
      // never spoil a kick before the ball's been struck.
      var revealed = b.kind !== "penalty_kick" || penPhase >= 3;
      var e = b._pensA === undefined ? { _pensA: 0, _pensB: 0, _kicksA: 0, _kicksB: 0 }
        : revealed ? b
        : { _pensA: b._pensAPre, _pensB: b._pensBPre, _kicksA: b._kicksAPre, _kicksB: b._kicksBPre };

      var panelW = clamp(W * 0.66, 230, 400), panelH = 76;
      var bx0 = W / 2 - panelW / 2, by0 = Math.max(36, FT + 6);

      ctx.save();
      ctx.fillStyle = "rgba(7,20,13,.88)";
      ctx.strokeStyle = "rgba(255,210,74,.55)"; ctx.lineWidth = 1.5;
      roundRect(ctx, bx0, by0, panelW, panelH, 14);
      ctx.fill(); ctx.stroke();

      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.font = "800 10px Archivo, Inter, sans-serif"; ctx.fillStyle = "#ffd24a";
      ctx.fillText("PENALTIES", W / 2, by0 + 13);

      ctx.font = "900 23px Archivo, Inter, sans-serif"; ctx.fillStyle = "#fff";
      ctx.fillText(e._pensA + " - " + e._pensB, W / 2, by0 + 36);

      ctx.font = "700 10.5px Inter, sans-serif";
      ctx.textAlign = "right"; ctx.fillStyle = colorA;
      ctx.fillText(nameA.length > 13 ? nameA.slice(0, 12) + "…" : nameA, W / 2 - 26, by0 + 36);
      ctx.textAlign = "left"; ctx.fillStyle = colorB;
      ctx.fillText(nameB.length > 13 ? nameB.slice(0, 12) + "…" : nameB, W / 2 + 26, by0 + 36);

      var maxShow = Math.min(10, Math.max(5, e._kicksA || 0, e._kicksB || 0));
      var dotGap = Math.min(18, (panelW - 36) / Math.max(1, maxShow - 1 || 1));
      var startX = W / 2 - ((maxShow - 1) * dotGap) / 2;
      function pipRow(y, kicks, scored, oppScored) {
        for (var i = 0; i < maxShow; i++) {
          var dx = startX + i * dotGap, taken = i < kicks;
          ctx.beginPath(); ctx.arc(dx, y, 4.5, 0, 7);
          ctx.fillStyle = !taken ? "rgba(255,255,255,.16)" : (i < scored ? "#2ee87f" : "#ff5d73");
          ctx.fill();
        }
      }
      pipRow(by0 + 56, e._kicksA || 0, e._pensA, e._pensB);
      pipRow(by0 + 68, e._kicksB || 0, e._pensB, e._pensA);
      ctx.restore();
    }

    // Zoomed penalty scene: a close-up aerial camera on just the goal being
    // attacked - same visual language as the open-play pitch (grass, box
    // markings, player dots) but only ~38% of the pitch length and the middle
    // ~70% of its width, so the goal genuinely fills the frame instead of
    // sitting in the corner of a wide shot of an empty pitch. Every position
    // here (goal/spot/run-up/keeper line, drawn via zx/zy) already lives in
    // that zoomed space, fed through the SAME sx/sy projection as the real
    // pitch so it still adapts correctly to portrait vs landscape.
    function zx(x, y) { return sx(x, y); }
    function zy(x, y) { return sy(x, y); }

    function drawPenaltyPitchZoomed() {
      var g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#1a5c33"); g.addColorStop(1, "#123f26");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

      // Mowing stripes across the crop, oriented for the current camera.
      ctx.fillStyle = "rgba(255,255,255,.045)";
      var stripes = 5;
      for (var s = 0; s < stripes; s++) {
        if (s % 2 !== 1) continue;
        var a = { x: zx(s / stripes, 0), y: zy(s / stripes, 0) };
        var b2 = { x: zx((s + 1) / stripes, 1), y: zy((s + 1) / stripes, 1) };
        ctx.fillRect(Math.min(a.x, b2.x), Math.min(a.y, b2.y), Math.abs(b2.x - a.x) || 2, Math.abs(b2.y - a.y) || 2);
      }

      function zoomedRect(x0, y0, x1, y1) {
        var p0 = { x: zx(x0, y0), y: zy(x0, y0) }, p1 = { x: zx(x1, y1), y: zy(x1, y1) };
        return { x: Math.min(p0.x, p1.x), y: Math.min(p0.y, p1.y), w: Math.abs(p1.x - p0.x), h: Math.abs(p1.y - p0.y) };
      }

      ctx.strokeStyle = "rgba(255,255,255,.8)"; ctx.lineWidth = 2.5;
      var box = zoomedRect(PEN_Z_BOX, 0.5 - PEN_GOAL_HALF * 3.4, 1, 0.5 + PEN_GOAL_HALF * 3.4);
      ctx.strokeRect(box.x, box.y, box.w, box.h);
      var six = zoomedRect(PEN_Z_SIXYARD, 0.5 - PEN_GOAL_HALF * 1.7, 1, 0.5 + PEN_GOAL_HALF * 1.7);
      ctx.strokeRect(six.x, six.y, six.w, six.h);

      // Penalty arc: the "D" bulging away from goal, centered on the spot.
      var spot = { x: zx(PEN_Z_SPOT, 0.5), y: zy(PEN_Z_SPOT, 0.5) };
      var edge = { x: zx(PEN_Z_BOX, 0.5), y: zy(PEN_Z_BOX, 0.5) };
      var arcR = Math.hypot(spot.x - edge.x, spot.y - edge.y) * 1.55;
      var awayAngle = Math.atan2(edge.y - spot.y, edge.x - spot.x);
      ctx.beginPath(); ctx.arc(spot.x, spot.y, arcR, awayAngle - 0.95, awayAngle + 0.95); ctx.stroke();

      ctx.beginPath(); ctx.arc(spot.x, spot.y, 4, 0, 7); ctx.fillStyle = "rgba(255,255,255,.65)"; ctx.fill();
    }

    function drawPenGoalHighlight() {
      var netDepth = 0.14;
      var y0 = 0.5 - PEN_GOAL_HALF, y1 = 0.5 + PEN_GOAL_HALF;
      var nearTop = { x: zx(PEN_Z_GOAL, y0), y: zy(PEN_Z_GOAL, y0) };
      var nearBot = { x: zx(PEN_Z_GOAL, y1), y: zy(PEN_Z_GOAL, y1) };
      var farTop  = { x: zx(PEN_Z_GOAL + netDepth, y0), y: zy(PEN_Z_GOAL + netDepth, y0) };
      var farBot  = { x: zx(PEN_Z_GOAL + netDepth, y1), y: zy(PEN_Z_GOAL + netDepth, y1) };
      var xs = [nearTop.x, nearBot.x, farTop.x, farBot.x], ys = [nearTop.y, nearBot.y, farTop.y, farBot.y];
      var rx = Math.min.apply(null, xs), rx2 = Math.max.apply(null, xs);
      var ry = Math.min.apply(null, ys), ry2 = Math.max.apply(null, ys);
      var rw = Math.max(4, rx2 - rx), rh = Math.max(4, ry2 - ry);

      var cx = (rx + rx2) / 2, cy = (ry + ry2) / 2, rad = Math.max(rw, rh) * 1.9 + 30;
      var glow = ctx.createRadialGradient(cx, cy, 6, cx, cy, rad);
      glow.addColorStop(0, "rgba(255,210,74,.24)"); glow.addColorStop(1, "rgba(255,210,74,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);

      ctx.fillStyle = "rgba(10,26,18,.65)";
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeStyle = "rgba(255,255,255,.22)"; ctx.lineWidth = 1;
      var steps = 7;
      for (var i = 0; i <= steps; i++) {
        if (rw >= rh) { var nx = rx + (rw / steps) * i; ctx.beginPath(); ctx.moveTo(nx, ry); ctx.lineTo(nx, ry + rh); ctx.stroke(); }
        else { var ny = ry + (rh / steps) * i; ctx.beginPath(); ctx.moveTo(rx, ny); ctx.lineTo(rx + rw, ny); ctx.stroke(); }
      }

      ctx.strokeStyle = "#fff"; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(nearTop.x, nearTop.y); ctx.lineTo(nearBot.x, nearBot.y); ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(nearTop.x, nearTop.y, 5, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(nearBot.x, nearBot.y, 5, 0, 7); ctx.fill();
    }

    function drawPenaltyScene() {
      var b = penKickBeat || tl.beats[bi] || {};
      drawPenaltyPitchZoomed();
      drawPenGoalHighlight();
      if (b.kind === "penalty_intro") return;   // establishing shot only - no kicker/keeper yet

      if (b._keeperObj) drawPlayer(b._keeperObj);
      if (b._kickerObj) drawPlayer(b._kickerObj);

      if (penPhase >= 3 && penGoalFlash > 0) {
        var label = b._penResult === "goal" ? "GOAL!" : b._penResult === "saved" ? "SAVED!" : "MISSED!";
        var lc = b._penResult === "goal" ? "#2ee87f" : b._penResult === "saved" ? "#4aa8ff" : "#ff5d73";
        ctx.save();
        ctx.globalAlpha = penGoalFlash;
        ctx.font = "900 " + Math.round(clamp(Math.min(W, H) * 0.1, 24, 44)) + "px Archivo, Inter, sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillStyle = lc;
        ctx.shadowColor = "rgba(0,0,0,.7)"; ctx.shadowBlur = 16;
        ctx.fillText(label, W / 2, H * 0.38);
        ctx.restore();
        if (b._penResult === "goal") {
          ctx.save(); ctx.globalAlpha = penGoalFlash * 0.28; ctx.fillStyle = "#2ee87f"; ctx.fillRect(0, 0, W, H); ctx.restore();
        }
      }
    }

    function updatePenalty(dt) {
      penTimer += dt;
      var b = penKickBeat || tl.beats[bi] || {};

      if (b.kind === "penalty_intro") return;
      var kicker = b._kickerObj, keeper = b._keeperObj;

      if (penPhase === 0) {
        // Run-up: walk from behind the spot to the spot.
        var t0 = clamp(penTimer / 0.5, 0, 1);
        if (kicker) kicker.pos.x = PEN_Z_RUNUP + (PEN_Z_SPOT - PEN_Z_RUNUP) * t0;
        if (penTimer >= 0.5) penPhase = 1;
      }
      if (penPhase === 1 && penTimer >= 1.5) { penPhase = 2; }
      if (penPhase === 2) {
        // Ball flight + keeper dive are both a bit quicker than a literal
        // real-time penalty so the strike reads as sharp/decisive rather than
        // floaty (PEN_KICK_DUR/PEN_DIVE_DUR below).
        var prog = clamp((penTimer - 1.5) / PEN_KICK_DUR, 0, 1);
        // Saved shots converge exactly on the keeper. Goals carry JUST past the
        // goal line - less than the net's drawn depth (~0.084 zoomed) so the
        // ball visibly lands inside the net graphic, not past it. Misses carry
        // further past (and their Y is already outside the goal mouth) so they
        // read as clearly wide rather than a graze off the frame.
        var overshoot = b._penResult === "goal" ? 0.05 : 0.12;
        var endX = b._penResult === "saved" ? PEN_Z_KEEPER : PEN_Z_GOAL + overshoot;
        ball.x = PEN_Z_SPOT + (endX - PEN_Z_SPOT) * prog;
        ball.y = 0.5 + (b._targetY - 0.5) * prog;
        if (keeper) {
          var dp = clamp((penTimer - 1.5) / PEN_DIVE_DUR, 0, 1);
          keeper.pos.y = 0.5 + (b._keeperTargetY - 0.5) * dp;
        }
        if (penTimer >= 1.5 + PEN_KICK_DUR) { penPhase = 3; dwell = 1.1; }
      }
      if (penPhase === 3) { penGoalFlash = Math.min(1, penGoalFlash + dt * 6); }
    }

    function enterBeat(i) {
      bi = i;
      if (i >= tl.beats.length) return finish();
      var b = tl.beats[i];
      setBanner(b);

      if (b.kind === "kickoff") { initPlayers(true); ball.x = 0.5; ball.y = 0.5; ball.moving = false; ball.dribble = false; ball.carrier = null; dwell = 0.5; return; }
      if (b.kind === "fulltime") { ball.moving = false; ball.dribble = false; dwell = 1.0; return; }

      if (b.kind === "penalty_intro") {
        penaltyMode = true; penKickBeat = b; penPhase = 0; penTimer = 0; penGoalFlash = 0;
        dwell = 2.2; return;
      }
      if (b.kind === "penalty_kick") {
        penaltyMode = true; penKickBeat = b; penPhase = 0; penTimer = 0; penGoalFlash = 0; dwell = 0;

        // Compute + cache the kick's geometry once (not per-frame, so nothing
        // jitters), directly in the zoomed camera space (goal always at X=1).
        // On-target aims land inside the goal mouth; a "missed" aim is pushed
        // outside it, so the ball only ever crosses the line when _penResult
        // is "goal".
        if (b._targetY == null) {
          var atk = b._penSide, def = atk === "A" ? "B" : "A";
          b._atk = atk; b._def = def;
          var aim = b._penAim != null ? b._penAim : 0.5;
          if (b._penResult === "missed") {
            var sign = aim < 0.5 ? -1 : 1;
            b._targetY = 0.5 + sign * (PEN_GOAL_HALF + 0.045 + Math.abs(aim - 0.5) * 0.14);
          } else {
            b._targetY = 0.5 + (aim - 0.5) * PEN_GOAL_HALF * 2 * 0.82;
          }
          if (b._penResult === "saved") {
            b._keeperTargetY = b._targetY;
          } else if (b._penResult === "goal") {
            // Commit fully to a side, clearly AWAY from where the shot ends
            // up - a plain mirror around center used to collapse back near
            // the ball's own target for a near-central shot, which made the
            // goal look like it went straight through the keeper's dive.
            var awaySide = b._targetY >= 0.5 ? -1 : 1;
            b._keeperTargetY = 0.5 + awaySide * PEN_GOAL_HALF * (0.85 + aim * 0.4);
          } else {
            b._keeperTargetY = 0.5 + (b._targetY - 0.5) * 0.3;
          }
        }

        b._kickerObj = playerByName(b._atk, b._kickerName);
        b._keeperObj = playersOf(b._def).filter(function (p) { return p.ptype === "GK"; })[0] || null;
        if (b._kickerObj) { b._kickerObj.pos.x = PEN_Z_RUNUP; b._kickerObj.pos.y = 0.5; }
        if (b._keeperObj) { b._keeperObj.pos.x = PEN_Z_KEEPER; b._keeperObj.pos.y = 0.5; }
        ball.x = PEN_Z_SPOT; ball.y = 0.5; ball.moving = false; ball.dribble = false; ball.carrier = null;
        return;
      }

      if (b.kind === "cornerSetup" || b.kind === "goalkickSetup") {
        // Dead-ball restart: the ball ROLLS to the restart spot (it's being
        // placed/carried back) while both teams drop into position - it never
        // snaps there. The slow roll + long dwell is exactly the "everyone
        // backs up while the keeper readies it" beat of a real restart.
        var spot = b.kind === "goalkickSetup"
          ? { x: b.posSide === "A" ? 0.13 : 0.87, y: 0.5 }
          : { x: b.ball.x, y: b.ball.y };
        ball.dribble = false; ball.carrier = null;
        ball.p0 = { x: ball.x, y: ball.y }; ball.p2 = spot;
        ball.p1 = { x: (ball.x + spot.x) / 2, y: (ball.y + spot.y) / 2 };
        ball.len = Math.hypot(spot.x - ball.x, spot.y - ball.y) || 0.001;
        ball.speed = 0.34 * fieldScale; ball.u = 0; ball.t = 0;
        ball.moving = ball.len > 0.02;
        b._formation = true; dwell = b.kind === "cornerSetup" ? 1.5 : 1.3; return;
      }

      if (b.kind === "goalkick") {
        var gk = playersOf(b.posSide).filter(function (p) { return p.ptype === "GK"; })[0];
        if (gk) { ball.x = gk.pos.x; ball.y = gk.pos.y; }
      }

      ball.carrier = null; b._recv = null; b._shooter = null; b._preShot = false;

      if (b.kind === "dribble") {
        if (b._carrier != null) ball.carrier = playerByIdx(b.posSide, b._carrier);
        else ball.carrier = nearest(playersOf(b.posSide).filter(function (p) { return p.ptype !== "GK"; }), { x: ball.x, y: ball.y });
      } else if (/^(shot|goal|miss|postHit)$/.test(b.kind)) {
        var idx = (b._scorerIdx != null) ? b._scorerIdx : b._shooterIdx;
        if (idx != null) b._shooter = playerByIdx(b.posSide, idx);
        if (!b._shooter) {
          var pool = playersOf(b.posSide).filter(function (p) { return p.ptype === "FWD" || p.ptype === "MID"; });
          if (!pool.length) pool = playersOf(b.posSide).filter(function (p) { return p.ptype !== "GK"; });
          b._shooter = nearest(pool, { x: b.ball.x, y: b.ball.y });
        }
        b._preShot = !!b._shooter;
      } else {
        b._recv = pickReceiver(b);
      }
      startBall(b);
    }

    function startBall(b) {
      ball.p0 = { x: ball.x, y: ball.y };
      var tgt = { x: b.ball.x, y: b.ball.y };
      if (b.kind === "goal") tgt = { x: b.posSide === "A" ? 1.04 : -0.04, y: clamp(b.ball.y, 0.44, 0.56) };
      ball.p2 = tgt;
      var dx = ball.p2.x - ball.p0.x, dy = ball.p2.y - ball.p0.y, len = Math.hypot(dx, dy) || 0.001;
      // Ground passes travel in a straight line - only kicks that actually
      // swerve in real football (crosses, shots, longer punted balls) get any
      // bend, and its direction is the per-kick _curveDir baked in at
      // generation time (see add() in generate()), never something
      // coincidental like the clock - so the ball only ever changes direction
      // because of what THIS kick actually was, not an unrelated pattern.
      var curve = b.kind === "pass" ? 0 : b.kind === "cross" ? 0.10 : (b.kind === "shot" || b.kind === "goal" || b.kind === "postHit") ? 0.04 : (len > 0.4 ? 0.06 : 0.015);
      curve *= (b._curveDir || 1);
      ball.p1 = { x: (ball.p0.x + ball.p2.x) / 2 - dy / len * curve, y: (ball.p0.y + ball.p2.y) / 2 + dx / len * curve };
      ball.len = len; ball.speed = speedFor(b.kind) * fieldScale; ball.u = 0; ball.t = 0;
      ball.dribble = (b.kind === "dribble"); ball.moving = !ball.dribble; dwell = 0;
    }

    function onArrive() {
      var b = tl.beats[bi];
      if (b.kind === "goal") return celebrate(b);
      // Per-outcome pause once the ball gets there, so each moment actually
      // registers instead of the next kick launching within a frame or two.
      // The ONE exception is postHit: the rebound beat must fire immediately,
      // because a ball pinging off the post doesn't pause on the woodwork -
      // that instant ricochet (into a decelerating postBounce roll) is what
      // makes a post shot read as physics instead of a teleport.
      var DWELL = {
        postHit: 0.03,      // ricochet - the bounce IS the next beat
        save: 0.95,         // keeper gathers / it's dead, let it land
        miss: 0.9,          // ball rolls out, dead-ball beat
        postBounce: 0.75,   // loose ball settles after the rebound
        parry: 0.45,        // spilled - still live, but a beat of scramble
        tackle: 0.55, goalkick: 0.6, blockOut: 0.5,
        deflectOut: 0.35,   // it's gone behind - brief beat before the corner is set
        corner: 0.15,       // delivery is met quickly - that's real
      };
      dwell = DWELL[b.kind] != null ? DWELL[b.kind] : 0.2;
    }

    function celebrate(b) {
      celebrating = true; celebrateUntil = performance.now() + 2000; flash = 1;
      if (root.CC_NATIVE) root.CC_NATIVE.haptic(b.posSide === "A" ? "success" : "light");
      var who = b.scorer ? lastName(b.scorer.name) : "";
      if (overlay) {
        overlay.style.setProperty("--goalcol", b.posSide === "A" ? colorA : colorB);
        overlay.innerHTML = '<div class="go-big">GOAL!</div>' + (who ? '<div class="go-name">' + who + "</div>" : "") +
          '<div class="go-min">' + (b.scorer ? b.scorer.minute : b.minute) + "'</div>";
        overlay.classList.add("show");
      }
    }

    function loop(now) {
      if (finished) return;
      try {
        var dt = Math.min(0.05, (now - last) / 1000); last = now; frameDt = dt;
        if (celebrating) {
          flash = Math.max(0, flash - 0.02);
          if (now > celebrateUntil) {
            celebrating = false; if (overlay) overlay.classList.remove("show");
            initPlayers(true); ball.x = 0.5; ball.y = 0.5; ball.moving = false; ball.carrier = null; enterBeat(bi + 1);
          }
          draw(); raf = requestAnimationFrame(loop); return;
        }
        if (penaltyMode) {
          updatePenalty(dt);
          if (dwell > 0) { dwell -= dt; if (dwell <= 0) { penaltyMode = false; enterBeat(bi + 1); } }
          draw(); raf = requestAnimationFrame(loop); return;
        }
        updateBall(dt); updatePlayers(dt);
        if (dwell > 0) { dwell -= dt; if (dwell <= 0) enterBeat(bi + 1); }
        draw(); raf = requestAnimationFrame(loop);
      } catch (e) { if (root.console) root.console.error("matchsim loop error:", e); finish(); }
    }

    function updateBall(dt) {
      var b = tl.beats[bi]; if (!b) return;
      ball.t = (ball.t || 0) + dt;

      if (b._formation) {
        // Dead-ball setup: keep rolling the ball to the restart spot (set up
        // in enterBeat); no onArrive here - the setup dwell owns the pause.
        if (ball.moving) {
          ball.u += (ball.speed * dt) / ball.len;
          if (ball.u >= 1) { ball.u = 1; ball.moving = false; ball.x = ball.p2.x; ball.y = ball.p2.y; }
          else { var uf = ball.u, iuf = 1 - uf; ball.x = iuf * iuf * ball.p0.x + 2 * iuf * uf * ball.p1.x + uf * uf * ball.p2.x; ball.y = iuf * iuf * ball.p0.y + 2 * iuf * uf * ball.p1.y + uf * uf * ball.p2.y; }
        }
        return;
      }

      if (b._preShot && b._shooter) {
        var sp = b._shooter.pos;
        var dx = sp.x - ball.x, dy = sp.y - ball.y, d = Math.hypot(dx, dy);
        var pull = Math.min(1, dt * 5);
        ball.x += dx * pull; ball.y += dy * pull;
        if (d < 0.025 || ball.t > 1.0) {
          b._preShot = false;
          ball.p0 = { x: ball.x, y: ball.y };
          var dx2 = ball.p2.x - ball.p0.x, dy2 = ball.p2.y - ball.p0.y, len2 = Math.hypot(dx2, dy2) || 0.001;
          var curve2 = (b.kind === "shot" || b.kind === "goal" || b.kind === "postHit") ? 0.04 : 0.06;
          curve2 *= (b._curveDir || 1);
          ball.p1 = { x: (ball.p0.x + ball.p2.x) / 2 - dy2 / len2 * curve2, y: (ball.p0.y + ball.p2.y) / 2 + dx2 / len2 * curve2 };
          ball.len = len2; ball.u = 0; ball.t = 0; ball.moving = true;
        }
        return;
      }

      if (ball.dribble && ball.carrier) {
        var off = adir(b.posSide) * 0.022;
        ball.x = ball.carrier.pos.x + off; ball.y = ball.carrier.pos.y;
        if ((d2({ x: ball.carrier.pos.x, y: ball.y }, b.ball) < 0.0016 || ball.t > 2.4) && dwell <= 0) { ball.dribble = false; onArrive(); }
        return;
      }
      if (ball.moving && b._recv) {
        // Ease the ball up over the last stretch into the receiver's feet -
        // a real ground pass arrives slower than it left the boot.
        var tg = b._recv.pos, dx3 = tg.x - ball.x, dy3 = tg.y - ball.y, d3 = Math.hypot(dx3, dy3) || 1e-4;
        var step = ball.speed * (d3 < 0.14 ? (0.55 + 0.45 * d3 / 0.14) : 1) * dt;
        if (d3 <= step + 0.02 || ball.t > 3.2) { ball.x = tg.x; ball.y = tg.y; ball.moving = false; onArrive(); }
        else { ball.x += dx3 / d3 * step; ball.y += dy3 / d3 * step; }
        return;
      }
      if (ball.moving) {
        ball.u += (ball.speed * ballEase(b.kind, ball.u) * dt) / ball.len;
        if (ball.u >= 1) { ball.u = 1; ball.moving = false; ball.x = ball.p2.x; ball.y = ball.p2.y; onArrive(); }
        else { var u = ball.u, iu = 1 - u; ball.x = iu * iu * ball.p0.x + 2 * iu * u * ball.p1.x + u * u * ball.p2.x; ball.y = iu * iu * ball.p0.y + 2 * iu * u * ball.p1.y + u * u * ball.p2.y; }
      }
    }

    function updatePlayers(dt) {
      var b = tl.beats[bi]; if (!b) return;

      var sp = setpieceTargets(b);
      if (sp) {
        players.forEach(function (p) {
          var t = sp[p.side + p.idx];
          if (t) steer(p, t.x, t.y, 0.40, dt);
        });
        return;
      }

      var poss = b.posSide, def = poss === "A" ? "B" : "A";
      var bp = { x: ball.x, y: ball.y };
      var dfO = playersOf(def).filter(function (p) { return p.ptype !== "GK"; })
        .sort(function (a, c) { return d2(a.pos, bp) - d2(c.pos, bp); });

      players.forEach(function (p) {
        if (p.ptype === "GK") {
          var gx = ownGoalX(p.side);
          var tx = gx + adir(p.side) * 0.025;
          var ty = clamp(0.5 + (ball.y - 0.5) * 0.55, 0.36, 0.64);
          if (def === p.side && /^(shot|goal|save|postHit)$/.test(b.kind)) {
            tx = gx + adir(p.side) * 0.05;
            ty = clamp(ball.y, 0.32, 0.68);
          }
          return steer(p, tx, ty, 0.32, dt);
        }

        if (p.side === poss) {
          if (p === ball.carrier) return steer(p, b.ball.x, b.ball.y, 0.22, dt);
          if (p === b._recv)      return steer(p, b.ball.x, b.ball.y, 0.30, dt);
          if (p === b._shooter && b._preShot) return steer(p, ball.x, ball.y, 0.34, dt);
          // Off-ball teammates shift as a block toward wherever the ball
          // actually is (not just hold their static formation lane) so the
          // whole side looks involved in the play, not just the 2-3 players
          // directly touching it.
          var ahead = p.ptype === "FWD" ? 0.30 : p.ptype === "MID" ? 0.05 : -0.28;
          var tx2 = clamp(p.pos0.x + ahead * adir(poss) * 0.6 + (ball.x - 0.5) * 0.32, 0.06, 0.94);
          var ty2 = clamp(p.pos0.y * 0.78 + ball.y * 0.22, 0.06, 0.94);
          return steer(p, tx2, ty2, p.ptype === "FWD" ? 0.23 : 0.19, dt);
        }

        var rank = dfO.indexOf(p);
        if (rank === 0) return steer(p, ball.x, ball.y, 0.34, dt);
        if (rank === 1) return steer(p, (ball.x + ownGoalX(p.side)) / 2, ball.y, 0.24, dt);
        // Rest of the defensive block shifts across too - real defending is a
        // shape that slides with the ball, not six players frozen in a grid.
        var back = p.ptype === "DEF" ? 0.22 : 0.08;
        var tx3 = clamp(p.pos0.x - back * adir(p.side) + (ball.x - 0.5) * 0.22, 0.06, 0.94);
        var ty3 = clamp(p.pos0.y * 0.80 + ball.y * 0.20, 0.06, 0.94);
        return steer(p, tx3, ty3, 0.19, dt);
      });

      // Gentle separation: when several players converge on the same spot
      // (goalmouth scrambles, corners), nudge overlapping pairs apart so the
      // action near goal stays readable instead of collapsing into one blob.
      // Keepers are never displaced - they own their line.
      var MIN_SEP = 0.034;
      for (var i = 0; i < players.length; i++) {
        for (var j = i + 1; j < players.length; j++) {
          var pa = players[i], pb = players[j];
          var sdx = pb.pos.x - pa.pos.x, sdy = pb.pos.y - pa.pos.y;
          var sd = Math.hypot(sdx, sdy);
          if (sd <= 0 || sd >= MIN_SEP) continue;
          var nx = sdx / sd, ny = sdy / sd, push = (MIN_SEP - sd);
          var aFixed = pa.ptype === "GK", bFixed = pb.ptype === "GK";
          if (!aFixed) {
            var aShare = bFixed ? push : push / 2;
            pa.pos.x = clamp(pa.pos.x - nx * aShare, 0.03, 0.97);
            pa.pos.y = clamp(pa.pos.y - ny * aShare, 0.06, 0.94);
          }
          if (!bFixed) {
            var bShare = aFixed ? push : push / 2;
            pb.pos.x = clamp(pb.pos.x + nx * bShare, 0.03, 0.97);
            pb.pos.y = clamp(pb.pos.y + ny * bShare, 0.06, 0.94);
          }
        }
      }
    }

    function steer(p, tx, ty, maxSp, dt) {
      var dx = tx - p.pos.x, dy = ty - p.pos.y, d = Math.hypot(dx, dy) || 0.0001;
      var want = Math.min(maxSp, d * 3.0);
      p.vel.x += (dx / d * want - p.vel.x) * 0.18;
      p.vel.y += (dy / d * want - p.vel.y) * 0.18;
      p.pos.x = clamp(p.pos.x + p.vel.x * dt, 0.03, 0.97);
      p.pos.y = clamp(p.pos.y + p.vel.y * dt, 0.06, 0.94);
    }

    function getDisplayMinute() {
      if (bi < 0 || bi >= tl.beats.length) return 0;
      var b = tl.beats[bi];
      if (bi + 1 >= tl.beats.length) return Math.min(90, b.minute);
      var nb = tl.beats[bi + 1];
      if (nb.minute <= b.minute) return Math.min(90, b.minute);
      var animDur = Math.max(0.4, (b.dur || 400) / 1000);
      var prog = clamp((ball.t || 0) / (animDur + 0.25), 0, 1);
      return Math.min(90, Math.round(b.minute + (nb.minute - b.minute) * prog));
    }

    function drawBall() {
      var bx = sx(ball.x, ball.y), by = sy(ball.x, ball.y);
      ctx.beginPath(); ctx.arc(bx, by, 5.5, 0, 7); ctx.fillStyle = "#fff";
      ctx.shadowColor = "rgba(0,0,0,.5)"; ctx.shadowBlur = 6; ctx.fill(); ctx.shadowBlur = 0;
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      if (penaltyMode) {
        drawPenaltyScene();
        drawBall();
        drawPenaltyBoard();
        drawHud();
        return;
      }
      drawPitch();
      players.forEach(drawPlayer);
      if (flash > 0) { ctx.fillStyle = "rgba(255,210,74," + (flash * 0.3) + ")"; ctx.fillRect(0, 0, W, H); if (!celebrating) flash = Math.max(0, flash - 0.03); }
      drawBall();
      // Goal netting painted AFTER the ball so a ball in/near the goal mouth
      // reads as tucking IN BEHIND the frame, not floating on top of it.
      drawGoalOverlay();
      drawHud();
      if (banner && bannerT > 0 && !celebrating) { drawBanner(banner, bannerIcon, bannerT); bannerT = Math.max(0, bannerT - frameDt * 0.7); }
    }

    function drawPlayer(p) {
      var x = sx(p.pos.x, p.pos.y), y = sy(p.pos.x, p.pos.y), isGK = p.ptype === "GK";
      ctx.beginPath(); ctx.arc(x, y, isGK ? 8.5 : 9.5, 0, 7);
      ctx.fillStyle = isGK ? "#13314a" : (p.side === "A" ? colorA : colorB);
      ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.stroke();
      ctx.fillStyle = isGK ? "#cfe8ff" : "rgba(4,20,12,.9)";
      ctx.font = "700 9px Inter, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(isGK ? "GK" : lastName(squads[p.side][p.idx].n).slice(0, 3), x, y);
    }

    // Cover-crops `img` into the dest rect like CSS object-fit:cover - fills
    // completely on any aspect ratio without distorting the source. Returns
    // false (drawing nothing) while the image is still loading, so callers
    // can fall back to a plain fill rather than flashing a blank/broken frame.
    function drawCoverImage(img, dx, dy, dw, dh) {
      if (!img || !img.complete || !img.naturalWidth) return false;
      var iw = img.naturalWidth, ih = img.naturalHeight;
      var scale = Math.max(dw / iw, dh / ih);
      var sw = dw / scale, sh = dh / scale;
      ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, dx, dy, dw, dh);
      return true;
    }

    function drawPitch() {
      var fw = FR - FL, fh = FB - FT;
      ctx.save();
      ctx.filter = skinPal.filter || "none";
      var drew;
      if (vertical) {
        // The real field photo is landscape (pitch length running left-right).
        // In portrait/vertical layout the pitch's LENGTH runs top-to-bottom on
        // screen (see sx/sy above), so draw the same image rotated 90 into a
        // landscape-shaped rect in the rotated space - it lands portrait on screen.
        ctx.save();
        ctx.translate(FL + fw / 2, FT + fh / 2);
        ctx.rotate(Math.PI / 2);
        drew = drawCoverImage(FIELD_IMG, -fh / 2, -fw / 2, fh, fw);
        ctx.restore();
      } else {
        drew = drawCoverImage(FIELD_IMG, FL, FT, fw, fh);
      }
      ctx.restore();
      if (!drew) {
        // Fallback while FIELD_IMG is still loading (or failed to load).
        var g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, "#16542f"); g.addColorStop(1, "#103f24");
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }
      if (skinPal.tint) {
        ctx.save();
        ctx.globalCompositeOperation = "overlay";
        ctx.fillStyle = skinPal.tint;
        ctx.fillRect(FL, FT, fw, fh);
        ctx.restore();
      }
      if (skinPal.scanlines) {
        ctx.save();
        ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.lineWidth = 1;
        for (var sl = FT; sl < FB; sl += 3) { ctx.beginPath(); ctx.moveTo(FL, sl); ctx.lineTo(FR, sl); ctx.stroke(); }
        ctx.restore();
      }
      ctx.strokeStyle = skinPal.line; ctx.lineWidth = 2;
      ctx.fillStyle = skinPal.stripe;

      if (vertical) {
        for (var s = 0; s < 10; s++) if (s % 2) ctx.fillRect(FL, FT + (s / 10) * fh, fw, fh / 10);
        ctx.strokeRect(FL, FT, fw, fh);
        ctx.beginPath(); ctx.moveTo(FL, FT + 0.5 * fh); ctx.lineTo(FR, FT + 0.5 * fh); ctx.stroke();
        ctx.beginPath(); ctx.arc(FL + 0.5 * fw, FT + 0.5 * fh, fw * 0.16, 0, 7); ctx.stroke();
        ctx.strokeRect(FL + fw * 0.26, FT, fw * 0.48, fh * 0.13);
        ctx.strokeRect(FL + fw * 0.26, FB - fh * 0.13, fw * 0.48, fh * 0.13);
        ctx.strokeRect(FL + fw * 0.38, FT, fw * 0.24, fh * 0.05);
        ctx.strokeRect(FL + fw * 0.38, FB - fh * 0.05, fw * 0.24, fh * 0.05);
        [[FL, FT], [FR, FT], [FL, FB], [FR, FB]].forEach(function (c) {
          ctx.beginPath(); ctx.arc(c[0], c[1], 7, 0, 7); ctx.stroke();
        });
        var gd = Math.max(10, fh * 0.035), gx1 = FL + fw * 0.42, gx2 = FL + fw * 0.58;
        ctx.fillStyle = "rgba(255,255,255,.16)"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2.5;
        ctx.fillRect(gx1, FT - gd, gx2 - gx1, gd); ctx.strokeRect(gx1, FT - gd, gx2 - gx1, gd);
        ctx.fillRect(gx1, FB, gx2 - gx1, gd); ctx.strokeRect(gx1, FB, gx2 - gx1, gd);
      } else {
        for (var s2 = 0; s2 < 10; s2++) if (s2 % 2) ctx.fillRect(px(s2 / 10), FT, fw / 10, fh);
        ctx.strokeRect(FL, FT, fw, fh);
        ctx.beginPath(); ctx.moveTo(px(0.5), FT); ctx.lineTo(px(0.5), FB); ctx.stroke();
        ctx.beginPath(); ctx.arc(px(0.5), py(0.5), fh * 0.13, 0, 7); ctx.stroke();
        ctx.strokeRect(FL, py(0.26), fw * 0.13, fh * 0.48);
        ctx.strokeRect(FR - fw * 0.13, py(0.26), fw * 0.13, fh * 0.48);
        ctx.strokeRect(FL, py(0.38), fw * 0.05, fh * 0.24);
        ctx.strokeRect(FR - fw * 0.05, py(0.38), fw * 0.05, fh * 0.24);
        [[FL, FT, 1, 1], [FR, FT, -1, 1], [FL, FB, 1, -1], [FR, FB, -1, -1]].forEach(function (c) {
          ctx.beginPath(); ctx.arc(c[0], c[1], 7, 0, 7); ctx.stroke();
        });
        var gd2 = Math.max(10, fw * 0.045), gy1 = py(0.42), gy2 = py(0.58);
        ctx.fillStyle = "rgba(255,255,255,.16)"; ctx.lineWidth = 2.5; ctx.strokeStyle = "#fff";
        ctx.fillRect(FL - gd2, gy1, gd2, gy2 - gy1); ctx.strokeRect(FL - gd2, gy1, gd2, gy2 - gy1);
        ctx.fillRect(FR, gy1, gd2, gy2 - gy1); ctx.strokeRect(FR, gy1, gd2, gy2 - gy1);
      }
    }

    // Real goal-frame art, drawn in the same footprint as the vector goal
    // boxes above but AFTER the ball (see draw()) so a ball entering the net
    // reads as going in BEHIND the frame - the depth cue the flat vector
    // goal box never had. No-ops silently until GOAL_IMG finishes loading.
    function drawGoalOverlay() {
      if (!GOAL_IMG.complete || !GOAL_IMG.naturalWidth) return;
      var fw = FR - FL, fh = FB - FT;
      if (vertical) {
        var gd = Math.max(10, fh * 0.035) * 2.2, gx1 = FL + fw * 0.42, gx2 = FL + fw * 0.58, gw = gx2 - gx1;
        ctx.drawImage(GOAL_IMG, gx1, FT - gd, gw, gd);
        // Bottom goal faces the opposite way - flip vertically so the open
        // net still reads as facing INTO the pitch, not out the back wall.
        ctx.save();
        ctx.translate(gx1, FB + gd); ctx.scale(1, -1);
        ctx.drawImage(GOAL_IMG, 0, 0, gw, gd);
        ctx.restore();
      } else {
        var gd2 = Math.max(10, fw * 0.045) * 2.2, gy1 = py(0.42), gy2 = py(0.58), gh = gy2 - gy1;
        ctx.save();
        ctx.translate(FL - gd2, gy1); ctx.rotate(Math.PI / 2);
        ctx.drawImage(GOAL_IMG, 0, 0, gh, gd2);
        ctx.restore();
        ctx.save();
        ctx.translate(FR + gd2, gy2); ctx.rotate(-Math.PI / 2);
        ctx.drawImage(GOAL_IMG, 0, 0, gh, gd2);
        ctx.restore();
      }
    }

    function drawHud() {
      // The live score/minute now live in the DOM notch above the canvas
      // (see .sim-notch--top), not painted on the canvas itself.
      var beat = tl.beats[Math.max(0, Math.min(bi, tl.beats.length - 1))];
      // Minute clock is meaningless once penalties start (frozen at 90'+) -
      // report null so the caller can blank it out.
      onTick({ scoreA: beat.scoreA, scoreB: beat.scoreB, minute: penaltyMode ? null : getDisplayMinute() });
    }

    function drawBanner(text, icon, a) {
      var alpha = clamp(a, 0, 1);
      ctx.globalAlpha = alpha;
      var label = (icon ? icon + "  " : "") + text;
      ctx.font = "800 14px Archivo, Inter, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      var w = ctx.measureText(label).width + 28;
      var x = W / 2 - w / 2, y = Math.max(50, FT - 22);
      ctx.fillStyle = "rgba(20,40,28,.92)";
      ctx.strokeStyle = "rgba(255,210,74,.9)"; ctx.lineWidth = 1.5;
      roundRect(ctx, x, y, w, 28, 14); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#ffd24a"; ctx.fillText(label, W / 2, y + 14);
      ctx.globalAlpha = 1;
    }

    function roundRect(c, x, y, w, h, r) {
      c.beginPath();
      c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
      c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
      c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y);
    }

    resize();
    root.addEventListener("resize", resize);
    return {
      start: start,
      skip: finish,
      destroy: function () { if (raf) cancelAnimationFrame(raf); root.removeEventListener("resize", resize); if (overlay) overlay.classList.remove("show"); finished = true; }
    };
  }

  var API = { create: create, generate: generate };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.CC_MATCHSIM = API;
})(typeof window !== "undefined" ? window : globalThis);
