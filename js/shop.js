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

    wrap.innerHTML = head +
      '<div class="seg shop-subseg" id="shop-subseg">' +
        '<button data-s="shop"' + (subTab === "shop" ? ' class="is-selected"' : "") + '>Shop</button>' +
        '<button data-s="locker"' + (subTab === "locker" ? ' class="is-selected"' : "") + '>Locker</button>' +
      '</div>' +
      '<div id="shop-body"></div>';

    $("shop-subseg").querySelectorAll("button").forEach(function (b) {
      b.onclick = function () { subTab = b.dataset.s; render(user); };
    });

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
    var thumbClass = "shop-thumb" + (it.category === "kit" ? " shop-thumb--round" : "");
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

  // Real kit/ball art hasn't been sourced yet - render a deterministic colored
  // placeholder (hue derived from the item id, so the same item always gets
  // the same color) with a category emoji until real assets are dropped in.
  var PLACEHOLDER_EMOJI = { kit: "👕", ball: "⚽", bundle: "🎁" };
  function hueFromId(id) { var h = 0; for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0; return h % 360; }
  function thumbHTML(it) {
    if (it.image_url) return '<img src="' + esc(it.image_url) + '" alt="" loading="lazy" />';
    if (it.category === "skin") return '<span class="shop-thumb-fallback ' + skinSwatchClass(it.id) + '"></span>';
    var hue = hueFromId(it.id);
    return '<span class="shop-thumb-fallback shop-thumb-emoji" style="background:linear-gradient(160deg, hsl(' + hue + ',55%,38%), hsl(' + hue + ',55%,18%))">' +
      (PLACEHOLDER_EMOJI[it.category] || "🏷️") + '</span>';
  }

  function buy(it, btn) {
    if (!BE.configured) return;
    btn.disabled = true; var orig = btn.textContent; btn.textContent = "…";
    BE.shop.buy(it.id).then(function (r) {
      if (r && r.url) {
        // Stripe Checkout - see supabase/functions/create-checkout-session.
        // Native: open in the system browser (SFSafariViewController), not
        // the app's own WKWebView, which is locked to WKAppBoundDomains and
        // would silently fail to load checkout.stripe.com. native.js catches
        // the redirect back (clubchampion://checkout-success) and closes it.
        if (root.CC_NATIVE && root.CC_NATIVE.isNative && root.CC_NATIVE.isNative() && root.Capacitor.Plugins.Browser) {
          root.Capacitor.Plugins.Browser.open({ url: r.url });
        } else {
          location.href = r.url;
        }
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
