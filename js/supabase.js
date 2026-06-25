/* ============================================================================
 * CLUB CHAMPION — Backend (Supabase)
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
      return client.from("matches").insert(m).catch(function () {});
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
      if (!client) return Promise.resolve();
      return client.rpc("record_h2h", { winner: winnerId, loser: loserId }).catch(function () {});
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
        // A1: only FRESH, still-active lobbies — never pull a player into a stale
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
      return client.from("match_lobby").update({ phase: "done" }).eq("id", lobbyId).catch(function () {});
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

  root.CC_BACKEND = {
    configured: configured, client: client,
    auth: auth, profile: profile, data: data, friends: friends,
    account: account, invites: invites, lobby: lobby,
  };
})(window);
