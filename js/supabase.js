/* ============================================================================
 * CLUB CHAMPION — Backend (Supabase)
 * ----------------------------------------------------------------------------
 * Thin wrapper over the Supabase JS client (loaded from CDN as `supabase`).
 * Exposes auth, profiles, seasons and friends. If keys aren't configured (or
 * the CDN didn't load), `configured` is false and callers fall back to local
 * offline behaviour — the game stays fully playable.
 * ==========================================================================*/
(function (root) {
  "use strict";
  var CFG = root.CC_CONFIG || {};
  var lib = root.supabase; // UMD global from the CDN script
  var configured = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && lib && lib.createClient);
  var client = configured ? lib.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  }) : null;

  function need() { if (!client) throw new Error("Accounts aren't set up yet — add your Supabase keys in js/config.js."); }

  var auth = {
    signUpEmail: function (email, password) { need(); return client.auth.signUp({ email: email, password: password }); },
    signInEmail: function (email, password) { need(); return client.auth.signInWithPassword({ email: email, password: password }); },
    signInGoogle: function () {
      need();
      return client.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + location.pathname } });
    },
    signOut: function () { need(); return client.auth.signOut(); },
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
  };

  // ---- friends -------------------------------------------------------------
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
        if (!target) throw new Error("No player found with username "" + username + "".");
        if (target.id === me.id) throw new Error("You can't add yourself.");
        // Check for any existing relationship to give a clearer error
        return client.from("friendships").select("id,status,requester,addressee")
          .or("and(requester.eq." + me.id + ",addressee.eq." + target.id + "),and(requester.eq." + target.id + ",addressee.eq." + me.id + ")")
          .maybeSingle().then(function (existing) {
            if (existing && existing.data) {
              var row = existing.data;
              if (row.status === "accepted") throw new Error("You're already friends with " + username + ".");
              if (row.status === "pending") {
                if (row.requester === me.id) throw new Error("You already sent " + username + " a request.");
                throw new Error(username + " already sent you a request — check your Requests.");
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
    // Realtime: fires `callback()` whenever a friendship row changes that
    // involves the current user. Returns the channel so callers can unsubscribe.
    subscribe: function (callback) {
      if (!client) return null;
      var channel = client.channel("friendships-" + Date.now());
      channel
        .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, function () {
          try { callback(); } catch (e) {}
        })
        .subscribe();
      return channel;
    },
    unsubscribe: function (channel) {
      if (client && channel) try { client.removeChannel(channel); } catch (e) {}
    },
  };

  root.CC_BACKEND = {
    configured: configured, client: client,
    auth: auth, profile: profile, data: data, friends: friends,
  };
})(window);
