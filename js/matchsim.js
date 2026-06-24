/* ============================================================================
 * CLUB CHAMPION — Match Simulation (head-to-head)
 * ----------------------------------------------------------------------------
 * Two layers:
 *  1) generate(): a SEEDED timeline of timed "beats" (passes, dribbles, shots,
 *     saves, corners, headers, free-kicks, tackles…) that resolves to EXACTLY
 *     the precomputed scoreline from ENGINE.playMatch(). Variety comes from a
 *     library of randomly-chosen sequence templates, so no two games look alike.
 *     Per-player match stats fall out as a byproduct.
 *  2) a canvas renderer that tweens the ball + 7-a-side player circles between
 *     beats with easing — running clock, live score, goal/save FX, and a Skip
 *     button. The score is precomputed, so the animation can never desync.
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
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function shuffle(arr, rand) {
    arr = arr.slice();
    for (var i = arr.length - 1; i > 0; i--) { var j = Math.floor(rand() * (i + 1)); var t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
    return arr;
  }
  function lastName(n) { var p = (n || "").replace(/\(alt\)/, "").trim().split(" "); return p[p.length - 1]; }

  function byPos(squad) { var g = { GK: [], DEF: [], MID: [], FWD: [] }; squad.forEach(function (p, i) { g[p.pos].push(i); }); return g; }

  // Normalised pitch position for every player of a side at attacking `phase`
  // (-1 = sat deep, +1 = pushed up). x: 0 = A's goal line, 1 = B's goal line.
  function layout(squad, side, phase) {
    var g = byPos(squad), out = new Array(squad.length);
    var xBase = { GK: 0.06, DEF: 0.25, MID: 0.47, FWD: 0.69 };
    var push = { GK: 0.0, DEF: 0.06, MID: 0.10, FWD: 0.15 };
    ["GK", "DEF", "MID", "FWD"].forEach(function (line) {
      var idxs = g[line], n = idxs.length;
      idxs.forEach(function (idx, k) {
        var x = xBase[line] + push[line] * phase;
        var y = 0.16 + ((k + 1) / (n + 1)) * 0.68;
        if (side === "B") x = 1 - x;
        out[idx] = { x: x, y: y };
      });
    });
    return out;
  }

  /* --------------------------------------------------- timeline generator */
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
    function add(minute, dur, ball, posSide, kind, label, flash) {
      beats.push({ minute: minute, dur: dur, ball: { x: ball.x, y: ball.y }, posSide: posSide,
        kind: kind, label: label, flash: !!flash, scoreA: score.A, scoreB: score.B });
    }

    add(0, 800, { x: 0.5, y: 0.5 }, "A", "kickoff", "Kick-off at " + (result.stadium || "the stadium") + "!", false);

    var nPoss = ri(rand, 26, 34);
    var minutes = []; for (var i = 0; i < nPoss; i++) minutes.push(ri(rand, 2, 89));
    minutes.sort(function (a, b) { return a - b; });
    var pA = atkA / (atkA + atkB);
    var sides = minutes.map(function () { return rand() < pA ? "A" : "B"; });

    function ensure(side, need) {
      var idxs = []; sides.forEach(function (s, k) { if (s === side) idxs.push(k); });
      var j = 0;
      while (idxs.length < need && j < sides.length) { if (sides[j] !== side) { sides[j] = side; idxs.push(j); } j++; }
      return idxs;
    }
    var goalAssign = {};
    shuffle(ensure("A", result.goalsA), rand).slice(0, result.goalsA).forEach(function (k) { goalAssign[k] = "A"; });
    shuffle(ensure("B", result.goalsB), rand).slice(0, result.goalsB).forEach(function (k) { goalAssign[k] = "B"; });

    for (var pIdx = 0; pIdx < nPoss; pIdx++) {
      var side = goalAssign[pIdx] || sides[pIdx];
      buildPossession(side, !!goalAssign[pIdx], minutes[pIdx]);
    }

    // Final whistle beat
    add(90, 1400, { x: 0.5, y: 0.5 }, "A", "fulltime", "Full time", false);

    // ----- ratings from tallies -----
    ["A", "B"].forEach(function (sd) {
      var won = (sd === "A" && result.winner === "A") || (sd === "B" && result.winner === "B");
      stats[sd].forEach(function (s) {
        var r = 6.3 + (s.ovr - 72) * 0.03 + s.goals * 0.9 + s.assists * 0.55 + s.saves * 0.06 + s.tackles * 0.08 + (won ? 0.25 : -0.1);
        s.rating = Math.round(clamp(r, 5.3, 9.8) * 10) / 10;
      });
    });

    return { beats: beats, stats: stats, scorers: scorers, result: result };

    // ---- possession builder (closure over the above) ----
    function buildPossession(side, isGoal, minute) {
      var def = side === "A" ? "B" : "A";
      var g = groups[side], dg = groups[def];
      var st = stats[side], dst = stats[def];

      // 1) build-up: 1-3 passes among defenders/midfielders
      var nPass = ri(rand, 1, 3);
      var carriers = shuffle(g.DEF.concat(g.MID), rand);
      var last = null;
      for (var k = 0; k < nPass; k++) {
        var who = carriers[k % carriers.length];
        var pp = posOf(side, who, 0.2 + 0.2 * k);
        add(minute, ri(rand, 300, 460), pp, side, "pass", null, false);
        st[who].touches++; st[who].passes++; last = who;
      }

      // 2) a final-action template
      if (isGoal) finishGoal(); else finishNoGoal();

      function attacker(weightFn) {
        var pool = g.FWD.concat(g.MID);
        return wRand(rand, pool, weightFn || function (i) { return Math.pow(squads[side][i].r.at, 2); });
      }
      function gkIdx(sd) { return groups[sd].GK[0]; }

      function finishGoal() {
        var type = pick(rand, ["through", "through", "cross", "cross", "solo", "freekick", "penalty"]);
        var scorer, assist = last, lbl;
        if (type === "cross") {
          var winger = pick(rand, g.MID.concat(g.FWD));
          var wp = posOf(side, winger, 1); wp = { x: wp.x, y: side === "A" ? 0.9 : 0.9 };
          add(minute, 420, posOf(side, winger, 1), side, "pass", "Out to the wing…", false);
          st[winger].touches++; st[winger].passes++; assist = winger;
          add(minute, 360, { x: side === "A" ? 0.86 : 0.14, y: 0.86 }, side, "cross", "Whipped in…", false);
          scorer = attacker(function (i) { return Math.pow(squads[side][i].r.ph, 2) * (squads[side][i].pos === "FWD" ? 2 : 1); });
          add(minute, 520, goalMouth(side, rand, false), side, "goal", lbl = headerOrFinish(true), true);
        } else if (type === "solo") {
          scorer = attacker(function (i) { return Math.pow(squads[side][i].r.at, 2.2); });
          add(minute, 460, posOf(side, scorer, 1), side, "dribble", "Jinks past one…", false);
          st[scorer].touches++;
          add(minute, 480, goalMouth(side, rand, false), side, "goal", "GOAL! A brilliant solo finish!", true);
          assist = null;
        } else if (type === "penalty") {
          add(minute, 700, { x: side === "A" ? 0.85 : 0.15, y: 0.5 }, side, "foul", "Penalty given!", false);
          scorer = attacker(function (i) { return Math.pow(squads[side][i].r.at, 2); });
          add(minute, 600, goalMouth(side, rand, false), side, "goal", "GOAL! Tucked away from the spot.", true);
          assist = null;
        } else if (type === "freekick") {
          add(minute, 700, { x: side === "A" ? 0.78 : 0.22, y: 0.5 }, side, "foul", "Free-kick in a dangerous spot…", false);
          scorer = attacker(function (i) { return Math.pow(squads[side][i].r.cr, 2); });
          add(minute, 560, goalMouth(side, rand, false), side, "goal", "GOAL! Curled into the top corner!", true);
          assist = null;
        } else { // through ball
          add(minute, 380, { x: side === "A" ? 0.7 : 0.3, y: clamp(0.5 + (rand() - 0.5) * 0.5, 0.2, 0.8) }, side, "pass", "Threaded through!", false);
          scorer = attacker();
          add(minute, 460, goalMouth(side, rand, false), side, "goal", "GOAL! Clinical finish!", true);
        }
        score[side]++;
        st[scorer].touches++; st[scorer].shots++; st[scorer].goals++;
        scorers[side].push({ name: scorer != null ? squads[side][scorer].n : "", minute: minute, type: type });
        if (assist != null && assist !== scorer) st[assist].assists++;
        // overwrite the just-pushed goal beat's running score so it shows the new score
        beats[beats.length - 1].scoreA = score.A; beats[beats.length - 1].scoreB = score.B;
      }

      function headerOrFinish(goal) {
        return goal ? pick(rand, ["GOAL! Towering header!", "GOAL! Headed home at the back post!", "GOAL! Tap-in from the cross!"]) : "Header just wide.";
      }

      function finishNoGoal() {
        var type = pick(rand, ["save", "save", "miss", "block", "corner", "tackle", "tackle", "post", "offside"]);
        var shooter = attacker();
        if (type === "save") {
          add(minute, 360, posOf(side, shooter, 1), side, "shot", "Shot!", false);
          st[shooter].touches++; st[shooter].shots++;
          add(minute, 500, goalMouth(side, rand, false), side, "save", pick(rand, ["Great save!", "Tipped over!", "Keeper holds it."]), false);
          dst[gkIdx(def)].saves++;
        } else if (type === "miss") {
          add(minute, 380, posOf(side, shooter, 1), side, "shot", "Shoots…", false);
          st[shooter].touches++; st[shooter].shots++;
          add(minute, 430, goalMouth(side, rand, true), side, "miss", pick(rand, ["Just wide!", "Over the bar!", "Inches off target."]), false);
        } else if (type === "post") {
          add(minute, 380, posOf(side, shooter, 1), side, "shot", "Lets fly…", false);
          st[shooter].touches++; st[shooter].shots++;
          add(minute, 520, { x: side === "A" ? 0.96 : 0.04, y: 0.62 }, side, "post", "Off the post!!", false);
        } else if (type === "block") {
          add(minute, 360, posOf(side, shooter, 1), side, "shot", "Shot blocked!", false);
          st[shooter].touches++; st[shooter].shots++;
          var blk = pick(rand, dg.DEF); dst[blk].tackles++;
        } else if (type === "corner") {
          add(minute, 600, { x: side === "A" ? 0.985 : 0.015, y: 0.04 }, side, "corner", "Corner kick…", false);
          var head = attacker(function (i) { return squads[side][i].r.ph; });
          var res = pick(rand, ["save", "miss", "miss"]);
          add(minute, 520, res === "save" ? goalMouth(side, rand, false) : goalMouth(side, rand, true), side, res === "save" ? "save" : "miss",
            res === "save" ? "Header saved!" : "Header off target.", false);
          st[head].touches++; st[head].shots++;
          if (res === "save") dst[gkIdx(def)].saves++;
        } else if (type === "offside") {
          add(minute, 420, posOf(side, shooter, 1.1), side, "offside", "Flag's up — offside.", false);
          st[shooter].touches++;
        } else { // tackle / turnover
          var tk = pick(rand, dg.DEF.concat(dg.MID));
          add(minute, 380, posOf(side, pick(rand, g.MID.concat(g.FWD)), 0.6), side, "dribble", null, false);
          add(minute, 360, posOf(def, tk, 0.1), def, "tackle", pick(rand, ["Won back!", "Crunching tackle!", "Intercepted."]), false);
          dst[tk].tackles++;
        }
      }
    }
  }

  /* ----------------------------------------------------------- renderer */
  function create(canvas, opts) {
    opts = opts || {};
    var tl = generate(opts.squadA, opts.squadB, opts.result, opts.seed || 1);
    // Attach each goal's scorer (in generation order) for the celebration callout.
    (function () { var c = { A: 0, B: 0 }; tl.beats.forEach(function (b) { if (b.kind === "goal") b.scorer = tl.scorers[b.posSide][c[b.posSide]++] || { name: "", minute: b.minute }; }); })();

    var ctx = canvas.getContext("2d");
    var colorA = opts.colorA || "#2ee87f", colorB = opts.colorB || "#ff5d73";
    var nameA = opts.teamAName || "Your XI", nameB = opts.teamBName || "CPU";
    var onDone = opts.onDone || function () {};
    var squads = { A: opts.squadA, B: opts.squadB };

    // DOM goal-celebration overlay inside the stage
    var stage = canvas.parentNode || canvas;
    var overlay = stage.querySelector ? stage.querySelector(".goal-overlay") : null;
    if (!overlay && stage.appendChild) { overlay = document.createElement("div"); overlay.className = "goal-overlay"; stage.appendChild(overlay); }

    var W = 0, H = 0, dpr = Math.min(2, root.devicePixelRatio || 1);
    function resize() {
      var rect = canvas.getBoundingClientRect();
      W = rect.width; H = rect.height;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    var PAD = 14;
    function px(x) { return PAD + x * (W - 2 * PAD); }
    function py(y) { return PAD + y * (H - 2 * PAD); }
    function adir(side) { return side === "A" ? 1 : -1; }
    function ownGoalX(side) { return side === "A" ? 0.04 : 0.96; }

    /* ---- player + ball physics state ---- */
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
    function d2(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; }
    function nearest(list, pt) { var best = null, bd = 1e9; list.forEach(function (p) { var d = d2(p.pos, pt); if (d < bd) { bd = d; best = p; } }); return best; }

    var ball = { x: 0.5, y: 0.5, p0: null, p1: null, p2: null, u: 1, len: 1, speed: 0.6, moving: false, dribble: false, dribT: 0, carrier: null };
    function speedFor(k) {
      switch (k) {
        case "goal": case "shot": return 1.9;   // shots are fast
        case "save": return 1.7;
        case "cross": return 0.92;
        case "corner": return 0.85;
        case "pass": return 0.62;                // build-up, slow
        case "dribble": return 0.24;             // carried
        case "kickoff": case "foul": return 1.1;
        default: return 0.78;                    // through balls
      }
    }

    var bi = -1, dwell = 0, celebrating = false, celebrateUntil = 0;
    var banner = null, bannerT = 0, flash = 0, raf = null, last = 0, finished = false;

    function start() { initPlayers(true); last = performance.now(); enterBeat(0); raf = requestAnimationFrame(loop); }
    function finish() { if (finished) return; finished = true; if (raf) cancelAnimationFrame(raf); if (overlay) overlay.classList.remove("show"); onDone({ stats: tl.stats, scorers: tl.scorers }); }

    function enterBeat(i) {
      bi = i;
      if (i >= tl.beats.length) return finish();
      var b = tl.beats[i];
      if (/^(save|post|tackle|corner|foul|offside|miss|kickoff|fulltime)$/.test(b.kind)) { banner = b.label; bannerT = b.label ? 1 : 0; }
      if (b.kind === "kickoff") { initPlayers(true); ball.x = 0.5; ball.y = 0.5; ball.moving = false; ball.dribble = false; ball.carrier = null; dwell = 0.7; return; }
      if (b.kind === "fulltime") { ball.moving = false; ball.dribble = false; dwell = 1.2; return; }
      ball.carrier = (b.kind === "dribble") ? nearest(playersOf(b.posSide).filter(function (p) { return p.ptype !== "GK"; }), { x: ball.x, y: ball.y }) : null;
      startBall(b);
    }

    function startBall(b) {
      ball.p0 = { x: ball.x, y: ball.y };
      ball.p2 = { x: b.ball.x, y: b.ball.y };
      var dx = ball.p2.x - ball.p0.x, dy = ball.p2.y - ball.p0.y, len = Math.hypot(dx, dy) || 0.001;
      var curve = b.kind === "cross" ? 0.12 : (b.kind === "shot" || b.kind === "goal") ? 0.05 : (len > 0.4 ? 0.07 : 0.015);
      curve *= (((b.minute || 1) % 2) ? 1 : -1);   // alternate swerve so paths aren't all straight
      ball.p1 = { x: (ball.p0.x + ball.p2.x) / 2 - dy / len * curve, y: (ball.p0.y + ball.p2.y) / 2 + dx / len * curve };
      ball.len = len; ball.speed = speedFor(b.kind); ball.u = 0; ball.dribT = 0;
      ball.dribble = (b.kind === "dribble"); ball.moving = !ball.dribble; dwell = 0;
    }

    function onArrive() {
      var b = tl.beats[bi];
      if (b.kind === "goal") return celebrate(b);
      dwell = /^(save|corner|foul|post|miss|tackle|offside)$/.test(b.kind) ? 0.45 : 0.12;
    }

    function celebrate(b) {
      celebrating = true; celebrateUntil = performance.now() + 2500; flash = 1;
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
        var dt = Math.min(0.05, (now - last) / 1000); last = now;
        if (celebrating) {
          flash = Math.max(0, flash - 0.02);
          if (now > celebrateUntil) {
            celebrating = false; if (overlay) overlay.classList.remove("show");
            initPlayers(true); ball.x = 0.5; ball.y = 0.5; ball.moving = false; ball.carrier = null; enterBeat(bi + 1);
          }
          draw(); raf = requestAnimationFrame(loop); return;
        }
        updateBall(dt); updatePlayers(dt);
        if (dwell > 0) { dwell -= dt; if (dwell <= 0) enterBeat(bi + 1); }
        draw(); raf = requestAnimationFrame(loop);
      } catch (e) { finish(); }
    }

    function updateBall(dt) {
      var b = tl.beats[bi]; if (!b) return;
      if (ball.dribble && ball.carrier) {                    // ball glued to the dribbler
        ball.x = ball.carrier.pos.x; ball.y = ball.carrier.pos.y; ball.dribT += dt;
        if ((d2({ x: ball.x, y: ball.y }, b.ball) < 0.0016 || ball.dribT > 2.2) && dwell <= 0) { ball.dribble = false; onArrive(); }
        return;
      }
      if (ball.moving) {
        ball.u += (ball.speed * dt) / ball.len;
        if (ball.u >= 1) { ball.u = 1; ball.moving = false; ball.x = ball.p2.x; ball.y = ball.p2.y; onArrive(); }
        else { var u = ball.u, iu = 1 - u; ball.x = iu * iu * ball.p0.x + 2 * iu * u * ball.p1.x + u * u * ball.p2.x; ball.y = iu * iu * ball.p0.y + 2 * iu * u * ball.p1.y + u * u * ball.p2.y; }
      }
    }

    // Role-aware steering: players roam relative to the ball, not glued to formation.
    function updatePlayers(dt) {
      var b = tl.beats[bi]; if (!b) return;
      var poss = b.posSide, def = poss === "A" ? "B" : "A";
      var bp = { x: ball.x, y: ball.y };
      var dfO = playersOf(def).filter(function (p) { return p.ptype !== "GK"; }).sort(function (a, c) { return d2(a.pos, bp) - d2(c.pos, bp); });
      players.forEach(function (p) {
        if (p.ptype === "GK") {
          var gx = ownGoalX(p.side);
          var tx = gx + adir(p.side) * 0.02, ty = clamp(0.5 + (ball.y - 0.5) * 0.5, 0.33, 0.67);
          if (def === p.side && (b.kind === "shot" || b.kind === "goal" || b.kind === "save")) { tx = gx + adir(p.side) * 0.06; ty = clamp(ball.y, 0.35, 0.65); }
          return steer(p, tx, ty, 0.24, dt);
        }
        if (p.side === poss) {
          if (p === ball.carrier) return steer(p, b.ball.x, b.ball.y, 0.2, dt);
          var ahead = p.ptype === "FWD" ? 0.22 : p.ptype === "MID" ? 0.05 : -0.20;
          // hold a WIDTH lane (pos0.y) so the team spreads across the pitch instead of swarming the ball
          return steer(p, clamp(ball.x + ahead * adir(poss), 0.1, 0.9), clamp(p.pos0.y * 0.82 + ball.y * 0.18, 0.08, 0.92), p.ptype === "FWD" ? 0.19 : 0.16, dt);
        }
        var rank = dfO.indexOf(p);
        if (rank === 0) return steer(p, ball.x, ball.y, 0.28, dt);                          // presser closes the ball
        if (rank === 1) return steer(p, (ball.x + ownGoalX(p.side)) / 2, ball.y, 0.22, dt);  // cover drops between ball & goal
        var back = p.ptype === "DEF" ? 0.16 : 0.05;
        return steer(p, clamp(ball.x - back * adir(p.side), 0.08, 0.92), clamp(p.pos0.y * 0.80 + ball.y * 0.20, 0.08, 0.92), 0.16, dt);
      });
    }

    function steer(p, tx, ty, maxSp, dt) {
      var dx = tx - p.pos.x, dy = ty - p.pos.y, d = Math.hypot(dx, dy) || 0.0001;
      var want = Math.min(maxSp, d * 3.0);
      p.vel.x += (dx / d * want - p.vel.x) * 0.18;
      p.vel.y += (dy / d * want - p.vel.y) * 0.18;
      p.pos.x = clamp(p.pos.x + p.vel.x * dt + (Math.random() - 0.5) * 0.0006, 0.03, 0.97);
      p.pos.y = clamp(p.pos.y + p.vel.y * dt + (Math.random() - 0.5) * 0.0006, 0.06, 0.94);
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      drawPitch();
      players.forEach(drawPlayer);
      if (flash > 0) { ctx.fillStyle = "rgba(255,210,74," + (flash * 0.3) + ")"; ctx.fillRect(0, 0, W, H); if (!celebrating) flash = Math.max(0, flash - 0.03); }
      var bx = px(ball.x), by = py(ball.y);
      ctx.beginPath(); ctx.arc(bx, by, 5.5, 0, 7); ctx.fillStyle = "#fff";
      ctx.shadowColor = "rgba(0,0,0,.5)"; ctx.shadowBlur = 6; ctx.fill(); ctx.shadowBlur = 0;
      drawHud(tl.beats[Math.max(0, Math.min(bi, tl.beats.length - 1))]);
      if (banner && bannerT > 0 && !celebrating) { drawBanner(banner, bannerT); bannerT = Math.max(0, bannerT - 0.01); }
    }

    function drawPlayer(p) {
      var x = px(p.pos.x), y = py(p.pos.y), isGK = p.ptype === "GK";
      ctx.beginPath(); ctx.arc(x, y, isGK ? 8.5 : 9.5, 0, 7);
      ctx.fillStyle = isGK ? "#13314a" : (p.side === "A" ? colorA : colorB);
      ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.stroke();
      ctx.fillStyle = isGK ? "#cfe8ff" : "rgba(4,20,12,.9)";
      ctx.font = "700 9px Inter, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(isGK ? "GK" : lastName(squads[p.side][p.idx].n).slice(0, 3), x, y);
    }

    function drawPitch() {
      var g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#15512f"); g.addColorStop(1, "#0f3f25");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // stripes
      ctx.fillStyle = "rgba(255,255,255,.03)";
      for (var s = 0; s < 8; s++) if (s % 2) ctx.fillRect(px(s / 8), 0, (W - 2 * PAD) / 8, H);
      ctx.strokeStyle = "rgba(255,255,255,.25)"; ctx.lineWidth = 2;
      ctx.strokeRect(px(0), py(0), W - 2 * PAD, H - 2 * PAD);
      // halfway + circle
      ctx.beginPath(); ctx.moveTo(px(0.5), py(0)); ctx.lineTo(px(0.5), py(1)); ctx.stroke();
      ctx.beginPath(); ctx.arc(px(0.5), py(0.5), (H - 2 * PAD) * 0.13, 0, 7); ctx.stroke();
      // boxes + goals
      var bh = (H - 2 * PAD), bw = (W - 2 * PAD);
      [[0, 1], [1, -1]].forEach(function (gg) {
        var gx = px(gg[0]);
        ctx.strokeRect(gx - (gg[0] === 0 ? 0 : bw * 0.16), py(0.28), bw * 0.16, bh * 0.44);
        ctx.fillStyle = "rgba(255,255,255,.18)";
        ctx.fillRect(gg[0] === 0 ? px(0) - 3 : px(1) - 1, py(0.4), 4, bh * 0.2);
      });
    }

    function drawHud(beat) {
      // top score bar
      ctx.fillStyle = "rgba(7,20,13,.78)"; ctx.fillRect(0, 0, W, 30);
      ctx.textBaseline = "middle"; ctx.font = "800 14px Archivo, Inter, sans-serif";
      ctx.textAlign = "left"; ctx.fillStyle = colorA; ctx.fillText(nameA, 12, 15);
      ctx.textAlign = "right"; ctx.fillStyle = colorB; ctx.fillText(nameB, W - 12, 15);
      ctx.textAlign = "center"; ctx.fillStyle = "#fff"; ctx.font = "900 16px Archivo, Inter, sans-serif";
      ctx.fillText(beat.scoreA + " - " + beat.scoreB, W / 2, 15);
      ctx.font = "700 11px Inter, sans-serif"; ctx.fillStyle = "#9fcfb4";
      ctx.fillText(Math.min(90, beat.minute) + "'", W / 2, 40);
    }

    function drawBanner(text, a) {
      ctx.globalAlpha = clamp(a, 0, 1);
      ctx.fillStyle = "rgba(7,20,13,.82)";
      ctx.font = "800 15px Archivo, Inter, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      var w = ctx.measureText(text).width + 28;
      ctx.fillRect(W / 2 - w / 2, H - 40, w, 26);
      ctx.fillStyle = "#ffd24a"; ctx.fillText(text, W / 2, H - 27);
      ctx.globalAlpha = 1;
    }

    resize();
    root.addEventListener("resize", resize);
    return {
      start: start,
      skip: finish,
      destroy: function () { if (raf) cancelAnimationFrame(raf); root.removeEventListener("resize", resize); if (overlay) overlay.classList.remove("show"); finished = true; },
    };
  }

  var API = { create: create, generate: generate };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.CC_MATCHSIM = API;
})(typeof window !== "undefined" ? window : globalThis);
