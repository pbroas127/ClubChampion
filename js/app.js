/* ============================================================================
 * CLUB CHAMPION — App shell: navigation, accounts, Stats, Friends, MP
 * ==========================================================================*/
(function (root) {
  "use strict";
  var BE = root.CC_BACKEND, UI = null;
  var state = { user: null, profile: null, tab: "home" };

  var $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }
  function toast(m) { if (root.CC_TOAST) root.CC_TOAST(m); }

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

  function openSettings() {
    if (!state.user) return;
    var ov = el("div", "modal"); ov.id = "settings-modal";
    ov.innerHTML = '<div class="modal-card" style="max-width:440px;max-height:88vh;overflow:auto">' +
      '<button class="icon-btn modal-close" id="set-close">✕</button><h2>Settings</h2>' +
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
      if (v.length < 3 || !/^[a-z0-9_]+$/i.test(v)) { $("set-err").textContent = "3-20 letters, numbers, or underscores."; return; }
      $("set-uname-btn").disabled = true; $("set-err").textContent = "";
      BE.profile.changeUsername(v).then(function () {
        toast("Username updated"); if (state.profile) state.profile.username = v; refreshAccountButton(); ov.remove();
      }).catch(function (e) { $("set-err").textContent = (e && e.message) || "Couldn't change."; $("set-uname-btn").disabled = false; });
    };
    $("set-pass").onclick = function () {
      var email = (state.user && state.user.email) || "";
      if (!email) { $("set-err").textContent = "No email on this account."; return; }
      BE.auth.resetPassword(email).then(function () { toast("Reset email sent"); }).catch(function (e) { $("set-err").textContent = (e && e.message) || "Couldn't send."; });
    };
    $("set-pro").onchange = function (e) {
      BE.profile.setProDefault(e.target.checked);
      if (state.profile) state.profile.pro_default = e.target.checked;
      if (root.CC_UI && root.CC_UI.setProDefault) root.CC_UI.setProDefault(e.target.checked);
    };
    $("set-wipe").onclick = function () {
      if (confirm("Delete ALL your saved stats? Can't be undone.")) {
        BE.account.wipeStats().then(function () { toast("Stats wiped"); ov.remove(); if (state.tab === "stats") renderStats(); });
      }
    };
    $("set-delete").onclick = function () {
      if (confirm("Permanently delete your account? Can't be undone.")) {
        BE.account.deleteAccount().then(function () { toast("Account deleted"); ov.remove(); }).catch(function (e) { $("set-err").textContent = (e && e.message) || "Couldn't delete."; });
      }
    };
  }

  function openHelp() {
    var faqs = [
      ["What is Club Champion?", "Spin a club and a year, draft a 7-player squad, chase an unbeaten season or knockout title."],
      ["How are players rated?", "Each player has Attack, Creativity, Defence, Physical, Goalkeeping. One weak category caps your season."],
      ["What is Pro Mode?", "Ratings hidden during draft so you pick on football knowledge alone."],
      ["What do Swap buttons do?", "Swap Club rolls a different side same year; Swap Year rolls a different year same side."],
      ["Are my stats saved?", "Yes when signed in, every game is saved per mode."],
      ["How do friends work?", "Add by username, accept requests, see online status, challenge them."],
    ];
    var howto = [
      ["Season", "Solo. Draft a balanced XI and try to go 38-0."],
      ["Beat the CPU", "Out-draft the CPU then win the final."],
      ["UCL Climb", "One squad, R16 to Final. Win or go home."],
      ["World Cup", "Draft national legends 1990-2026."],
      ["Friends", "Add by username, manage requests, view their stats."],
    ];
    var ov = el("div", "modal"); ov.id = "help-modal";
    ov.innerHTML = '<div class="modal-card" style="max-width:560px;max-height:86vh;overflow:auto">' +
      '<button class="icon-btn modal-close" id="help-close">✕</button><h2>Help</h2>' +
      '<h3 class="fs-sec">FAQ</h3><div class="help-faq">' +
        faqs.map(function (q) { return '<details class="help-q"><summary>' + q[0] + "</summary><p>" + q[1] + "</p></details>"; }).join("") +
      "</div>" +
      '<h3 class="fs-sec">How to play</h3><div class="help-how">' +
        howto.map(function (h) { return '<div class="help-row"><b>' + h[0] + "</b><span>" + h[1] + "</span></div>"; }).join("") +
      "</div>" +
      '<h3 class="fs-sec">Contact</h3>' +
      '<p class="help-contact">Questions? <a href="mailto:clubchampsupport@gmail.com">clubchampsupport@gmail.com</a></p></div>';
    document.body.appendChild(ov);
    ov.addEventListener("click", function (e) { if (e.target === ov) ov.remove(); });
    $("help-close").onclick = function () { ov.remove(); };
  }

  function openAuth(mode) {
    if (!BE.configured) { toast("Accounts not set up."); return; }
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
      clearTimeout(unameTimer); st.textContent = "Checking...";
      unameTimer = setTimeout(function () {
        BE.profile.available(v).then(function (ok) {
          unameOk = ok; st.textContent = ok ? "Available" : "Taken";
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
      if (!email || pass.length < 6) return showErr("Enter email and 6+ char password.");
      $("auth-submit").disabled = true;
      if (m === "up") {
        var uname = $("auth-username").value.trim();
        if (uname.length < 3) { $("auth-submit").disabled = false; return showErr("Choose a username (3-20)."); }
        if (!unameOk) { $("auth-submit").disabled = false; return showErr("Username not available."); }
        BE.profile.available(uname).then(function (ok) {
          if (!ok) throw new Error("Username taken.");
          return BE.auth.signUpEmail(email, pass);
        }).then(function (r) {
          if (r.error) throw r.error;
          state.pendingUsername = uname;
          if (r.data && r.data.session) {
            return BE.profile.setUsername(uname).then(function () { toast("Welcome!"); closeAuth(); });
          }
          showErr("Check email to confirm, then sign in.");
          $("auth-submit").disabled = false;
        }).catch(function (e) {
          var msg = (e && e.message) || "Sign-up failed.";
          if (/already registered/i.test(msg)) msg = "Email already registered.";
          showErr(msg); $("auth-submit").disabled = false;
        });
      } else {
        BE.auth.signInEmail(email, pass).then(function (r) {
          if (r.error) throw r.error; toast("Signed in"); closeAuth();
        }).catch(function (e) {
          var msg = (e && e.message) || "Sign-in failed.";
          if (/invalid login/i.test(msg)) msg = "Wrong email/password.";
          showErr(msg); $("auth-submit").disabled = false;
        });
      }
    }
    setMode(m);
  }
  function closeAuth() { var a = $("auth-modal"); if (a) a.remove(); }

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

  var heartbeatTimer = null;
  function startHeartbeat() {
    if (!BE.profile.heartbeat) return;
    BE.profile.heartbeat();
    if (heartbeatTimer) return;
    heartbeatTimer = setInterval(function () { if (state.user) BE.profile.heartbeat(); }, 60000);
  }
  function stopHeartbeat() { if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; } }

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
      hint.textContent = "Pick a unique username.";
      $("auth-title").after(hint);
      var input = $("auth-username");
      var status = $("auth-uname-status");
      if (suggested && suggested.length >= 3) {
        input.value = suggested;
        findAvailableVariation(suggested, 0);
      } else { status.textContent = "At least 3 characters"; }
      $("auth-submit").textContent = "Save";
      $("auth-submit").onclick = function () {
        var v = input.value.trim();
        if (v.length < 3) { $("auth-err").textContent = "At least 3 chars."; return; }
        if (!/^[a-z0-9_]+$/i.test(v)) { $("auth-err").textContent = "Letters/numbers/underscores only."; return; }
        $("auth-err").textContent = "";
        $("auth-submit").disabled = true;
        BE.auth.getUser().then(function (currentUser) {
          if (!currentUser) throw new Error("Session expired.");
          state.user = currentUser;
          return BE.profile.available(v);
        }).then(function (ok) {
          if (!ok) { $("auth-err").textContent = "Taken."; $("auth-submit").disabled = false; return null; }
          return BE.profile.setUsername(v);
        }).then(function (r) {
          if (!r) return;
          if (r.error) throw r.error;
          closeAuth(); onAuth(state.user); toast("Welcome!");
        }).catch(function (e) {
          $("auth-err").textContent = (e && e.message) || "Couldn't save.";
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
    status.className = "auth-uname-status"; status.textContent = "Checking...";
    BE.profile.available(tryName).then(function (ok) {
      if (ok) { status.textContent = "Available"; status.classList.add("ok"); }
      else findAvailableVariation(base, attempt + 1);
    });
  }

  function recordSeason(R) {
    if (!state.user || !BE.configured) { toast("Sign in to save"); return; }
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
    if (!state.user || !BE.configured) { toast("Sign in to save"); return; }
    var run = {
      mode: s.mode, formation: s.formation ? s.formation.name + " " + s.formation.tag : "",
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

  var statsSub = "solo", statsData = null;
  var STATS_TABS = [["solo", "Season"], ["cpu", "vs CPU"], ["ucl", "UCL"], ["wc", "World Cup"]];

  function renderStats() {
    var wrap = $("screen-stats"); if (!wrap) return;
    var head = '<div class="page-head"><h2>Your Stats</h2><p>' +
      (state.user ? "Tracked per mode." : "Sign in to save and track.") + "</p></div>";
    if (!state.user) { statsData = null; wrap.innerHTML = head + signInCard("Sign in to track stats."); wireSignInCard(); return; }
    wrap.innerHTML = head + statsTabBar() + '<div id="stats-body" class="muted-line">Loading...</div>';
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
    if (statsSub === "solo") body.innerHTML = list.length ? bestSeasonCard(bestSeason(list), "Best season") + n : emptyMini("🏆", "No seasons yet.");
    else if (statsSub === "cpu") body.innerHTML = list.length ? bestSeasonCard(bestSeason(list), "Best vs-CPU") + n : emptyMini("🆚", "No CPU games yet.");
    else body.innerHTML = list.length ? runCard(bestRun(list)) + n : emptyMini(statsSub === "ucl" ? "⭐" : "🌍", "No runs yet.");
  }
  function emptyMini(icon, msg) {
    return '<div class="card empty-card" style="padding:34px 22px"><div class="empty-emoji">' + icon + "</div><p>" + esc(msg) + "</p></div>";
  }

  function roundLabelFromRow(s) {
    var rounds = (root.CC_GAME && root.CC_GAME.TOUR_ROUNDS && root.CC_GAME.TOUR_ROUNDS[s.mode]) || [];
    if (s.unbeaten || (rounds.length && s.wins >= rounds.length)) return "Champions";
    var idx = Math.min(s.wins || 0, Math.max(0, rounds.length - 1));
    return "Reached " + (rounds[idx] || "knockouts");
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
    return '<div class="card"><div class="run-head"><div class="run-round">' + roundLabelFromRow(s) + "</div>" +
      '<div class="run-meta">' + esc(s.formation || "") + " · " + (s.goals_for || 0) + " GF / " + (s.goals_against || 0) + " GA</div></div>" +
      '<div class="stat-list stat-list--full" style="margin-top:12px">' + (rows || '<div class="muted-line">No stats.</div>') + "</div></div>";
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
    return '<div class="card"><h3>' + title + tag + "</h3>" +
      '<div class="best-line"><b>' + rec + '</b> · ' + s.points + " pts · " + (s.formation || "") +
        ' · <span class="dim">' + (s.goals_for || 0) + " GF / " + (s.goals_against || 0) + " GA</span></div>" +
      '<div class="stat-list stat-list--full" style="margin-top:12px">' + rows + "</div></div>";
  }

  var friendsChannel = null, invitesChannel = null, inviteTick = null;

  function teardownFriendsRealtime() {
    if (friendsChannel && BE.friends && BE.friends.unsubscribe) { BE.friends.unsubscribe(friendsChannel); friendsChannel = null; }
    if (invitesChannel && BE.invites && BE.invites.unsubscribe) { BE.invites.unsubscribe(invitesChannel); invitesChannel = null; }
    if (inviteTick) { clearInterval(inviteTick); inviteTick = null; }
  }

  function renderFriends() {
    var wrap = $("screen-friends"); if (!wrap) return;
    var head = '<div class="page-head"><h2>Friends</h2><p>Add players by username, manage requests, compare seasons.</p></div>';
    if (!BE.configured) { wrap.innerHTML = head + emptyCard("Accounts not set up", "Add Supabase keys."); return; }
    if (!state.user) { wrap.innerHTML = head + signInCard("Sign in to add friends."); wireSignInCard(); teardownFriendsRealtime(); return; }

    wrap.innerHTML = head +
      '<div class="card" id="friend-list-card"><h3>Your Friends</h3>' +
        '<div id="friend-list"><div class="muted-line" style="text-align:left">Loading...</div></div></div>' +
      '<div class="card" id="game-invites-card"><h3>Game Invites</h3>' +
        '<div id="game-invites"><div class="muted-line" style="text-align:left;padding:4px 2px">Loading...</div></div></div>' +
      '<div class="card"><h3>Add a Friend</h3>' +
        '<div class="friend-add">' +
          '<input class="inp" id="friend-search" placeholder="Friend\'s username" maxlength="20" autocomplete="off" />' +
          '<button class="btn btn--kickoff btn--sm" id="friend-add-btn">Add</button></div>' +
        '<div class="friend-msg" id="friend-msg"></div></div>' +
      '<div class="card" id="friend-requests-card"><h3>Requests</h3>' +
        '<div class="friend-sub-head">Incoming</div>' +
        '<div id="friend-incoming"><div class="muted-line" style="text-align:left">Loading...</div></div>' +
        '<div class="friend-sub-head" style="margin-top:14px">Sent</div>' +
        '<div id="friend-outgoing"><div class="muted-line" style="text-align:left">Loading...</div></div></div>';

    wireFriendsAdd();
    loadFriendsData();
    renderInvites();

    teardownFriendsRealtime();
    if (BE.friends && BE.friends.subscribe) {
      friendsChannel = BE.friends.subscribe(function () { if (state.tab === "friends") loadFriendsData(); });
    }
    if (BE.invites && BE.invites.subscribe) {
      invitesChannel = BE.invites.subscribe(function (payload) {
        // LOBBY FIX: if MY outgoing invite was accepted, jump into the lobby
        if (payload && payload.new && payload.new.status === "accepted" &&
            payload.new.from_user === state.user.id) {
          toast("Match accepted! Entering lobby...");
          setTimeout(function () { tryEnterLobby(); }, 600);
          return;
        }
        if (state.tab === "friends") renderInvites();
      });
    }
    inviteTick = setInterval(function () { if (state.tab === "friends") updateInviteCountdowns(); }, 1000);
  }

  function wireFriendsAdd() {
    var btn = $("friend-add-btn"), input = $("friend-search"), msg = $("friend-msg");
    function send() {
      var u = input.value.trim();
      if (!u) { msg.textContent = ""; return; }
      btn.disabled = true; msg.className = "friend-msg"; msg.textContent = "Sending...";
      BE.friends.request(u).then(function (r) {
        if (r && r.error) throw r.error;
        msg.className = "friend-msg ok"; msg.textContent = "Request sent to " + u + ".";
        input.value = ""; loadFriendsData();
      }).catch(function (e) {
        msg.className = "friend-msg bad";
        msg.textContent = (e && e.message) || "Couldn't send.";
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
        return '<div class="friend-row"><b>' + esc(r.username) + '</b><span>' +
          '<button class="mini-btn ok" data-acc="' + r.id + '">Accept</button>' +
          '<button class="mini-btn" data-dec="' + r.id + '">Decline</button></span></div>';
      }).join("");
      box.querySelectorAll("[data-acc]").forEach(function (b) {
        b.onclick = function () { b.disabled = true; BE.friends.accept(b.dataset.acc).then(function () { loadFriendsData(); }); };
      });
      box.querySelectorAll("[data-dec]").forEach(function (b) {
        b.onclick = function () { b.disabled = true; BE.friends.decline(b.dataset.dec).then(function () { loadFriendsData(); }); };
      });
    });

    BE.friends.outgoing().then(function (reqs) {
      var box = $("friend-outgoing"); if (!box) return;
      if (!reqs.length) { box.innerHTML = '<div class="muted-line" style="text-align:left">No requests sent.</div>'; return; }
      box.innerHTML = reqs.map(function (r) {
        return '<div class="friend-row"><b>' + esc(r.username) + '</b>' +
          '<span><span class="dim" style="font-size:12px">Pending</span>' +
          '<button class="mini-btn" data-cancel="' + r.id + '">Cancel</button></span></div>';
      }).join("");
      box.querySelectorAll("[data-cancel]").forEach(function (b) {
        b.onclick = function () { b.disabled = true; BE.friends.cancelRequest(b.dataset.cancel).then(function () { loadFriendsData(); }); };
      });
    });

    BE.friends.list().then(function (fr) {
      var box = $("friend-list"); if (!box) return;
      if (!fr.length) { box.innerHTML = '<div class="muted-line" style="text-align:left">No friends yet.</div>'; return; }
      var ids = fr.map(function (f) { return f.userId; });
      BE.profile.getMany(ids).then(function (pmap) {
        box.innerHTML = fr.map(function (f) {
          var pr = presence((pmap[f.userId] || {}).last_seen);
          return '<div class="friend-row friend-row--full" id="fr-' + f.userId + '">' +
            '<span class="status-dot ' + (pr.online ? "on" : "off") + '"></span>' +
            '<div class="friend-id"><b>' + esc(f.username) + '</b><small>' + pr.text + '</small></div>' +
            '<span class="friend-h2h dim" id="h2h-' + f.userId + '">0-0</span>' +
            '<span class="friend-acts">' +
              '<button class="mini-btn mini-btn--play" data-play="' + f.userId + '" data-name="' + esc(f.username) + '">Challenge</button>' +
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
        box.querySelectorAll("[data-play]").forEach(function (b) { b.onclick = function () { openInvitePopup(b, b.dataset.play, b.dataset.name); }; });
        box.querySelectorAll("[data-stats]").forEach(function (b) { b.onclick = function () { renderFriendStats(b.dataset.stats, b.dataset.name); }; });
        box.querySelectorAll("[data-menu]").forEach(function (b) { b.onclick = function (ev) { ev.stopPropagation(); openFriendMenu(b, b.dataset.menu, b.dataset.name); }; });
      });
    });
  }

  function poolLabel(p) { return p === "wc" ? "World Cup" : "Clubs"; }

  function openInvitePopup(btn, userId, name) {
    var ex = $("invite-pop"); if (ex) { ex.remove(); return; }
    var m = el("div", "invite-pop"); m.id = "invite-pop";
    m.innerHTML =
      '<div class="ip-title">Challenge ' + esc(name) + "</div>" +
      '<label class="ip-row"><span>Player pool</span>' +
        '<select class="inp ip-sel" id="ip-pool"><option value="club">Clubs</option><option value="wc">World Cup</option></select></label>' +
      '<label class="ip-row"><span>Pro Mode</span><input type="checkbox" id="ip-pro" /></label>' +
      '<div class="ip-mode">Mode: <b>Classic</b> · Tournament <span class="dim">soon</span></div>' +
      '<button class="btn btn--kickoff btn--sm" id="ip-send">Send invite</button>';
    document.body.appendChild(m);
    var r = btn.getBoundingClientRect();
    m.style.top = (r.bottom + 8) + "px";
    m.style.left = Math.max(8, Math.min(r.left - 60, window.innerWidth - 250)) + "px";
    $("ip-send").onclick = function () {
      $("ip-send").disabled = true;
      BE.invites.send(userId, { pool: $("ip-pool").value, pro: $("ip-pro").checked }).then(function () {
        m.remove(); toast("Challenge sent to " + name + "!"); renderInvites();
      }).catch(function (e) { toast((e && e.message) || "Couldn't send."); $("ip-send").disabled = false; });
    };
    setTimeout(function () { document.addEventListener("click", function h(e) { if (!m.contains(e.target) && e.target !== btn) { m.remove(); document.removeEventListener("click", h); } }); }, 0);
  }

  function renderInvites() {
    var box = $("game-invites"); if (!box) return;
    BE.invites.mine().then(function (inv) {
      function row(x, sent) {
        return '<div class="friend-row invite-row" data-exp="' + x.expires_at + '">' +
          '<div class="friend-id"><b>' + esc(x.username) + "</b><small>" + poolLabel(x.pool) + (x.pro ? " · Pro" : "") + ' · <span class="inv-cd">...</span></small></div>' +
          '<span class="friend-acts">' + (sent
            ? '<span class="dim" style="font-size:12px">Waiting...</span><button class="mini-btn" data-cancel-inv="' + x.id + '">Cancel</button>'
            : '<button class="mini-btn ok" data-acc-inv="' + x.id + '">Accept</button><button class="mini-btn" data-dec-inv="' + x.id + '">Decline</button>') +
          "</span></div>";
      }
      var html = "";
      if (inv.incoming.length) html += '<div class="friend-sub-head">Incoming</div>' + inv.incoming.map(function (x) { return row(x, false); }).join("");
      if (inv.outgoing.length) html += '<div class="friend-sub-head"' + (inv.incoming.length ? ' style="margin-top:12px"' : "") + ">Sent</div>" + inv.outgoing.map(function (x) { return row(x, true); }).join("");
      box.innerHTML = html || '<div class="muted-line" style="text-align:left;padding:4px 2px">No invites.</div>';
      box.querySelectorAll("[data-acc-inv]").forEach(function (b) {
        b.onclick = function () { b.disabled = true; BE.invites.accept(b.dataset.accInv).then(function (r) { onInviteAccepted(r && r.data); }); };
      });
      box.querySelectorAll("[data-dec-inv]").forEach(function (b) { b.onclick = function () { b.disabled = true; BE.invites.decline(b.dataset.decInv).then(function () { renderInvites(); }); }; });
      box.querySelectorAll("[data-cancel-inv]").forEach(function (b) { b.onclick = function () { b.disabled = true; BE.invites.cancel(b.dataset.cancelInv).then(function () { renderInvites(); }); }; });
      updateInviteCountdowns();
    }).catch(function () {});
  }

  function updateInviteCountdowns() {
    var rows = document.querySelectorAll(".invite-row"); var expired = false;
    rows.forEach(function (rw) {
      var exp = new Date(rw.getAttribute("data-exp")).getTime();
      var left = Math.max(0, Math.round((exp - Date.now()) / 1000));
      var cd = rw.querySelector(".inv-cd"); if (cd) cd.textContent = left + "s";
      if (left <= 0) expired = true;
    });
    if (expired && state.tab === "friends") renderInvites();
  }

  function onInviteAccepted(inviteRow) {
    if (!inviteRow) { setTimeout(function () { tryEnterLobby(); }, 400); return; }
    if (!BE.lobby) { toast("Lobby not loaded."); return; }
    BE.lobby.createFromInvite(inviteRow).then(function (r) {
      if (r && r.data) enterLobby(r.data.id, true);
      else tryEnterLobby();
    }).catch(function () { tryEnterLobby(); });
  }

  function tryEnterLobby() {
    if (!BE.lobby) return;
    BE.lobby.mine().then(function (lobbyRow) {
      if (lobbyRow) enterLobby(lobbyRow.id, lobbyRow.host === state.user.id);
      else toast("Couldn't find lobby.");
    });
  }

  function renderFriendStats(userId, name) {
    var wrap = $("screen-friends"); if (!wrap) return;
    teardownFriendsRealtime();
    wrap.innerHTML = '<div class="page-head"><button class="link-btn" id="fs-back" style="margin:0 0 10px">← Back to Friends</button>' +
      "<h2>" + esc(name) + "'s Stats</h2><p>Their best run.</p></div>" +
      '<div id="fs-body" class="muted-line">Loading...</div>';
    $("fs-back").onclick = function () { renderFriends(); };
    BE.data.userSeasons(userId).then(function (seasons) {
      var by = { solo: [], cpu: [], ucl: [], wc: [] };
      seasons.forEach(function (s) { if (by[s.mode]) by[s.mode].push(s); });
      var html = "";
      if (by.solo.length) html += '<h3 class="fs-sec">Season</h3>' + bestSeasonCard(bestSeason(by.solo), "Best season");
      if (by.cpu.length) html += '<h3 class="fs-sec">vs CPU</h3>' + bestSeasonCard(bestSeason(by.cpu), "Best vs-CPU");
      if (by.ucl.length) html += '<h3 class="fs-sec">UCL Climb</h3>' + runCard(bestRun(by.ucl));
      if (by.wc.length) html += '<h3 class="fs-sec">World Cup</h3>' + runCard(bestRun(by.wc));
      var body = $("fs-body"); if (!body) return;
      body.className = "";
      body.innerHTML = html || emptyMini("📊", esc(name) + " hasn't played yet.");
    });
  }

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
      if (confirm("Remove " + name + "?")) {
        BE.friends.removeByUser(userId).then(function () { toast("Removed " + name); loadFriendsData(); });
      }
    };
    setTimeout(function () { document.addEventListener("click", function h(e) { if (!m.contains(e.target)) { m.remove(); document.removeEventListener("click", h); } }); }, 0);
  }

  function openReportModal(userId, name) {
    var ov = el("div", "modal"); ov.id = "report-modal";
    ov.innerHTML = '<div class="modal-card" style="max-width:420px">' +
      '<button class="icon-btn modal-close" id="rep-close">✕</button><h2>Report ' + esc(name) + "</h2>" +
      '<label class="set-label">Reason</label>' +
      '<select class="inp" id="rep-reason"><option>Spam</option><option>Abuse</option><option>Cheating</option><option>Other</option></select>' +
      '<textarea class="inp" id="rep-comment" placeholder="Details (optional)" rows="3" style="resize:vertical"></textarea>' +
      '<div class="auth-err" id="rep-err"></div>' +
      '<button class="btn btn--kickoff btn--sm" id="rep-submit">Submit</button></div>';
    document.body.appendChild(ov);
    ov.addEventListener("click", function (e) { if (e.target === ov) ov.remove(); });
    $("rep-close").onclick = function () { ov.remove(); };
    $("rep-submit").onclick = function () {
      $("rep-submit").disabled = true;
      BE.friends.report(userId, $("rep-reason").value, $("rep-comment").value.trim()).then(function () {
        ov.remove(); toast("Report submitted.");
      }).catch(function (e) { $("rep-err").textContent = (e && e.message) || "Couldn't submit."; $("rep-submit").disabled = false; });
    };
  }

  function renderRanked() {
    var wrap = $("screen-ranked"); if (!wrap) return;
    wrap.innerHTML =
      '<div class="page-head"><h2>Ranked <span class="tag-soon">COMING SOON</span></h2><p>Climb the ladder.</p></div>' +
      '<div class="card ranked-teaser"><div class="ranked-badge">🏅</div>' +
        '<h3>Draft. Watch. Climb.</h3>' +
        '<p>Ranked mode is in the works.</p></div>';
  }

  function emptyCard(t, sub) { return '<div class="card empty-card"><div class="empty-emoji">⚽</div><h3>' + t + "</h3><p>" + sub + "</p></div>"; }
  function signInCard(t) { return '<div class="card empty-card"><div class="empty-emoji">🔒</div><h3>' + t + '</h3><button class="btn btn--kickoff btn--sm" id="signin-cta" style="max-width:200px;margin:14px auto 0">Sign in</button></div>'; }
  function wireSignInCard() { var b = $("signin-cta"); if (b) b.onclick = function () { openAuth("in"); }; }

  /* =================== PART A ENDS HERE — PART B STARTS NEXT MESSAGE ===== */
 /* ============================================================ LOBBY === */
  var lobbyState = {
    lobbyId: null, isHost: false, channel: null,
    timerHandle: null, deadline: 0, chosenFormation: null, profiles: {},
  };

  function enterLobby(lobbyId, isHost) {
    lobbyState.lobbyId = lobbyId;
    lobbyState.isHost = isHost;
    lobbyState.chosenFormation = null;
    lobbyState.deadline = Date.now() + 20000;
    showLobbyScreen();
    BE.lobby.get(lobbyId).then(function (row) {
      if (!row) { toast("Lobby missing."); UI.showScreen("home"); return; }
      var ids = [row.host, row.guest];
      BE.profile.getMany(ids).then(function (pmap) {
        lobbyState.profiles = pmap;
        renderLobby(row);
      });
    });
    if (lobbyState.channel) BE.lobby.unsubscribe(lobbyState.channel);
    lobbyState.channel = BE.lobby.subscribe(lobbyId, function (newRow) {
      if (!newRow) return;
      // Both players ready → host advances phase
      if (newRow.host_ready && newRow.guest_ready && newRow.phase === "formation") {
        if (lobbyState.isHost) BE.lobby.start(lobbyId);
        renderLobby(newRow);
        return;
      }
      // Phase advanced to reveal → Phase 7 takes over
      if (newRow.phase === "reveal") {
        stopLobbyTimer();
        enterFirstPickReveal(newRow);
        return;
      }
      // Phase advanced to draft → Phase 8 takes over
      if (newRow.phase === "draft") {
        stopLobbyTimer();
        enterMpDraft(newRow);
        return;
      }
      renderLobby(newRow);
    });
    startLobbyTimer();
  }

  function showLobbyScreen() {
    document.querySelectorAll(".screen").forEach(function (s) { s.classList.remove("is-active"); });
    var s = $("screen-mplobby");
    if (s) s.classList.add("is-active");
    document.body.dataset.screen = "mplobby";
  }

  function renderLobby(row) {
    var wrap = $("mpl-wrap"); if (!wrap) return;
    var me = state.user.id;
    var hostP = lobbyState.profiles[row.host] || { username: "Host" };
    var guestP = lobbyState.profiles[row.guest] || { username: "Guest" };
    var meIsHost = row.host === me;
    var meName = meIsHost ? hostP.username : guestP.username;
    var oppName = meIsHost ? guestP.username : hostP.username;
    var meReady = meIsHost ? row.host_ready : row.guest_ready;
    var oppReady = meIsHost ? row.guest_ready : row.host_ready;
    var draft = row.draft || {};
    var meFormation = meIsHost ? draft.host_formation : draft.guest_formation;
    var oppFormation = meIsHost ? draft.guest_formation : draft.host_formation;
    var formations = (root.CC_ENGINE && root.CC_ENGINE.FORMATIONS) || [];

    wrap.innerHTML =
      '<div class="mpl-head">' +
        '<div class="mpl-kicker">Champions Cup — Multiplayer</div>' +
        '<div class="mpl-title">Match Lobby</div>' +
        '<div class="mpl-vs"><b>' + esc(meName) + '</b> vs <b>' + esc(oppName) + '</b></div>' +
      '</div>' +
      '<div class="mpl-players">' +
        '<div class="mpl-side me">' +
          '<div class="mpl-name">' + esc(meName) + ' (you)</div>' +
          '<div class="mpl-fm">' + (meFormation ? formationLabel(meFormation, formations) : "—") + '</div>' +
          '<div class="mpl-status' + (meReady ? " ready" : "") + '">' + (meReady ? "Ready" : "Choosing…") + '</div>' +
        '</div>' +
        '<div class="mpl-vs-mid">VS</div>' +
        '<div class="mpl-side">' +
          '<div class="mpl-name">' + esc(oppName) + '</div>' +
          '<div class="mpl-fm">' + (oppFormation ? formationLabel(oppFormation, formations) : "—") + '</div>' +
          '<div class="mpl-status' + (oppReady ? " ready" : "") + '">' + (oppReady ? "Ready" : "Choosing…") + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="mpl-timer-wrap">' +
        '<div class="mpl-timer-label">Both players ready in</div>' +
        '<div class="mpl-timer" id="mpl-timer">0:20</div>' +
      '</div>' +
      '<div class="mpl-panel"><h3>Pick Your Formation</h3>' +
        '<div class="formation-grid" id="mpl-fgrid"></div>' +
      '</div>' +
      '<div class="mpl-panel">' +
        '<div class="mpl-pro-row locked">' +
          '<label class="toggle">' +
            '<input type="checkbox" disabled' + (row.pro ? " checked" : "") + ' />' +
            '<span class="toggle-track"><span class="toggle-thumb"></span></span>' +
            '<span class="toggle-label"><b>Pro Mode</b><small>Locked to inviter\'s choice.</small></span>' +
          '</label></div>' +
      '</div>' +
      '<div class="mpl-actions">' +
        '<button class="btn btn--ghost btn--sm" id="mpl-leave">Leave</button>' +
        '<button class="btn btn--kickoff btn--sm flex1" id="mpl-ready"' + (!meFormation || meReady ? " disabled" : "") + '>' +
          (meReady ? "Ready ✓" : "Ready up") + '</button>' +
      '</div>';

    var fgrid = $("mpl-fgrid");
    if (fgrid && formations.length) {
      formations.forEach(function (f) {
        var card = el("button", "formation-card" + (meFormation === f.id ? " is-selected" : ""));
        card.dataset.id = f.id;
        card.innerHTML =
          '<div class="formation-num">' + f.name + "</div>" +
          '<div class="formation-tag">' + f.tag + "</div>" +
          '<div class="formation-blurb">' + f.blurb + "</div>";
        if (meReady) card.disabled = true;
        card.addEventListener("click", function () {
          if (meReady) return;
          lobbyState.chosenFormation = f.id;
          BE.lobby.setFormation(lobbyState.lobbyId, meIsHost, f.id).then(function () {
            fgrid.querySelectorAll(".formation-card").forEach(function (c) { c.classList.remove("is-selected"); });
            card.classList.add("is-selected");
            var rb = $("mpl-ready"); if (rb) rb.disabled = false;
          });
        });
        fgrid.appendChild(card);
      });
    }

    $("mpl-leave").onclick = function () {
      if (confirm("Leave this lobby?")) {
        BE.lobby.leave(lobbyState.lobbyId);
        teardownLobby();
        UI.showScreen("home");
      }
    };

    $("mpl-ready").onclick = function () {
      var chosen = lobbyState.chosenFormation || meFormation;
      if (!chosen) { toast("Pick a formation first."); return; }
      $("mpl-ready").disabled = true;
      BE.lobby.setReady(lobbyState.lobbyId, meIsHost, true);
    };
  }

  function formationLabel(id, formations) {
    var f = formations.filter(function (x) { return x.id === id; })[0];
    return f ? f.name + " · " + f.tag : id;
  }

  function startLobbyTimer() {
    stopLobbyTimer();
    lobbyState.timerHandle = setInterval(function () {
      var left = Math.max(0, Math.round((lobbyState.deadline - Date.now()) / 1000));
      var t = $("mpl-timer");
      if (t) {
        t.textContent = "0:" + (left < 10 ? "0" : "") + left;
        t.classList.toggle("warn", left <= 5);
      }
      if (left <= 0) {
        stopLobbyTimer();
        var formations = (root.CC_ENGINE && root.CC_ENGINE.FORMATIONS) || [];
        if (!lobbyState.chosenFormation && formations.length) {
          var pick = formations[Math.floor(Math.random() * formations.length)];
          lobbyState.chosenFormation = pick.id;
          BE.lobby.setFormation(lobbyState.lobbyId, lobbyState.isHost, pick.id).then(function () {
            BE.lobby.setReady(lobbyState.lobbyId, lobbyState.isHost, true).then(function () {
              setTimeout(function () { forceCheckBothReady(); }, 600);
            });
          });
        } else {
          BE.lobby.setReady(lobbyState.lobbyId, lobbyState.isHost, true).then(function () {
            setTimeout(function () { forceCheckBothReady(); }, 600);
          });
        }
      }
    }, 250);
  }

  function forceCheckBothReady() {
    if (!lobbyState.lobbyId) return;
    BE.lobby.get(lobbyState.lobbyId).then(function (row) {
      if (!row) return;
      if (row.host_ready && row.guest_ready && row.phase === "formation" && lobbyState.isHost) {
        BE.lobby.start(lobbyState.lobbyId);
      }
    });
  }

  function stopLobbyTimer() {
    if (lobbyState.timerHandle) { clearInterval(lobbyState.timerHandle); lobbyState.timerHandle = null; }
  }

  function teardownLobby() {
    if (lobbyState.channel) BE.lobby.unsubscribe(lobbyState.channel);
    lobbyState.channel = null;
    stopLobbyTimer();
    lobbyState.lobbyId = null;
  }

  /* ================================================ PHASE 7 — FIRST PICK */
  // Show the slot-machine spin between both usernames, land on the server's
  // chosen winner, then 3-2-1 countdown, then advance to draft.
  var revealState = { handle: null, countdownHandle: null };

  function enterFirstPickReveal(row) {
    showLobbyScreen();
    var wrap = $("mpl-wrap"); if (!wrap) return;
    var hostP = lobbyState.profiles[row.host] || { username: "Host" };
    var guestP = lobbyState.profiles[row.guest] || { username: "Guest" };
    var winnerName = row.first_pick === row.host ? hostP.username : guestP.username;
    var meIsHost = row.host === state.user.id;
    var meWon = row.first_pick === state.user.id;

    wrap.innerHTML =
      '<div class="mpl-head">' +
        '<div class="mpl-kicker">Champions Cup — Multiplayer</div>' +
        '<div class="mpl-title">First Pick</div>' +
        '<div class="mpl-vs"><b>' + esc(hostP.username) + '</b> vs <b>' + esc(guestP.username) + '</b></div>' +
      '</div>' +
      '<div class="mpl-panel" style="text-align:center;padding:36px 18px">' +
        '<div id="fp-reel" class="fp-reel">' +
          '<span id="fp-reel-text">…</span>' +
        '</div>' +
        '<div id="fp-result" class="fp-result" hidden>' +
          '<div class="fp-winner-name" id="fp-winner-name"></div>' +
          '<div class="fp-winner-sub" id="fp-winner-sub">picks first</div>' +
        '</div>' +
        '<div id="fp-countdown" class="fp-countdown" hidden>3</div>' +
      '</div>';

    // Spin through both names rapidly for 2 seconds
    var names = [hostP.username, guestP.username];
    var ticks = 0;
    var reelText = $("fp-reel-text");
    if (revealState.handle) clearInterval(revealState.handle);
    revealState.handle = setInterval(function () {
      reelText.textContent = names[ticks % 2];
      ticks++;
      if (ticks > 22) {
        clearInterval(revealState.handle); revealState.handle = null;
        $("fp-reel").style.display = "none";
        var resBox = $("fp-result"); resBox.hidden = false;
        $("fp-winner-name").textContent = winnerName;
        $("fp-winner-sub").textContent = meWon ? "You pick first!" : "picks first";
        // Wait a beat, then 3-2-1 countdown
        setTimeout(function () {
          $("fp-result").style.opacity = "0.4";
          var cd = $("fp-countdown"); cd.hidden = false;
          var n = 3;
          cd.textContent = n;
          revealState.countdownHandle = setInterval(function () {
            n--;
            if (n > 0) cd.textContent = n;
            else {
              clearInterval(revealState.countdownHandle); revealState.countdownHandle = null;
              // Only the host advances the phase (avoids double-write)
              if (meIsHost) BE.lobby.advanceToDraft(lobbyState.lobbyId);
              else {
                // Guest: poll for the phase change in case the host's update is delayed
                setTimeout(function () {
                  BE.lobby.get(lobbyState.lobbyId).then(function (r) {
                    if (r && r.phase !== "draft") BE.lobby.advanceToDraft(lobbyState.lobbyId);
                  });
                }, 800);
              }
            }
          }, 900);
        }, 1800);
      }
    }, 90);
  }

  /* ================================================== PHASE 8 — MP DRAFT */
  // Side-by-side draft. Active player can click; other watches greyed.
  // Same name allowed across teams only if different club+year combo.
  var mpDraft = {
    lobbyId: null, meIsHost: false, row: null, formations: null,
    DATA: null, ENGINE: null, GAME: null, CPU: null,
    rand: null, timerHandle: null, deadline: 0,
  };

  function enterMpDraft(row) {
    mpDraft.lobbyId = lobbyState.lobbyId;
    mpDraft.meIsHost = row.host === state.user.id;
    mpDraft.row = row;
    mpDraft.DATA = root.CC_DATA;
    mpDraft.ENGINE = root.CC_ENGINE;
    mpDraft.GAME = root.CC_GAME;
    mpDraft.CPU = root.CC_CPU;
    mpDraft.rand = mpDraft.GAME.mulberry32(row.seed >>> 0 || 1);

    // Initialize the draft state on the host's side (if not already)
    var d = row.draft || {};
    if (!d.host_squad) {
      var formations = mpDraft.ENGINE.FORMATIONS;
      var hostFormation = formations.filter(function (f) { return f.id === d.host_formation; })[0] || formations[0];
      var guestFormation = formations.filter(function (f) { return f.id === d.guest_formation; })[0] || formations[0];
      d.host_squad = [];
      d.guest_squad = [];
      d.host_open = Object.assign({}, hostFormation.slots);
      d.guest_open = Object.assign({}, guestFormation.slots);
      d.host_drafted = {};
      d.guest_drafted = {};
      d.host_skips = { club: 1, year: 1 };
      d.guest_skips = { club: 1, year: 1 };
      d.turn = row.first_pick;
      d.round = 1;
      d.total_rounds = 7;
      d.current_spin = null;
      if (mpDraft.meIsHost) {
        d.current_spin = makeMpSpin(d);
        d.turn_deadline = new Date(Date.now() + 20000).toISOString();
        BE.lobby.updateDraft(mpDraft.lobbyId, d).then(function (r) {
          if (r && r.draft) { mpDraft.row = r; renderMpDraft(); startMpTurnTimer(); }
        });
        return;
      }
    }
    renderMpDraft();
    startMpTurnTimer();
  }

  function makeMpSpin(d) {
    var meIsTurn = d.turn === mpDraft.row.host;
    var openSlots = meIsTurn ? d.host_open : d.guest_open;
    var drafted = meIsTurn ? d.host_drafted : d.guest_drafted;
    // Use the shared rng to make spins deterministic across both clients
    var spin = mpDraft.GAME.makeSpin(openSlots, drafted, mpDraft.rand);
    if (!spin) return null;
    return {
      clubIndex: spin.clubIndex,
      club: spin.club, short: spin.short, color: spin.color, country: spin.country,
      year: spin.year, label: spin.label,
      eligibleNames: spin.eligible.map(function (p) { return p.n; }),
    };
  }

  function renderMpDraft() {
    showLobbyScreen();
    var wrap = $("mpl-wrap"); if (!wrap) return;
    var d = mpDraft.row.draft || {};
    var me = state.user.id;
    var hostP = lobbyState.profiles[mpDraft.row.host] || { username: "Host" };
    var guestP = lobbyState.profiles[mpDraft.row.guest] || { username: "Guest" };
    var meName = mpDraft.meIsHost ? hostP.username : guestP.username;
    var oppName = mpDraft.meIsHost ? guestP.username : hostP.username;
    var myTurn = d.turn === me;
    var mySquad = mpDraft.meIsHost ? (d.host_squad || []) : (d.guest_squad || []);
    var oppSquad = mpDraft.meIsHost ? (d.guest_squad || []) : (d.host_squad || []);
    var pickNum = mySquad.length + oppSquad.length + 1;
    var totalPicks = (d.total_rounds || 7) * 2;

    wrap.innerHTML =
      '<div class="mpl-head" style="margin-bottom:8px">' +
        '<div class="mpl-kicker">Live Draft — Pick ' + pickNum + ' of ' + totalPicks + '</div>' +
        '<div class="mpl-title" style="font-size:22px">' +
          (myTurn ? "Your turn" : esc(oppName) + "'s turn") +
        '</div>' +
      '</div>' +

      '<div class="mp-timer-wrap"><div class="mp-timer" id="mp-timer">0:20</div></div>' +

      '<div class="mp-spin-panel">' +
        '<div class="slot-reel" style="margin:0 auto;max-width:420px">' +
          '<div class="reel reel--club"><span id="mp-reel-club">' + (d.current_spin ? esc(d.current_spin.short || d.current_spin.club) : "—") + '</span></div>' +
          '<div class="reel reel--year"><span id="mp-reel-year">' + (d.current_spin ? d.current_spin.year : "—") + '</span></div>' +
        '</div>' +
        '<div class="slot-era">' + (d.current_spin ? esc(d.current_spin.label) : "&nbsp;") + '</div>' +
      '</div>' +

      '<div class="mp-board">' +
        '<div class="mp-side' + (myTurn ? " mp-side--active" : "") + '">' +
          '<div class="mp-side-head"><b>' + esc(meName) + '</b><span>You</span></div>' +
          '<div class="mp-pitch" id="mp-pitch-me"></div>' +
        '</div>' +
        '<div class="mp-side' + (!myTurn ? " mp-side--active" : "") + '">' +
          '<div class="mp-side-head"><b>' + esc(oppName) + '</b><span>Opp</span></div>' +
          '<div class="mp-pitch" id="mp-pitch-opp"></div>' +
        '</div>' +
      '</div>' +

      '<div class="mp-players-panel">' +
        '<h3>' + (myTurn ? "Pick a player" : "Watching " + esc(oppName) + " pick…") + '</h3>' +
        '<div class="players' + (myTurn ? "" : " mp-locked") + '" id="mp-players"></div>' +
      '</div>';

    renderMpPitches(mySquad, oppSquad);
    renderMpPlayers(d, myTurn, mySquad, oppSquad);
  }

  function renderMpPitches(mySquad, oppSquad) {
    [["mp-pitch-me", mySquad], ["mp-pitch-opp", oppSquad]].forEach(function (pair) {
      var pitch = $(pair[0]); if (!pitch) return;
      pitch.innerHTML = "";
      var slots = mpDraft.ENGINE.FORMATIONS[0].slots; // shape doesn't really matter visually
      var byPos = { GK: [], DEF: [], MID: [], FWD: [] };
      pair[1].forEach(function (p) { byPos[p.pos].push(p); });
      ["GK", "DEF", "MID", "FWD"].forEach(function (pos) {
        var line = el("div", "pitch-line");
        var n = Math.max(byPos[pos].length, 1);
        for (var i = 0; i < n; i++) {
          var p = byPos[pos][i];
          var chip = el("div", "slot-chip" + (p ? " is-filled" : ""));
          if (p) {
            chip.innerHTML = '<div class="chip-pos">' + pos + '</div>' +
              '<div class="chip-name">' + esc(lastName(p.n)) + '</div>' +
              '<div class="chip-sub">' + esc(p.short || p.club) + ' ' + p.year + '</div>';
          } else {
            chip.innerHTML = '<div class="chip-pos">' + pos + '</div><div class="chip-sub">—</div>';
          }
          line.appendChild(chip);
        }
        pitch.appendChild(line);
      });
    });
  }

  function lastName(n) { var p = (n || "").trim().split(" "); return p[p.length - 1]; }

  function renderMpPlayers(d, myTurn, mySquad, oppSquad) {
    var box = $("mp-players"); if (!box) return;
    box.innerHTML = "";
    if (!d.current_spin) { box.innerHTML = '<div class="muted-line">Spinning…</div>'; return; }
    var era = mpDraft.DATA.eraForYear(d.current_spin.clubIndex, d.current_spin.year);
    if (!era) { box.innerHTML = '<div class="muted-line">No era found.</div>'; return; }

    var openSlots = mpDraft.meIsHost ? d.host_open : d.guest_open;
    var drafted = mpDraft.meIsHost ? d.host_drafted : d.guest_drafted;
    var oppDrafted = mpDraft.meIsHost ? d.guest_drafted : d.host_drafted;

    // Filter to players that match this spin's eligible list (deterministic), then sort
    var nameSet = {}; d.current_spin.eligibleNames.forEach(function (n) { nameSet[n] = true; });
    var list = era.players.filter(function (p) {
      if (!nameSet[p.n]) return false;
      if (openSlots[p.pos] <= 0) return false;
      if (drafted[p.n]) return false;
      return true;
    });

    // Duplicate rule: if opponent picked this same player with the SAME club+year combo,
    // lock it for me too (the same exact slot machine roll can't yield two of the same).
    // Across different rolls, "Messi Barca 2016 vs Messi PSG 2022" is fine because clubs/years differ.

    list.sort(function (a, b) {
      return Math.round(mpDraft.ENGINE.overall(b)) - Math.round(mpDraft.ENGINE.overall(a));
    });

    list.forEach(function (pl) {
      var ovr = Math.round(mpDraft.ENGINE.overall(pl));
      var oppHasSame = !!oppDrafted[pl.n + "|" + d.current_spin.clubIndex + "|" + d.current_spin.year];
      var card = el("button", "pcard" + (oppHasSame ? " mp-locked-card" : ""));
      card.innerHTML =
        '<div class="pos-badge pos-' + pl.pos + '">' + pl.pos + "</div>" +
        '<div class="pcard-info"><div class="pcard-name">' + esc(pl.n) + "</div>" +
          '<div class="pcard-sub">' + esc(d.current_spin.club) + " · " + d.current_spin.year + "</div></div>" +
        '<div class="pcard-ovr">' + ovr + "<small>OVR</small></div>";
      if (myTurn && !oppHasSame) {
        card.addEventListener("click", function () { mpPickPlayer(pl); });
      } else {
        card.disabled = true;
        if (oppHasSame) card.title = "Opponent picked this exact combo";
      }
      box.appendChild(card);
    });
    if (!list.length) box.innerHTML = '<div class="muted-line" style="text-align:left">No eligible players in this roll.</div>';
  }

  function mpPickPlayer(pl) {
    var d = Object.assign({}, mpDraft.row.draft);
    var me = state.user.id;
    var spin = d.current_spin;
    var entry = {
      n: pl.n, pos: pl.pos, r: pl.r,
      club: spin.club, short: spin.short, color: spin.color,
      year: spin.year, label: spin.label, clubIndex: spin.clubIndex,
    };
    var squadKey = mpDraft.meIsHost ? "host_squad" : "guest_squad";
    var openKey = mpDraft.meIsHost ? "host_open" : "guest_open";
    var draftedKey = mpDraft.meIsHost ? "host_drafted" : "guest_drafted";

    d[squadKey] = (d[squadKey] || []).concat([entry]);
    d[openKey] = Object.assign({}, d[openKey]);
    d[openKey][pl.pos] = Math.max(0, (d[openKey][pl.pos] || 0) - 1);
    d[draftedKey] = Object.assign({}, d[draftedKey]);
    d[draftedKey][pl.n] = true;
    d[draftedKey][pl.n + "|" + spin.clubIndex + "|" + spin.year] = true;

    // Swap turn
    d.turn = (d.turn === mpDraft.row.host) ? mpDraft.row.guest : mpDraft.row.host;
    d.round = ((d.host_squad || []).length + (d.guest_squad || []).length) >= (d.total_rounds || 7) * 2 ? d.round : d.round;

    // Are we done?
    var totalPicked = (d.host_squad || []).length + (d.guest_squad || []).length;
    if (totalPicked >= (d.total_rounds || 7) * 2) {
      d.current_spin = null;
      d.turn = null;
      BE.lobby.updateDraft(mpDraft.lobbyId, d).then(function () {
        stopMpTurnTimer();
        showMpDraftComplete();
      });
      return;
    }

    // Roll next spin
    d.current_spin = makeMpSpin({ ...d });
    d.turn_deadline = new Date(Date.now() + 20000).toISOString();
    BE.lobby.updateDraft(mpDraft.lobbyId, d).then(function (r) {
      if (r && r.draft) { mpDraft.row = r; renderMpDraft(); startMpTurnTimer(); }
    });
  }

  function startMpTurnTimer() {
    stopMpTurnTimer();
    var d = mpDraft.row && mpDraft.row.draft;
    if (!d || !d.turn_deadline) return;
    mpDraft.deadline = new Date(d.turn_deadline).getTime();
    mpDraft.timerHandle = setInterval(function () {
      var left = Math.max(0, Math.round((mpDraft.deadline - Date.now()) / 1000));
      var t = $("mp-timer");
      if (t) {
        t.textContent = "0:" + (left < 10 ? "0" : "") + left;
        t.classList.toggle("warn", left <= 5);
      }
      if (left <= 0) {
        stopMpTurnTimer();
        // Only the CURRENT turn-holder auto-picks (avoid double-fire)
        if (mpDraft.row.draft.turn === state.user.id) autoPickMp();
      }
    }, 250);
  }

  function stopMpTurnTimer() {
    if (mpDraft.timerHandle) { clearInterval(mpDraft.timerHandle); mpDraft.timerHandle = null; }
  }

  function autoPickMp() {
    var d = mpDraft.row.draft;
    if (!d || !d.current_spin) return;
    var era = mpDraft.DATA.eraForYear(d.current_spin.clubIndex, d.current_spin.year);
    if (!era) return;
    var openSlots = mpDraft.meIsHost ? d.host_open : d.guest_open;
    var drafted = mpDraft.meIsHost ? d.host_drafted : d.guest_drafted;
    var oppDrafted = mpDraft.meIsHost ? d.guest_drafted : d.host_drafted;
    var nameSet = {}; d.current_spin.eligibleNames.forEach(function (n) { nameSet[n] = true; });
    var list = era.players.filter(function (p) {
      if (!nameSet[p.n]) return false;
      if (openSlots[p.pos] <= 0) return false;
      if (drafted[p.n]) return false;
      var key = p.n + "|" + d.current_spin.clubIndex + "|" + d.current_spin.year;
      if (oppDrafted[key]) return false;
      return true;
    });
    if (!list.length) return;
    // Pick best OVR (auto-pick favors strong choice)
    list.sort(function (a, b) { return mpDraft.ENGINE.overall(b) - mpDraft.ENGINE.overall(a); });
    mpPickPlayer(list[0]);
  }

  function showMpDraftComplete() {
    var wrap = $("mpl-wrap"); if (!wrap) return;
    var d = mpDraft.row.draft || {};
    var hostP = lobbyState.profiles[mpDraft.row.host] || { username: "Host" };
    var guestP = lobbyState.profiles[mpDraft.row.guest] || { username: "Guest" };
    wrap.innerHTML =
      '<div class="mpl-head">' +
        '<div class="mpl-kicker">Draft Complete</div>' +
        '<div class="mpl-title">Both squads locked in</div>' +
      '</div>' +
      '<div class="mpl-panel" style="text-align:center;padding:32px">' +
        '<div style="font-size:48px;margin-bottom:14px">⚽</div>' +
        '<h3 style="font-family:Archivo;font-size:18px;color:var(--gold);margin:0">Match watching is next</h3>' +
        '<p style="color:var(--muted);font-size:14px;margin-top:10px">Phases 9 + 10 (lineup, live sim, results, rematch) are shipping in the next batch.</p>' +
      '</div>' +
      '<div class="mpl-actions">' +
        '<button class="btn btn--kickoff btn--sm flex1" id="mpl-back">Return Home</button>' +
      '</div>';
    $("mpl-back").onclick = function () {
      BE.lobby.leave(lobbyState.lobbyId);
      teardownLobby();
      UI.showScreen("home");
    };
  }

  /* --- Hook the lobby channel to refresh during draft phase ---------------- */
  // The lobby subscribe in enterLobby() already routes phase changes here.
  // We need a separate update listener once we're in the draft so picks sync.
  // We re-use lobbyState.channel — but expand the handler to refresh mpDraft.row
  // when in draft phase. Patching that here keeps everything in one place:
  (function patchLobbySubscribeForDraft() {
    var origSubscribe = BE.lobby && BE.lobby.subscribe;
    if (!origSubscribe || BE.lobby._patched) return;
    BE.lobby._patched = true;
    BE.lobby.subscribe = function (lobbyId, cb) {
      return origSubscribe(lobbyId, function (newRow) {
        try {
          // If we're in MP draft, keep mpDraft.row in sync and re-render
          if (mpDraft.lobbyId && newRow && newRow.id === mpDraft.lobbyId && newRow.phase === "draft") {
            mpDraft.row = newRow;
            renderMpDraft();
            startMpTurnTimer();
            return;
          }
        } catch (e) {}
        cb(newRow);
      });
    };
  })();

  /* ---------------------------------------------------------------- init - */
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
