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
    var prevTab = state.tab;
    state.tab = tab;
    UI.showScreen(tab === "play" ? "home" : tab);
    document.querySelectorAll(".nav-tab").forEach(function (b) { b.classList.toggle("is-active", b.dataset.tab === tab); });
    if (prevTab === "friends" && tab !== "friends") teardownFriendsRealtime();
    if (tab === "stats") renderStats();
    if (tab === "friends") renderFriends();
    if (tab === "ranked") renderRanked();
  }

  function onScreen(name) {
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
      '<button class="acc-item" id="acc-settings">Settings</button>' +
      '<button class="acc-item" id="acc-help">Help</button>' +
      '<button class="acc-item" id="acc-out">Sign out</button>';
    document.body.appendChild(m);
    var r = $("nav-account").getBoundingClientRect();
    m.style.top = (r.bottom + 8) + "px"; m.style.right = (window.innerWidth - r.right) + "px";
    $("acc-stats").onclick = function () { m.remove(); setTab("stats"); };
    $("acc-settings").onclick = function () { m.remove(); openSettings(); };
    $("acc-help").onclick = function () { m.remove(); openHelp(); };
    $("acc-out").onclick = function () { m.remove(); BE.auth.signOut().then(function () { toast("Signed out"); }); };
    setTimeout(function () { document.addEventListener("click", function h(e) { if (!m.contains(e.target) && e.target.id !== "nav-account") { m.remove(); document.removeEventListener("click", h); } }); }, 0);
  }

  /* ---------------------------------------------------- settings (P4) --- */
  function openSettings() {
    if (!state.user) return;
    var ov = el("div", "modal"); ov.id = "settings-modal";
    ov.innerHTML = '<div class="modal-card" style="max-width:440px;max-height:88vh;overflow:auto">' +
      '<button class="icon-btn modal-close" id="set-close">✕</button>' +
      "<h2>Settings</h2>" +
      '<div class="set-block"><label class="set-label">Username</label>' +
        '<div class="friend-add"><input class="inp" id="set-uname" maxlength="20" value="' + esc(state.profile ? state.profile.username : "") + '" />' +
        '<button class="btn btn--kickoff btn--sm" id="set-uname-btn" style="width:auto;padding:0 16px">Save</button></div>' +
        '<div class="set-hint" id="set-uname-hint">Change your username once every 30 days.</div></div>' +
      '<div class="set-block"><label class="set-label">Password</label>' +
        '<button class="btn btn--ghost btn--sm" id="set-pass">Send password reset email</button></div>' +
      '<div class="set-block set-row"><div><b>Pro Mode default</b><div class="set-hint">Start every game with ratings hidden.</div></div>' +
        '<label class="toggle" style="width:auto;gap:0"><input type="checkbox" id="set-pro"' + (state.profile && state.profile.pro_default ? " checked" : "") + ' /><span class="toggle-track"><span class="toggle-thumb"></span></span></label></div>' +
      '<div class="set-block"><label class="set-label set-danger-label">Danger zone</label>' +
        '<button class="btn btn--ghost btn--sm set-danger-btn" id="set-wipe">Wipe all my stats</button>' +
        '<button class="btn btn--ghost btn--sm set-danger-btn" id="set-delete" style="margin-top:8px">Delete my account</button></div>' +
      '<div class="auth-err" id="set-err"></div></div>';
    document.body.appendChild(ov);
    ov.addEventListener("click", function (e) { if (e.target === ov) ov.remove(); });
    $("set-close").onclick = function () { ov.remove(); };
    if (BE.profile.full) BE.profile.full().then(function (p) {
      if (p && p.username_changed_at) {
        var next = new Date(new Date(p.username_changed_at).getTime() + 30 * 86400000);
        if (next > new Date()) {
          $("set-uname").disabled = true; $("set-uname-btn").disabled = true;
          $("set-uname-hint").textContent = "Next username change: " + next.toLocaleDateString();
        }
      }
    });
    $("set-uname-btn").onclick = function () {
      var v = $("set-uname").value.trim();
      if (v.length < 3 || !/^[a-z0-9_]+$/i.test(v)) { $("set-err").textContent = "3–20 letters, numbers, or underscores."; return; }
      $("set-uname-btn").disabled = true; $("set-err").textContent = "";
      BE.profile.changeUsername(v).then(function () {
        toast("Username updated to " + v); if (state.profile) state.profile.username = v; refreshAccountButton(); ov.remove();
      }).catch(function (e) { $("set-err").textContent = (e && e.message) || "Couldn’t change username."; $("set-uname-btn").disabled = false; });
    };
    $("set-pass").onclick = function () {
      var email = (state.user && state.user.email) || "";
      if (!email) { $("set-err").textContent = "No email on this account (signed in with Google?)."; return; }
      BE.auth.resetPassword(email).then(function () { toast("Reset email sent to " + email); }).catch(function (e) { $("set-err").textContent = (e && e.message) || "Couldn’t send email."; });
    };
    $("set-pro").onchange = function (e) {
      BE.profile.setProDefault(e.target.checked);
      if (state.profile) state.profile.pro_default = e.target.checked;
      if (root.CC_UI && root.CC_UI.setProDefault) root.CC_UI.setProDefault(e.target.checked);
    };
    $("set-wipe").onclick = function () {
      if (confirm("Delete ALL your saved stats (every mode)? This can’t be undone.")) {
        BE.account.wipeStats().then(function () { toast("All stats wiped."); ov.remove(); if (state.tab === "stats") renderStats(); });
      }
    };
    $("set-delete").onclick = function () {
      if (confirm("Permanently delete your account, stats, and friends? This can’t be undone.")) {
        BE.account.deleteAccount().then(function () { toast("Account deleted."); ov.remove(); }).catch(function (e) { $("set-err").textContent = (e && e.message) || "Couldn’t delete account."; });
      }
    };
  }

  /* ------------------------------------------------------- help (P4) ---- */
  function openHelp() {
    var faqs = [
      ["What is Club Champion?", "Spin a club &amp; an exact year (or a World Cup nation), draft a 7-player squad, and chase an unbeaten season or a knockout title."],
      ["How are players rated?", "Each player has Attack, Creativity, Defence, Physical and Goalkeeping. Your squad’s totals run through a non-linear engine — one weak category caps your whole season."],
      ["What is Pro Mode?", "Ratings are hidden during the draft so you pick on football knowledge alone. Player choices are ordered by position, not quality."],
      ["What do the Swap buttons do?", "Swap Club/Nation rolls a different side (same year); Swap Year rolls a different year (same side). Tournaments give you 2 of each."],
      ["How do UCL Climb &amp; World Cup work?", "Keep one drafted squad and win single-leg knockouts to advance. Opponents get tougher each round."],
      ["Are my stats saved?", "Yes — when you’re signed in, every game is saved to your account and shown per mode in the Stats tab."],
      ["How do friends work?", "Add players by username, accept requests, and see who’s online. Head-to-head and live matches are rolling out."],
      ["Found a bug or a wrong rating?", "Ratings are subjective and for fun. Email us anything below and we’ll take a look."],
    ];
    var howto = [
      ["Season", "Solo. Draft a balanced XI and try to finish 38-0."],
      ["Beat the CPU", "Out-draft the CPU, then win the one-off final."],
      ["UCL Climb", "One squad, Round of 16 → Final. Win or go home."],
      ["World Cup", "Draft national legends from 1990–2026, Group of 32 → Final."],
      ["Friends", "Add by username, manage requests, view their stats."],
    ];
    var ov = el("div", "modal"); ov.id = "help-modal";
    ov.innerHTML = '<div class="modal-card" style="max-width:560px;max-height:86vh;overflow:auto">' +
      '<button class="icon-btn modal-close" id="help-close">✕</button>' +
      "<h2>Help</h2>" +
      '<h3 class="fs-sec">FAQ</h3><div class="help-faq">' +
        faqs.map(function (q) { return '<details class="help-q"><summary>' + q[0] + "</summary><p>" + q[1] + "</p></details>"; }).join("") +
      "</div>" +
      '<h3 class="fs-sec">How to play</h3><div class="help-how">' +
        howto.map(function (h) { return '<div class="help-row"><b>' + h[0] + "</b><span>" + h[1] + "</span></div>"; }).join("") +
      "</div>" +
      '<h3 class="fs-sec">Contact</h3>' +
      '<p class="help-contact">Questions or feedback? <a href="mailto:clubchampsupport@gmail.com">clubchampsupport@gmail.com</a></p>' +
      "</div>";
    document.body.appendChild(ov);
    ov.addEventListener("click", function (e) { if (e.target === ov) ov.remove(); });
    $("help-close").onclick = function () { ov.remove(); };
  }

  /* ------------------------------------------------------- auth modal --- */
  function openAuth(mode) {
    if (!BE.configured) { toast("Accounts aren't set up yet (add Supabase keys)."); return; }
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
        if (!unameOk) { $("auth-submit").disabled = false; return showErr("That username isn't available."); }
        BE.profile.available(uname).then(function (ok) {
          if (!ok) throw new Error("That username was just taken.");
          return BE.auth.signUpEmail(email, pass);
        }).then(function (r) {
          if (r.error) throw r.error;
          state.pendingUsername = uname;
          if (r.data && r.data.session) {
            return BE.profile.setUsername(uname).then(function () { toast("Welcome, " + uname + "!"); closeAuth(); });
          }
          showErr("Account made — but Supabase has 'Confirm email' ON, so check your inbox to confirm, then sign in.");
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
          if (/invalid login/i.test(msg)) msg = "Wrong email/password — or your email isn't confirmed yet.";
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
    if (!user) {
      state.profile = null; stopHeartbeat(); refreshAccountButton();
      if (state.tab === "friends" || state.tab === "stats") (state.tab === "friends" ? renderFriends : renderStats)();
      return;
    }
    BE.profile.mine().then(function (p) {
      if (!p && state.pendingUsername) return BE.profile.setUsername(state.pendingUsername).then(function () { return BE.profile.mine(); });
      return p;
    }).then(function (p) {
      var needsUsername = !p || !p.username || isAutoGeneratedUsername(p.username, user);
      if (needsUsername) {
        var suggested = sanitizeUsername(getDisplayName(user) || "");
        promptUsername(suggested);
        return;
      }
      state.profile = p; refreshAccountButton();
      if (root.CC_UI && root.CC_UI.setProDefault) root.CC_UI.setProDefault(!!p.pro_default);
      startHeartbeat();
      if (state.tab === "stats") renderStats();
      if (state.tab === "friends") renderFriends();
    });
  }

  /* ----------------------------------------------------- presence (P2) -- */
  var heartbeatTimer = null;
  function startHeartbeat() {
    if (!BE.profile.heartbeat) return;
    BE.profile.heartbeat();
    if (heartbeatTimer) return;
    heartbeatTimer = setInterval(function () { if (state.user) BE.profile.heartbeat(); }, 60000);
  }
  function stopHeartbeat() { if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; } }
  // "online now" / "5m ago" / "2h ago" / "3d ago" from a last_seen timestamp.
  function presence(lastSeen) {
    if (!lastSeen) return { online: false, text: "offline" };
    var diff = Date.now() - new Date(lastSeen).getTime();
    if (diff < 5 * 60000) return { online: true, text: "online now" };
    var m = Math.floor(diff / 60000);
    if (m < 60) return { online: false, text: m + "m ago" };
    var h = Math.floor(m / 60);
    if (h < 24) return { online: false, text: h + "h ago" };
    return { online: false, text: Math.floor(h / 24) + "d ago" };
  }

  function isAutoGeneratedUsername(username, user) {
    if (!username) return true;
    if (/\s/.test(username)) return true;
    if (/[A-Z]/.test(username) && username.length > 6) return true;
    var displayName = getDisplayName(user);
    if (displayName && username.toLowerCase() === displayName.toLowerCase()) return true;
    return false;
  }

  function getDisplayName(user) {
    if (!user) return "";
    var md = user.user_metadata || {};
    return md.full_name || md.name || md.user_name || "";
  }

  function sanitizeUsername(s) {
    return String(s || "").toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20);
  }

  function promptUsername(suggested) {
    if ($("auth-modal")) return;
    openAuth("up");
    setTimeout(function () {
      var card = document.querySelector(".auth-card"); if (!card) return;
      $("auth-title").textContent = "Pick a username";
      card.querySelector(".auth-seg").style.display = "none";
      $("auth-email").style.display = "none"; $("auth-pass").style.display = "none";
      $("auth-google").style.display = "none"; document.querySelector(".auth-or").style.display = "none";
      $("auth-username-row").hidden = false;

      var hint = document.createElement("p");
      hint.style.cssText = "color:var(--muted);font-size:13px;margin:-8px 0 14px;";
      hint.textContent = "Pick a unique username — others will use this to find and friend you.";
      $("auth-title").after(hint);

      var input = $("auth-username");
      var status = $("auth-uname-status");

      if (suggested && suggested.length >= 3) {
        input.value = suggested;
        findAvailableVariation(suggested, 0);
      } else {
        status.textContent = "At least 3 characters";
      }

      $("auth-submit").textContent = "Save username";
      $("auth-submit").onclick = function () {
        var v = input.value.trim();
        if (v.length < 3) { $("auth-err").textContent = "At least 3 characters."; return; }
        if (!/^[a-z0-9_]+$/i.test(v)) { $("auth-err").textContent = "Letters, numbers, and underscores only."; return; }
        $("auth-err").textContent = "";
        $("auth-submit").disabled = true;

        BE.auth.getUser().then(function (currentUser) {
          if (!currentUser) {
            throw new Error("Session expired — please sign in again.");
          }
          state.user = currentUser;
          return BE.profile.available(v);
        }).then(function (ok) {
          if (!ok) {
            $("auth-err").textContent = "That username is taken — try another.";
            $("auth-submit").disabled = false;
            return null;
          }
          return BE.profile.setUsername(v);
        }).then(function (r) {
          if (!r) return;
          if (r.error) throw r.error;
          closeAuth();
          onAuth(state.user);
          toast("Welcome, " + v + "!");
        }).catch(function (e) {
          $("auth-err").textContent = (e && e.message) || "Couldn't save username.";
          $("auth-submit").disabled = false;
        });
      };
    }, 30);
  }

  function findAvailableVariation(base, attempt) {
    if (attempt > 9) return;
    var tryName = attempt === 0 ? base : base + attempt;
    var input = $("auth-username");
    var status = $("auth-uname-status");
    if (!input) return;
    input.value = tryName;
    status.className = "auth-uname-status"; status.textContent = "Checking…";
    BE.profile.available(tryName).then(function (ok) {
      if (ok) {
        status.textContent = "✓ available";
        status.classList.add("ok");
      } else {
        findAvailableVariation(base, attempt + 1);
      }
    });
  }

  /* ----------------------------------------------------- seasons -------- */
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

  function recordRun(s) {
    if (!state.user || !BE.configured) { toast("Sign in to save your run"); return; }
    var run = {
      mode: s.mode,
      formation: s.formation ? s.formation.name + " " + s.formation.tag : "",
      wins: s.roundsWon, draws: 0, losses: s.champion ? 0 : 1, points: s.roundsWon,
      goals_for: s.goalsFor, goals_against: s.goalsAgainst,
      unbeaten: !!s.champion,
      squad: s.squad.map(function (p) { return { n: p.n, pos: p.pos, club: p.club, year: p.year }; }),
      player_stats: s.players,
      created_at: new Date().toISOString(),
    };
    BE.data.saveSeason(run).catch(function () {});
  }

  function bestSeason(list) {
    return list.slice().sort(function (a, b) { return (b.points - a.points) || (a.losses - b.losses); })[0] || null;
  }
  function bestRun(list) {
    return list.slice().sort(function (a, b) {
      return (b.wins - a.wins) || ((b.unbeaten ? 1 : 0) - (a.unbeaten ? 1 : 0)) ||
        (((b.goals_for || 0) - (b.goals_against || 0)) - ((a.goals_for || 0) - (a.goals_against || 0)));
    })[0] || null;
  }

  /* -------------------------------------------------------- STATS tab --- */
  var statsSub = "solo", statsData = null;
  var STATS_TABS = [["solo", "🏆 Season"], ["cpu", "🆚 vs CPU"], ["ucl", "⭐ UCL"], ["wc", "🌍 World Cup"]];

  function renderStats() {
    var wrap = $("screen-stats"); if (!wrap) return;
    var head = '<div class="page-head"><h2>Your Stats</h2><p>' +
      (state.user ? "Tracked per mode, saved to your account." : "Sign in to save and track your stats.") + "</p></div>";
    if (!state.user) { statsData = null; wrap.innerHTML = head + signInCard("Sign in to save &amp; track your stats."); wireSignInCard(); return; }
    wrap.innerHTML = head + statsTabBar() + '<div id="stats-body" class="muted-line">Loading…</div>';
    wireStatsTabs();
    BE.data.mySeasons().then(function (seasons) {
      statsData = { solo: [], cpu: [], ucl: [], wc: [] };
      seasons.forEach(function (s) { if (statsData[s.mode]) statsData[s.mode].push(s); });
      renderStatsBody();
    });
  }
  function statsTabBar() {
    return '<div class="seg stats-seg">' + STATS_TABS.map(function (t) {
      return '<button data-stab="' + t[0] + '"' + (t[0] === statsSub ? ' class="is-selected"' : "") + ">" + t[1] + "</button>";
    }).join("") + "</div>";
  }
  function wireStatsTabs() {
    document.querySelectorAll(".stats-seg button").forEach(function (b) {
      b.onclick = function () {
        statsSub = b.dataset.stab;
        document.querySelectorAll(".stats-seg button").forEach(function (x) { x.classList.toggle("is-selected", x.dataset.stab === statsSub); });
        renderStatsBody();
      };
    });
  }
  function renderStatsBody() {
    var body = $("stats-body"); if (!body || !statsData) return;
    var list = statsData[statsSub] || [];
    var n = '<div class="muted-line">' + list.length + " played</div>";
    if (statsSub === "solo") body.innerHTML = list.length ? bestSeasonCard(bestSeason(list), "Best season") + n : emptyMini("🏆", "No seasons yet — chase 38-0.");
    else if (statsSub === "cpu") body.innerHTML = list.length ? bestSeasonCard(bestSeason(list), "Best vs-CPU squad") + n : emptyMini("🆚", "No CPU games yet — beat a rival manager.");
    else body.innerHTML = list.length ? runCard(bestRun(list)) + n : emptyMini(statsSub === "ucl" ? "⭐" : "🌍", "No runs yet — keep one squad and climb.");
  }
  function emptyMini(icon, msg) {
    return '<div class="card empty-card" style="padding:34px 22px"><div class="empty-emoji">' + icon + "</div><p>" + esc(msg) + "</p></div>";
  }

  function roundLabelFromRow(s) {
    var rounds = (root.CC_GAME && root.CC_GAME.TOUR_ROUNDS[s.mode]) || [];
    if (s.unbeaten || (rounds.length && s.wins >= rounds.length)) return "🏆 Champions";
    var idx = Math.min(s.wins || 0, Math.max(0, rounds.length - 1));
    return "Reached the " + (rounds[idx] || "knockouts");
  }
  function runCard(s) {
    var players = (s.player_stats || []).slice().sort(function (a, b) { return (b.goals + b.assists) - (a.goals + a.assists); });
    var rows = players.map(function (p) {
      var line = (p.goals ? p.goals + "G " : "") + (p.assists ? p.assists + "A " : "") + (p.saves ? p.saves + "sv " : "");
      return '<div class="st-row"><div class="st-pos pos-' + p.pos + '">' + p.pos + "</div>" +
        '<div class="st-name">' + esc(p.n) + "<small>" + esc(p.club || "") + (p.year ? " · " + p.year : "") + "</small></div>" +
        '<div class="st-sub">' + (line || "&nbsp;") + "</div>" +
        '<div class="st-rtg">' + (p.rating != null ? (p.rating.toFixed ? p.rating.toFixed(1) : p.rating) : "") + "</div></div>";
    }).join("");
    return '<div class="card">' +
      '<div class="run-head"><div class="run-round">' + roundLabelFromRow(s) + "</div>" +
        '<div class="run-meta">' + esc(s.formation || "") + " · " + (s.goals_for || 0) + " GF / " + (s.goals_against || 0) + " GA</div></div>" +
      '<div class="stat-list stat-list--full" style="margin-top:12px">' + (rows || '<div class="muted-line">No player stats recorded.</div>') + "</div></div>";
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
  var friendsChannel = null;

  function teardownFriendsRealtime() {
    if (friendsChannel && BE.friends && BE.friends.unsubscribe) {
      BE.friends.unsubscribe(friendsChannel);
      friendsChannel = null;
    }
  }

  function renderFriends() {
    var wrap = $("screen-friends"); if (!wrap) return;
    var head = '<div class="page-head"><h2>Friends</h2><p>Add players by username, manage requests, and compare best seasons.</p></div>';
    if (!BE.configured) { wrap.innerHTML = head + emptyCard("Accounts not set up", "Add your Supabase keys in <code>js/config.js</code> to enable friends."); return; }
    if (!state.user) { wrap.innerHTML = head + signInCard("Sign in to add friends."); wireSignInCard(); teardownFriendsRealtime(); return; }

    wrap.innerHTML = head +
      // Card 1 — Your Friends
      '<div class="card" id="friend-list-card">' +
        '<h3>Your Friends</h3>' +
        '<div id="friend-list"><div class="muted-line" style="text-align:left">Loading…</div></div>' +
      '</div>' +
      // Card 2 — Game Invites (placeholder for now)
      '<div class="card"><h3>Game Invites</h3>' +
        '<div class="muted-line" style="text-align:left;padding:6px 2px">No invites yet — coming soon when you can challenge friends.</div>' +
      '</div>' +
      // Card 3 — Add Friend
      '<div class="card"><h3>Add a Friend</h3>' +
        '<div class="friend-add">' +
          '<input class="inp" id="friend-search" placeholder="Friend\'s username" maxlength="20" autocomplete="off" />' +
          '<button class="btn btn--kickoff btn--sm" id="friend-add-btn">Add</button>' +
        '</div>' +
        '<div class="friend-msg" id="friend-msg"></div>' +
      '</div>' +
      // Card 4 — Requests (Incoming + Sent)
      '<div class="card" id="friend-requests-card">' +
        '<h3>Requests</h3>' +
        '<div class="friend-sub-head">Incoming</div>' +
        '<div id="friend-incoming"><div class="muted-line" style="text-align:left">Loading…</div></div>' +
        '<div class="friend-sub-head" style="margin-top:14px">Sent</div>' +
        '<div id="friend-outgoing"><div class="muted-line" style="text-align:left">Loading…</div></div>' +
      '</div>';

    wireFriendsAdd();
    loadFriendsData();

    teardownFriendsRealtime();
    if (BE.friends && BE.friends.subscribe) {
      friendsChannel = BE.friends.subscribe(function () {
        if (state.tab === "friends") loadFriendsData();
      });
    }
  }

  function wireFriendsAdd() {
    var btn = $("friend-add-btn"), input = $("friend-search"), msg = $("friend-msg");
    function send() {
      var u = input.value.trim();
      if (!u) { msg.textContent = ""; return; }
      btn.disabled = true; msg.className = "friend-msg"; msg.textContent = "Sending…";
      BE.friends.request(u).then(function (r) {
        if (r && r.error) throw r.error;
        msg.className = "friend-msg ok"; msg.textContent = "✓ Request sent to " + u + ".";
        input.value = "";
        loadFriendsData();
      }).catch(function (e) {
        msg.className = "friend-msg bad";
        msg.textContent = (e && e.message) || "Couldn't send request.";
      }).then(function () { btn.disabled = false; });
    }
    btn.onclick = send;
    input.onkeydown = function (e) { if (e.key === "Enter") send(); };
  }

  function loadFriendsData() {
    if (!state.user) return;
    BE.friends.incoming().then(function (reqs) {
      var box = $("friend-incoming"); if (!box) return;
      if (!reqs.length) { box.innerHTML = '<div class="muted-line" style="text-align:left">No pending requests.</div>'; return; }
      box.innerHTML = reqs.map(function (r) {
        return '<div class="friend-row">' +
          '<b>' + esc(r.username) + '</b>' +
          '<span>' +
            '<button class="mini-btn ok" data-acc="' + r.id + '">Accept</button>' +
            '<button class="mini-btn" data-dec="' + r.id + '">Decline</button>' +
          '</span></div>';
      }).join("");
      box.querySelectorAll("[data-acc]").forEach(function (b) {
        b.onclick = function () {
          b.disabled = true;
          BE.friends.accept(b.dataset.acc).then(function () { loadFriendsData(); });
        };
      });
      box.querySelectorAll("[data-dec]").forEach(function (b) {
        b.onclick = function () {
          b.disabled = true;
          BE.friends.decline(b.dataset.dec).then(function () { loadFriendsData(); });
        };
      });
    });

    BE.friends.outgoing().then(function (reqs) {
      var box = $("friend-outgoing"); if (!box) return;
      if (!reqs.length) { box.innerHTML = '<div class="muted-line" style="text-align:left">No requests sent.</div>'; return; }
      box.innerHTML = reqs.map(function (r) {
        return '<div class="friend-row">' +
          '<b>' + esc(r.username) + '</b>' +
          '<span><span class="dim" style="font-size:12px">Pending</span>' +
            '<button class="mini-btn" data-cancel="' + r.id + '">Cancel</button>' +
          '</span></div>';
      }).join("");
      box.querySelectorAll("[data-cancel]").forEach(function (b) {
        b.onclick = function () {
          b.disabled = true;
          BE.friends.cancelRequest(b.dataset.cancel).then(function () { loadFriendsData(); });
        };
      });
    });

    BE.friends.list().then(function (fr) {
      var box = $("friend-list"); if (!box) return;
      if (!fr.length) { box.innerHTML = '<div class="muted-line" style="text-align:left">No friends yet — add someone above.</div>'; return; }
      var ids = fr.map(function (f) { return f.userId; });
      BE.profile.getMany(ids).then(function (pmap) {
        box.innerHTML = fr.map(function (f) {
          var pr = presence((pmap[f.userId] || {}).last_seen);
          return '<div class="friend-row friend-row--full" id="fr-' + f.userId + '">' +
            '<span class="status-dot ' + (pr.online ? "on" : "off") + '"></span>' +
            '<div class="friend-id"><b>' + esc(f.username) + '</b><small>' + pr.text + '</small></div>' +
            '<span class="friend-h2h dim" id="h2h-' + f.userId + '" title="Head-to-head vs you">0-0</span>' +
            '<span class="friend-acts">' +
              '<button class="mini-btn mini-btn--play" data-play="' + f.userId + '">Challenge</button>' +
              '<button class="mini-btn" data-stats="' + f.userId + '" data-name="' + esc(f.username) + '">Stats</button>' +
              '<button class="mini-btn friend-menu-btn" data-menu="' + f.userId + '" data-name="' + esc(f.username) + '">⋮</button>' +
            '</span></div>';
        }).join("");
        fr.forEach(function (f) {
          BE.friends.headToHead(f.userId).then(function (h) {
            var e = $("h2h-" + f.userId); if (!e) return;
            e.textContent = h.wins + "-" + h.losses;
            e.classList.toggle("dim", (h.wins + h.losses) === 0);
          });
        });
        box.querySelectorAll("[data-play]").forEach(function (b) { b.onclick = function () { toast("Live multiplayer matches are coming soon!"); }; });
        box.querySelectorAll("[data-stats]").forEach(function (b) { b.onclick = function () { renderFriendStats(b.dataset.stats, b.dataset.name); }; });
        box.querySelectorAll("[data-menu]").forEach(function (b) { b.onclick = function (ev) { ev.stopPropagation(); openFriendMenu(b, b.dataset.menu, b.dataset.name); }; });
      });
    });
  }

  /* ------------------------------------------------ friend stats viewer -- */
  function renderFriendStats(userId, name) {
    var wrap = $("screen-friends"); if (!wrap) return;
    teardownFriendsRealtime();
    wrap.innerHTML = '<div class="page-head"><button class="link-btn" id="fs-back" style="margin:0 0 10px">← Back to Friends</button>' +
      "<h2>" + esc(name) + "’s Stats</h2><p>Their best run in each mode.</p></div>" +
      '<div id="fs-body" class="muted-line">Loading…</div>';
    $("fs-back").onclick = function () { renderFriends(); };
    BE.data.userSeasons(userId).then(function (seasons) {
      var by = { solo: [], cpu: [], ucl: [], wc: [] };
      seasons.forEach(function (s) { if (by[s.mode]) by[s.mode].push(s); });
      var html = "";
      if (by.solo.length) html += '<h3 class="fs-sec">🏆 Season</h3>' + bestSeasonCard(bestSeason(by.solo), "Best season");
      if (by.cpu.length) html += '<h3 class="fs-sec">🆚 vs CPU</h3>' + bestSeasonCard(bestSeason(by.cpu), "Best vs-CPU squad");
      if (by.ucl.length) html += '<h3 class="fs-sec">⭐ UCL Climb</h3>' + runCard(bestRun(by.ucl));
      if (by.wc.length) html += '<h3 class="fs-sec">🌍 World Cup</h3>' + runCard(bestRun(by.wc));
      var body = $("fs-body"); if (!body) return;
      body.className = "";
      body.innerHTML = html || emptyMini("📊", esc(name) + " hasn’t played any tracked games yet.");
    });
  }

  /* --------------------------------------------------- friend ⋮ menu ----- */
  function openFriendMenu(btn, userId, name) {
    var ex = $("friend-pop"); if (ex) { ex.remove(); return; }
    var m = el("div", "acc-menu"); m.id = "friend-pop";
    m.innerHTML = '<button class="acc-item" id="fm-report">Report</button><button class="acc-item" id="fm-remove">Remove friend</button>';
    document.body.appendChild(m);
    var r = btn.getBoundingClientRect();
    m.style.top = (r.bottom + 6) + "px"; m.style.right = Math.max(8, window.innerWidth - r.right) + "px";
    $("fm-report").onclick = function () { m.remove(); openReportModal(userId, name); };
    $("fm-remove").onclick = function () {
      m.remove();
      if (confirm("Remove " + name + " from your friends?")) {
        BE.friends.removeByUser(userId).then(function () { toast("Removed " + name); loadFriendsData(); });
      }
    };
    setTimeout(function () { document.addEventListener("click", function h(e) { if (!m.contains(e.target)) { m.remove(); document.removeEventListener("click", h); } }); }, 0);
  }

  function openReportModal(userId, name) {
    var ov = el("div", "modal"); ov.id = "report-modal";
    ov.innerHTML = '<div class="modal-card" style="max-width:420px">' +
      '<button class="icon-btn modal-close" id="rep-close">✕</button>' +
      "<h2>Report " + esc(name) + "</h2>" +
      '<label class="set-label">Reason</label>' +
      '<select class="inp" id="rep-reason"><option>Spam</option><option>Abuse</option><option>Cheating</option><option>Other</option></select>' +
      '<textarea class="inp" id="rep-comment" placeholder="Add details (optional)" rows="3" style="resize:vertical"></textarea>' +
      '<div class="auth-err" id="rep-err"></div>' +
      '<button class="btn btn--kickoff btn--sm" id="rep-submit">Submit report</button></div>';
    document.body.appendChild(ov);
    ov.addEventListener("click", function (e) { if (e.target === ov) ov.remove(); });
    $("rep-close").onclick = function () { ov.remove(); };
    $("rep-submit").onclick = function () {
      $("rep-submit").disabled = true;
      BE.friends.report(userId, $("rep-reason").value, $("rep-comment").value.trim()).then(function () {
        ov.remove(); toast("Report submitted. Thank you.");
      }).catch(function (e) { $("rep-err").textContent = (e && e.message) || "Couldn’t submit report."; $("rep-submit").disabled = false; });
    };
  }

  /* -------------------------------------------------------- RANKED tab -- */
  function renderRanked() {
    var wrap = $("screen-ranked"); if (!wrap) return;
    wrap.innerHTML =
      '<div class="page-head"><h2>Ranked <span class="tag-soon">COMING SOON</span></h2><p>Climb the ladder against real managers.</p></div>' +
      '<div class="card ranked-teaser">' +
        '<div class="ranked-badge">🏅</div>' +
        '<h3>Draft. Watch. Climb.</h3>' +
        '<p>Ranked mode will match you against other players\' saved squads. Draft your XI, watch the match play out, and win <b>ELO</b> based on the result, your goal difference, and your season record. Lose and you\'ll drop — every placement counts.</p>' +
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

  root.CC_APP = { init: init, onScreen: onScreen, recordSeason: recordSeason, recordRun: recordRun, openAuth: openAuth, setTab: setTab };
})(window);
