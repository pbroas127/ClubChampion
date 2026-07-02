/* ============================================================================
 * CLUB CHAMPION  Locker (owned items + equip)
 * ----------------------------------------------------------------------------
 * Renders into a container handed to it by shop.js's Locker sub-tab. Reads
 * BE.shop.myLocker() (owned kits/balls/skins + which is currently equipped)
 * and lets the player switch their active kit/ball/skin via BE.profile.equip().
 * ========================================================================== */
(function (root) {
  "use strict";

  var BE;
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); };
  function toast(m) { if (root.CC_TOAST) root.CC_TOAST(m); }

  var lockerCatTab = "kit";

  function render(container) {
    if (!container) return;
    BE = BE || root.CC_BACKEND;
    container.innerHTML = '<div class="muted-line">Loading your locker…</div>';
    BE.shop.myLocker().then(function (rows) {
      paint(container, rows || []);
    }).catch(function () {
      container.innerHTML = '<div class="card empty-card"><div class="empty-emoji">🗄️</div><h3>Couldn\'t load your locker</h3></div>';
    });
  }

  function paint(container, rows) {
    var byCat = { kit: [], ball: [], skin: [] };
    rows.forEach(function (r) { if (byCat[r.category]) byCat[r.category].push(r); });
    // "Classic Green" is the free default skin - always show it in the Locker
    // even before any purchase, since every player owns it implicitly.
    if (!byCat.skin.some(function (r) { return r.item_id === "skin_classic_green"; })) {
      byCat.skin.unshift({ item_id: "skin_classic_green", category: "skin", name: "Classic Green", image_url: null, equipped: !byCat.skin.some(function (r) { return r.equipped; }) });
    }

    var recentlyEquipped = rows.filter(function (r) { return r.equipped; });

    container.innerHTML =
      (recentlyEquipped.length ? recentlyEquippedHTML(recentlyEquipped) : "") +
      '<div class="seg shop-catseg" id="locker-catseg">' +
        ["kit", "ball", "skin"].map(function (c) {
          var n = byCat[c].length;
          return '<button data-c="' + c + '"' + (lockerCatTab === c ? ' class="is-selected"' : "") + '>' + catLabel(c) + ' <small>' + n + '</small></button>';
        }).join("") +
      '</div>' +
      '<div class="shop-grid" id="locker-grid"></div>';

    $c(container, "#locker-catseg").querySelectorAll("button").forEach(function (b) {
      b.onclick = function () { lockerCatTab = b.dataset.c; paint(container, rows); };
    });

    paintGrid(container, byCat[lockerCatTab]);
  }

  function $c(container, sel) { return container.querySelector(sel); }
  function catLabel(c) { return { kit: "Jerseys", ball: "Balls", skin: "Skins" }[c] || c; }

  function chipThumb(r) {
    return root.CC_SHOP ? root.CC_SHOP.thumbHTML({ id: r.item_id, category: r.category, image_url: r.image_url }) :
      (r.image_url ? '<img src="' + esc(r.image_url) + '" alt="" />' : '<span class="shop-thumb-fallback swatch-' + r.item_id.replace(/^skin_/, "") + '"></span>');
  }

  function recentlyEquippedHTML(items) {
    return '<div class="card locker-equipped-card"><h3>Currently equipped</h3><div class="locker-equipped-row">' +
      items.map(function (r) {
        return '<div class="locker-equipped-chip">' + chipThumb(r) + '<span>' + esc(r.name) + '</span></div>';
      }).join("") +
    '</div></div>';
  }

  function paintGrid(container, items) {
    var grid = $c(container, "#locker-grid"); if (!grid) return;
    if (!items.length) {
      grid.innerHTML = '<div class="card empty-card"><div class="empty-emoji">🗄️</div><h3>Nothing here yet</h3><p>Visit the Shop tab to pick some up.</p></div>';
      return;
    }
    grid.innerHTML = items.map(function (r) {
      var thumb = r.image_url
        ? '<img src="' + esc(r.image_url) + '" alt="" loading="lazy" />'
        : '<span class="shop-thumb-fallback swatch-' + r.item_id.replace(/^skin_/, "") + '"></span>';
      return (
        '<div class="shop-card locker-card' + (r.equipped ? " is-equipped" : "") + '" data-id="' + esc(r.item_id) + '">' +
          (r.equipped ? '<div class="shop-badges"><span class="shop-badge shop-badge--equipped">EQUIPPED</span></div>' : "") +
          '<div class="shop-thumb' + (r.category === "kit" ? " shop-thumb--round" : "") + '">' + thumb + '</div>' +
          '<div class="shop-name">' + esc(r.name) + '</div>' +
          '<div class="shop-cta">' +
            (r.equipped
              ? '<span class="shop-owned-tag">✓ Active</span>'
              : '<button class="btn btn--ghost btn--sm locker-equip-btn">Equip</button>') +
          '</div>' +
        '</div>'
      );
    }).join("");

    grid.querySelectorAll(".locker-equip-btn").forEach(function (btn) {
      btn.onclick = function () {
        var card = btn.closest(".locker-card"), id = card.dataset.id;
        btn.disabled = true;
        BE.profile.equip(id).then(function () {
          toast("Equipped");
          if (root.CC_SHOP) root.CC_SHOP.catalogCacheBust();
          render(container);
        }).catch(function (e) {
          toast((e && e.message) || "Couldn't equip that.");
          btn.disabled = false;
        });
      };
    });
  }

  root.CC_LOCKER = { render: render };
})(window);
