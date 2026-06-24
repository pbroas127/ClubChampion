/* ============================================================================
 * CLUB CHAMPION — Match Simulation (head-to-head)
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

  function byPos(squad) { var g = { GK: [], DEF: [], MID: [], FWD: [] }; squad.forEach(function (p, i) { g[p.pos].push(i); }); return g; }

  // Balanced spread — not edge-hugging, not bunched.
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
    function add(minute, dur, ball, posSide, kind, label, flash) {
      beats.push({ minute: minute, dur: dur, ball: { x: ball.x, y: ball.y }, posSide: posSide,
        kind: kind, label: label, flash: !!flash, scoreA: score.A, scoreB: score.B });
    }

    add(0, 600, { x: 0.5, y: 0.5 }, "A", "kickoff", "Kick-off at " + (result.stadium || "the stadium") + "!", false);

    var nPoss = ri(rand, 20, 26);
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

    add(90, 1000, { x: 0.5, y: 0.5 }, "A", "fulltime", "Full time", false);

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

      var nPass = ri(rand, 1, 3);
      var carriers = shuffle(g.DEF.concat(g.MID), rand);
      var last = null;
      for (var k = 0; k < nPass; k++) {
        var who = carriers[k % carriers.length];
        var pp = posOf(side, who, 0.2 + 0.2 * k);
        add(minute, ri(rand, 320, 460), pp, side, "pass", null, false);
        st[who].touches++; st[who].passes++; last = who;
      }

      if (isGoal) finishGoal(); else finishNoGoal();

      function attacker(weightFn) {
        var pool = g.FWD.concat(g.MID);
        return wRand(rand, pool, weightFn || function (i) { return Math.pow(squads[side][i].r.at, 2); });
      }
      function gkIdx(sd) { return groups[sd].GK[0]; }

      function finishGoal() {
        var type = pick(rand, ["through", "through", "cross", "cross", "solo", "freekick", "penalty"]);
        var scorer, assist = last;
        if (type === "cross") {
          var winger = pick(rand, g.MID.concat(g.FWD));
          add(minute, 360, posOf(side, winger, 1), side, "pass", "Out to the wing…", false);
          st[winger].touches++; st[winger].passes++; assist = winger;
          add(minute, 340, { x: side === "A" ? 0.86 : 0.14, y: 0.84 }, side, "cross", "Whipped in…", false);
          scorer = attacker(function (i) { return Math.pow(squads[side][i].r.ph, 2) * (squads[side][i].pos === "FWD" ? 2 : 1); });
          add(minute, 380, goalMouth(side, rand, false), side, "goal", headerOrFinish(true), true);
        } else if (type === "solo") {
          scorer = attacker(function (i) { return Math.pow(squads[side][i].r.at, 2.2); });
          add(minute, 360, posOf(side, scorer, 1), side, "dribble", "Jinks past one…", false);
          st[scorer].touches++;
          add(minute, 360, goalMouth(side, rand, false), side, "goal", "GOAL! A brilliant solo finish!", true);
          assist = null;
        } else if (type === "penalty") {
          add(minute, 500, { x: side === "A" ? 0.85 : 0.15, y: 0.5 }, side, "foul", "Penalty given!", false);
          scorer = attacker(function (i) { return Math.pow(squads[side][i].r.at, 2); });
          add(minute, 460, goalMouth(side, rand, false), side, "goal", "GOAL! Tucked away from the spot.", true);
          assist = null;
        } else if (type === "freekick") {
          add(minute, 500, { x: side === "A" ? 0.78 : 0.22, y: 0.5 }, side, "foul", "Free-kick in a dangerous spot…", false);
          scorer = attacker(function (i) { return Math.pow(squads[side][i].r.cr, 2); });
          add(minute, 440, goalMouth(side, rand, false), side, "goal", "GOAL! Curled into the top corner!", true);
          assist = null;
        } else {
          add(minute, 320, { x: side === "A" ? 0.7 : 0.3, y: clamp(0.5 + (rand() - 0.5) * 0.5, 0.2, 0.8) }, side, "pass", "Threaded through!", false);
          scorer = attacker();
          add(minute, 360, goalMouth(side, rand, false), side, "goal", "GOAL! Clinical finish!", true);
        }
        score[side]++;
        st[scorer].touches++; st[scorer].shots++; st[scorer].goals++;
        scorers[side].push({ name: scorer != null ? squads[side][scorer].n : "", minute: minute, type: type });
        if (assist != null && assist !== scorer) st[assist].assists++;
        beats[beats.length - 1].scoreA = score.A; beats[beats.length - 1].scoreB = score.B;
      }

      function headerOrFinish(goal) {
        return goal ? pick(rand, ["GOAL! Towering header!", "GOAL! Headed home at the back post!", "GOAL! Tap-in from the cross!"]) : "Header just wide.";
      }

      function finishNoGoal() {
        var type = pick(rand, ["save", "save", "miss", "block", "corner", "tackle", "tackle", "post", "offside"]);
        var shooter = attacker();

        if (type === "save") {
          add(minute, 300, posOf(side, shooter, 1), side, "shot", "Shot!", false);
          st[shooter].touches++; st[shooter].shots++;
          var caught = rand() < 0.55;
          add(minute, 360, goalMouth(side, rand, false), side, "save",
              pick(rand, ["Great save!", "Tipped over!", "Keeper holds it."]), false);
          dst[gkIdx(def)].saves++;
          if (!caught) {
            var rebX = side === "A" ? 0.78 : 0.22;
            var rebY = clamp(0.5 + (rand() - 0.5) * 0.4, 0.25, 0.75);
            add(minute, 380, { x: rebX, y: rebY }, def, "parry", "Parried clear!", false);
          } else {
            add(minute, 420, { x: side === "A" ? 0.32 : 0.68, y: clamp(0.5 + (rand() - 0.5) * 0.5, 0.2, 0.8) },
              def, "goalkick", null, false);
          }
        } else if (type === "miss") {
          add(minute, 300, posOf(side, shooter, 1), side, "shot", "Shoots…", false);
          st[shooter].touches++; st[shooter].shots++;
          var wideTop = rand() < 0.5;
          var missY = wideTop ? 0.18 : 0.82;
          var outX = side === "A" ? 1.02 : -0.02;
          add(minute, 380, { x: outX, y: missY }, side, "miss",
              pick(rand, ["Just wide!", "Over the bar!", "Inches off target."]), false);
          add(minute, 460, { x: side === "A" ? 0.32 : 0.68, y: clamp(0.5 + (rand() - 0.5) * 0.5, 0.2, 0.8) },
            def, "goalkick", null, false);
        } else if (type === "post") {
          add(minute, 300, posOf(side, shooter, 1), side, "shot", "Lets fly…", false);
          st[shooter].touches++; st[shooter].shots++;
          var hitTop = rand() < 0.5;
          var postY = hitTop ? 0.42 : 0.58;
          var postX = side === "A" ? 0.985 : 0.015;
          add(minute, 280, { x: postX, y: postY }, side, "postHit", "OFF THE POST!", false);
          if (rand() < 0.5) {
            var cornerX = side === "A" ? 1.01 : -0.01;
            var cornerY = hitTop ? 0.04 : 0.96;
            add(minute, 360, { x: cornerX, y: cornerY }, side, "postBounce", "Out for a corner!", false);
            add(minute, 460, { x: side === "A" ? 0.985 : 0.015, y: hitTop ? 0.06 : 0.94 },
              side, "corner", "Corner kick…", false);
            var head = attacker(function (i) { return squads[side][i].r.ph; });
            var res = pick(rand, ["save", "miss", "miss"]);
            add(minute, 380, res === "save" ? goalMouth(side, rand, false) : goalMouth(side, rand, true),
              side, res === "save" ? "save" : "miss",
              res === "save" ? "Header saved!" : "Header off target.", false);
            st[head].touches++; st[head].shots++;
            if (res === "save") dst[gkIdx(def)].saves++;
            else {
              add(minute, 420, { x: side === "A" ? 0.32 : 0.68, y: clamp(0.5 + (rand() - 0.5) * 0.5, 0.2, 0.8) },
                def, "goalkick", null, false);
            }
          } else {
            var bounceY = hitTop ? 0.30 : 0.70;
            var bounceX = side === "A" ? 0.80 : 0.20;
            add(minute, 360, { x: bounceX, y: bounceY }, def, "postBounce", "Back into play!", false);
          }
        } else if (type === "block") {
          add(minute, 300, posOf(side, shooter, 1), side, "shot", "Shot blocked!", false);
          st[shooter].touches++; st[shooter].shots++;
          var blk = pick(rand, dg.DEF); dst[blk].tackles++;
          add(minute, 320, posOf(def, blk, 0.2), def, "blockOut", null, false);
        } else if (type === "corner") {
          add(minute, 440, { x: side === "A" ? 0.985 : 0.015, y: 0.04 }, side, "corner", "Corner kick…", false);
          var head2 = attacker(function (i) { return squads[side][i].r.ph; });
          var res2 = pick(rand, ["save", "miss", "miss"]);
          add(minute, 380, res2 === "save" ? goalMouth(side, rand, false) : goalMouth(side, rand, true),
            side, res2 === "save" ? "save" : "miss",
            res2 === "save" ? "Header saved!" : "Header off target.", false);
          st[head2].touches++; st[head2].shots++;
          if (res2 === "save") dst[gkIdx(def)].saves++;
          else {
            add(minute, 420, { x: side === "A" ? 0.32 : 0.68, y: clamp(0.5 + (rand() - 0.5) * 0.5, 0.2, 0.8) },
              def, "goalkick", null, false);
          }
        } else if (type === "offside") {
          var offX = side === "A" ? clamp(0.66 + (rand() - 0.5) * 0.08, 0.62, 0.74) :
                                    clamp(0.34 + (rand() - 0.5) * 0.08, 0.26, 0.38);
          var offY = clamp(0.5 + (rand() - 0.5) * 0.5, 0.18, 0.82);
          add(minute, 320, { x: offX, y: offY }, side, "offside", "Flag's up — offside.", false);
          st[shooter].touches++;
          add(minute, 380, { x: side === "A" ? 0.35 : 0.65, y: offY }, def, "goalkick", null, false);
        } else {
          var tk = pick(rand, dg.DEF.concat(dg.MID));
          add(minute, 280, posOf(side, pick(rand, g.MID.concat(g.FWD)), 0.6), side, "dribble", null, false);
          add(minute, 300, posOf(def, tk, 0.1), def, "tackle", pick(rand, ["Won back!", "Crunching tackle!", "Intercepted."]), false);
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
    var nameA = opts.teamAName || "Your XI", nameB = opts.teamBName || "CPU";
    var onDone = opts.onDone || function () {};
    var squads = { A: opts.squadA, B: opts.squadB };

    var stage = canvas.parentNode || canvas;
    var overlay = stage.querySelector ? stage.querySelector(".goal-overlay") : null;
    if (!overlay && stage.appendChild) { overlay = document.createElement("div"); overlay.className = "goal-overlay"; stage.appendChild(overlay); }

    var W = 0, H = 0, dpr = Math.min(2, root.devicePixelRatio || 1);
    var FL = 0, FR = 1, FT = 0, FB = 1;
    function resize() {
      var rect = canvas.getBoundingClientRect();
      W = rect.width; H = rect.height;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      FL = W * 0.075; FR = W * 0.925; FT = H * 0.07; FB = H * 0.93;
    }
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
    function d2(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; }
    function nearest(list, pt) { var best = null, bd = 1e9; list.forEach(function (p) { var d = d2(p.pos, pt); if (d < bd) { bd = d; best = p; } }); return best; }

    var ball = { x: 0.5, y: 0.5, p0: null, p1: null, p2: null, u: 1, len: 1, speed: 0.6, moving: false, dribble: false, dribT: 0, carrier: null, t: 0 };
    function speedFor(k) {
      switch (k) {
        case "goal":       return 1.50;
        case "shot":       return 1.30;
        case "postHit":    return 1.30;
        case "postBounce": return 0.85;
        case "save":       return 1.10;
        case "parry":      return 0.75;
        case "cross":      return 0.62;
        case "corner":     return 0.55;
        case "pass":       return 0.58;
        case "dribble":    return 0.26;
        case "goalkick":   return 0.85;
        case "blockOut":   return 0.55;
        case "kickoff":
        case "foul":       return 0.75;
        default:           return 0.60;
      }
    }

    function pickReceiver(b) {
      if (/^(shot|goal|miss|postHit)$/.test(b.kind)) return null;
      if (b.kind === "save") return playersOf(b.posSide === "A" ? "B" : "A").filter(function (p) { return p.ptype === "GK"; })[0] || null;
      var pool = playersOf(b.posSide).filter(function (p) { return p.ptype !== "GK" && p !== ball.carrier; });
      if (!pool.length) pool = playersOf(b.posSide);
      return nearest(pool, b.ball);
    }

    var bi = -1, dwell = 0, celebrating = false, celebrateUntil = 0;
    var banner = null, bannerT = 0, flash = 0, raf = null, last = 0, finished = false;

    function start() { initPlayers(true); last = performance.now(); enterBeat(0); raf = requestAnimationFrame(loop); }
    function finish() { if (finished) return; finished = true; if (raf) cancelAnimationFrame(raf); if (overlay) overlay.classList.remove("show"); onDone({ stats: tl.stats, scorers: tl.scorers }); }

    function enterBeat(i) {
      bi = i;
      if (i >= tl.beats.length) return finish();
      var b = tl.beats[i];
      if (/^(save|parry|postHit|postBounce|tackle|corner|foul|offside|miss|kickoff|fulltime)$/.test(b.kind)) {
        banner = b.label; bannerT = b.label ? 1 : 0;
      }
      if (b.kind === "kickoff") { initPlayers(true); ball.x = 0.5; ball.y = 0.5; ball.moving = false; ball.dribble = false; ball.carrier = null; dwell = 0.5; return; }
      if (b.kind === "fulltime") { ball.moving = false; ball.dribble = false; dwell = 1.0; return; }

      if (b.kind === "goalkick") {
        var gk = playersOf(b.posSide).filter(function (p) { return p.ptype === "GK"; })[0];
        if (gk) { ball.x = gk.pos.x; ball.y = gk.pos.y; }
      }

      ball.carrier = null;
      b._recv = null;
      b._shooter = null;
      b._preShot = false;

      if (b.kind === "dribble") {
        ball.carrier = nearest(playersOf(b.posSide).filter(function (p) { return p.ptype !== "GK"; }), { x: ball.x, y: ball.y });
      } else if (/^(shot|goal|miss|postHit)$/.test(b.kind)) {
        var pool = playersOf(b.posSide).filter(function (p) { return p.ptype === "FWD" || p.ptype === "MID"; });
        if (!pool.length) pool = playersOf(b.posSide).filter(function (p) { return p.ptype !== "GK"; });
        b._shooter = nearest(pool, { x: b.ball.x, y: b.ball.y });
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
      var curve = b.kind === "cross" ? 0.10 : (b.kind === "shot" || b.kind === "goal" || b.kind === "postHit") ? 0.04 : (len > 0.4 ? 0.06 : 0.015);
      curve *= (((b.minute || 1) % 2) ? 1 : -1);
      ball.p1 = { x: (ball.p0.x + ball.p2.x) / 2 - dy / len * curve, y: (ball.p0.y + ball.p2.y) / 2 + dx / len * curve };
      ball.len = len; ball.speed = speedFor(b.kind); ball.u = 0; ball.dribT = 0; ball.t = 0;
      ball.dribble = (b.kind === "dribble"); ball.moving = !ball.dribble; dwell = 0;
    }

    function onArrive() {
      var b = tl.beats[bi];
      if (b.kind === "goal") return celebrate(b);
      dwell = /^(save|parry|corner|foul|postHit|miss|tackle|offside|goalkick)$/.test(b.kind) ? 0.32 : 0.10;
    }

    function celebrate(b) {
      celebrating = true; celebrateUntil = performance.now() + 2200; flash = 1;
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
      ball.t = (ball.t || 0) + dt;

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
          curve2 *= (((b.minute || 1) % 2) ? 1 : -1);
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
        var tg = b._recv.pos, dx3 = tg.x - ball.x, dy3 = tg.y - ball.y, d3 = Math.hypot(dx3, dy3) || 1e-4, step = ball.speed * dt;
        if (d3 <= step + 0.02 || ball.t > 2.8) { ball.x = tg.x; ball.y = tg.y; ball.moving = false; onArrive(); }
        else { ball.x += dx3 / d3 * step; ball.y += dy3 / d3 * step; }
        return;
      }
      if (ball.moving) {
        ball.u += (ball.speed * dt) / ball.len;
        if (ball.u >= 1) { ball.u = 1; ball.moving = false; ball.x = ball.p2.x; ball.y = ball.p2.y; onArrive(); }
        else { var u = ball.u, iu = 1 - u; ball.x = iu * iu * ball.p0.x + 2 * iu * u * ball.p1.x + u * u * ball.p2.x; ball.y = iu * iu * ball.p0.y + 2 * iu * u * ball.p1.y + u * u * ball.p2.y; }
      }
    }

    function updatePlayers(dt) {
      var b = tl.beats[bi]; if (!b) return;
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
          var ahead = p.ptype === "FWD" ? 0.30 : p.ptype === "MID" ? 0.05 : -0.28;
          var tx2 = clamp(p.pos0.x + ahead * adir(poss) * 0.6 + (ball.x - 0.5) * 0.25, 0.06, 0.94);
          var ty2 = clamp(p.pos0.y * 0.95 + ball.y * 0.05, 0.06, 0.94);
          return steer(p, tx2, ty2, p.ptype === "FWD" ? 0.20 : 0.16, dt);
        }

        var rank = dfO.indexOf(p);
        if (rank === 0) return steer(p, ball.x, ball.y, 0.34, dt);
        if (rank === 1) return steer(p, (ball.x + ownGoalX(p.side)) / 2, ball.y, 0.24, dt);
        var back = p.ptype === "DEF" ? 0.22 : 0.08;
        var tx3 = clamp(p.pos0.x - back * adir(p.side) + (ball.x - 0.5) * 0.15, 0.06, 0.94);
        var ty3 = clamp(p.pos0.y * 0.95 + ball.y * 0.05, 0.06, 0.94);
        return steer(p, tx3, ty3, 0.16, dt);
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
      g.addColorStop(0, "#16542f"); g.addColorStop(1, "#103f24");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      var fw = FR - FL, fh = FB - FT;
      ctx.fillStyle = "rgba(255,255,255,.04)";
      for (var s = 0; s < 10; s++) if (s % 2) ctx.fillRect(px(s / 10), FT, fw / 10, fh);
      ctx.strokeStyle = "rgba(255,255,255,.75)"; ctx.lineWidth = 2;
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
      var gd = Math.max(10, fw * 0.045), gy1 = py(0.42), gy2 = py(0.58);
      ctx.fillStyle = "rgba(255,255,255,.16)"; ctx.lineWidth = 2.5; ctx.strokeStyle = "#fff";
      ctx.fillRect(FL - gd, gy1, gd, gy2 - gy1); ctx.strokeRect(FL - gd, gy1, gd, gy2 - gy1);
      ctx.fillRect(FR, gy1, gd, gy2 - gy1); ctx.strokeRect(FR, gy1, gd, gy2 - gy1);
    }

    function drawHud(beat) {
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
