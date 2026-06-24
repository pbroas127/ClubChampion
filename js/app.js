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
