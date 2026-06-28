/* Node test harness: sanity-check & tune the simulation engine.
 * Run: node scripts/test-engine.js
 */
const DATA = require("../js/data.js");
const E = require("../js/engine.js");

function findPlayer(name) {
  for (const c of DATA.CLUBS)
    for (const era of c.eras)
      for (const p of era.players)
        if (p.n === name) return Object.assign({ club: c.club }, p);
  throw new Error("not found: " + name);
}

function squad(names) { return names.map(findPlayer); }

function show(title, names) {
  const s = squad(names);
  const r = E.simulateSeason(s);
  const rec = r.record;
  const tag = r.perfect ? "  ★ PERFECT / INVINCIBLE" : r.unbeaten ? "  ◆ UNBEATEN" : "";
  console.log(
    title.padEnd(26),
    `Q=${r.strength.toFixed(3)}`,
    `${rec.W}-${rec.D}-${rec.L}`.padEnd(9),
    `${r.points}pts`.padEnd(7),
    `minRatio=${r.minRatio.toFixed(2)}` + tag
  );
  return r;
}

console.log("\n=== SEASON PROJECTIONS (target spread) ===\n");

// Absolutely maxed, balanced 2-2-2  should flirt with 38-0.
show("GOD SQUAD (2-2-2)", [
  "Manuel Neuer", "Virgil van Dijk", "Paolo Maldini",
  "Kevin De Bruyne", "Xavi", "Lionel Messi", "Kylian Mbappé",
]);

// Elite but realistic single-era pick.
show("Barcelona 2010 (best 7)", [
  "Víctor Valdés", "Carles Puyol", "Dani Alves",
  "Xavi", "Andrés Iniesta", "Lionel Messi", "David Villa",
]);

// Strong defensive shape (catenaccio).
show("Catenaccio elite (3-2-1)", [
  "Gianluigi Donnarumma", "Diego Godín", "Sergio Ramos", "Virgil van Dijk",
  "Rodri", "Luka Modric", "Erling Haaland",
]);

// All-out attack: loaded forwards, thin at the back -> should be gated.
show("All-Out Attack stars", [
  "Manuel Neuer", "Sergio Ramos",
  "Kevin De Bruyne", "Xavi",
  "Lionel Messi", "Cristiano Ronaldo", "Kylian Mbappé",
]);

// No real keeper (outfielder in goal) -> goalkeeping gate should bite hard.
show("NO KEEPER (gate test)", [
  "Sergio Ramos", "Virgil van Dijk", "Paolo Maldini",
  "Kevin De Bruyne", "Xavi", "Lionel Messi", "Kylian Mbappé",
]);

// Mid-tier mix.
show("Mid-table mix", [
  "Hugo Lloris", "Toby Alderweireld", "Jan Vertonghen",
  "Christian Eriksen", "Dele Alli", "Heung-min Son", "Harry Kane",
]);

// Genuinely weak squad: a "meh roll" side from the lean years.
show("Weak/meh-roll squad", [
  "Nicky Weaver", "Richard Edghill", "Gerard Wiekens",
  "Kevin Horlock", "Ali Benarbia", "Shaun Goater", "Paul Dickov",
]);

console.log("\n=== GATE FLAGS (All-Out Attack stars) ===");
const aoa = E.simulateSeason(squad([
  "Manuel Neuer", "Sergio Ramos",
  "Kevin De Bruyne", "Xavi",
  "Lionel Messi", "Cristiano Ronaldo", "Kylian Mbappé",
]));
aoa.flags.forEach((f) =>
  console.log("  " + f.label.padEnd(12), f.ratio.toFixed(2), f.grade, "(" + f.tone + ")"));

console.log("\n=== HEAD-TO-HEAD (you vs CPU) ===");
const you = squad(["Manuel Neuer", "Virgil van Dijk", "Paolo Maldini",
  "Kevin De Bruyne", "Xavi", "Lionel Messi", "Kylian Mbappé"]);
const cpu = squad(["Petr Cech", "John Terry", "Ricardo Carvalho",
  "Frank Lampard", "Michael Essien", "Didier Drogba", "Arjen Robben"]);
for (let seed = 1; seed <= 5; seed++) {
  const m = E.playMatch(you, cpu, seed * 7919);
  const pens = m.pens ? ` (pens ${m.pens.a}-${m.pens.b})` : "";
  console.log(`  seed ${seed}: YOU ${m.goalsA}-${m.goalsB} CPU${pens} -> ${m.winner === "A" ? "YOU win" : "CPU win"}`);
}

console.log("\n=== DATASET COVERAGE ===");
console.log("  clubs:", DATA.CLUBS.length, " spin combos (club+era):", DATA.COMBOS.length);
let totalPlayers = 0, thinEras = [];
DATA.COMBOS.forEach((c) => {
  totalPlayers += c.players.length;
  const need = { GK: 1, DEF: 1, MID: 1, FWD: 1 };
  Object.keys(need).forEach((k) => { if (c.counts[k] < need[k]) thinEras.push(c.club + " " + c.label + " missing " + k); });
});
console.log("  total player rows:", totalPlayers);
console.log("  eras missing a position group:", thinEras.length ? thinEras : "none ✓");
