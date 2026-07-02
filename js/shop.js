/* ============================================================================
 * CLUB CHAMPION  Shop tab
 * ----------------------------------------------------------------------------
 * Peer module to ui.js/app.js (same window.CC_* pattern). Renders the
 * Shop/Locker screen, the catalog grid, and the purchase flow. Locker
 * rendering itself lives in js/locker.js; this file calls into it for the
 * Locker sub-tab so the two stay decoupled (shop.js = browse/buy, locker.js =
 * own/equip).
 * ========================================================================== */
(function (root) {
  "use strict";

  var BE;
  var $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }
  function toast(m) { if (root.CC_TOAST) root.CC_TOAST(m); }
  function money(cents) { return cents === 0 ? "Free" : "$" + (cents / 100).toFixed(2); }
  function isNew(releaseAt) { return releaseAt && (Date.now() - new Date(releaseAt).getTime()) < 14 * 86400000; }

  var subTab = "shop";        // "shop" | "locker"
  var catFilter = "kit";      // "kit" | "ball" | "skin" | "bundle"
  var catalog = null;         // cached list from BE.shop.list()
  var owned = null;           // Set of owned item ids, cached from BE.shop.myLocker()

  function signInCard() {
    return '<div class="card empty-card"><div class="empty-emoji">🔒</div><h3>Sign in to visit the Shop</h3>' +
      '<button class="btn btn--kickoff btn--sm" id="shop-signin-cta" style="max-width:200px;margin:14px auto 0">Sign in</button></div>';
  }

  function render(user) {
    var wrap = $("screen-shop"); if (!wrap) return;
    var head = '<div class="page-head"><h2>Shop</h2><p>Kits, balls, and match-sim skins for your squad.</p></div>';

    if (!user) {
      wrap.innerHTML = head + signInCard();
      var cta = $("shop-signin-cta"); if (cta) cta.onclick = function () { root.CC_APP.openAuth("in"); };
      return;
    }
    if (!BE || !BE.configured) {
      wrap.innerHTML = head + '<div class="card empty-card"><div class="empty-emoji">🛍️</div><h3>Shop isn\'t set up yet</h3><p>Accounts aren\'t configured.</p></div>';
      return;
    }

    // Apple requires a Restore Purchases affordance wherever IAP is sold -
    // only meaningful (and only shown) inside the native iOS app.
    var restoreBtn = (root.CC_IAP && root.CC_IAP.isNative())
      ? '<button class="link-btn shop-restore-btn" id="shop-restore">Restore Purchases</button>' : '';

    wrap.innerHTML = head +
      '<div class="seg shop-subseg" id="shop-subseg">' +
        '<button data-s="shop"' + (subTab === "shop" ? ' class="is-selected"' : "") + '>Shop</button>' +
        '<button data-s="locker"' + (subTab === "locker" ? ' class="is-selected"' : "") + '>Locker</button>' +
      '</div>' +
      '<div id="shop-body"></div>' + restoreBtn;

    $("shop-subseg").querySelectorAll("button").forEach(function (b) {
      b.onclick = function () { subTab = b.dataset.s; render(user); };
    });
    if (restoreBtn) $("shop-restore").onclick = function () { restorePurchases($("shop-restore")); };

    if (subTab === "locker") {
      if (root.CC_LOCKER) root.CC_LOCKER.render($("shop-body"));
      return;
    }
    renderShopBody(user);
  }

  function renderShopBody(user) {
    var body = $("shop-body"); if (!body) return;
    body.innerHTML =
      '<div class="seg shop-catseg" id="shop-catseg">' +
        ["kit", "ball", "skin", "bundle"].map(function (c) {
          return '<button data-c="' + c + '"' + (catFilter === c ? ' class="is-selected"' : "") + '>' + catLabel(c) + '</button>';
        }).join("") +
      '</div>' +
      '<div class="shop-grid" id="shop-grid"><div class="muted-line">Loading…</div></div>';

    $("shop-catseg").querySelectorAll("button").forEach(function (b) {
      b.onclick = function () { catFilter = b.dataset.c; renderShopBody(user); };
    });

    loadCatalog().then(function () { paintGrid(user); });
  }

  function catLabel(c) { return { kit: "Kits", ball: "Balls", skin: "Skins", bundle: "Bundles" }[c] || c; }

  function loadCatalog() {
    var p1 = catalog ? Promise.resolve(catalog) : BE.shop.list().then(function (rows) { catalog = rows || []; return catalog; });
    var p2 = owned ? Promise.resolve(owned) : BE.shop.myLocker().then(function (rows) {
      owned = {}; (rows || []).forEach(function (r) { owned[r.item_id] = true; });
      return owned;
    });
    return Promise.all([p1, p2]);
  }

  function paintGrid(user) {
    var grid = $("shop-grid"); if (!grid || !catalog) return;
    var items = catalog.filter(function (it) { return it.category === catFilter; });
    if (!items.length) { grid.innerHTML = '<div class="muted-line">Nothing here yet.</div>'; return; }

    grid.innerHTML = items.map(function (it) { return itemCardHTML(it); }).join("");
    grid.querySelectorAll(".shop-card").forEach(function (card) {
      var id = card.dataset.id, it = catalog.filter(function (x) { return x.id === id; })[0];
      var btn = card.querySelector(".shop-buy-btn");
      if (!btn) return;
      btn.onclick = function () { buy(it, btn); };
    });
  }

  function itemCardHTML(it) {
    var ownedIt = !!(owned && owned[it.id]) || it.price_cents === 0;
    var isBundle = it.category === "bundle";
    var isCoin = it.category === "kit" || it.category === "ball";
    var thumbClass = "shop-thumb" + (isCoin ? " shop-thumb--round" : "");
    var thumb = thumbHTML(it);
    var badges = '';
    if (isNew(it.release_at)) badges += '<span class="shop-badge shop-badge--new">NEW</span>';
    if (isBundle) badges += '<span class="shop-badge shop-badge--save">BUNDLE</span>';
    return (
      '<div class="shop-card' + (ownedIt ? " is-owned" : "") + '" data-id="' + esc(it.id) + '">' +
        (badges ? '<div class="shop-badges">' + badges + '</div>' : '') +
        '<div class="' + thumbClass + '">' + thumb + '</div>' +
        '<div class="shop-name">' + esc(it.name) + '</div>' +
        (it.description ? '<div class="shop-desc">' + esc(it.description) + '</div>' : '') +
        '<div class="shop-cta">' +
          (ownedIt
            ? '<span class="shop-owned-tag">✓ Owned</span>'
            : '<button class="btn btn--kickoff btn--sm shop-buy-btn">' + money(it.price_cents) + '</button>') +
        '</div>' +
      '</div>'
    );
  }

  // CSS-only skins have no image_url - give each a distinct gradient swatch
  // derived from its id so the card still reads as a real preview.
  function skinSwatchClass(id) { return "swatch-" + id.replace(/^skin_/, ""); }

  // Real kit/ball art hasn't been sourced for most of the catalog yet. Kits
  // without unique art fall back to a plain red/blue two-tone disc (no
  // generated image needed - pure CSS); balls without unique art fall back
  // to one shared generic classic-ball image. Bundles keep the emoji tile.
  var GENERIC_BALL_IMG = "https://d8j0ntlcm91z4.cloudfront.net/user_3DIHRL4hfIamgJ8ncr9DUxS5zcC/hf_20260702_225514_af667896-4208-47e0-b06e-887de605259f.png";
  function placeholderFaceHTML(it) {
    if (it.category === "kit") return '<span class="cc-face-default-kit"></span>';
    if (it.category === "ball") return '<img src="' + esc(GENERIC_BALL_IMG) + '" alt="" loading="lazy" />';
    return '<span class="shop-thumb-fallback shop-thumb-emoji" style="background:linear-gradient(160deg, hsl(43,55%,38%), hsl(43,55%,18%))">🎁</span>';
  }
  function thumbHTML(it) {
    if (it.category === "skin") {
      return it.image_url ? '<img src="' + esc(it.image_url) + '" alt="" loading="lazy" />' : '<span class="shop-thumb-fallback ' + skinSwatchClass(it.id) + '"></span>';
    }
    if (it.category !== "kit" && it.category !== "ball") {
      return it.image_url ? '<img src="' + esc(it.image_url) + '" alt="" loading="lazy" />' : placeholderFaceHTML(it);
    }
    // Kits + balls: real or placeholder face, always inside the same silver
    // coin bezel (see .cc-coin in shop.css) so the whole catalog reads as one
    // consistent collection regardless of which items have real art yet.
    var face = it.image_url
      // Nation kits use their flag full-bleed (cover); club crests and ball
      // art keep their own transparent padding intact (contain).
      ? '<img src="' + esc(it.image_url) + '" alt="" loading="lazy"' + (it.kit_scope === "nation" ? ' class="cc-face-cover"' : '') + ' />'
      : placeholderFaceHTML(it);
    return '<span class="cc-coin"><span class="cc-coin-face">' + face + '</span></span>';
  }

  // Apple requires real IAP for anything bought inside the iOS app (App
  // Review 3.1.1) - Stripe Checkout only runs for web purchases. See js/iap.js.
  function buy(it, btn) {
    if (!BE.configured) return;
    if (root.CC_IAP && root.CC_IAP.isNative() && root.CC_IAP.isConfigured()) { buyNative(it, btn); return; }
    btn.disabled = true; var orig = btn.textContent; btn.textContent = "…";
    BE.shop.buy(it.id).then(function (r) {
      if (r && r.url) {
        // Stripe Checkout (web only at this point - native never reaches
        // here) - see supabase/functions/create-checkout-session.
        location.href = r.url;
        return;
      }
      // Free item (e.g. a promo) - already granted server-side, just refresh.
      owned = null; catalog = null;
      toast("Added to your Locker");
      renderShopBody(root.CC_APP && root.CC_APP.currentUser ? root.CC_APP.currentUser() : true);
    }).catch(function (e) {
      toast((e && e.message) || "Couldn't start checkout.");
      btn.disabled = false; btn.textContent = orig;
    });
  }

  function buyNative(it, btn) {
    if (!it.revenuecat_product_id) { toast("This item isn't available on iOS yet - try the web version."); return; }
    btn.disabled = true; var orig = btn.textContent; btn.textContent = "…";
    root.CC_IAP.buy(it.revenuecat_product_id).then(function () {
      return pollForEntitlement(it.id);
    }).then(function (got) {
      catalog = null; owned = null;
      if (got) { onReturnFromCheckout(); return; }
      toast("Purchase received - check your Locker in a moment.");
      renderShopBody(root.CC_APP && root.CC_APP.currentUser ? root.CC_APP.currentUser() : true);
    }).catch(function (e) {
      btn.disabled = false; btn.textContent = orig;
      if (e && e.userCancelled) return;
      toast((e && e.message) || "Purchase failed.");
    });
  }

  // The RevenueCat webhook grants the entitlement server-side a moment after
  // the purchase resolves client-side - poll briefly rather than showing the
  // purchase as "done" before it's actually reflected in the Locker.
  function pollForEntitlement(itemId, triesLeft) {
    triesLeft = triesLeft == null ? 6 : triesLeft;
    return BE.shop.myLocker().then(function (rows) {
      var got = (rows || []).some(function (r) { return r.item_id === itemId; });
      if (got || triesLeft <= 1) return got;
      return new Promise(function (resolve) { setTimeout(resolve, 900); }).then(function () {
        return pollForEntitlement(itemId, triesLeft - 1);
      });
    });
  }

  function restorePurchases(btn) {
    if (!root.CC_IAP || !root.CC_IAP.isNative()) return;
    var orig = btn.textContent; btn.disabled = true; btn.textContent = "Restoring…";
    root.CC_IAP.restore().then(function () {
      catalog = null; owned = null;
      toast("Purchases restored");
      renderShopBody(root.CC_APP && root.CC_APP.currentUser ? root.CC_APP.currentUser() : true);
    }).catch(function (e) {
      toast((e && e.message) || "Couldn't restore purchases.");
      btn.disabled = false; btn.textContent = orig;
    });
  }

  // Called once, after a Stripe Checkout redirect lands back on the app with
  // ?checkout=success - invalidates caches so the just-bought item shows as
  // owned without needing a manual refresh, and pops the purchase moment.
  function onReturnFromCheckout() {
    owned = null; catalog = null;
    // Native purchases return here without a page reload (unlike the web
    // ?checkout=success flow, which naturally re-renders on next paint) - if
    // the Shop screen is up right now, refresh it immediately.
    if (document.body.dataset.screen === "shop") {
      var user = root.CC_APP && root.CC_APP.currentUser ? root.CC_APP.currentUser() : true;
      render(user);
    }
    var el2 = document.createElement("div");
    el2.className = "shop-confetti-toast";
    el2.textContent = "🎉 Purchase complete — check your Locker!";
    document.body.appendChild(el2);
    requestAnimationFrame(function () { el2.classList.add("show"); });
    setTimeout(function () { el2.classList.remove("show"); setTimeout(function () { el2.remove(); }, 300); }, 3200);
  }

  function init() { BE = root.CC_BACKEND; }

  root.CC_SHOP = { init: init, render: render, onReturnFromCheckout: onReturnFromCheckout, catalogCacheBust: function () { catalog = null; owned = null; }, thumbHTML: thumbHTML };
})(window);
