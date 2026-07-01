/* ============================================================================
 * CLUB CHAMPION  App shell: navigation, accounts, Stats, Friends, MP
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
    if (rankedQ.active) leaveRankedQueueSilently();   // nav away cancels an active search
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
    if (state.user) {
      var uname = (state.profile && state.profile.username) ? state.profile.username : "account";
      btn.classList.add("is-user");
      // Full name on desktop; just the initial (CSS shows it as a circle) on mobile.
      btn.innerHTML = '<span class="acc-dot"></span><span class="acc-name">' + esc(uname) + '</span>' +
        '<span class="acc-initial">' + esc(uname.charAt(0).toUpperCase()) + '</span>';
    } else {
      btn.classList.remove("is-user");
      btn.innerHTML = "Sign in";
    }
  }

  function toggleAccountMenu() {
    var existing = $("acc-menu");
    if (existing) { existing.remove(); return; }
    var m = el("div", "acc-menu"); m.id = "acc-menu";
    m.innerHTML =
      '<div class="acc-head">Signed in as<br><b>' + esc(state.profile ? state.profile.username : "") + "</b></div>" +
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
      state.profile = null; stopHeartbeat(); teardownInviteRealtime(); refreshAccountButton();
      if (rankedQ.active) cancelRankedSearch();
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
      setupInviteRealtime();   // #1: listen for challenges from any tab
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

  var friendsChannel = null, invitesChannel = null, inviteTick = null, h2hChannel = null;
  var enteredLobbyOnce = false;
  
  function teardownFriendsRealtime() {
    if (friendsChannel && BE.friends && BE.friends.unsubscribe) { BE.friends.unsubscribe(friendsChannel); friendsChannel = null; }
    if (h2hChannel && BE.friends && BE.friends.unsubscribe) { BE.friends.unsubscribe(h2hChannel); h2hChannel = null; }
    if (inviteTick) { clearInterval(inviteTick); inviteTick = null; }
  }

  // #1: invite realtime is GLOBAL  it stays live the whole time you're signed
  // in, so a challenge pops for the receiver instantly without opening Friends.
  function setupInviteRealtime() {
    if (invitesChannel || !state.user || !BE.invites || !BE.invites.subscribe) return;
    invitesChannel = BE.invites.subscribe(function (payload) {
      var inv = payload && payload.new;
      if (inv && state.user) {
        var iAmInThisInvite = inv.from_user === state.user.id || inv.to_user === state.user.id;
        if (iAmInThisInvite) {
          if (inv.status === "accepted" && inv.lobby_id) {
            enteredLobbyOnce = true;
            enterLobby(inv.lobby_id, inv.from_user === state.user.id);
            return;
          }
          if (inv.status === "accepted") { retryEnterLobby(12, 500); return; }
          // Fresh incoming challenge → toast so the receiver never misses it.
          if (inv.status === "pending" && inv.to_user === state.user.id && payload.eventType === "INSERT") {
            BE.profile.getMany([inv.from_user]).then(function (pm) {
              var nm = (pm[inv.from_user] || {}).username || "Someone";
              toast("⚔️ " + nm + " challenged you!");
            }).catch(function () { toast("⚔️ New challenge!"); });
          }
        }
      }
      if (state.tab === "friends") renderInvites();
    });
  }

  function teardownInviteRealtime() {
    if (invitesChannel && BE.invites && BE.invites.unsubscribe) { BE.invites.unsubscribe(invitesChannel); invitesChannel = null; }
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
    // BUG #3 FIX: subscribe to head_to_head so the friend rows update live when
    // a match finishes (the host's record_h2h RPC fires after every game).
    if (BE.friends.subscribeH2H) {
      h2hChannel = BE.friends.subscribeH2H(function () {
        if (state.tab === "friends") refreshAllH2H();
      });
    }
    setupInviteRealtime();   // #1: global subscription; safe no-op if already live
    inviteTick = setInterval(function () {
      if (state.tab === "friends") updateInviteCountdowns();
    }, 1000);
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

  function refreshAllH2H() {
    if (!state.user || !BE.friends.list) return;
    BE.friends.list().then(function (fr) {
      fr.forEach(function (f) {
        BE.friends.headToHead(f.userId).then(function (h) {
          var e = $("h2h-" + f.userId); if (!e) return;
          e.textContent = h.wins + "-" + h.losses;
          e.classList.toggle("dim", (h.wins + h.losses) === 0);
        });
      });
    });
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
      '<div class="ip-head"><div class="ip-title">Challenge ' + esc(name) + "</div>" +
        '<div class="ip-sub">7-round live draft, then a one-off match.</div></div>' +
      '<div class="ip-field"><span class="ip-label">Player pool</span>' +
        '<div class="seg ip-seg" id="ip-pool-seg">' +
          '<button type="button" data-pool="club" class="is-selected">⚽ Clubs</button>' +
          '<button type="button" data-pool="wc">🌍 World Cup</button>' +
        '</div></div>' +
      '<label class="toggle ip-toggle">' +
        '<input type="checkbox" id="ip-pro" />' +
        '<span class="toggle-track"><span class="toggle-thumb"></span></span>' +
        '<span class="toggle-label"><b>Pro Mode</b><small>Hide ratings  draft on knowledge alone.</small></span>' +
      '</label>' +
      '<div class="ip-mode-note">Mode <b>Classic</b><span class="dim"> · Tournament soon</span></div>' +
      '<button class="btn btn--kickoff btn--sm" id="ip-send">Send challenge <span>→</span></button>';
    document.body.appendChild(m);
    var r = btn.getBoundingClientRect();
    m.style.top = (r.bottom + 8) + "px";
    m.style.left = Math.max(8, Math.min(r.left - 80, window.innerWidth - 288)) + "px";
    var poolSeg = $("ip-pool-seg");
    poolSeg.querySelectorAll("button").forEach(function (b) {
      b.onclick = function () {
        poolSeg.querySelectorAll("button").forEach(function (x) { x.classList.remove("is-selected"); });
        b.classList.add("is-selected");
      };
    });
    $("ip-send").onclick = function () {
      $("ip-send").disabled = true;
      var sel = poolSeg.querySelector("button.is-selected");
      var pool = (sel && sel.dataset.pool) || "club";
      BE.invites.send(userId, { pool: pool, pro: $("ip-pro").checked }).then(function (r) {
        m.remove(); toast("Challenge sent to " + name + "!");
        var inv = r && r.data;
        // A2: host immediately creates + enters the lobby, then waits (grey 30s timer).
        if (inv) {
          BE.lobby.createFromInvite(inv).then(function (lr) {
            if (lr && lr.data) { enteredLobbyOnce = true; enterLobby(lr.data.id, true); }
            else renderInvites();
          }).catch(function () { renderInvites(); });
        } else { renderInvites(); }
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
            ? (x.lobby_id ? '<button class="mini-btn ok" data-join-inv="' + x.lobby_id + '">🎮 Join Lobby</button>' : '<span class="dim" style="font-size:12px">Sending…</span>') +
              '<button class="mini-btn" data-cancel-inv="' + x.id + '">Cancel</button>'
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
      box.querySelectorAll("[data-join-inv]").forEach(function (b) { b.onclick = function () { enteredLobbyOnce = true; enterLobby(b.dataset.joinInv, true); }; });   // A3
      updateInviteCountdowns();
    }).catch(function () {});
  }

  
  function maybeAutoJoinLobby() {
    if (!state.user || !BE.lobby) return;
    if (document.body.dataset.screen === "mplobby") return;
    if (enteredLobbyOnce) return;

    BE.lobby.mine().then(function (lobbyRow) {
      if (lobbyRow) {
        enteredLobbyOnce = true;
        enterLobby(lobbyRow.id, lobbyRow.host === state.user.id);
      }
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
    if (!inviteRow) { retryEnterLobby(12, 500); return; }
    var amHost = !!(state.user && inviteRow.from_user === state.user.id);
    // Host already created the lobby on send → just join it (no duplicate lobby).
    if (inviteRow.lobby_id) {
      enteredLobbyOnce = true;
      enterLobby(inviteRow.lobby_id, amHost);
      return;
    }
    // Fallback for older invites with no pre-made lobby.
    BE.lobby.createFromInvite(inviteRow).then(function (r) {
      if (r && r.data) { enteredLobbyOnce = true; enterLobby(r.data.id, amHost); }
      else retryEnterLobby(12, 500);
    }).catch(function () { retryEnterLobby(12, 500); });
  }

  function tryEnterLobby() {
    if (!BE.lobby) return;
    BE.lobby.mine().then(function (lobbyRow) {
      if (lobbyRow) enterLobby(lobbyRow.id, lobbyRow.host === state.user.id);
      else toast("Couldn't find lobby.");
    });
  }

  function retryEnterLobby(tries, delay) {
    tries = tries || 12;
    delay = delay || 500;

    function attempt(n) {
      BE.lobby.mine().then(function (lobbyRow) {
        if (lobbyRow) {
          enterLobby(lobbyRow.id, lobbyRow.host === state.user.id);
          return;
        }
        if (n > 0) {
          setTimeout(function () { attempt(n - 1); }, delay);
        } else {
          toast("Couldn't find match lobby  try again.");
        }
      }).catch(function () {
        if (n > 0) {
          setTimeout(function () { attempt(n - 1); }, delay);
        } else {
          toast("Couldn't find match lobby  try again.");
        }
      });
    }

    attempt(tries);
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

  var rankedBoard = { kind: "global" };   // "global" | "friends" leaderboard toggle

  function renderRanked() {
    var wrap = $("screen-ranked"); if (!wrap) return;
    var head = '<div class="page-head"><h2>Ranked</h2>' +
      '<p>Global matchmaking - climb the ladder. Season <b id="rank-season-num">' + rankedSeasonNumber() + '</b> ' +
      '<span id="rank-season-cd" class="dim">' + fmtSeasonCountdown(rankedSeasonEndsAt() - Date.now()) + "</span></p></div>";
    if (!state.user) { wrap.innerHTML = head + signInCard("Sign in to play ranked."); wireSignInCard(); return; }
    if (!BE.configured) { wrap.innerHTML = head + emptyCard("Accounts aren't set up", "Ranked needs Supabase configured."); return; }

    wrap.innerHTML = head +
      '<div class="card rank-me" id="rank-me"><div class="muted-line" style="margin:0">Loading your rank…</div></div>' +
      '<div class="card rank-board">' +
        '<div class="seg rank-board-seg" id="rank-board-seg">' +
          '<button data-k="global"' + (rankedBoard.kind === "global" ? ' class="is-selected"' : "") + '>Global</button>' +
          '<button data-k="friends"' + (rankedBoard.kind === "friends" ? ' class="is-selected"' : "") + '>Friends</button>' +
        "</div>" +
        '<div id="rank-board-rows"><div class="muted-line">Loading leaderboard…</div></div>' +
      "</div>";

    $("rank-board-seg").querySelectorAll("button").forEach(function (b) {
      b.onclick = function () {
        rankedBoard.kind = b.dataset.k;
        $("rank-board-seg").querySelectorAll("button").forEach(function (x) { x.classList.remove("is-selected"); });
        b.classList.add("is-selected");
        renderRankedBoard();
      };
    });

    BE.ranked.myStats().then(function (s) {
      var box = $("rank-me"); if (!box) return;
      if (!s) { showRankMeError("Couldn't load your rank."); return; }
      var t = tierForMmr(s.mmr);
      box.innerHTML = rankHeroHTML("rank-tab", t, s.ranked_wins, s.ranked_losses);
    }).catch(function (e) {
      console.error("renderRanked myStats failed:", e && e.message);
      // Show the ACTUAL error text - this is exactly the class of failure
      // ("ranked SQL not (fully) applied") that used to hang silently on
      // "Loading your rank..." forever with nothing to go on.
      showRankMeError((e && e.message) ? e.message : "Couldn't load your rank.");
    });

    renderRankedBoard();
  }

  function showRankMeError(msg) {
    var box = $("rank-me"); if (!box) return;
    box.innerHTML = '<div class="muted-line" style="margin:0 0 10px">' + esc(msg) + '</div>' +
      '<button class="mini-btn" id="rank-me-retry">Retry</button>';
    var rb = $("rank-me-retry"); if (rb) rb.onclick = renderRanked;
  }

  function nextDivisionLabel(t) {
    if (t.division === 1) {
      var nextTier = RANKED_TIERS[t.tierIndex + 1] || "Champion";
      return nextTier + (t.tierIndex + 1 < RANKED_TIERS.length ? " V" : "");
    }
    return t.name + " " + RANKED_ROMAN[t.division - 1];
  }

  function renderRankedBoard() {
    var box = $("rank-board-rows"); if (!box) return;
    box.innerHTML = '<div class="muted-line">Loading leaderboard…</div>';
    var fetchRows = rankedBoard.kind === "global"
      ? BE.ranked.leaderboardGlobal(50)
      : BE.friends.list().then(function (fr) {
          var ids = fr.map(function (f) { return f.userId; });
          ids.push(state.user.id);   // include myself in the friends view
          return BE.ranked.leaderboardFriends(ids);
        });
    fetchRows.then(function (rows) {
      var box2 = $("rank-board-rows"); if (!box2) return;
      if (!rows.length) { box2.innerHTML = '<div class="muted-line">' + (rankedBoard.kind === "friends" ? "No ranked friends yet." : "No ranked players yet.") + "</div>"; return; }
      box2.innerHTML = rows.map(function (r, i) {
        var t = tierForMmr(r.mmr);
        var me = r.id === state.user.id;
        return '<div class="rank-row' + (me ? " is-me" : "") + '">' +
          '<div class="rank-row-pos">' + (i + 1) + '</div>' +
          '<img class="rank-row-badge" src="' + (RANKED_BADGE_URLS[t.tierIndex] || RANKED_BADGE_URLS[0]) + '" alt="" />' +
          '<div class="rank-row-name">' + esc(r.username) + (me ? " (you)" : "") + '</div>' +
          '<div class="rank-row-tier">' + esc(t.label) + '</div>' +
          '<div class="rank-row-wl">' + r.ranked_wins + "-" + r.ranked_losses + '</div>' +
          '<div class="rank-row-mmr">' + t.mmr + "</div></div>";
      }).join("");
    }).catch(function (e) {
      console.error("renderRankedBoard failed:", e && e.message);
      var box3 = $("rank-board-rows"); if (!box3) return;
      box3.innerHTML = '<div class="muted-line">' + esc((e && e.message) ? e.message : "Couldn't load the leaderboard.") + '</div>' +
        '<button class="mini-btn" id="rank-board-retry" style="margin-top:8px">Retry</button>';
      var rb = $("rank-board-retry"); if (rb) rb.onclick = renderRankedBoard;
    });
  }

  function emptyCard(t, sub) { return '<div class="card empty-card"><div class="empty-emoji">⚽</div><h3>' + t + "</h3><p>" + sub + "</p></div>"; }
  function signInCard(t) { return '<div class="card empty-card"><div class="empty-emoji">🔒</div><h3>' + t + '</h3><button class="btn btn--kickoff btn--sm" id="signin-cta" style="max-width:200px;margin:14px auto 0">Sign in</button></div>'; }
  function wireSignInCard() { var b = $("signin-cta"); if (b) b.onclick = function () { openAuth("in"); }; }

  /* ========================================================== RANKED === */
  // Global matchmaking queue -> existing lobby/draft/match pipeline (unchanged
  // from casual 1v1). "Global" is by construction: the queue has no region
  // column and try_ranked_match() pairs purely on wait time, so any two players
  // anywhere can be matched.
  var rankedQ = { active: false, channel: null, pollHandle: null, elapsed: 0 };

  // Every ranked game played since the last FRESH entry into ranked (i.e.
  // since the Kick Off button on the home screen, not "Find Another Match" -
  // that keeps the same session going). Consumed and cleared once the results
  // popup is shown on Return Home.
  var rankedSession = { games: [], startMmr: null };

  // 100 mmr per division, 5 divisions per tier (500/tier). Matches the
  // ranked_k_win/ranked_k_loss bands in schema.sql 1:1 (0-499/500-999/.../2000+).
  var RANKED_TIERS = ["Bronze", "Silver", "Gold", "Platinum", "Diamond"];
  var RANKED_ROMAN = ["", "I", "II", "III", "IV", "V"];
  function tierForMmr(mmr) {
    mmr = Math.max(0, Math.round(mmr || 0));
    var tierIndex = Math.floor(mmr / 500);
    if (tierIndex >= RANKED_TIERS.length) {
      return { name: "Champion", division: null, label: "Champion", mmr: mmr, pointsInDivision: null, tierIndex: RANKED_TIERS.length };
    }
    var withinTier = mmr % 500;
    var division = 5 - Math.floor(withinTier / 100);   // 5 (tier start) -> 1 (about to rank up)
    var name = RANKED_TIERS[tierIndex];
    return {
      name: name, division: division, label: name + " " + RANKED_ROMAN[division],
      mmr: mmr, pointsInDivision: withinTier % 100, tierIndex: tierIndex,
    };
  }

  // Transparent-PNG shield badges, one per tier (Bronze/Silver/Gold/Platinum/
  // Diamond/Champion), generated via Higgsfield + background removal.
  var RANKED_BADGE_URLS = [
    "https://d8j0ntlcm91z4.cloudfront.net/user_3DIHRL4hfIamgJ8ncr9DUxS5zcC/hf_20260701_172403_5758a2a6-2212-4c6e-a7ba-d38e5d2fb9c2.png",
    "https://d8j0ntlcm91z4.cloudfront.net/user_3DIHRL4hfIamgJ8ncr9DUxS5zcC/hf_20260701_172411_721570d2-fcd7-4fe0-8cd4-faa02a2a8fc6.png",
    "https://d8j0ntlcm91z4.cloudfront.net/user_3DIHRL4hfIamgJ8ncr9DUxS5zcC/hf_20260701_172423_ac8ce5c5-4469-4215-afd4-226e78f9390c.png",
    "https://d8j0ntlcm91z4.cloudfront.net/user_3DIHRL4hfIamgJ8ncr9DUxS5zcC/hf_20260701_172435_2f1c0a27-98e0-4ec3-a317-b45004bf79ed.png",
    "https://d8j0ntlcm91z4.cloudfront.net/user_3DIHRL4hfIamgJ8ncr9DUxS5zcC/hf_20260701_172442_92aee393-bdb0-45f2-91a4-4c8f239c5fd3.png",
    "https://d8j0ntlcm91z4.cloudfront.net/user_3DIHRL4hfIamgJ8ncr9DUxS5zcC/hf_20260701_172449_9163075f-0f31-46e6-bb91-ee1ae96c6890.png",
  ];

  // Shared "hero" header used by BOTH the Ranked tab and the post-match popup:
  // big centered badge, tier name above it, record below, animated bar below
  // that. idPrefix keeps element ids unique when both could theoretically
  // exist in the DOM at once.
  function rankHeroHTML(idPrefix, t, wins, losses) {
    var barPct = t.division ? t.pointsInDivision : 100;
    var badgeUrl = RANKED_BADGE_URLS[t.tierIndex] || RANKED_BADGE_URLS[0];
    return '<div class="rank-hero">' +
      '<div class="rank-hero-name rank-tier-' + t.tierIndex + '" id="' + idPrefix + '-name">' + esc(t.label) + '</div>' +
      '<div class="rank-hero-badge-wrap"><img class="rank-hero-badge" id="' + idPrefix + '-badge" src="' + badgeUrl + '" alt="' + esc(t.label) + ' badge" /></div>' +
      '<div class="rank-hero-record" id="' + idPrefix + '-record">' + wins + "-" + losses + " · " + t.mmr + " pts</div>" +
      '<div class="rank-hero-bar-wrap">' +
        '<div class="rank-hero-bar"><div class="rank-hero-bar-fill rank-tier-' + t.tierIndex + '" id="' + idPrefix + '-barfill" style="width:' + barPct + '%"></div></div>' +
        '<div class="rank-hero-bar-label" id="' + idPrefix + '-barlabel">' +
          (t.division ? (t.pointsInDivision + "/100 to " + nextDivisionLabel(t)) : "Top of the ladder - no ceiling.") +
        "</div>" +
      "</div>" +
    "</div>";
  }

  function clampPct(v) { return Math.max(0, Math.min(100, v)); }
  function tweenBarWidth(fillEl, fromPct, toPct, ms, cb) {
    if (!fillEl) { if (cb) cb(); return; }
    fillEl.style.transition = "none";
    fillEl.style.width = clampPct(fromPct) + "%";
    void fillEl.offsetWidth;   // force reflow so "none" takes effect before re-enabling below
    fillEl.style.transition = "width " + ms + "ms cubic-bezier(.22,.9,.34,1)";
    requestAnimationFrame(function () { fillEl.style.width = clampPct(toPct) + "%"; });
    if (cb) setTimeout(cb, ms + 60);
  }

  // Animates a rank-hero (by idPrefix) from fromMmr to toMmr. Promotions fill
  // the bar to 100%, pop, reset, and continue for EVERY 100-point division
  // boundary crossed (so a big multi-win session correctly plays through
  // several "level ups" in a row, not just one), swapping the badge/tier name
  // in sync each time a tier itself changes. Demotions are a single plain
  // tween - no overflow theatrics, just the number moving down.
  function animateRankProgression(idPrefix, fromMmr, toMmr, cb) {
    var fillEl = $(idPrefix + "-barfill"), nameEl = $(idPrefix + "-name"),
        badgeEl = $(idPrefix + "-badge"), labelEl = $(idPrefix + "-barlabel");
    if (!fillEl) { if (cb) cb(); return; }
    fromMmr = Math.max(0, Math.round(fromMmr)); toMmr = Math.max(0, Math.round(toMmr));

    function pctOf(mmr) { var t = tierForMmr(mmr); return t.division ? t.pointsInDivision : 100; }
    function syncTierUI(mmrPoint) {
      var tt = tierForMmr(mmrPoint);
      if (nameEl) { nameEl.textContent = tt.label; nameEl.className = "rank-hero-name rank-tier-" + tt.tierIndex; }
      if (fillEl) fillEl.className = "rank-hero-bar-fill rank-tier-" + tt.tierIndex;
      if (labelEl) labelEl.textContent = tt.division ? (tt.pointsInDivision + "/100 to " + nextDivisionLabel(tt)) : "Top of the ladder - no ceiling.";
      var badgeUrl = RANKED_BADGE_URLS[tt.tierIndex];
      if (badgeEl && badgeUrl && badgeEl.getAttribute("src") !== badgeUrl) { badgeEl.setAttribute("src", badgeUrl); badgeEl.setAttribute("alt", tt.label + " badge"); }
      return tt;
    }

    if (toMmr === fromMmr) { syncTierUI(toMmr); if (cb) cb(); return; }

    if (toMmr < fromMmr) {
      tweenBarWidth(fillEl, pctOf(fromMmr), pctOf(toMmr), 900, function () { syncTierUI(toMmr); if (cb) cb(); });
      return;
    }

    var boundariesLeft = Math.floor(toMmr / 100) - Math.floor(fromMmr / 100);
    var cur = fromMmr;
    (function step() {
      if (boundariesLeft <= 0) {
        tweenBarWidth(fillEl, pctOf(cur), pctOf(toMmr), 900, function () { syncTierUI(toMmr); if (cb) cb(); });
        return;
      }
      var nextBoundary = (Math.floor(cur / 100) + 1) * 100;
      tweenBarWidth(fillEl, pctOf(cur), 100, 650, function () {
        fillEl.classList.add("rank-bar-pop");
        setTimeout(function () {
          fillEl.classList.remove("rank-bar-pop");
          cur = nextBoundary; boundariesLeft--;
          syncTierUI(cur);
          fillEl.style.transition = "none"; fillEl.style.width = "0%"; void fillEl.offsetWidth;
          setTimeout(step, 120);
        }, 340);
      });
    })();
  }

  function onRankedKickoff() {
    if (!state.user) { openAuth("in"); return; }
    if (!BE.configured) { toast("Accounts aren't set up yet."); return; }
    // Fresh entry point (home screen Kick Off, not "Find Another Match") ->
    // start a new results-popup session. startMmr is captured lazily, the
    // first time a match actually starts (see enterMpMatch).
    rankedSession.games = [];
    rankedSession.startMmr = null;
    startRankedSearch();
  }

  function startRankedSearch() {
    if (rankedQ.active) return;
    rankedQ.active = true;
    rankedQ.elapsed = 0;
    BE.ranked.joinQueue().catch(function () {
      rankedQ.active = false;
      toast("Couldn't join the queue - try again.");
    });
    renderRankedSearching();

    var me = state.user.id;
    if (rankedQ.channel) BE.ranked.unsubscribe(rankedQ.channel);
    rankedQ.channel = BE.ranked.subscribeQueue(me, function (row) {
      if (row && row.matched_lobby_id) enterRankedLobby(row.matched_lobby_id);
    });

    pollRankedMatch();
  }

  function pollRankedMatch() {
    if (rankedQ.pollHandle) clearTimeout(rankedQ.pollHandle);
    if (!rankedQ.active) return;
    BE.ranked.tryMatch().then(function (lobbyId) {
      if (!rankedQ.active) return;
      if (lobbyId) { enterRankedLobby(lobbyId); return; }
      // Not matched by my own call - maybe someone else already matched me
      // (the realtime subscribe above should catch this instantly, but a poll
      // fallback covers a missed/late realtime event too).
      BE.ranked.checkMatched().then(function (matchedId) {
        if (!rankedQ.active) return;
        if (matchedId) { enterRankedLobby(matchedId); return; }
        rankedQ.elapsed += 2;
        var e = $("ranked-elapsed"); if (e) e.textContent = fmtClock(rankedQ.elapsed);
        rankedQ.pollHandle = setTimeout(pollRankedMatch, 2000);
      });
    }).catch(function () {
      if (rankedQ.active) rankedQ.pollHandle = setTimeout(pollRankedMatch, 2000);
    });
  }

  function enterRankedLobby(lobbyId) {
    if (!rankedQ.active) return;   // already handled (or cancelled) via another path
    rankedQ.active = false;
    if (rankedQ.pollHandle) { clearTimeout(rankedQ.pollHandle); rankedQ.pollHandle = null; }
    if (rankedQ.channel) { BE.ranked.unsubscribe(rankedQ.channel); rankedQ.channel = null; }
    BE.ranked.leaveQueue();   // matched - tidy up the queue row, best effort
    BE.lobby.get(lobbyId).then(function (row) {
      if (!row) { toast("Match lobby not found - try again."); return; }
      enteredLobbyOnce = true;
      enterLobby(lobbyId, row.host === state.user.id);
    }).catch(function () { toast("Couldn't enter the match - try again."); });
  }

  function leaveRankedQueueSilently() {
    if (!rankedQ.active) return;
    rankedQ.active = false;
    if (rankedQ.pollHandle) { clearTimeout(rankedQ.pollHandle); rankedQ.pollHandle = null; }
    if (rankedQ.channel) { BE.ranked.unsubscribe(rankedQ.channel); rankedQ.channel = null; }
    BE.ranked.leaveQueue();
  }

  function cancelRankedSearch() {
    if (!rankedQ.active) return;
    leaveRankedQueueSilently();
    setTab("play");
  }

  function renderRankedSearching() {
    showLobbyScreen();
    var wrap = $("mpl-wrap"); if (!wrap) return;
    wrap.innerHTML =
      '<div class="mpl-head"><div class="mpl-kicker">Champions Cup - Ranked</div>' +
        '<div class="mpl-title">Finding an opponent…</div></div>' +
      '<div class="mpl-panel" style="text-align:center;padding:40px 18px">' +
        '<div class="ranked-search-spin"></div>' +
        '<div class="fp-result" style="margin-top:18px"><div class="fp-winner-sub">Searching globally - any region</div></div>' +
        '<div class="mpl-timer" id="ranked-elapsed" style="margin-top:6px">0:00</div>' +
        '<div class="mpl-actions" style="margin-top:22px;justify-content:center">' +
          '<button class="btn btn--ghost btn--sm" id="ranked-cancel">Cancel</button>' +
        '</div></div>';
    var cb = $("ranked-cancel"); if (cb) cb.onclick = cancelRankedSearch;
  }

  /* ---- Monthly ranked seasons (UTC calendar month) -----------------------
     Purely a function of "now" - mirrors ranked_current_season()/the season
     boundary in schema.sql exactly, so the countdown shown here always lines
     up with when the server will actually halve everyone's mmr. Season 1 =
     July 2026 (this feature's launch month). */
  var RANKED_SEASON_BASE = 2026 * 12 + 6;   // year*12+month, 0-indexed month (July = 6)
  function rankedSeasonNumber() {
    var n = new Date();
    return Math.max(1, (n.getUTCFullYear() * 12 + n.getUTCMonth()) - RANKED_SEASON_BASE + 1);
  }
  function rankedSeasonEndsAt() {
    var n = new Date();
    return Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + 1, 1, 0, 0, 0);
  }
  // Degrading granularity exactly as specified: days+hours -> hours+mins -> mins+secs.
  function fmtSeasonCountdown(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    var d = Math.floor(s / 86400); s -= d * 86400;
    var h = Math.floor(s / 3600); s -= h * 3600;
    var m = Math.floor(s / 60); s -= m * 60;
    if (d > 0) return d + "d " + h + "h left";
    if (h > 0) return h + "h " + m + "m left";
    return m + "m " + s + "s left";
  }
  function tickRankedSeasonUI() {
    var num = rankedSeasonNumber(), left = rankedSeasonEndsAt() - Date.now();
    var n1 = $("rb-season-num"); if (n1) n1.textContent = num;
    var cd1 = $("rb-countdown"); if (cd1) cd1.textContent = fmtSeasonCountdown(left);
    var n2 = $("rank-season-num"); if (n2) n2.textContent = num;
    var cd2 = $("rank-season-cd"); if (cd2) cd2.textContent = fmtSeasonCountdown(left);
  }
  setInterval(tickRankedSeasonUI, 1000);
  tickRankedSeasonUI();   // paint immediately - don't wait a full second for first tick

  /* =================== PART A ENDS HERE  PART B STARTS NEXT MESSAGE ===== */
 /* ============================================================ LOBBY === */
  var lobbyState = {
    lobbyId: null, isHost: false, channel: null,
    timerHandle: null, deadline: 0, chosenFormation: null, profiles: {},
    // Local, per-entry deadlines so timers can't freeze on a lost DB write:
    formationDeadline: 0,   // gold 20s  set once both have joined (this client)
    greyDeadline: 0,        // grey 30s  "waiting for opponent to join"
    steppedOut: false,      // I clicked Leave but can still rejoin within the window
    exiting: false,         // an auto-home message is showing; ignore further ticks/echoes
  };

  function enterLobby(lobbyId, isHost) {
    lobbyState.lobbyId = lobbyId;
    lobbyState.isHost = isHost;
    lobbyState.chosenFormation = null;
    lobbyState.deadline = Date.now() + 20000;
    // Fresh entry (incl. rematch re-entry): re-arm timers locally so nothing carries
    // over a stale/expired deadline from the previous game.
    lobbyState.formationDeadline = 0;
    lobbyState.greyDeadline = 0;
    lobbyState.steppedOut = false;
    lobbyState.exiting = false;
    showLobbyScreen();
    BE.lobby.get(lobbyId).then(function (row) {
      if (!row) { toast("Lobby missing."); UI.showScreen("home"); return; }
      lobbyState.lastRow = row;
      // B: mark my presence so the other side knows when BOTH have joined.
      var meIsHost = row.host === state.user.id;
      BE.lobby.updateDraft(lobbyId, meIsHost ? { host_in: true } : { guest_in: true }).catch(function () {});
      var ids = [row.host, row.guest];
      BE.profile.getMany(ids).then(function (pmap) {
        lobbyState.profiles = pmap;
        renderLobby(row);
      });
    });
    if (lobbyState.channel) BE.lobby.unsubscribe(lobbyState.channel);
    lobbyState.channel = BE.lobby.subscribe(lobbyId, function (newRow) {
      if (!newRow) return;
      if (!lobbyState.lobbyId) return;              // #7: ignore late echoes after we've left
      if (lobbyState.exiting) return;               // an exit message is showing  don't re-enter
      lobbyState.lastRow = newRow;                  // B: tick reads the live row
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
        if (mpMatch.started || mpEntering) return;  // already past draft locally; ignore stale echo
        stopLobbyTimer();
        enterMpDraft(newRow);
        return;
      }
      // Phase advanced to match → Phase 9 (lineup → live sim → results).
      if (newRow.phase === "match") {
        stopLobbyTimer();
        if (mpMatch.started) { enterMpMatch(newRow); return; }  // rematch-flag echo while in match
        mpEntering = true;
        enterMpMatchResilient(newRow, 0);
        return;
      }
      // A rematch reset bounces us back to formation → re-enter the lobby fresh.
      if (newRow.phase === "formation" && mpMatch.started) {
        resetMpMatch();
        enterLobby(newRow.id, newRow.host === state.user.id);
        return;
      }
      // Opponent left / match abandoned.
      if (newRow.phase === "done") {
        // If WE were the one who left, lobbyState.lobbyId is already null and
        // we've already navigated home. Don't re-trigger anything.
        if (!lobbyState.lobbyId) return;
        onOpponentLeft();
        return;
      }
      // While I'm stepped out, keep MY rejoin screen  don't let an echo (e.g. my
      // own presence update) re-render the full lobby over it. The timer keeps
      // ticking via the interval.
      if (lobbyState.steppedOut) { paintLobbyTimer(newRow); return; }
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
    lobbyState.lastRow = row;
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
    var bothIn = !!(draft.host_in && draft.guest_in);

    wrap.innerHTML =
      '<div class="mpl-head">' +
        '<div class="mpl-kicker">Champions Cup  Multiplayer</div>' +
        '<div class="mpl-title">Match Lobby</div>' +
        '<div class="mpl-vs"><b>' + esc(meName) + '</b> vs <b>' + esc(oppName) + '</b></div>' +
      '</div>' +
      '<div class="mpl-players">' +
        '<div class="mpl-side me">' +
          '<div class="mpl-name">' + esc(meName) + ' (you)</div>' +
          '<div class="mpl-fm">' + (meFormation ? formationLabel(meFormation, formations) : "") + '</div>' +
          '<div class="mpl-status' + (meReady ? " ready" : "") + '">' + (meReady ? "Ready" : "Choosing…") + '</div>' +
        '</div>' +
        '<div class="mpl-vs-mid">VS</div>' +
        '<div class="mpl-side">' +
          '<div class="mpl-name">' + esc(oppName) + '</div>' +
          '<div class="mpl-fm">' + (oppFormation ? formationLabel(oppFormation, formations) : "") + '</div>' +
          '<div class="mpl-status' + (oppReady ? " ready" : "") + '">' + (oppReady ? "Ready" : "Choosing…") + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="mpl-timer-wrap">' +
        '<div class="mpl-timer-label" id="mpl-timer-label">' + (bothIn ? "Pick &amp; ready up" : "Waiting for opponent to join…") + '</div>' +
        '<div class="mpl-timer' + (bothIn ? "" : " mpl-timer--grey") + '" id="mpl-timer">' + (bothIn ? "0:20" : "0:30") + '</div>' +
      '</div>' +
      '<div class="mpl-panel"><h3>Pick Your Formation</h3>' +
        '<div class="formation-grid" id="mpl-fgrid"></div>' +
      '</div>' +
      '<div class="mpl-panel">' +
        '<div class="mpl-pro-row locked">' +
          '<label class="toggle">' +
            '<input type="checkbox" disabled' + (row.pro ? " checked" : "") + ' />' +
            '<span class="toggle-track"><span class="toggle-thumb"></span></span>' +
            '<span class="toggle-label"><b>Pro Mode</b><small>' + (row.ranked ? "Ranked is always Pro." : "Locked to inviter's choice.") + '</small></span>' +
          '</label></div>' +
      '</div>' +
      '<div class="mpl-actions">' +
        '<button class="btn btn--ghost btn--sm" id="mpl-leave">Leave</button>' +
        '<button class="btn btn--kickoff btn--sm flex1" id="mpl-ready"' + (!meFormation || meReady ? " disabled" : "") + '>' +
          (meReady ? "Ready ✓" : "Ready up") + '</button>' +
      '</div>';

    var fgrid = $("mpl-fgrid");
    var dotClass = { GK: "pos-gk", DEF: "pos-def", MID: "pos-mid", FWD: "pos-fwd" };
    if (fgrid && formations.length) {
      formations.forEach(function (f) {
        var card = el("button", "formation-card" + (meFormation === f.id ? " is-selected" : ""));
        card.dataset.id = f.id;
        var mini = "";
        ["FWD", "MID", "DEF", "GK"].forEach(function (pos) {
          var nn = f.slots[pos]; if (!nn) return;
          var dots = ""; for (var k = 0; k < nn; k++) dots += '<i class="' + dotClass[pos] + '" style="background:var(--' + dotClass[pos] + ')"></i>';
          mini += '<div class="row">' + dots + "</div>";
        });
        card.innerHTML =
          '<div class="formation-num">' + f.name + "</div>" +
          '<div class="formation-tag">' + f.tag + "</div>" +
          '<div class="formation-mini">' + mini + "</div>" +
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

    // Leave is forgiving: step out (clear my presence) but stay rejoinable for the
    // rest of the gold window instead of killing the lobby outright.
    $("mpl-leave").onclick = function () { stepOutOfLobby(); };

    $("mpl-ready").onclick = function () {
      var chosen = lobbyState.chosenFormation || meFormation;
      if (!chosen) { toast("Pick a formation first."); return; }
      var btn = $("mpl-ready"); btn.disabled = true; btn.textContent = "Ready ✓";
      var st = document.querySelector(".mpl-side.me .mpl-status");
      if (st) { st.textContent = "Ready"; st.classList.add("ready"); }
      // #8: start as soon as both are ready  don't wait for the timer.
      BE.lobby.setReady(lobbyState.lobbyId, meIsHost, true).then(function () { setTimeout(forceCheckBothReady, 250); });
    };

    // Paint the real remaining time NOW (synchronously) so a re-render  e.g. when
    // either player readies up  never flashes the hardcoded "0:20"/"0:30".
    paintLobbyTimer(row);
  }

  function doLeaveLobby() {
    var lid = lobbyState.lobbyId;
    // Trip ALL the guards BEFORE we do anything async
    lobbyState.lobbyId = null;
    mpDraft.lobbyId = null;
    mpMatch.started = false;
    mpMatch.lobbyId = null;
    mpEntering = false;
    enteredLobbyOnce = true;

    // Stop every timer
    stopLobbyTimer();
    stopMpTurnTimer();
    if (mpMatch.kickTimer) { clearInterval(mpMatch.kickTimer); mpMatch.kickTimer = null; }
    if (mpMatch.rematchTimer) { clearInterval(mpMatch.rematchTimer); mpMatch.rematchTimer = null; }
    if (mpDraft.spinTick) { clearInterval(mpDraft.spinTick); mpDraft.spinTick = null; }

    // Kill the sim if running
    if (mpMatch.sim) { try { mpMatch.sim.destroy(); } catch (e) {} mpMatch.sim = null; }

    // Tell server we left (best effort, don't await)
    if (lid && BE.lobby && BE.lobby.leave) { try { BE.lobby.leave(lid); } catch (e) {} }

    // Tear down the realtime channel so no late echo can re-enter
    if (lobbyState.channel) {
      try { BE.lobby.unsubscribe(lobbyState.channel); } catch (e) {}
      lobbyState.channel = null;
    }

    // Reset state objects
    resetMpMatch();

    // Force navigate home  body data attr too so CSS doesn't keep lobby visible
    document.body.dataset.screen = "home";
    setTab("play");

    // Belt-and-braces: a tick later, ensure home screen is showing
    setTimeout(function () {
      document.querySelectorAll(".screen").forEach(function (s) { s.classList.remove("is-active"); });
      var home = $("screen-home"); if (home) home.classList.add("is-active");
    }, 50);
  }


  
  function formationLabel(id, formations) {
    var f = formations.filter(function (x) { return x.id === id; })[0];
    return f ? f.name + " · " + f.tag : id;
  }

  function fmtClock(s) { return "0:" + (s < 10 ? "0" : "") + Math.max(0, s); }

  // Two-phase lobby timer. GREY (30s): waiting for the opponent to EVER join 
  // counts from the lobby's real expiry. GOLD (20s): once both have joined,
  // counts from a LOCAL deadline (never a shared DB field  that could be lost to a
  // concurrent write and freeze the clock; local can't). Gold mode sticks once
  // armed, so if a player steps out we keep counting and wait for them to rejoin.
  function paintLobbyTimer(row) {
    if (!row) return 0;
    var t = $("mpl-timer"), label = $("mpl-timer-label");
    var draft = row.draft || {};
    var bothIn = !!(draft.host_in && draft.guest_in);
    var goldMode = !!(lobbyState.formationDeadline || bothIn);
    var left;
    if (goldMode) {
      if (!lobbyState.formationDeadline) lobbyState.formationDeadline = Date.now() + 20000;
      left = Math.max(0, Math.round((lobbyState.formationDeadline - Date.now()) / 1000));
      if (t) { t.textContent = fmtClock(left); t.classList.remove("mpl-timer--grey"); t.classList.toggle("warn", left <= 5); }
      if (label) label.innerHTML = lobbyState.steppedOut ? "Rejoin before the timer runs out"
        : (bothIn ? "Pick &amp; ready up" : "Opponent left  waiting for them to rejoin…");
    } else {
      var gd = lobbyState.greyDeadline || (row.lobby_expires_at ? new Date(row.lobby_expires_at).getTime() : (Date.now() + 30000));
      lobbyState.greyDeadline = gd;
      left = Math.max(0, Math.round((gd - Date.now()) / 1000));
      if (t) { t.textContent = fmtClock(left); t.classList.add("mpl-timer--grey"); t.classList.remove("warn"); }
      if (label) label.innerHTML = "Waiting for opponent to join…";
    }
    return left;
  }

  function startLobbyTimer() {
    stopLobbyTimer();
    lobbyState.timerHandle = setInterval(lobbyTick, 250);
    lobbyTick();   // paint immediately so there's never a stale/blank frame
  }

  function lobbyTick() {
    if (lobbyState.exiting) return;
    var row = lobbyState.lastRow; if (!row) return;
    var draft = row.draft || {};
    var bothIn = !!(draft.host_in && draft.guest_in);
    var left = paintLobbyTimer(row);
    if (left > 0) return;
    stopLobbyTimer();
    if (lobbyState.formationDeadline || bothIn) {
      // GOLD expired.
      if (bothIn) { autoReadyFormation(); return; }
      if (lobbyState.steppedOut) { exitLobbyWithMessage("Rejoin window expired  returning home."); return; }
      // Opponent stepped out and never came back → close out the waiting player.
      var lid0 = lobbyState.lobbyId; if (lid0) { try { BE.lobby.leave(lid0); } catch (e) {} }
      exitLobbyWithMessage("Opponent has left  returning home.");
    } else {
      // GREY expired  opponent never joined.
      var lid1 = lobbyState.lobbyId; if (lid1) { try { BE.lobby.leave(lid1); } catch (e) {} }
      exitLobbyWithMessage("Opponent failed to join  returning home.");
    }
  }

  // Show a brief centered message in the lobby, then auto-home. Trips the guards
  // so no late echo/tick can pull us back in while the message is up.
  function exitLobbyWithMessage(msg) {
    if (lobbyState.exiting) return;
    lobbyState.exiting = true;
    stopLobbyTimer();
    // Stop anything live (sim/kick/rematch) right away so replacing the DOM can't
    // leave a detached canvas animating or a timer firing into nothing.
    if (mpMatch.sim) { try { mpMatch.sim.destroy(); } catch (e) {} mpMatch.sim = null; }
    if (mpMatch.kickTimer) { clearInterval(mpMatch.kickTimer); mpMatch.kickTimer = null; }
    if (mpMatch.rematchTimer) { clearInterval(mpMatch.rematchTimer); mpMatch.rematchTimer = null; }
    showLobbyScreen();
    var wrap = $("mpl-wrap");
    if (wrap) {
      wrap.innerHTML =
        '<div class="mpl-head"><div class="mpl-kicker">Champions Cup  Multiplayer</div>' +
          '<div class="mpl-title">Lobby Closed</div></div>' +
        '<div class="mpl-panel" style="text-align:center;padding:40px 18px">' +
          '<div class="fp-result"><div class="fp-winner-sub">' + esc(msg) + '</div></div></div>';
    }
    if (lobbyState.channel) { try { BE.lobby.unsubscribe(lobbyState.channel); } catch (e) {} lobbyState.channel = null; }
    lobbyState.lobbyId = null;
    enteredLobbyOnce = true;
    setTimeout(function () {
      resetMpMatch();
      document.body.dataset.screen = "home";
      setTab("play");
    }, 1800);
  }

  // Leave the formation lobby but stay rejoinable: clear my presence (so the
  // opponent sees me gone and their gold timer keeps ticking) WITHOUT ending the
  // lobby, and show an in-place Rejoin / Return Home view.
  function stepOutOfLobby() {
    var lid = lobbyState.lobbyId; if (!lid) return;
    // Rejoin only makes sense once both have joined (gold window). Alone in the
    // grey "waiting" phase, Leave just leaves.
    var draft = (lobbyState.lastRow && lobbyState.lastRow.draft) || {};
    if (!lobbyState.formationDeadline && !(draft.host_in && draft.guest_in)) { doLeaveLobby(); return; }
    lobbyState.steppedOut = true;
    BE.lobby.updateDraft(lid, lobbyState.isHost ? { host_in: false } : { guest_in: false }).catch(function () {});
    showLobbyScreen();
    var wrap = $("mpl-wrap"); if (!wrap) return;
    wrap.innerHTML =
      '<div class="mpl-head"><div class="mpl-kicker">Champions Cup  Multiplayer</div>' +
        '<div class="mpl-title">You left the lobby</div></div>' +
      '<div class="mpl-timer-wrap">' +
        '<div class="mpl-timer-label" id="mpl-timer-label">Rejoin before the timer runs out</div>' +
        '<div class="mpl-timer" id="mpl-timer">0:20</div></div>' +
      '<div class="mpl-panel" style="text-align:center;padding:24px 18px">' +
        '<div class="fp-result"><div class="fp-winner-sub">Step back in to keep the match going.</div></div>' +
        '<div class="mpl-actions" style="margin-top:18px">' +
          '<button class="btn btn--kickoff flex1" id="mpl-rejoin">Rejoin</button>' +
          '<button class="btn btn--ghost btn--sm" id="mpl-gohome">Return Home</button>' +
        '</div></div>';
    paintLobbyTimer(lobbyState.lastRow);
    var rj = $("mpl-rejoin"); if (rj) rj.onclick = rejoinLobby;
    var gh = $("mpl-gohome"); if (gh) gh.onclick = function () { doLeaveLobby(); };
  }

  function rejoinLobby() {
    var lid = lobbyState.lobbyId; if (!lid) return;
    lobbyState.steppedOut = false;
    BE.lobby.updateDraft(lid, lobbyState.isHost ? { host_in: true } : { guest_in: true }).catch(function () {});
    BE.lobby.get(lid).then(function (row) {
      if (row) { lobbyState.lastRow = row; renderLobby(row); }
    }).catch(function () {});
  }

  function autoReadyFormation() {
    var row = lobbyState.lastRow || {};
    var meReady = lobbyState.isHost ? row.host_ready : row.guest_ready;
    if (meReady) { setTimeout(forceCheckBothReady, 300); return; }
    var formations = (root.CC_ENGINE && root.CC_ENGINE.FORMATIONS) || [];
    if (!lobbyState.chosenFormation && formations.length) {
      var pick = formations[Math.floor(Math.random() * formations.length)];
      lobbyState.chosenFormation = pick.id;
      BE.lobby.setFormation(lobbyState.lobbyId, lobbyState.isHost, pick.id).then(function () {
        BE.lobby.setReady(lobbyState.lobbyId, lobbyState.isHost, true).then(function () { setTimeout(forceCheckBothReady, 600); });
      });
    } else {
      BE.lobby.setReady(lobbyState.lobbyId, lobbyState.isHost, true).then(function () { setTimeout(forceCheckBothReady, 600); });
    }
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
    enteredLobbyOnce = false;
  }


  /* ================================================ PHASE 7  FIRST PICK */
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
        '<div class="mpl-kicker">Champions Cup  Multiplayer</div>' +
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

  /* ================================================== PHASE 8  MP DRAFT */
  // Side-by-side draft. Active player can click; other watches greyed.
  // Same name allowed across teams only if different club+year combo.
  var mpDraft = {
    lobbyId: null, meIsHost: false, row: null, formations: null,
    DATA: null, ENGINE: null, GAME: null, CPU: null,
    rand: null, timerHandle: null, deadline: 0,
  };

  function enterMpDraft(row) {
    // A new draft means any earlier match in this lobby is over. Clear stale
    // match/countdown state NOW so the later draft→match hand-off can't be blocked
    // by a leftover mpMatch.started/lobbyId (rematch guard)  that left the last
    // picker frozen on the "Squads Locked" countdown on a 2nd/replayed match.
    if (mpMatch.started || mpEntering) resetMpMatch();
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
    var pool = mpDraft.row.pool || "club";
    // C4: seed each spin from (matchSeed + pickCount) so spins are genuinely
    // varied, never repeat from a stale re-seed, and are identical on both clients.
    var picks = (d.host_squad || []).length + (d.guest_squad || []).length;
    var seed = (((mpDraft.row.seed >>> 0) + picks * 0x9e3779b1) >>> 0) || 1;
    var rand = mpDraft.GAME.mulberry32(seed);
    // D3: branch the pool  World Cup nations vs Clubs.
    var spin = pool === "wc"
      ? mpDraft.GAME.makeNationSpin(openSlots, drafted, rand)
      : mpDraft.GAME.makeSpin(openSlots, drafted, rand);
    if (!spin) return null;
    return {
      pool: pool,
      clubIndex: (spin.clubIndex != null ? spin.clubIndex : null),
      teamName: spin.teamName || null,
      club: spin.club, short: spin.short, color: spin.color, country: spin.country,
      year: spin.year, label: spin.label,
      eligibleNames: spin.eligible.map(function (p) { return p.n; }),
    };
  }

  // Resolve the player pool for a stored spin (Clubs era OR World Cup nation).
  function mpSpinPlayers(spin) {
    if (!spin) return [];
    if (spin.pool === "wc") {
      var N = root.CC_NATIONS; if (!N) return [];
      var teams = N.teamsForYear(spin.year) || [];
      var t = teams.filter(function (x) { return x.team === spin.teamName; })[0];
      return t ? t.players : [];
    }
    var era = mpDraft.DATA.eraForYear(spin.clubIndex, spin.year);
    return era ? era.players : [];
  }
  // Stable identity for the duplicate-lock rule (8.3): same side + year.
  function mpSpinKey(spin) { return (spin.pool === "wc" ? spin.teamName : spin.clubIndex) + "|" + spin.year; }

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
        '<div class="mpl-kicker">Live Draft  Pick ' + pickNum + ' of ' + totalPicks + '</div>' +
        '<div class="mpl-title" style="font-size:22px">' +
          (myTurn ? "Your turn" : esc(oppName) + "'s turn") +
        '</div>' +
      '</div>' +

      '<div class="mp-timer-wrap"><div class="mp-timer" id="mp-timer">0:20</div></div>' +

      '<div class="mp-spin-panel">' +
        '<div class="slot-reel" style="margin:0 auto;max-width:420px">' +
          '<div class="reel reel--club"><span id="mp-reel-club">' + (d.current_spin ? esc(d.current_spin.short || d.current_spin.club) : "") + '</span></div>' +
          '<div class="reel reel--year"><span id="mp-reel-year">' + (d.current_spin ? d.current_spin.year : "") + '</span></div>' +
        '</div>' +
        '<div class="slot-era">' + (d.current_spin ? esc(d.current_spin.label) : "&nbsp;") + '</div>' +
      '</div>' +

      '<div class="mp-board">' +
        '<div class="mp-side' + (myTurn ? " mp-side--active" : "") + '">' +
          '<div class="mp-side-head"><b>' + esc(meName) + '</b><span>You</span></div>' +
          '<div class="mp-pitch pitch" id="mp-pitch-me"></div>' +
        '</div>' +
        '<div class="mp-side' + (!myTurn ? " mp-side--active" : "") + '">' +
          '<div class="mp-side-head"><b>' + esc(oppName) + '</b><span>Opp</span></div>' +
          '<div class="mp-pitch pitch" id="mp-pitch-opp"></div>' +
        '</div>' +
      '</div>' +

      '<div class="mp-players-panel">' +
        '<h3>' + (myTurn ? "Pick a player" : "Watching " + esc(oppName) + " pick…") + '</h3>' +
        '<div class="players' + (myTurn ? "" : " mp-locked") + '" id="mp-players"></div>' +
      '</div>';

    renderMpPitches(mySquad, oppSquad,
      mpDraft.meIsHost ? d.host_formation : d.guest_formation,
      mpDraft.meIsHost ? d.guest_formation : d.host_formation);
    renderMpPlayers(d, myTurn, mySquad, oppSquad);

    // #3: spin the reels through the pool, then land on the real roll. Trigger off
    // shownSpinId (set only when a spin FINISHES) so a realtime re-render mid-spin
    // never skips it; animateMpReels ignores re-entrant calls for the same roll.
    var spinId = d.current_spin ? (d.current_spin.short + "|" + d.current_spin.year + "|" + pickNum) : "";
    if (spinId && spinId !== mpDraft.shownSpinId) {
      animateMpReels(d.current_spin, spinId);
    }
  }

  function animateMpReels(spin, spinId) {
    if (!spin) return;
    if (mpDraft.animId === spinId) return;            // already spinning to this roll
    if (mpDraft.spinTick) { clearInterval(mpDraft.spinTick); mpDraft.spinTick = null; }
    mpDraft.animId = spinId;
    var pool = (mpDraft.row && mpDraft.row.pool) || "club";
    var N = root.CC_NATIONS, DATA = root.CC_DATA;
    var ticks = 0;
    function setSpinning(on) {
      document.querySelectorAll(".mp-spin-panel .reel").forEach(function (rl) { rl.classList.toggle("is-spinning", on); });
    }
    function rand() {
      // Re-query the reels each tick so a realtime re-render (fresh DOM) can't orphan
      // the animation  this is why the watcher's reel used to snap instead of spin.
      var rc = $("mp-reel-club"), ry = $("mp-reel-year");
      if (!rc || !ry) return false;
      if (pool === "wc" && N) {
        rc.textContent = N.COMBOS[Math.floor(Math.random() * N.COMBOS.length)].short;
        ry.textContent = N.YEARS[Math.floor(Math.random() * N.YEARS.length)];
      } else {
        rc.textContent = DATA.CLUBS[Math.floor(Math.random() * DATA.CLUBS.length)].short;
        ry.textContent = 1990 + Math.floor(Math.random() * 37);
      }
      return true;
    }
    setSpinning(true);
    rand();                                            // start spinning instantly (no flash of the answer)
    mpDraft.spinTick = setInterval(function () {
      if (++ticks > 13) {
        clearInterval(mpDraft.spinTick); mpDraft.spinTick = null;
        setSpinning(false);
        var rc = $("mp-reel-club"), ry = $("mp-reel-year");
        if (rc) rc.textContent = spin.short || spin.club;
        if (ry) ry.textContent = spin.year;
        mpDraft.shownSpinId = spinId;                 // mark this roll settled → won't re-animate
        mpDraft.animId = null;
        return;
      }
      if (!rand()) { clearInterval(mpDraft.spinTick); mpDraft.spinTick = null; mpDraft.animId = null; }
    }, 70);
  }

  function renderMpPitches(mySquad, oppSquad, myFormationId, oppFormationId) {
    var F = mpDraft.ENGINE.FORMATIONS;
    function slotsFor(id) { var f = F.filter(function (x) { return x.id === id; })[0] || F[0]; return f.slots; }
    [["mp-pitch-me", mySquad, myFormationId], ["mp-pitch-opp", oppSquad, oppFormationId]].forEach(function (pair) {
      var pitch = $(pair[0]); if (!pitch) return;
      pitch.innerHTML = "";
      var slots = slotsFor(pair[2]);                 // C1: the player's CHOSEN formation
      var byPos = { GK: [], DEF: [], MID: [], FWD: [] };
      pair[1].forEach(function (p) { byPos[p.pos].push(p); });
      ["GK", "DEF", "MID", "FWD"].forEach(function (pos) {
        var n = slots[pos] || 0; if (!n) return;     // exactly the slots this shape needs
        var line = el("div", "pitch-line");
        for (var i = 0; i < n; i++) {
          var p = byPos[pos][i];
          var chip = el("div", "slot-chip" + (p ? " is-filled" : ""));   // empties stay dashed
          if (p) {
            chip.style.background = shade(p.color);                       // #6: team-coloured like solo
            chip.innerHTML = '<div class="chip-pos">' + pos + '</div>' +
              '<div class="chip-name">' + esc(lastName(p.n)) + '</div>' +
              '<div class="chip-sub">' + esc(p.short || p.club) + ' ' + p.year + '</div>';
          } else {
            chip.innerHTML = '<div class="chip-pos">' + pos + '</div><div class="chip-sub"></div>';
          }
          line.appendChild(chip);
        }
        pitch.appendChild(line);
      });
    });
  }

  function lastName(n) { var p = (n || "").trim().split(" "); return p[p.length - 1]; }
  function shade(hex) {
    try {
      var c = String(hex).replace("#", "");
      var r = Math.round(parseInt(c.substr(0, 2), 16) * 0.42);
      var g = Math.round(parseInt(c.substr(2, 2), 16) * 0.42);
      var b = Math.round(parseInt(c.substr(4, 2), 16) * 0.42);
      return "rgb(" + r + "," + g + "," + b + ")";
    } catch (e) { return "var(--panel)"; }
  }

  function renderMpPlayers(d, myTurn, mySquad, oppSquad) {
    var box = $("mp-players"); if (!box) return;
    box.innerHTML = "";
    if (!d.current_spin) { box.innerHTML = '<div class="muted-line">Spinning…</div>'; return; }
    var poolPlayers = mpSpinPlayers(d.current_spin);
    if (!poolPlayers.length) { box.innerHTML = '<div class="muted-line">No players found.</div>'; return; }

    var openSlots = mpDraft.meIsHost ? d.host_open : d.guest_open;
    var drafted = mpDraft.meIsHost ? d.host_drafted : d.guest_drafted;
    var oppDrafted = mpDraft.meIsHost ? d.guest_drafted : d.host_drafted;

    // Filter to players that match this spin's eligible list (deterministic), then sort
    var nameSet = {}; d.current_spin.eligibleNames.forEach(function (n) { nameSet[n] = true; });
    var list = poolPlayers.filter(function (p) {
      if (!nameSet[p.n]) return false;
      if (openSlots[p.pos] <= 0) return false;
      if (drafted[p.n]) return false;
      return true;
    });

    // Duplicate rule: if opponent picked this same player with the SAME club+year combo,
    // lock it for me too (the same exact slot machine roll can't yield two of the same).
    // Across different rolls, "Messi Barca 2016 vs Messi PSG 2022" is fine because clubs/years differ.

    // #4: Pro Mode  hide ratings and DON'T sort by overall (no rating signal).
    var pro = !!mpDraft.row.pro;
    var POS_ORDER = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
    if (pro) {
      list.sort(function (a, b) {
        var pa = POS_ORDER[a.pos], pb = POS_ORDER[b.pos];
        if (pa !== pb) return pa - pb;                  // group by position
        return a.n < b.n ? -1 : a.n > b.n ? 1 : 0;      // then alphabetical (stable, no OVR leak)
      });
    } else {
      list.sort(function (a, b) {
        return Math.round(mpDraft.ENGINE.overall(b)) - Math.round(mpDraft.ENGINE.overall(a));
      });
    }

    list.forEach(function (pl) {
      var ovr = Math.round(mpDraft.ENGINE.overall(pl));
      var oppHasSame = !!oppDrafted[pl.n + "|" + mpSpinKey(d.current_spin)];
      var card = el("button", "pcard" + (pro ? " is-pro" : "") + (oppHasSame ? " mp-locked-card" : ""));
      card.innerHTML =
        '<div class="pos-badge pos-' + pl.pos + '">' + pl.pos + "</div>" +
        '<div class="pcard-info"><div class="pcard-name">' + esc(pl.n) + "</div>" +
          '<div class="pcard-sub">' + esc(d.current_spin.club) + " · " + d.current_spin.year + "</div></div>" +
        (pro ? "" : '<div class="pcard-ovr">' + ovr + "<small>OVR</small></div>");
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
    d[draftedKey][pl.n + "|" + mpSpinKey(spin)] = true;

    // Swap turn  use absolute opponent ID, not relative swap, so a stale
    // local draft can't race with the opponent's concurrent pick.
    d.turn = (state.user.id === mpDraft.row.host) ? mpDraft.row.guest : mpDraft.row.host;

    // Are we done?
    var totalPicked = (d.host_squad || []).length + (d.guest_squad || []).length;
    if (totalPicked >= (d.total_rounds || 7) * 2) {
      d.current_spin = null;
      d.turn = null;
      stopMpTurnTimer();
      // LAST-PICKER FIX: the picker must NOT wait for its own realtime echo  the
      // writer's client frequently never receives its own broadcast, which left
      // the last picker frozen on the draft while the opponent advanced. Instead:
      //   1) write the final draft to the DB (with retries) so the OPPONENT's echo
      //      fires and it advances,
      //   2) advance THIS client straight to the lineup from a locally-built row 
      //      no self-echo, no extra countdown screen.
      var localLobbyId = mpDraft.lobbyId;
      var matchRow = Object.assign({}, mpDraft.row, { draft: d, phase: "match" });
      mpDraft.row = matchRow;
      // Null the draft lobbyId so the subscribe patch stops intercepting echoes.
      mpDraft.lobbyId = null;
      // Persist to the DB (source of truth + opponent's realtime echo), retrying.
      finishDraftWithRetry(localLobbyId, d, 4);
      // Go straight to the match (lineup screen). Resilient so a flaky local row
      // can fall back to the authoritative DB row instead of hard-freezing.
      mpEntering = true;
      enterMpMatchResilient(matchRow, 0);
      return;
    }

    // Roll next spin
    d.current_spin = makeMpSpin({ ...d });
    d.turn_deadline = new Date(Date.now() + 20000).toISOString();
    // Send only changed fields so concurrent opponent writes aren't clobbered.
    var patch = {};
    patch[squadKey] = d[squadKey];
    patch[openKey] = d[openKey];
    patch[draftedKey] = d[draftedKey];
    patch.turn = d.turn;
    patch.current_spin = d.current_spin;
    patch.turn_deadline = d.turn_deadline;
    BE.lobby.updateDraft(mpDraft.lobbyId, patch).then(function (r) {
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
    var poolPlayers = mpSpinPlayers(d.current_spin);
    if (!poolPlayers.length) return;
    var openSlots = mpDraft.meIsHost ? d.host_open : d.guest_open;
    var drafted = mpDraft.meIsHost ? d.host_drafted : d.guest_drafted;
    var oppDrafted = mpDraft.meIsHost ? d.guest_drafted : d.host_drafted;
    var nameSet = {}; d.current_spin.eligibleNames.forEach(function (n) { nameSet[n] = true; });
    var list = poolPlayers.filter(function (p) {
      if (!nameSet[p.n]) return false;
      if (openSlots[p.pos] <= 0) return false;
      if (drafted[p.n]) return false;
      if (oppDrafted[p.n + "|" + mpSpinKey(d.current_spin)]) return false;
      return true;
    });
    if (!list.length) return;
    // Pick best OVR (auto-pick favors strong choice)
    list.sort(function (a, b) { return mpDraft.ENGINE.overall(b) - mpDraft.ENGINE.overall(a); });
    mpPickPlayer(list[0]);
  }

  /* ============================================== PHASE 9  LIVE MATCH == */
  // Both clients hold the same drafted squads (in the lobby `draft`) and the same
  // `seed`, so the match result is computed identically on each side; we just
  // render it from each viewer's own perspective ("Your XI" = side A).
  var mpMatch = {
    started: false, lobbyId: null, meIsHost: false, row: null,
    mySquad: null, oppSquad: null, meName: "", oppName: "",
    canon: null, myResult: null, sim: null, out: null,
    kickTimer: null, rematchTimer: null, isRanked: false, preMmr: null, sessionRecorded: false,
  };

  // Set true only during the brief hand-off between the last draft pick and the
  // match starting. No UI  it just guards against stale draft echoes re-rendering
  // the draft while we're entering the match (the entry is usually instant).
  var mpEntering = false;

  function resetMpMatch() {
    if (mpMatch.sim) { try { mpMatch.sim.destroy(); } catch (e) {} }
    if (mpMatch.kickTimer) clearInterval(mpMatch.kickTimer);
    if (mpMatch.rematchTimer) clearInterval(mpMatch.rematchTimer);
    mpMatch = { started: false, lobbyId: null, meIsHost: false, row: null, mySquad: null,
      oppSquad: null, meName: "", oppName: "", canon: null, myResult: null, sim: null,
      out: null, kickTimer: null, rematchTimer: null, isRanked: false, preMmr: null, sessionRecorded: false };
    // clear draft state too, so a rematch's fresh draft isn't read as stale by the
    // lobby subscribe patch (which intercepts draft-phase updates by lobby id).
    stopMpTurnTimer();
    mpEntering = false;
    mpDraft.lobbyId = null; mpDraft.row = null;
  }

  function onOpponentLeft() {
    if (!mpMatch.started && !lobbyState.lobbyId) return;
    var oppName = "Your opponent";
    try {
      var row = lobbyState.lastRow;
      if (row) { var oppId = row.host === state.user.id ? row.guest : row.host; oppName = (lobbyState.profiles[oppId] || {}).username || oppName; }
    } catch (e) {}
    exitLobbyWithMessage(oppName + " has left  returning home.");
  }

  // Persist the final draft (phase → "match") with a few retries so a flaky
  // write can never leave the opponent stuck on the draft waiting for an echo.
  function finishDraftWithRetry(lobbyId, draft, tries) {
    if (!lobbyId) return;
    BE.lobby.finishDraft(lobbyId, draft).catch(function () {
      if (tries > 1) setTimeout(function () { finishDraftWithRetry(lobbyId, draft, tries - 1); }, 600);
    });
  }

  // Enter the match straight from the last pick  no extra countdown screen  and
  // without ever hard-freezing. Try the row we already have FIRST (the picker's
  // local row and the opponent's echo row are normally complete → instant lineup).
  // Only if that doesn't take do we fetch the authoritative DB row and retry; as a
  // last resort show a visible "Continue" button so nobody is ever stuck.
  function enterMpMatchResilient(localRow, attempt) {
    if (mpMatch.started || !lobbyState.lobbyId) return;  // already in, or we've left
    enterMpMatch(localRow);                               // instant path
    if (mpMatch.started || !lobbyState.lobbyId) return;
    if (attempt >= 10) { showMpHandoffFallback(localRow); return; }
    // Not in yet (data still propagating) → fetch the DB row and try again.
    setTimeout(function () {
      if (mpMatch.started || !lobbyState.lobbyId) return;
      var id = localRow && localRow.id;
      if (!id) { enterMpMatchResilient(localRow, attempt + 1); return; }
      BE.lobby.get(id).then(function (r) {
        var dbOk = r && r.phase === "match" && r.draft &&
          (r.draft.host_squad || []).length >= 7 && (r.draft.guest_squad || []).length >= 7;
        enterMpMatchResilient(dbOk ? r : localRow, attempt + 1);
      }).catch(function () { enterMpMatchResilient(localRow, attempt + 1); });
    }, 600);
  }

  // Visible escape hatch if the match data never resolves  better than a frozen
  // countdown. Lets the player force-enter from the best row we have, or bail.
  function showMpHandoffFallback(localRow) {
    if (mpMatch.started) return;
    showLobbyScreen();
    var wrap = $("mpl-wrap"); if (!wrap) return;
    wrap.innerHTML =
      '<div class="mpl-head"><div class="mpl-kicker">Champions Cup  Multiplayer</div>' +
        '<div class="mpl-title">Almost there…</div></div>' +
      '<div class="mpl-panel" style="text-align:center;padding:28px 18px">' +
        '<div class="fp-result"><div class="fp-winner-sub">Syncing the final squads is taking a moment.</div></div>' +
        '<div class="mpl-actions" style="margin-top:18px">' +
          '<button class="btn btn--kickoff flex1" id="mp-handoff-go">Continue to match →</button>' +
          '<button class="btn btn--ghost btn--sm" id="mp-handoff-leave">Leave</button>' +
        '</div></div>';
    var gob = $("mp-handoff-go");
    if (gob) gob.onclick = function () {
      if (mpMatch.started) return;
      BE.lobby.get(localRow && localRow.id).then(function (r) {
        var dbOk = r && r.phase === "match" && r.draft &&
          (r.draft.host_squad || []).length >= 7 && (r.draft.guest_squad || []).length >= 7;
        enterMpMatch(dbOk ? r : localRow);
        if (!mpMatch.started) toast("Still syncing  try again in a second.");
      }).catch(function () { enterMpMatch(localRow); });
    };
    var lb = $("mp-handoff-leave");
    if (lb) lb.onclick = function () { doLeaveLobby(); };
  }

  function enterMpMatch(row) {
    if (!row) return;
    // Already watching this lobby's match → this update is a rematch flag.
    if (mpMatch.started && mpMatch.lobbyId === row.id) { mpMatch.row = row; handleRematchFlags(row); return; }
    var E = root.CC_ENGINE, d = row.draft || {};
    var hostSquad = d.host_squad || [], guestSquad = d.guest_squad || [];

    // Validate BEFORE claiming mpMatch.started. If data is incomplete, just bail
    // WITHOUT scheduling our own retry  the resilient caller owns retrying, so we
    // never spin up competing/forever retry loops.
    if (!hostSquad.length || !guestSquad.length || hostSquad.length < 7 || guestSquad.length < 7) {
      return;
    }

    // Now claim
    mpMatch.started = true; mpMatch.lobbyId = row.id; mpMatch.row = row;
    mpEntering = false;
    stopMpTurnTimer();
    var meIsHost = row.host === state.user.id; mpMatch.meIsHost = meIsHost;
    var hostP = lobbyState.profiles[row.host] || { username: "Host" };
    var guestP = lobbyState.profiles[row.guest] || { username: "Guest" };
    mpMatch.hostSquad = hostSquad; mpMatch.guestSquad = guestSquad;
    mpMatch.hostName = hostP.username; mpMatch.guestName = guestP.username;
    mpMatch.mySquad = meIsHost ? hostSquad : guestSquad;
    mpMatch.oppSquad = meIsHost ? guestSquad : hostSquad;
    mpMatch.meName = meIsHost ? hostP.username : guestP.username;
    mpMatch.oppName = meIsHost ? guestP.username : hostP.username;
    mpMatch.oppId = meIsHost ? row.guest : row.host;

    // Identical on BOTH clients: host=A, guest=B, same seed → same plays / score
    var seed = (row.seed >>> 0) || 1;
    var canon;
    try {
      canon = E.playMatch(hostSquad, guestSquad, seed);
    } catch (err) {
      console.error("playMatch threw:", err);
      mpMatch.started = false;  // unwind so a retry can fire
      mpMatch.lobbyId = null;
      toast("Match calculation error  returning home.");
      doLeaveLobby();
      return;
    }
    mpMatch.canon = canon;

    mpMatch.isRanked = !!row.ranked;
    mpMatch.preMmr = null;
    // Snapshot my mmr NOW, before the result gets recorded, so the results
    // screen/session tracker can compute this game's exact delta later. Fired
    // once at match entry - by the time results actually show (lineup intro +
    // full sim), this has always long since resolved.
    if (mpMatch.isRanked && BE.ranked && BE.ranked.myStats) {
      BE.ranked.myStats().then(function (s) {
        if (!s) return;
        mpMatch.preMmr = s.mmr;
        // First match of this ranked session (onRankedKickoff cleared this to
        // null) -> this is the "before" state the post-match popup animates
        // FROM. "Find Another Match" leaves it set, so a multi-game session
        // still animates from the very start of the session, not per-game.
        if (rankedSession.startMmr == null) rankedSession.startMmr = s.mmr;
      }).catch(function () {});
    }

    // Host writes the head-to-head + match row once (no double count). Wrapped so
    // a backend hiccup here can never block the lineup from rendering.
    try {
      if (meIsHost) {
        var winnerId = canon.winner === "A" ? row.host : row.guest;
        var loserId = canon.winner === "A" ? row.guest : row.host;
        if (BE.friends.recordResult) BE.friends.recordResult(winnerId, loserId);
        if (BE.data.recordMatch) BE.data.recordMatch({
          lobby_id: row.id, player_a: row.host, player_b: row.guest,
          goals_a: canon.goalsA, goals_b: canon.goalsB, winner: winnerId, ranked: !!row.ranked,
        });
        // Ranked: atomic Elo + W/L update, banded off each player's own mmr.
        if (row.ranked && BE.ranked && BE.ranked.recordResult) BE.ranked.recordResult(winnerId, loserId);
      }
    } catch (e) { console.error("record result/match failed:", e); }

    // Render the lineup. If this throws, unwind so the resilient caller can retry
    // (or show the fallback) instead of leaving a half-started, frozen screen.
    try {
      showMpLineupIntro();
    } catch (err) {
      console.error("showMpLineupIntro threw:", err);
      mpMatch.started = false;
      mpMatch.lobbyId = null;
    }
  }

  function mpOvrClass(v) { return v >= 86 ? "ovr-hi" : v >= 78 ? "ovr-mid" : "ovr-lo"; }
  function mpTeamSheet(side, name, which) {
    var E = root.CC_ENGINE, CPU = root.CC_CPU, R = E.teamRatings(side);
    var order = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
    var rows = side.slice().sort(function (a, b) { return order[a.pos] - order[b.pos]; }).map(function (p) {
      var ovr = Math.round(CPU.primaryRating(p));
      return '<div class="ts-row"><div class="ts-pos pos-' + p.pos + '">' + p.pos + "</div>" +
        '<div class="ts-name">' + esc(lastName(p.n)) + "<small>" + esc(p.short || p.club) + " " + p.year + "</small></div>" +
        '<div class="ts-rtg ' + mpOvrClass(ovr) + '">' + ovr + "</div></div>";
    }).join("");
    function cat(k, v) { return '<div class="ts-cat"><span>' + k + '</span><b class="' + mpOvrClass(v) + '">' + v + "</b></div>"; }
    return '<div class="card teamsheet ts-' + which + '">' +
      '<div class="ts-head"><div class="ts-name-big">' + esc(name) + "</div>" +
        '<div class="ts-ovr"><b>' + R.ovr + "</b><small>OVR</small></div>" +
        '<div class="ts-cats">' + cat("ATT", R.att) + cat("DEF", R.def) + cat("GOA", R.gk) + "</div></div>" +
      '<div class="ts-list">' + rows + "</div></div>";
  }

  function showMpLineupIntro() {
    showLobbyScreen();
    var wrap = $("mpl-wrap"); if (!wrap) return;
    wrap.innerHTML =
      '<div class="lineup-head"><div class="lineup-round">Champions Cup · Final</div>' +
        "<h2>Team sheets</h2><p>Match starting in <b id=\"mp-kick\">0:10</b></p></div>" +
      '<div class="lineup-sheets">' + mpTeamSheet(mpMatch.mySquad, mpMatch.meName + " (you)", "you") +
        '<div class="lineup-vs">VS</div>' + mpTeamSheet(mpMatch.oppSquad, mpMatch.oppName, "opp") + "</div>" +
      '<div class="mpl-actions"><button class="btn btn--kickoff flex1" id="mp-kick-now">Kick off now <span>→</span></button></div>';
    var n = 10;
    var go = function () { if (mpMatch.kickTimer) { clearInterval(mpMatch.kickTimer); mpMatch.kickTimer = null; } runMpSim(); };
    mpMatch.kickTimer = setInterval(function () {
      n--; var e = $("mp-kick"); if (e) e.textContent = "0:" + (n < 10 ? "0" : "") + Math.max(0, n);
      if (n <= 0) { clearInterval(mpMatch.kickTimer); mpMatch.kickTimer = null; go(); }
    }, 1000);
    var kb = $("mp-kick-now"); if (kb) kb.onclick = go;
  }

  function runMpSim() {
    var wrap = $("mpl-wrap"); if (!wrap) return;
    // Full-size, in a real .sim-wrap/.sim-stage like solo so the canvas fills the screen.
    wrap.innerHTML =
      '<div class="sim-wrap">' +
        '<div class="sim-head">' + esc(mpMatch.hostName) + " vs " + esc(mpMatch.guestName) + "</div>" +
        '<div class="sim-stage"><canvas id="mp-canvas"></canvas></div>' +
        '<button class="btn btn--ghost btn--sm sim-skip" id="mp-sim-skip">Skip to result →</button>' +
      '</div>';
    var canvas = $("mp-canvas");
    if (mpMatch.sim) { try { mpMatch.sim.destroy(); } catch (e) {} mpMatch.sim = null; }
    try {
      // host=A / guest=B for BOTH clients → identical match on both screens.
      mpMatch.sim = root.CC_MATCHSIM.create(canvas, {
        squadA: mpMatch.hostSquad, squadB: mpMatch.guestSquad, result: mpMatch.canon,
        teamAName: mpMatch.hostName, teamBName: mpMatch.guestName,
        colorA: "#2ee87f", colorB: "#ff5d73", seed: (mpMatch.row.seed >>> 0) || 1,
        onDone: function (out) { mpMatch.sim = null; mpMatch.out = out; showMpResults(out); },
      });
      var sk = $("mp-sim-skip"); if (sk) sk.onclick = function () { if (mpMatch.sim) mpMatch.sim.skip(); };
      mpMatch.sim.start();
    } catch (e) { showMpResults({ stats: { A: [], B: [] }, scorers: { A: [], B: [] } }); }
  }

  function mpStatCard(stats, title) {
    var rows = (stats || []).slice().sort(function (a, b) { return b.rating - a.rating; }).map(function (s) {
      var line = (s.goals ? s.goals + "G " : "") + (s.assists ? s.assists + "A " : "") + (s.saves ? s.saves + "sv " : "");
      var c = s.rating >= 7.5 ? "ovr-hi" : s.rating >= 6.8 ? "ovr-mid" : "ovr-lo";
      return '<div class="st-row"><div class="st-pos pos-' + s.pos + '">' + s.pos + "</div>" +
        '<div class="st-name">' + esc(lastName(s.n)) + "<small>" + (line || "&nbsp;") + "</small></div>" +
        '<div class="st-rtg ' + c + '">' + (s.rating != null ? s.rating.toFixed(1) : "") + "</div></div>";
    }).join("");
    return '<div class="card"><h3>' + title + " · player ratings</h3><div class=\"stat-list\">" + rows + "</div></div>";
  }

  function showMpResults(out) {
    var wrap = $("mpl-wrap"); if (!wrap) return;
    // Captured by REFERENCE (not mpMatch.foo lookups below) so a quick "Find
    // Another Match" click - which reassigns the mpMatch variable to a brand
    // new object via resetMpMatch() - can never cross-contaminate this game's
    // still-in-flight rank fetch with the NEXT match's state.
    var matchRef = mpMatch;
    var canon = mpMatch.canon, meIsHost = mpMatch.meIsHost;
    var youWin = meIsHost ? (canon.winner === "A") : (canon.winner === "B");
    var myGoals = meIsHost ? canon.goalsA : canon.goalsB;
    var oppGoals = meIsHost ? canon.goalsB : canon.goalsA;
    var myStats = meIsHost ? out.stats.A : out.stats.B;
    var oppStats = meIsHost ? out.stats.B : out.stats.A;
    var pens = canon.pens ? (" (pens " + (meIsHost ? canon.pens.a + "-" + canon.pens.b : canon.pens.b + "-" + canon.pens.a) + ")") : "";
    var isRanked = mpMatch.isRanked;
    wrap.innerHTML =
      '<div class="results-wrap">' +
        '<div class="verdict ' + (youWin ? "verdict--win" : "") + '">' +
          '<div class="verdict-kicker">' + (isRanked ? "Champions Cup · Ranked" : "Champions Cup · Multiplayer") + '</div>' +
          '<div class="verdict-title">' + (youWin ? "YOU WIN! 🏆" : "YOU LOSE") + "</div>" +
          '<div class="verdict-record">' + myGoals + " - " + oppGoals + "</div>" +
          '<div class="verdict-sub">vs ' + esc(mpMatch.oppName) + pens + ' &nbsp;·&nbsp; ' +
            (isRanked ? '<span id="mp-rank" class="dim">Updating rank …</span>' : '<span id="mp-h2h" class="dim">H2H …</span>') +
          "</div>" +
        "</div>" +
        '<div class="res-grid">' + mpStatCard(myStats, "Your XI") + mpStatCard(oppStats, esc(mpMatch.oppName)) + "</div>" +
        '<div class="mpl-actions" style="margin-top:16px">' +
          '<button class="btn btn--ghost btn--sm flex1" id="mp-home">Return Home</button>' +
          (isRanked
            ? '<button class="btn btn--kickoff btn--sm flex1" id="mp-rematch">Find Another Match</button>'
            : '<button class="btn btn--kickoff btn--sm flex1" id="mp-rematch">↻ Rematch</button>') +
        "</div>" +
        '<div class="mp-rematch-note" id="mp-rematch-note"></div>' +
      "</div>";
    // BUG #3 FIX: fetch H2H AFTER a delay so the host's record_h2h RPC has time
    // to commit. Retry once if first read shows stale 0-0.
    if (!isRanked && BE.friends.headToHead && mpMatch.oppId) {
      var fetchH2H = function (attempt) {
        BE.friends.headToHead(mpMatch.oppId).then(function (h) {
          var e = $("mp-h2h"); if (!e) return;
          var youWonThisMatch = mpMatch.meIsHost ? (mpMatch.canon.winner === "A") : (mpMatch.canon.winner === "B");
          // If we won but H2H wins didn't tick up yet, retry once
          if (attempt < 2 && youWonThisMatch && h.wins === 0 && h.losses === 0) {
            setTimeout(function () { fetchH2H(attempt + 1); }, 1200);
            return;
          }
          e.textContent = "H2H vs " + mpMatch.oppName + ": " + h.wins + "-" + h.losses;
        }).catch(function () {});
      };
      setTimeout(function () { fetchH2H(0); }, 800);
    }
    // Ranked: fetch MY updated rank after a delay so the host's Elo RPC has time
    // to commit (same delayed-refresh pattern as H2H above). This is also where
    // the game's result lands in the session tracker for the eventual Return
    // Home popup - delta is computed against the mmr snapshot taken when the
    // match started (matchRef.preMmr), and "hasn't moved yet" (rather than a
    // fixed sentinel value) is what drives the retry, since a real result
    // always moves mmr by at least ±1 (never exactly 0).
    if (isRanked && BE.ranked && BE.ranked.myStats) {
      var preMmr = matchRef.preMmr;
      var recordSessionGame = function (s) {
        if (matchRef.sessionRecorded) return;
        matchRef.sessionRecorded = true;
        var delta = (preMmr != null && s) ? (s.mmr - preMmr) : 0;
        rankedSession.games.push({
          delta: delta, myGoals: myGoals, oppGoals: oppGoals, won: youWin,
          // Snapshot the resulting state right here so the post-match popup
          // never needs another network round-trip to know where you landed.
          mmrAfter: s ? s.mmr : (preMmr != null ? preMmr : 0),
          winsAfter: s ? s.ranked_wins : null, lossesAfter: s ? s.ranked_losses : null,
        });
      };
      var fetchRank = function (attempt) {
        BE.ranked.myStats().then(function (s) {
          var e = $("mp-rank");
          if (attempt < 4 && preMmr != null && s && s.mmr === preMmr) {
            setTimeout(function () { fetchRank(attempt + 1); }, 1000);
            return;
          }
          if (e && s) { var t = tierForMmr(s.mmr); e.textContent = t.label + " · " + s.ranked_wins + "-" + s.ranked_losses; }
          recordSessionGame(s);
        }).catch(function () { recordSessionGame(null); });
      };
      setTimeout(function () { fetchRank(0); }, 900);
    }
    // #7: post-game Return Home tears down LOCALLY only  never yanks the opponent.
    // Ranked with at least one game recorded this session -> show the results
    // popup first. If the rank fetch above is still in flight, wait for it
    // (briefly disabling the button) so the popup always has real numbers
    // instead of racing ahead of the just-finished game's own result.
    $("mp-home").onclick = function () {
      var goHome = function () { resetMpMatch(); teardownLobby(); enteredLobbyOnce = true; setTab("play"); };
      if (!isRanked) { goHome(); return; }
      var btn = $("mp-home");
      var proceed = function () { showRankedResultsPopup(goHome); };
      if (matchRef.sessionRecorded) { proceed(); return; }
      // Also lock "Find Another Match" for the wait - it tears down mpMatch/the
      // lobby via a totally different path (startRankedSearch), and letting
      // both run at once would race goHome's teardown against a search that's
      // already in flight.
      var rematchBtn = $("mp-rematch");
      if (btn) { btn.disabled = true; btn.textContent = "Finishing…"; }
      if (rematchBtn) rematchBtn.disabled = true;
      var tries = 0;
      (function waitForRecord() {
        if (matchRef.sessionRecorded || ++tries > 40) { proceed(); return; }
        setTimeout(waitForRecord, 200);
      })();
    };
    $("mp-rematch").onclick = isRanked
      ? function () { resetMpMatch(); teardownLobby(); enteredLobbyOnce = true; startRankedSearch(); }
      : requestRematch;
    if (!isRanked) handleRematchFlags(mpMatch.row);   // reflect any rematch request that already arrived
  }

  // Post-match "Ranked" results popup, shown when returning home from a ranked
  // match (single game or a multi-game "Find Another Match" streak). Reuses
  // the exact rank-hero component from the Ranked tab so the badge/name/bar
  // are pixel-identical, then plays: result card pops in -> bar animates from
  // the session's starting mmr to the current mmr (playing through any
  // promotion/demotion exactly like animateRankProgression already does).
  function rankedResultsCardHTML(games) {
    var n = games.length, totalDelta = 0, wins = 0;
    for (var i = 0; i < n; i++) { totalDelta += games[i].delta; if (games[i].won) wins++; }
    var losses = n - wins;
    var deltaStr = (totalDelta > 0 ? "+" : "") + totalDelta;
    var deltaClass = totalDelta > 0 ? "rr-delta--up" : (totalDelta < 0 ? "rr-delta--down" : "");
    if (n === 1) {
      var g = games[0];
      return '<div class="rr-label">Result</div>' +
        '<div class="rr-score ' + (g.won ? "rr-score--win" : "rr-score--loss") + '">' + g.myGoals + " - " + g.oppGoals + (g.won ? " Win" : " Loss") + '</div>' +
        '<div class="rr-delta ' + deltaClass + '">' + deltaStr + ' MMR</div>';
    }
    return '<div class="rr-label">Results (' + n + ' games)</div>' +
      '<div class="rr-score">' + wins + "-" + losses + '</div>' +
      '<div class="rr-delta ' + deltaClass + '">' + deltaStr + ' MMR</div>';
  }

  function showRankedResultsPopup(onClose) {
    var games = rankedSession.games.slice();
    rankedSession.games = [];
    if (!games.length) { onClose(); return; }
    var last = games[games.length - 1];
    var endMmr = last.mmrAfter != null ? last.mmrAfter : 0;
    var totalDelta = games.reduce(function (s, g) { return s + g.delta; }, 0);
    var startMmr = rankedSession.startMmr != null ? rankedSession.startMmr : Math.max(0, endMmr - totalDelta);
    rankedSession.startMmr = null;
    var finalWins = last.winsAfter != null ? last.winsAfter : 0;
    var finalLosses = last.lossesAfter != null ? last.lossesAfter : 0;
    var startTier = tierForMmr(startMmr);

    var closed = false;
    var ov = el("div", "modal"); ov.id = "ranked-result-modal";
    ov.innerHTML =
      '<div class="modal-card rr-card">' +
        '<button class="icon-btn modal-close" id="rr-x">✕</button>' +
        '<div class="rr-kicker">Champions Cup · Ranked</div>' +
        rankHeroHTML("rr", startTier, finalWins, finalLosses) +
        '<div class="rr-resultbox rr-resultbox--in">' + rankedResultsCardHTML(games) + "</div>" +
        '<button class="btn btn--kickoff btn--sm" id="rr-close" style="margin-top:18px;width:100%">Continue</button>' +
      "</div>";
    document.body.appendChild(ov);
    // rankHeroHTML bakes the record line's "N pts" off the tier object it was
    // given (startTier, so name/badge/bar all animate from the right place) -
    // but the record itself isn't part of that animation and should read your
    // real current mmr from the moment the popup opens, not the pre-session one.
    var recEl = $("rr-record");
    if (recEl) recEl.textContent = finalWins + "-" + finalLosses + " · " + Math.max(0, Math.round(endMmr)) + " pts";
    var doClose = function () { if (closed) return; closed = true; ov.remove(); onClose(); };
    ov.addEventListener("click", function (e) { if (e.target === ov) doClose(); });
    $("rr-x").onclick = doClose;
    $("rr-close").onclick = doClose;

    // Let the result card's own pop-in animation (CSS: .rr-resultbox--in,
    // delayed .3s, .5s duration) land before the bar starts moving.
    setTimeout(function () { animateRankProgression("rr", startMmr, endMmr); }, 850);
  }

  /* ================================================== PHASE 10  REMATCH */
  function requestRematch() {
    var d = (mpMatch.row && mpMatch.row.draft) || {};
    var oppWants = mpMatch.meIsHost ? d.rematch_guest : d.rematch_host;
    var side = mpMatch.meIsHost ? "rematch_host" : "rematch_guest";
    if (oppWants) {
      // Both players want a rematch  go straight to the reset WITHOUT touching
      // the draft at all. This avoids the read-modify-write race in updateDraft
      // that can clobber the initiator's rematch_host flag.
      if (mpMatch.row) mpMatch.row.draft = Object.assign({}, d, (function () { var p = {}; p[side] = true; return p; })());
      var btn0 = $("mp-rematch"); if (btn0) btn0.disabled = true;
      var note0 = $("mp-rematch-note"); if (note0) note0.textContent = "Rematch on  setting up…";
      BE.lobby.rematch(mpMatch.lobbyId);
      return;
    }
    // Initiator: stamp the shared 20s window and set our flag.
    var patch = {}; patch[side] = true;
    patch.rematch_at = new Date().toISOString();
    BE.lobby.updateDraft(mpMatch.lobbyId, patch);
    if (mpMatch.row) mpMatch.row.draft = Object.assign({}, d, patch);
    var btn = $("mp-rematch"); if (btn) btn.disabled = true;
    var note = $("mp-rematch-note");
    if (note) note.textContent = "Waiting for " + mpMatch.oppName + " to accept…";
    armRematchExpiry();
  }

  // Both players run the same 20s countdown off the shared rematch_at stamp, so
  // the request and the Accept button expire together.
  function armRematchExpiry() {
    if (mpMatch.rematchTimer) return;
    var d = (mpMatch.row && mpMatch.row.draft) || {};
    if (d.rematch_host && d.rematch_guest) return;     // already accepted
    var base = d.rematch_at ? new Date(d.rematch_at).getTime() : Date.now();
    var deadline = base + 20000;
    mpMatch.rematchTimer = setInterval(function () {
      var left = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      if (!$("mp-accept-rematch")) { var b = $("mp-rematch"); if (b) b.textContent = "Rematch sent ⏱ " + fmtClock(left); }
      if (left <= 0) { clearInterval(mpMatch.rematchTimer); mpMatch.rematchTimer = null; expireRematch(); }
    }, 500);
  }

  // No accept within the window: hide BOTH the rematch and accept buttons on this
  // client and center Return Home. The initiator also clears its stale flag.
  function expireRematch() {
    if (mpMatch.rematchTimer) { clearInterval(mpMatch.rematchTimer); mpMatch.rematchTimer = null; }
    var rb = $("mp-rematch"); if (rb) rb.style.display = "none";
    var ab = $("mp-accept-rematch"); if (ab) ab.style.display = "none";
    var note = $("mp-rematch-note"); if (note) note.innerHTML = "";
    var home = $("mp-home");
    if (home) { home.classList.remove("flex1"); if (home.parentNode) home.parentNode.style.justifyContent = "center"; }
    var d = (mpMatch.row && mpMatch.row.draft) || {};
    var iWant = mpMatch.meIsHost ? d.rematch_host : d.rematch_guest;
    if (iWant && mpMatch.lobbyId) {
      var clr = mpMatch.meIsHost ? { rematch_host: false } : { rematch_guest: false };
      clr.rematch_at = null;
      BE.lobby.updateDraft(mpMatch.lobbyId, clr).catch(function () {});
      if (mpMatch.row) mpMatch.row.draft = Object.assign({}, d, clr);
    }
  }

  function handleRematchFlags(row) {
    if (!row) return;
    var d = row.draft || {};
    var oppWants = mpMatch.meIsHost ? d.rematch_guest : d.rematch_host;
    var iWant = mpMatch.meIsHost ? d.rematch_host : d.rematch_guest;
    if (d.rematch_host && d.rematch_guest) {
      if (mpMatch.rematchTimer) { clearInterval(mpMatch.rematchTimer); mpMatch.rematchTimer = null; }
      var note0 = $("mp-rematch-note"); if (note0) note0.textContent = "Rematch on  setting up…";
      if (mpMatch.meIsHost) BE.lobby.rematch(row.id);   // formation reset re-enters both
      return;
    }
    // The pending request was withdrawn/expired → take the Accept button away.
    if (!oppWants && $("mp-accept-rematch")) { expireRematch(); return; }
    if (oppWants && !iWant) {
      var note = $("mp-rematch-note");
      if (note && !$("mp-accept-rematch")) {
        note.innerHTML = "<b>" + esc(mpMatch.oppName) + "</b> wants a rematch! " +
          '<button class="mini-btn ok" id="mp-accept-rematch">Accept</button>';
        var ab = $("mp-accept-rematch"); if (ab) ab.onclick = requestRematch;
      }
      armRematchExpiry();   // the accepter's window expires in sync with the initiator
    }
  }

  /* --- Hook the lobby channel to refresh during draft phase ---------------- */
  // The lobby subscribe in enterLobby() already routes phase changes here.
  // We need a separate update listener once we're in the draft so picks sync.
  // We re-use lobbyState.channel  but expand the handler to refresh mpDraft.row
  // when in draft phase. Patching that here keeps everything in one place:
  (function patchLobbySubscribeForDraft() {
    var origSubscribe = BE.lobby && BE.lobby.subscribe;
    if (!origSubscribe || BE.lobby._patched) return;
    BE.lobby._patched = true;
    BE.lobby.subscribe = function (lobbyId, cb) {
      return origSubscribe(lobbyId, function (newRow) {
        try {
          if (!newRow) return cb(newRow);
          // After WE've locally advanced past the draft (match started OR the
          // hand-off to the match is in progress), ignore any stale draft/reveal
          // echoes so we can't be re-rendered back onto the draft screen.
          if (mpMatch.started || mpEntering) {
            if (newRow.phase === "draft" || newRow.phase === "reveal") return;
            return cb(newRow);
          }
          if (newRow.phase !== "draft") return cb(newRow);
          if (mpDraft.lobbyId && newRow.id === mpDraft.lobbyId) {
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

  root.CC_APP = {
    init: init, onScreen: onScreen, recordSeason: recordSeason, recordRun: recordRun,
    openAuth: openAuth, setTab: setTab, onRankedKickoff: onRankedKickoff,
  };
})(window);
