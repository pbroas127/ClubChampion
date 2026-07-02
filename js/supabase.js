/* ============================================================================
 * CLUB CHAMPION  Backend (Supabase)
 * ==========================================================================*/
(function (root) {
  "use strict";
  var CFG = root.CC_CONFIG || {};
  var lib = root.supabase;
  var configured = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && lib && lib.createClient);
  var client = configured ? lib.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  }) : null;

  function need() { if (!client) throw new Error("Accounts aren't set up yet - add your Supabase keys in js/config.js."); }

  var auth = {
    signUpEmail: function (email, password) { need(); return client.auth.signUp({ email: email, password: password }); },
    signInEmail: function (email, password) { need(); return client.auth.signInWithPassword({ email: email, password: password }); },
    signInGoogle: function () {
      need();
      return client.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + location.pathname } });
    },
    signOut: function () { need(); return client.auth.signOut(); },
    resetPassword: function (email) { need(); return client.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }); },
    getUser: function () {
      if (!client) return Promise.resolve(null);
      return client.auth.getUser().then(function (r) { return r && r.data ? r.data.user : null; }).catch(function () { return null; });
    },
    onChange: function (cb) { if (client) client.auth.onAuthStateChange(function (_e, s) { cb(s ? s.user : null); }); },
  };

  var profile = {
    available: function (name) {
      if (!client) return Promise.resolve(true);
      return client.rpc("username_available", { name: name }).then(function (r) { return !!r.data; });
    },
    setUsername: function (name) {
      need();
      return auth.getUser().then(function (u) {
        if (!u || !u.id) {
          return client.auth.getSession().then(function (s) {
            var user = s && s.data && s.data.session ? s.data.session.user : null;
            if (!user || !user.id) throw new Error("Not signed in.");
            return client.from("profiles").upsert({ id: user.id, username: name }).select().single();
          });
        }
        return client.from("profiles").upsert({ id: u.id, username: name }).select().single();
      });
    },
    mine: function () {
      if (!client) return Promise.resolve(null);
      return auth.getUser().then(function (u) {
        if (!u) return null;
        return client.from("profiles").select("*").eq("id", u.id).maybeSingle().then(function (r) { return r.data; });
      });
    },
    byUsername: function (name) {
      if (!client) return Promise.resolve(null);
      return client.from("profiles").select("*").ilike("username", name).maybeSingle().then(function (r) { return r.data; });
    },
    heartbeat: function () {
      if (!client) return Promise.resolve();
      return auth.getUser().then(function (u) {
        if (!u) return;
        return client.from("profiles").update({ last_seen: new Date().toISOString() }).eq("id", u.id);
      }).catch(function () {});
    },
    getMany: function (ids) {
      if (!client || !ids || !ids.length) return Promise.resolve({});
      return client.from("profiles").select("id,username,last_seen").in("id", ids).then(function (r) {
        var map = {}; (r.data || []).forEach(function (p) { map[p.id] = p; }); return map;
      }).catch(function () { return {}; });
    },
    full: function () {
      if (!client) return Promise.resolve(null);
      return auth.getUser().then(function (u) {
        if (!u) return null;
        return client.from("profiles").select("username,username_changed_at,pro_default").eq("id", u.id).maybeSingle().then(function (r) { return r.data; });
      }).catch(function () { return null; });
    },
    changeUsername: function (name) {
      need();
      return auth.getUser().then(function (u) {
        if (!u) throw new Error("Not signed in.");
        return client.from("profiles").select("username_changed_at").eq("id", u.id).maybeSingle().then(function (r) {
          var last = r.data && r.data.username_changed_at ? new Date(r.data.username_changed_at) : null;
          if (last) {
            var days = (Date.now() - last.getTime()) / 86400000;
            if (days < 30) {
              var e = new Error("You can change your username again on " + new Date(last.getTime() + 30 * 86400000).toLocaleDateString());
              e.locked = true; throw e;
            }
          }
          return client.rpc("username_available", { name: name }).then(function (a) {
            if (!a.data) throw new Error("That username is taken.");
            return client.from("profiles").update({ username: name, username_changed_at: new Date().toISOString() }).eq("id", u.id).select().single();
          });
        });
      });
    },
    setProDefault: function (on) {
      if (!client) return Promise.resolve();
      return auth.getUser().then(function (u) {
        if (!u) return; return client.from("profiles").update({ pro_default: !!on }).eq("id", u.id);
      }).catch(function () {});
    },
  };

  var account = {
    wipeStats: function () {
      need();
      return auth.getUser().then(function (u) { return client.from("seasons").delete().eq("user_id", u.id); });
    },
    deleteAccount: function () {
      need();
      return auth.getUser().then(function (u) {
        var id = u.id;
        return Promise.all([
          client.from("seasons").delete().eq("user_id", id),
          client.from("friendships").delete().or("requester.eq." + id + ",addressee.eq." + id),
          client.from("profiles").delete().eq("id", id),
        ]).then(function () { return client.auth.signOut(); });
      });
    },
  };

  var data = {
    saveSeason: function (s) {
      need();
      return auth.getUser().then(function (u) {
        return client.from("seasons").insert(Object.assign({ user_id: u.id }, s));
      });
    },
    bestSeason: function (userId) {
      if (!client) return Promise.resolve(null);
      return client.from("seasons").select("*").eq("user_id", userId)
        .order("points", { ascending: false }).limit(1).maybeSingle().then(function (r) { return r.data; });
    },
    mySeasons: function () {
      if (!client) return Promise.resolve([]);
      return auth.getUser().then(function (u) {
        if (!u) return [];
        return client.from("seasons").select("*").eq("user_id", u.id)
          .order("created_at", { ascending: false }).then(function (r) { return r.data || []; });
      });
    },
    userSeasons: function (userId) {
      if (!client) return Promise.resolve([]);
      return client.from("seasons").select("*").eq("user_id", userId)
        .order("created_at", { ascending: false }).then(function (r) { return r.data || []; }).catch(function () { return []; });
    },
    recordMatch: function (m) {                       // multiplayer result (Phase 9)
      if (!client) return Promise.resolve();
      // .then() before .catch() - see the note on ranked.recordResult: .catch()
      // directly on a bare query-builder result throws "...catch is not a
      // function" SYNCHRONOUSLY. This call sits right before ranked.recordResult
      // in enterMpMatch's try block, so that throw was aborting the try block
      // before the ranked Elo write ever ran - the actual root cause of ranked
      // results never recording.
      return client.from("matches").insert(m)
        .then(function (r) { if (r && r.error) throw r.error; return r; })
        .catch(function (e) { console.error("recordMatch failed:", e && e.message); });
    },
    // My recent multiplayer matches, newest first, with the exact per-match
    // mmr deltas (stored on the lobby row by the ranked result RPC) stitched
    // in as m._lobby for ranked rows.
    myMatches: function (limitN) {
      if (!client) return Promise.resolve([]);
      return auth.getUser().then(function (u) {
        if (!u) return [];
        return client.from("matches").select("*")
          .or("player_a.eq." + u.id + ",player_b.eq." + u.id)
          .order("created_at", { ascending: false }).limit(limitN || 12)
          .then(function (r) {
            if (r && r.error) throw r.error;
            var rows = r.data || [];
            var lids = [];
            rows.forEach(function (m) { if (m.ranked && m.lobby_id) lids.push(m.lobby_id); });
            if (!lids.length) return rows;
            return client.from("match_lobby").select("id,mmr_dw,mmr_dl,elo_done").in("id", lids)
              .then(function (r2) {
                var map = {};
                ((r2 && r2.data) || []).forEach(function (l) { map[l.id] = l; });
                rows.forEach(function (m) { m._lobby = map[m.lobby_id] || null; });
                return rows;
              });
          });
      }).catch(function (e) { console.error("myMatches failed:", e && e.message); return []; });
    },
  };

  function profilesByIds(ids) {
    if (!client || !ids.length) return Promise.resolve({});
    return client.from("profiles").select("id,username").in("id", ids).then(function (r) {
      var map = {}; (r.data || []).forEach(function (p) { map[p.id] = p.username; }); return map;
    });
  }

  var friends = {
    request: function (username) {
      need();
      return Promise.all([auth.getUser(), profile.byUsername(username)]).then(function (vals) {
        var me = vals[0], target = vals[1];
        if (!target) throw new Error("No player found with username '" + username + "'.");
        if (target.id === me.id) throw new Error("You can't add yourself.");
        return client.from("friendships").select("id,status,requester,addressee")
          .or("and(requester.eq." + me.id + ",addressee.eq." + target.id + "),and(requester.eq." + target.id + ",addressee.eq." + me.id + ")")
          .maybeSingle().then(function (existing) {
            if (existing && existing.data) {
              var row = existing.data;
              if (row.status === "accepted") throw new Error("You're already friends with " + username + ".");
              if (row.status === "pending") {
                if (row.requester === me.id) throw new Error("You already sent " + username + " a request.");
                throw new Error(username + " already sent you a request.");
              }
            }
            return client.from("friendships").insert({ requester: me.id, addressee: target.id, status: "pending" });
          });
      });
    },
    accept: function (id) { need(); return client.from("friendships").update({ status: "accepted" }).eq("id", id); },
    decline: function (id) { need(); return client.from("friendships").delete().eq("id", id); },
    remove: function (id) { need(); return client.from("friendships").delete().eq("id", id); },
    cancelRequest: function (id) { need(); return client.from("friendships").delete().eq("id", id); },
    incoming: function () {
      if (!client) return Promise.resolve([]);
      return auth.getUser().then(function (u) {
        if (!u) return [];
        return client.from("friendships").select("*").eq("addressee", u.id).eq("status", "pending").then(function (r) {
          var rows = r.data || [];
          return profilesByIds(rows.map(function (x) { return x.requester; })).then(function (m) {
            return rows.map(function (x) { return { id: x.id, username: m[x.requester] || "player", userId: x.requester }; });
          });
        });
      });
    },
    outgoing: function () {
      if (!client) return Promise.resolve([]);
      return auth.getUser().then(function (u) {
        if (!u) return [];
        return client.from("friendships").select("*").eq("requester", u.id).eq("status", "pending").then(function (r) {
          var rows = r.data || [];
          return profilesByIds(rows.map(function (x) { return x.addressee; })).then(function (m) {
            return rows.map(function (x) { return { id: x.id, username: m[x.addressee] || "player", userId: x.addressee }; });
          });
        });
      });
    },
    list: function () {
      if (!client) return Promise.resolve([]);
      return auth.getUser().then(function (u) {
        if (!u) return [];
        return client.from("friendships").select("*").eq("status", "accepted")
          .or("requester.eq." + u.id + ",addressee.eq." + u.id).then(function (r) {
            var rows = r.data || [];
            var otherIds = rows.map(function (x) { return x.requester === u.id ? x.addressee : x.requester; });
            return profilesByIds(otherIds).then(function (m) {
              return rows.map(function (x) {
                var other = x.requester === u.id ? x.addressee : x.requester;
                return { id: x.id, userId: other, username: m[other] || "player" };
              });
            });
          });
      });
    },
    headToHead: function (otherId) {
      if (!client) return Promise.resolve({ wins: 0, losses: 0 });
      return auth.getUser().then(function (u) {
        if (!u) return { wins: 0, losses: 0 };
        var lo = u.id < otherId ? u.id : otherId, hi = u.id < otherId ? otherId : u.id;
        return client.from("head_to_head").select("*").eq("low_id", lo).eq("high_id", hi).maybeSingle().then(function (r) {
          if (!r.data) return { wins: 0, losses: 0 };
          var meLow = u.id === lo;
          return { wins: meLow ? r.data.low_wins : r.data.high_wins, losses: meLow ? r.data.high_wins : r.data.low_wins };
        });
      }).catch(function () { return { wins: 0, losses: 0 }; });
    },
    recordResult: function (winnerId, loserId) {
      if (!client || !winnerId || !loserId || winnerId === loserId) return Promise.resolve();
      // Prefer the atomic RPC. If it's missing/errors (e.g. schema not applied),
      // fall back to a manual upsert  the caller (host) is one of the pair, so the
      // head_to_head RLS policy (auth.uid() in (low_id, high_id)) permits it.
      return client.rpc("record_h2h", { winner: winnerId, loser: loserId })
        .then(function (r) { if (r && r.error) throw r.error; return r; })
        .catch(function (err) {
          console.warn("record_h2h RPC failed, using manual upsert:", err && err.message);
          var lo = winnerId < loserId ? winnerId : loserId;
          var hi = winnerId < loserId ? loserId : winnerId;
          var winIsLow = winnerId === lo;
          return client.from("head_to_head").select("low_wins,high_wins")
            .eq("low_id", lo).eq("high_id", hi).maybeSingle()
            .then(function (r) {
              var lw = (r.data && r.data.low_wins) || 0;
              var hw = (r.data && r.data.high_wins) || 0;
              if (winIsLow) lw += 1; else hw += 1;
              return client.from("head_to_head").upsert(
                { low_id: lo, high_id: hi, low_wins: lw, high_wins: hw, updated_at: new Date().toISOString() },
                { onConflict: "low_id,high_id" }
              ).then(function (res) {
                if (res && res.error) console.error("head_to_head upsert failed:", res.error.message);
                return res;
              });
            });
        })
        .catch(function (e) { console.error("recordResult failed:", e && e.message); });
    },
    report: function (otherId, reason, comment) {
      need();
      return auth.getUser().then(function (u) {
        return client.from("reports").insert({ reporter: u.id, reported: otherId, reason: reason, comment: comment || null });
      });
    },
    removeByUser: function (otherId) {
      need();
      return auth.getUser().then(function (u) {
        return client.from("friendships").delete()
          .or("and(requester.eq." + u.id + ",addressee.eq." + otherId + "),and(requester.eq." + otherId + ",addressee.eq." + u.id + ")");
      });
    },
    subscribe: function (callback) {
      if (!client) return null;
      var channel = client.channel("friendships-" + Date.now());
      channel.on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, function (payload) {
        try { callback(payload); } catch (e) {}
      }).subscribe();
      return channel;
    },
    // BUG #3 FIX: realtime subscription on head_to_head so friend rows update
    // live the instant a match result is written.
    subscribeH2H: function (callback) {
      if (!client) return null;
      var channel = client.channel("h2h-" + Date.now());
      channel.on("postgres_changes", { event: "*", schema: "public", table: "head_to_head" }, function (payload) {
        try { callback(payload); } catch (e) {}
      }).subscribe();
      return channel;
    },
    unsubscribe: function (channel) {
      if (client && channel) try { client.removeChannel(channel); } catch (e) {}
    },
  };

  var invites = {
    send: function (toUserId, opts) {
      need(); opts = opts || {};
      return auth.getUser().then(function (u) {
        var now = Date.now();
        return client.from("game_invites").insert({
          from_user: u.id, to_user: toUserId, status: "pending",
          pool: opts.pool || "club", pro: !!opts.pro, mode: opts.mode || "classic",
          expires_at: new Date(now + 30000).toISOString(),
        }).select().single();
      });
    },
    cancel: function (id) { need(); return client.from("game_invites").update({ status: "cancelled" }).eq("id", id); },
    accept: function (id) { need(); return client.from("game_invites").update({ status: "accepted" }).eq("id", id).select().single(); },
    decline: function (id) { need(); return client.from("game_invites").update({ status: "declined" }).eq("id", id); },
    mine: function () {
      if (!client) return Promise.resolve({ incoming: [], outgoing: [] });
      return auth.getUser().then(function (u) {
        if (!u) return { incoming: [], outgoing: [] };
        return client.from("game_invites").select("*").eq("status", "pending").gt("expires_at", new Date().toISOString())
          .or("from_user.eq." + u.id + ",to_user.eq." + u.id).then(function (r) {
            var rows = r.data || [];
            var ids = rows.map(function (x) { return x.from_user === u.id ? x.to_user : x.from_user; });
            return profilesByIds(ids).then(function (m) {
              var inc = [], out = [];
              rows.forEach(function (x) {
                var other = x.from_user === u.id ? x.to_user : x.from_user;
                var e = { id: x.id, userId: other, username: m[other] || "player", pool: x.pool, pro: x.pro, expires_at: x.expires_at, lobby_id: x.lobby_id };
                if (x.to_user === u.id) inc.push(e); else out.push(e);
              });
              return { incoming: inc, outgoing: out };
            });
          });
      }).catch(function () { return { incoming: [], outgoing: [] }; });
    },
    subscribe: function (cb) {
      if (!client) return null;
      var ch = client.channel("invites-" + Date.now());
      ch.on("postgres_changes", { event: "*", schema: "public", table: "game_invites" }, function (payload) {
        try { cb(payload); } catch (e) {}
      }).subscribe();
      return ch;
    },
    unsubscribe: function (ch) { if (client && ch) try { client.removeChannel(ch); } catch (e) {} },
  };

  var lobby = {
    createFromInvite: function (invite) {
      need();
      return client.from("match_lobby").insert({
        host: invite.from_user || invite.fromUser,
        guest: invite.to_user || invite.toUser,
        pool: invite.pool || "club",
        pro: !!invite.pro,
        phase: "formation",
        lobby_expires_at: new Date(Date.now() + 30000).toISOString(),   // B2: grey 30s "waiting" timer
      }).select().single().then(function (r) {
        // Save the new lobby_id back onto the invite row so BOTH users can enter reliably
        if (r && r.data && invite.id) {
          return client.from("game_invites")
            .update({ lobby_id: r.data.id })
            .eq("id", invite.id)
            .then(function () { return r; })
            .catch(function () { return r; });
        }
        return r;
      });
    },
    mine: function () {
      if (!client) return Promise.resolve(null);
      return auth.getUser().then(function (u) {
        if (!u) return null;
        // A1: only FRESH, still-active lobbies  never pull a player into a stale
        // or finished one. (phase filter already excludes done/expired.)
        var cutoff = new Date(Date.now() - 5 * 60000).toISOString();
        return client.from("match_lobby").select("*")
          .or("host.eq." + u.id + ",guest.eq." + u.id)
          .in("phase", ["formation", "reveal", "draft", "match"])
          .gte("created_at", cutoff)
          .order("created_at", { ascending: false }).limit(1).maybeSingle()
          .then(function (r) { return r.data; });
      }).catch(function () { return null; });
    },
    get: function (lobbyId) {
      if (!client) return Promise.resolve(null);
      return client.from("match_lobby").select("*").eq("id", lobbyId).maybeSingle().then(function (r) { return r.data; });
    },
    setFormation: function (lobbyId, isHost, formationId) {
      need();
      return client.from("match_lobby").select("draft").eq("id", lobbyId).single().then(function (r) {
        var draft = (r.data && r.data.draft) || {};
        if (isHost) draft.host_formation = formationId; else draft.guest_formation = formationId;
        return client.from("match_lobby").update({ draft: draft }).eq("id", lobbyId);
      });
    },
    setReady: function (lobbyId, isHost, ready) {
      need();
      var update = isHost ? { host_ready: !!ready } : { guest_ready: !!ready };
      return client.from("match_lobby").update(update).eq("id", lobbyId);
    },
    start: function (lobbyId) {
      need();
      return client.from("match_lobby").select("*").eq("id", lobbyId).single().then(function (r) {
        var row = r.data; if (!row) return null;
        if (row.phase !== "formation") return row;
        var seed = Math.floor(Math.random() * 2147483647);
        var firstPick = (seed % 2 === 0) ? row.host : row.guest;
        return client.from("match_lobby").update({
          seed: seed, first_pick: firstPick, phase: "reveal",
        }).eq("id", lobbyId).select().single().then(function (rr) { return rr.data; });
      });
    },
    // Phase 7: move from reveal → draft when both players have seen the countdown
    advanceToDraft: function (lobbyId) {
      need();
      return client.from("match_lobby").select("phase,first_pick,seed").eq("id", lobbyId).single().then(function (r) {
        if (!r.data || r.data.phase !== "reveal") return r.data;
        return client.from("match_lobby").update({ phase: "draft" }).eq("id", lobbyId).select().single().then(function (rr) { return rr.data; });
      });
    },
    // Phase 8: update the shared draft state (current spin, picks, turn)
    updateDraft: function (lobbyId, draftPatch) {
      need();
      return client.from("match_lobby").select("draft").eq("id", lobbyId).single().then(function (r) {
        var draft = (r.data && r.data.draft) || {};
        Object.keys(draftPatch).forEach(function (k) { draft[k] = draftPatch[k]; });
        return client.from("match_lobby").update({ draft: draft }).eq("id", lobbyId).select().single().then(function (rr) { return rr.data; });
      });
    },
    // Phase 9: lock the final squads AND flip to "match" in one write, so BOTH
    // clients transition together (avoids the opponent getting stuck on draft).
    finishDraft: function (lobbyId, draft) {
      need();
      return client.from("match_lobby").update({ draft: draft, phase: "match" }).eq("id", lobbyId)
        .select().single().then(function (rr) { return rr.data; });
    },
    // Phase 10: reset the lobby for a rematch (new seed, fresh formation pick).
    rematch: function (lobbyId) {
      need();
      var seed = Math.floor(Math.random() * 2147483647);
      return client.from("match_lobby").update({
        phase: "formation", seed: seed, draft: {},
        host_ready: false, guest_ready: false, first_pick: null,
      }).eq("id", lobbyId).select().single().then(function (rr) { return rr.data; });
    },
    leave: function (lobbyId) {
      if (!client) return Promise.resolve();
      // Prefer the atomic leave_lobby RPC: it stamps done_from = the phase we
      // left FROM before closing the lobby, which is what lets the opponent's
      // forfeit claim prove the game had actually started. Falls back to the
      // plain phase write if the RPC isn't deployed yet.
      return client.rpc("leave_lobby", { lobby: lobbyId })
        .then(function (r) { if (r && r.error) throw r.error; return r; })
        .catch(function () {
          return client.from("match_lobby").update({ phase: "done" }).eq("id", lobbyId)
            .then(function (r) { if (r && r.error) throw r.error; return r; })
            .catch(function (e) { console.error("lobby.leave failed:", e && e.message); });
        });
    },
    subscribe: function (lobbyId, cb) {
      if (!client) return null;
      var ch = client.channel("lobby-" + lobbyId);
      ch.on("postgres_changes", {
        event: "*", schema: "public", table: "match_lobby", filter: "id=eq." + lobbyId,
      }, function (payload) { try { cb(payload.new || payload.old); } catch (e) {} }).subscribe();
      return ch;
    },
    unsubscribe: function (ch) { if (client && ch) try { client.removeChannel(ch); } catch (e) {} },
  };

  /* ---------------------------------------------------------- RANKED --- */
  var ranked = {
    // Join (or refresh) the global matchmaking queue.
    joinQueue: function () {
      need();
      return auth.getUser().then(function (u) {
        if (!u) throw new Error("Not signed in.");
        return client.from("ranked_queue").upsert(
          { user_id: u.id, joined_at: new Date().toISOString(), matched_lobby_id: null },
          { onConflict: "user_id" }
        ).select().single().then(function (r) { return r.data; });
      });
    },
    leaveQueue: function () {
      if (!client) return Promise.resolve();
      return auth.getUser().then(function (u) {
        if (!u) return;
        return client.from("ranked_queue").delete().eq("user_id", u.id);
      }).catch(function () {});
    },
    // Ask the server to try to pair me with the longest-waiting player inside
    // my current skill (mmr) window - which widens the longer I wait, so a
    // fresh queue gets close matches and a long wait still finds someone
    // eventually. Returns the new lobby id if THIS call performed the match,
    // else null.
    tryMatch: function () {
      if (!client) return Promise.resolve(null);
      return client.rpc("try_ranked_match").then(function (r) { return r.data || null; }).catch(function () { return null; });
    },
    // Check whether SOMEONE ELSE'S call already matched me (poll fallback for
    // the realtime subscription below).
    checkMatched: function () {
      if (!client) return Promise.resolve(null);
      return auth.getUser().then(function (u) {
        if (!u) return null;
        return client.from("ranked_queue").select("matched_lobby_id").eq("user_id", u.id).maybeSingle()
          .then(function (r) { return (r.data && r.data.matched_lobby_id) || null; });
      }).catch(function () { return null; });
    },
    // Instant "someone else matched me" notification via realtime, so the
    // waiting player doesn't have to sit through a full poll interval.
    subscribeQueue: function (userId, cb) {
      if (!client) return null;
      var ch = client.channel("ranked-queue-" + userId);
      ch.on("postgres_changes", {
        event: "*", schema: "public", table: "ranked_queue", filter: "user_id=eq." + userId,
      }, function (payload) { try { cb(payload.new || null); } catch (e) {} }).subscribe();
      return ch;
    },
    unsubscribe: function (ch) { if (client && ch) try { client.removeChannel(ch); } catch (e) {} },
    // Atomic Elo + W/L update (K-factor banded off each player's own mmr).
    recordResult: function (winnerId, loserId) {
      if (!client || !winnerId || !loserId || winnerId === loserId) return Promise.resolve();
      // NOTE: the postgrest query builder returned by client.rpc() only
      // implements .then() until it's been chained - calling .catch() on it
      // DIRECTLY throws "...catch is not a function" synchronously (this is
      // exactly what silently ate every ranked result: enterMpMatch calls this
      // inside a try/catch, so the TypeError below was always being swallowed
      // before record_ranked_result ever actually ran). The .then() first
      // resolves that; only chain .catch() after a .then().
      return client.rpc("record_ranked_result", { winner: winnerId, loser: loserId })
        .then(function (r) { if (r && r.error) throw r.error; return r; })
        .catch(function (e) { console.error("record_ranked_result failed:", e && e.message); });
    },
    myStats: function () {
      if (!client) return Promise.resolve(null);
      return auth.getUser().then(function (u) {
        if (!u) return null;
        // Catch my own row up to the current season BEFORE reading it, so a
        // season boundary I crossed since my last match shows correctly right
        // away instead of waiting for my next queue/match touch. A sync failure
        // is non-fatal (logged, not thrown) - we still try to read the row.
        // (.then() before .catch() - see the note in ranked.recordResult above:
        // .catch() directly on a bare client.rpc() result throws synchronously.)
        return client.rpc("ranked_sync_me")
          .then(function (r) { if (r && r.error) throw r.error; return r; })
          .catch(function (e) {
            console.warn("ranked_sync_me failed (continuing with existing mmr):", e && e.message);
          }).then(function () {
          return client.from("profiles").select("id,username,mmr,ranked_wins,ranked_losses,ranked_streak,season_number").eq("id", u.id).maybeSingle();
        }).then(function (r) {
          // A real DB/RLS error here must NOT be swallowed to null - that's
          // exactly what left the Ranked tab stuck on "Loading your rank..."
          // forever with no way to tell what went wrong.
          if (r && r.error) { console.error("myStats profiles read failed:", r.error.message); throw r.error; }
          return r ? r.data : null;
        });
      });
    },
    leaderboardGlobal: function (limitN) {
      if (!client) return Promise.resolve([]);
      return client.from("profiles").select("id,username,mmr,ranked_wins,ranked_losses,ranked_streak")
        .order("mmr", { ascending: false }).limit(limitN || 50)
        .then(function (r) {
          if (r && r.error) { console.error("leaderboardGlobal failed:", r.error.message); throw r.error; }
          return r.data || [];
        });
    },
    leaderboardFriends: function (friendIds) {
      if (!client || !friendIds || !friendIds.length) return Promise.resolve([]);
      return client.from("profiles").select("id,username,mmr,ranked_wins,ranked_losses,ranked_streak")
        .in("id", friendIds).order("mmr", { ascending: false })
        .then(function (r) {
          if (r && r.error) { console.error("leaderboardFriends failed:", r.error.message); throw r.error; }
          return r.data || [];
        });
    },
    // Another player's rank (mmr/W-L) - same public columns the leaderboard
    // already reads for arbitrary users, just for exactly one id. Used by the
    // ranked lobby screen to show who you're up against.
    statsFor: function (userId) {
      if (!client || !userId) return Promise.resolve(null);
      return client.from("profiles").select("id,username,mmr,ranked_wins,ranked_losses,ranked_streak")
        .eq("id", userId).maybeSingle()
        .then(function (r) {
          if (r && r.error) { console.error("ranked.statsFor failed:", r.error.message); throw r.error; }
          return r ? r.data : null;
        }).catch(function (e) { console.error("ranked.statsFor failed:", e && e.message); return null; });
    },
    // Record a decided ranked match. Idempotent server-side (elo_done lock on
    // the lobby row) and callable by EITHER player, so the result can never be
    // lost to a vanished host. Resolves to [deltaWinner, deltaLoser] - the
    // exact server-computed swing, same values for whichever client asks.
    recordResultLobby: function (lobbyId, winnerId, loserId, goalsHost, goalsGuest) {
      if (!client || !lobbyId) return Promise.resolve(null);
      return client.rpc("record_ranked_result_lobby", {
        lobby: lobbyId, winner: winnerId, loser: loserId,
        goals_host: goalsHost, goals_guest: goalsGuest,
      }).then(function (r) { if (r && r.error) throw r.error; return r.data || null; })
        .catch(function (e) { console.error("record_ranked_result_lobby failed:", e && e.message); return null; });
    },
    // Claim a forfeit win after the opponent left/vanished mid-game. Server
    // enforces validity (real leave from reveal/draft/match, or a 20s-dead
    // heartbeat) and awards a normal Elo win/loss. Returns [myDelta, theirDelta].
    claimForfeit: function (lobbyId) {
      if (!client || !lobbyId) return Promise.resolve(null);
      return client.rpc("claim_ranked_forfeit", { lobby: lobbyId })
        .then(function (r) { if (r && r.error) throw r.error; return r.data || null; })
        .catch(function (e) { console.error("claim_ranked_forfeit failed:", e && e.message); return null; });
    },
    // Refresh my liveness on the lobby; resolves to how stale the OPPONENT's
    // heartbeat is in seconds (null if unknown). All server-side clocks.
    heartbeat: function (lobbyId) {
      if (!client || !lobbyId) return Promise.resolve(null);
      return client.rpc("lobby_heartbeat", { lobby: lobbyId })
        .then(function (r) { if (r && r.error) throw r.error; return r.data != null ? Number(r.data) : null; })
        .catch(function () { return null; });
    },
  };

  /* ------------------------------------------------ PLAYER COLLECTION --- */
  var collection = {
    // Fire-and-forget: fold a completed draft's squad into my album.
    add: function (players) {
      if (!client || !players || !players.length) return Promise.resolve();
      return client.rpc("collection_add", { players: players })
        .then(function (r) { if (r && r.error) throw r.error; return r; })
        .catch(function (e) { console.error("collection_add failed:", e && e.message); });
    },
    mine: function () {
      if (!client) return Promise.resolve([]);
      return auth.getUser().then(function (u) {
        if (!u) return [];
        return client.from("player_collection").select("*").eq("user_id", u.id)
          .order("ovr", { ascending: false }).limit(400)
          .then(function (r) { if (r && r.error) throw r.error; return r.data || []; });
      }).catch(function (e) { console.error("collection.mine failed:", e && e.message); return []; });
    },
  };

  root.CC_BACKEND = {
    configured: configured, client: client,
    auth: auth, profile: profile, data: data, friends: friends,
    account: account, invites: invites, lobby: lobby, ranked: ranked,
    collection: collection,
  };
})(window);
