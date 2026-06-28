/* ============================================================================
 * CLUB CHAMPION  CPU Manager (the AI you play against)
 * ----------------------------------------------------------------------------
 * The CPU plays the exact same game you do: it gets its own random slot spins
 * and drafts a 7-player squad into the same formation. Difficulty controls how
 * smart it is:
 *
 *   easy    grabs a random decent option, never skips well, leaves holes.
 *   normal  takes the best player on the board for an open slot.
 *   hard    evaluates each option by how much it lifts the WHOLE squad, and
 *            spends its skips to dodge weak rolls. A genuinely tough draft.
 *
 * `ctx.spin(openSlots, drafted, rand)` is supplied by the game controller so
 * the CPU and the human share identical slot-machine logic.
 * ==========================================================================*/

(function (root) {
  "use strict";

  var E = root.CC_ENGINE;

  function primaryRating(pl) {
    var r = pl.r;
    switch (pl.pos) {
      case "GK": return r.gk;
      case "DEF": return r.df * 0.6 + r.ph * 0.25 + r.cr * 0.15;
      case "MID": return r.cr * 0.5 + r.df * 0.2 + r.ph * 0.15 + r.at * 0.15;
      case "FWD": return r.at * 0.55 + r.cr * 0.25 + r.ph * 0.2;
    }
    return (r.at + r.cr + r.df + r.ph) / 4;
  }

  // How much does adding this player lift the current squad's overall strength?
  function marginalGain(squad, candidate) {
    var before = squad.length ? E.strength(E.ratios(E.categoryTotals(squad))) : 0;
    var after = E.strength(E.ratios(E.categoryTotals(squad.concat([candidate]))));
    return after - before;
  }

  function pickWeighted(list, rand, sharpness) {
    // Softmax-ish weighted random pick over a scored list (sharpness↑ = greedier).
    var max = -Infinity, i;
    for (i = 0; i < list.length; i++) if (list[i].score > max) max = list[i].score;
    var weights = [], sum = 0;
    for (i = 0; i < list.length; i++) {
      var w = Math.exp((list[i].score - max) * sharpness);
      weights.push(w); sum += w;
    }
    var roll = rand() * sum;
    for (i = 0; i < list.length; i++) { roll -= weights[i]; if (roll <= 0) return list[i].pl; }
    return list[list.length - 1].pl;
  }

  // Per-difficulty behaviour, tuned so the squads land in clearly different
  // strength bands (easy ~ mid-table draft, hard ~ near-optimal).
  var PROFILE = {
    easy:   { skipAt: 0,  sharpness: 0,  greedy: false },  // sharpness 0 = uniform random
    normal: { skipAt: 66, sharpness: 12, greedy: false },
    hard:   { skipAt: 82, sharpness: 0,  greedy: true },
  };

  function draft(ctx) {
    var formation = ctx.formation, rand = ctx.rng, diff = ctx.difficulty || "normal";
    var prof = PROFILE[diff] || PROFILE.normal;
    var openSlots = Object.assign({}, formation.slots);
    var squad = [], drafted = {};
    var skips = { club: 1, year: 1 };
    var totalSlots = 0; Object.keys(openSlots).forEach(function (k) { totalSlots += openSlots[k]; });

    for (var round = 0; round < totalSlots; round++) {
      var spin = ctx.spin(openSlots, drafted, rand);

      // Spend a skip on a poor roll (hard does this well, normal sometimes).
      var bestRating = spin.eligible.reduce(function (m, p) {
        return Math.max(m, primaryRating(p));
      }, 0);
      if (bestRating < prof.skipAt && (skips.club > 0 || skips.year > 0)) {
        if (skips.year > 0) skips.year--; else skips.club--;
        spin = ctx.spin(openSlots, drafted, rand);
      }

      var choice;
      if (prof.greedy) {
        // Maximise whole-squad strength (the strongest play).
        choice = spin.eligible.map(function (pl) { return { pl: pl, g: marginalGain(squad, pl) }; })
          .sort(function (a, b) { return b.g - a.g; })[0].pl;
      } else if (prof.sharpness <= 0) {
        // Uniform random eligible pick  leaves holes, very beatable.
        choice = spin.eligible[Math.floor(rand() * spin.eligible.length)];
      } else {
        var scored = spin.eligible.map(function (pl) { return { pl: pl, score: primaryRating(pl) }; });
        choice = pickWeighted(scored, rand, prof.sharpness);
      }

      // Wrap the pick with its club/year metadata (same shape the human's
      // picks use) so the results screen can show where each player came from.
      var entry = {
        n: choice.n, pos: choice.pos, r: choice.r,
        club: spin.club, short: spin.short, color: spin.color,
        year: spin.year, label: spin.label,
      };
      squad.push(entry);
      drafted[choice.n] = true;
      openSlots[choice.pos]--;
    }

    return squad;
  }

  var API = { draft: draft, primaryRating: primaryRating };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.CC_CPU = API;
})(typeof window !== "undefined" ? window : globalThis);
