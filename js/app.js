/* ============================================================================
 * CLUB CHAMPION — App shell: navigation, accounts, Stats, Friends, Ranked
 * ----------------------------------------------------------------------------
 * Wraps the gameplay (ui.js) with a top nav and tabbed pages. Uses CC_BACKEND
 * (Supabase) when configured; otherwise everything still works offline —
 * seasons save to localStorage, and account-gated tabs prompt to sign in.
 * ==========================================================================*/
(function (root) {
  "use strict";
  var BE = root.CC_BACKEND, UI = null;
  var state = { user: null, profile: null, tab: "home" };

  var $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }
  function toast(m) { if (root.CC_TOAST) root.CC_TOAST(m); }

  /* ----------------------------------------------------------- nav ------ */
  function setTab(tab) {
    state.tab = tab;
    UI.showScreen(tab === "play" ? "home" : tab);
    document.querySelectorAll(".nav-tab").forEach(function (b) { b.classList.toggle("is-active", b.dataset.tab === tab); });
    if (tab === "stats") renderStats();
    if (tab === "friends") renderFriends();
    if (tab === "ranked") renderRanked();
  }

  function onScreen(name) {
    // keep the nav tab highlight in sync when gameplay changes screens
    var map = { home: "play" };
    var tab = map[name] || (["stats", "friends", "ranked"].indexOf(name) >= 0 ? name : null);
    if (tab) document.querySelectorAll(".nav-tab").forEach(function (b) { b.classList.toggle("is-active", b.dataset.tab === tab); });
  }

  function wireNav() {
    document.querySelectorAll(".nav-tab").forEach(function (b) {
      b.addEventListener("click", function () { setTab(b.dataset.tab); });
    });
    var brand = $("nav-brand"); if (brand) brand.addEventListener("click", function () { setTab("play"); });
    $("nav-account").addEventListener("click", function () { state.user ? toggleAccountMenu() : openAuth("in"); });
  }

  function refreshAccountButton() {
    var btn = $("nav-account");
    if (state.user) btn.innerHTML = '<span class="acc-dot"></span>' + esc(state.profile && state.profile.username ? state.profile.username : "account");
    else btn.innerHTML = "Sign in";
  }

  /* --------------------------------------------------------- account menu */
  function toggleAccountMenu() {
    var existing = $("acc-menu");
    if (existing) { existing.remove(); return; }
    var m = el("div", "acc-menu"); m.id = "acc-menu";
    m.innerHTML =
      '<div class="acc-head">Signed in as<br><b>' + esc(state.profile ? state.profile.username : "—") + "</b></div>" +
      '<button class="acc-item" id="acc-stats">My stats</button>' +
      '<button class="acc-item" id="acc-out">Sign out</button>';
    document.body.appendChild(m);
    var r = $("nav-account").getBoundingClientRect();
    m.style.top = (r.bottom + 8) + "px"; m.style.right = (window.innerWidth - r.right) + "px";
    $("acc-stats").onclick = function () { m.remove(); setTab("stats"); };
    $("acc-out").onclick = function () { m.remove(); BE.auth.signOut().then(function () { toast("Signed out"); }); };
    setTimeout(function () { document.addEventListener("click", function h(e) { if (!m.contains(e.target) && e.target.id !== "nav-account") { m.remove(); document.removeEventListener("click", h); } }); }, 0);
  }

  /* ------------------------------------------------------- auth modal --- */
  function openAuth(mode) {
    if (!BE.configured) { toast("Accounts aren’t set up yet (add Supabase keys)."); return; }
    closeAuth();
    var ov = el("div", "modal"); ov.id = "auth-modal";
    ov.innerHTML =
      '<div class="modal-card auth-card">' +
        '<button class="icon-btn modal-close" id="auth-close">✕</button>' +
        '<h2 id="auth-title">Welcome back</h2>' +
        '<div class="seg auth-seg"><button data-m="in" class="is-selected">Sign in</button><button data-m="up">Create account</button></div>' +
        '<button class="btn btn--ghost auth-google" id="auth-google"><span>G</span> Continue with Google</button>' +
        '<div class="auth-or">or</div>' +
        '<input class="inp" id="auth-email" type="email" placeholder="Email" autocomplete="email" />' +
        '<input class="inp" id="auth-pass" type="password" placeholder="Password (6+ chars)" autocomplete="current-password" />' +
        '<div class="auth-username" id="auth-username-row" hidden>' +
          '<input class="inp" id="auth-username" type="text" placeholder="Pick a unique username" maxlength="20" />' +
          '<div class="auth-uname-status" id="auth-uname-status"></div>' +
        "</div>" +
        '<div class="auth-err" id="auth-err"></div>' +
        '<button class="btn btn--kickoff btn--sm" id="auth-submit">Sign in</button>' +
      "</div>";
    document.body.appendChild(ov);
    ov.addEventListener("click", function (e) { if (e.target === ov) closeAuth(); });
    $("auth-close").onclick = closeAuth;
    var m = mode || "in";
    ov.querySelectorAll(".auth-seg button").forEach(function (b) {
      b.addEventListener("click", function () { setMode(b.dataset.m); });
    });
    $("auth-google").onclick = function () { BE.auth.signInGoogle().catch(function (e) { showErr(e.message); }); };
    $("auth-submit").onclick = submit;
    var unameOk = false, unameTimer;
    $("auth-username") && ($("auth-username").oninput = function () {
      var v = $("auth-username").value.trim(); unameOk = false;
      var st = $("auth-uname-status"); st.className = "auth-uname-status";
      if (v.length < 3) { st.textContent = "At least 3 characters"; return; }
      clearTimeout(unameTimer); st.textContent = "Checking…";
      unameTimer = setTimeout(function () {
        BE.profile.available(v).then(function (ok) {
          unameOk = ok; st.textContent = ok ? "✓ available" : "✗ taken";
          st.classList.add(ok ? "ok" : "bad");
        });
      }, 350);
    });
    function setMode(mm) {
      m = mm;
      ov.querySelectorAll(".auth-seg button").forEach(function (b) { b.classList.toggle("is-selected", b.dataset.m === mm); });
      $("auth-title").textContent = mm === "up" ? "Create your account" : "Welcome back";
      $("auth-username-row").hidden = mm !== "up";
      $("auth-submit").textContent = mm === "up" ? "Create account" : "Sign in";
      $("auth-pass").autocomplete = mm === "up" ? "new-password" : "current-password";
      showErr("");
    }
    function showErr(t) { $("auth-err").textContent = t || ""; }
    function submit() {
      var email = $("auth-email").value.trim(), pass = $("auth-pass").value;
      if (!email || pass.length < 6) return showErr("Enter an email and a 6+ character password.");
      $("auth-submit").disabled = true;
      if (m === "up") {
        var uname = $("auth-username").value.trim();
        if (uname.length < 3) { $("auth-submit").disabled = false; return showErr("Choose a username (3-20 chars)."); }
        if (!unameOk) { $("auth-submit").disabled = false; return showErr("That username isn’t available."); }
        BE.profile.available(uname).then(function (ok) {
          if (!ok) throw new Error("That username was just taken.");
          return BE.auth.signUpEmail(email, pass);
        }).then(function (r) {
          if (r.error) throw r.error;
          state.pendingUsername = uname;
          if (r.data && r.data.session) {           // signed in immediately (email confirmation OFF)
            return BE.profile.setUsername(uname).then(function () { toast("Welcome, " + uname + "!"); closeAuth(); });
          }
          // email confirmation is ON in Supabase — user can't log in until they confirm
          showErr("Account made — but Supabase has ‘Confirm email’ ON, so check your inbox to confirm, then sign in. (Turn it off in Supabase → Auth for instant login.)");
          $("auth-submit").disabled = false;
        }).catch(function (e) {
          var msg = (e && e.message) || "Sign-up failed.";
          if (/already registered/i.test(msg)) msg = "That email already has an account — try Sign in instead.";
          showErr(msg); $("auth-submit").disabled = false;
        });
      } else {
        BE.auth.signInEmail(email, pass).then(function (r) {
          if (r.error) throw r.error; toast("Signed in!"); closeAuth();
        }).catch(function (e) {
          var msg = (e && e.message) || "Sign-in failed.";
          if (/invalid login/i.test(msg)) msg = "Wrong email/password — or your email isn’t confirmed yet.";
          showErr(msg); $("auth-submit").disabled = false;
        });
      }
    }
    setMode(m);
  }
  function closeAuth() { var a = $("auth-modal"); if (a) a.remove(); }

  /* --------------------------------------------------- auth state sync -- */
  function onAuth(user) {
    state.user = user;
    if (!user) { state.profile = null; refreshAccountButton(); if (state.tab === "friends" || state.tab === "stats") (state.tab === "friends" ? renderFriends : renderStats)(); return; }
    BE.profile.mine().then(function (p) {
      if (!p && state.pendingUsername) return BE.profile.setUsername(state.pendingUsername).then(function () { return BE.profile.mine(); });
      return p;
    }).then(function (p) {
      // If they signed in via Google and have no username yet, ask for one.
      if (!p) { promptUsername(); }
      state.profile = p; refreshAccountButton();
      if (state.tab === "stats") renderStats();
      if (state.tab === "friends") renderFriends();
    });
  }

  function promptUsername() {
    if ($("auth-modal")) return;
    openAuth("up");
    setTimeout(function () {
      var card = document.querySelector(".auth-card"); if (!card) return;
      $("auth-title").textContent = "Pick a username";
      card.querySelector(".auth-seg").style.display = "none";
      $("auth-email").style.display = "none"; $("auth-pass").style.display = "none";
      $("auth-google").style.display = "none"; document.querySelector(".auth-or").style.display = "none";
      $("auth-username-row").hidden = false;
      $("auth-submit").textContent = "Save username";
      $("auth-submit").onclick = function () {
        var v = $("auth-username").value.trim();
        if (v.length < 3) return;
        BE.profile.setUsername(v).then(function (r) {
          if (r.error) throw r.error; closeAuth(); onAuth(state.user); toast("Welcome, " + v + "!");
        }).catch(function (e) { $("auth-err").textContent = e.message; });
      };
    }, 30);
  }

  /* ----------------------------------------------------- seasons -------- */
  // Seasons are saved to your ACCOUNT only — you can play signed out, but you
  // must be signed in for stats to be tracked.
  function recordSeason(R) {
    if (!state.user || !BE.configured) { toast("Sign in to save your stats"); return; }
    var ss = R.seasonStats || (UI && UI.seasonStatsFor ? UI.seasonStatsFor(R.squad, R.you, 1) : null);
    var rec = R.you.record;
    var season = {
      mode: R.mode, formation: R.formation ? R.formation.name + " " + R.formation.tag : "",
      wins: rec.W, draws: rec.D, losses: rec.L, points: R.you.points,
      goals_for: ss ? ss.goalsFor : null, goals_against: ss ? ss.goalsAgainst : null,
      unbeaten: !!R.you.unbeaten,
      squad: R.squad.map(function (p) { return { n: p.n, pos: p.pos, club: p.club, year: p.year }; }),
      player_stats: ss ? ss.players : [],
      created_at: new Date().toISOString(),
    };
    BE.data.saveSeason(season).catch(function () {});
  }

  function bestOf(list) {
    return list.slice().sort(function (a, b) { return (b.points - a.points) || (a.losses - b.losses); })[0] || null;
  }

  /* -------------------------------------------------------- STATS tab --- */
  function renderStats() {
    var wrap = $("screen-stats"); if (!wrap) return;
    var head = '<div class="page-head"><h2>Your Stats</h2><p>' +
      (state.user ? "Saved to your account." : "Sign in to save and track your seasons.") + "</p></div>";
    if (!state.user) { wrap.innerHTML = head + signInCard("Sign in to save &amp; track your stats."); wireSignInCard(); return; }
    BE.data.mySeasons().then(function (seasons) {
      var best = bestOf(seasons);
      if (!best) { wrap.innerHTML = head + emptyCard("No seasons yet", "Play a game and your best season &amp; player stats show up here."); return; }
      wrap.innerHTML = head + bestSeasonCard(best, "Your best season") +
        '<div class="muted-line">' + seasons.length + " season" + (seasons.length > 1 ? "s" : "") + " played</div>";
    });
  }

  function bestSeasonCard(s, title) {
    var rec = s.wins + "-" + s.draws + "-" + s.losses;
    var tag = s.unbeaten ? ' <span class="tag-gold">UNBEATEN</span>' : "";
    var players = (s.player_stats || []).slice().sort(function (a, b) { return (b.goals + b.assists) - (a.goals + a.assists); });
    var rows = players.map(function (p) {
      var line = (p.goals ? p.goals + "G " : "") + (p.assists ? p.assists + "A " : "") + (p.saves ? p.saves + "sv " : "");
      return '<div class="st-row"><div class="st-pos pos-' + p.pos + '">' + p.pos + "</div>" +
        '<div class="st-name">' + esc(p.n) + '<small>' + esc(p.club || "") + (p.year ? " · " + p.year : "") + "</small></div>" +
        '<div class="st-sub">' + (line || "&nbsp;") + "</div>" +
        '<div class="st-rtg">' + (p.rating != null ? p.rating.toFixed ? p.rating.toFixed(1) : p.rating : "") + "</div></div>";
    }).join("");
    return '<div class="card">' +
      '<h3>' + title + tag + "</h3>" +
      '<div class="best-line"><b>' + rec + '</b> · ' + s.points + " pts · " + (s.formation || "") +
        ' · <span class="dim">' + (s.goals_for || 0) + " GF / " + (s.goals_against || 0) + " GA</span></div>" +
      '<div class="stat-list stat-list--full" style="margin-top:12px">' + rows + "</div></div>";
  }

  /* ------------------------------------------------------- FRIENDS tab -- */
  function renderFriends() {
    var wrap = $("screen-friends"); if (!wrap) return;
    var head = '<div class="page-head"><h2>Friends</h2><p>Add players by username and compare best seasons.</p></div>';
    if (!BE.configured) { wrap.innerHTML = head + emptyCard("Accounts not set up", "Add your Supabase keys in <code>js/config.js</code> to enable friends."); return; }
    if (!state.user) { wrap.innerHTML = head + signInCard("Sign in to add friends."); wireSignInCard(); return; }

    wrap.innerHTML = head +
      '<div class="card"><h3>Add a friend</h3>' +
        '<div class="friend-add"><input class="inp" id="friend-search" placeholder="Friend’s username" maxlength="20" />' +
        '<button class="btn btn--kickoff btn--sm" id="friend-add-btn">Add</button></div>' +
        '<div class="friend-msg" id="friend-msg"></div></div>' +
      '<div class="card" id="friend-requests"><h3>Requests</h3><div class="muted-line">Loading…</div></div>' +
      '<div class="card" id="friend-list"><h3>Your friends</h3><div class="muted-line">Loading…</div></div>';
    $("friend-add-btn").onclick = function () {
      var u = $("friend-search").value.trim(); if (!u) return;
      $("friend-add-btn").disabled = true;
      BE.friends.request(u).then(function (r) {
        if (r && r.error) throw r.error;
        $("friend-msg").textContent = "Request sent to " + u + "."; $("friend-search").value = "";
      }).catch(function (e) { $("friend-msg").textContent = e.message || "Couldn’t send request."; })
        .then(function () { $("friend-add-btn").disabled = false; });
    };
    BE.friends.incoming().then(function (reqs) {
      var box = $("friend-requests");
      if (!reqs.length) { box.innerHTML = "<h3>Requests</h3><div class=\"muted-line\">No pending requests.</div>"; return; }
      box.innerHTML = "<h3>Requests</h3>" + reqs.map(function (r) {
        return '<div class="friend-row"><b>' + esc(r.username) + "</b><span>" +
          '<button class="mini-btn ok" data-acc="' + r.id + '">Accept</button>' +
          '<button class="mini-btn" data-dec="' + r.id + '">Decline</button></span></div>';
      }).join("");
      box.querySelectorAll("[data-acc]").forEach(function (b) { b.onclick = function () { BE.friends.accept(b.dataset.acc).then(function () { renderFriends(); }); }; });
      box.querySelectorAll("[data-dec]").forEach(function (b) { b.onclick = function () { BE.friends.decline(b.dataset.dec).then(function () { renderFriends(); }); }; });
    });
    BE.friends.list().then(function (fr) {
      var box = $("friend-list");
      if (!fr.length) { box.innerHTML = "<h3>Your friends</h3><div class=\"muted-line\">No friends yet — add someone above.</div>"; return; }
      box.innerHTML = "<h3>Your friends</h3>" + fr.map(function (f) {
        return '<div class="friend-row" id="fr-' + f.userId + '"><b>' + esc(f.username) + "</b><span class=\"dim\">loading best…</span></div>";
      }).join("");
      fr.forEach(function (f) {
        BE.data.bestSeason(f.userId).then(function (s) {
          var row = $("fr-" + f.userId); if (!row) return;
          var span = row.querySelector("span");
          span.className = "";
          span.innerHTML = s ? "<b>" + s.wins + "-" + s.draws + "-" + s.losses + "</b> · " + s.points + "pts" + (s.unbeaten ? " 🏆" : "") : "<span class=\"dim\">no season yet</span>";
        });
      });
    });
  }

  /* -------------------------------------------------------- RANKED tab -- */
  function renderRanked() {
    var wrap = $("screen-ranked"); if (!wrap) return;
    wrap.innerHTML =
      '<div class="page-head"><h2>Ranked <span class="tag-soon">COMING SOON</span></h2><p>Climb the ladder against real managers.</p></div>' +
      '<div class="card ranked-teaser">' +
        '<div class="ranked-badge">🏅</div>' +
        '<h3>Draft. Watch. Climb.</h3>' +
        '<p>Ranked mode will match you against other players’ saved squads. Draft your XI, watch the match play out, and win <b>ELO</b> based on the result, your goal difference, and your season record. Lose and you’ll drop — every placement counts.</p>' +
        '<ul class="ranked-list"><li>Seeded matchmaking by rating</li><li>Seasonal divisions &amp; leaderboards</li><li>ELO rewards for unbeaten runs</li></ul>' +
        '<div class="ranked-cta">In the works — check back soon.</div>' +
      "</div>";
  }

  /* --------------------------------------------------------- helpers ---- */
  function emptyCard(t, sub) { return '<div class="card empty-card"><div class="empty-emoji">⚽</div><h3>' + t + "</h3><p>" + sub + "</p></div>"; }
  function signInCard(t) { return '<div class="card empty-card"><div class="empty-emoji">🔒</div><h3>' + t + '</h3><button class="btn btn--kickoff btn--sm" id="signin-cta" style="max-width:200px;margin:14px auto 0">Sign in</button></div>'; }
  function wireSignInCard() { var b = $("signin-cta"); if (b) b.onclick = function () { openAuth("in"); }; }

  /* ----------------------------------------------------------- init ----- */
  function init() {
    UI = root.CC_UI;
    if (!BE) { BE = root.CC_BACKEND || { configured: false, auth: {}, profile: {}, data: {}, friends: {} }; }
    wireNav();
    refreshAccountButton();
    if (BE.configured) {
      BE.auth.onChange(onAuth);
      BE.auth.getUser().then(function (u) { if (u) onAuth(u); });
    }
  }

  root.CC_APP = { init: init, onScreen: onScreen, recordSeason: recordSeason, openAuth: openAuth, setTab: setTab };
})(window);
