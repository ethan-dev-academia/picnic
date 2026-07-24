/* ============================================================
   2nd Annual YCombinator Startup School Picnic — main site JS
   Dependency-free. Reads window.PICNIC_GROUPS / PICNIC_LOCATIONS /
   PICNIC_ASSIGNMENTS (plain <script> globals — works over file://).
   Degrades gracefully when data files are absent.
   ============================================================ */
(function () {
  "use strict";

  var MAX_RESULTS = 10;

  // ---------- Data (may be absent — never crash) ----------

  var GROUPS = (typeof window.PICNIC_GROUPS === "object" && window.PICNIC_GROUPS) || null;
  var LOCATIONS = Array.isArray(window.PICNIC_LOCATIONS) ? window.PICNIC_LOCATIONS : null;
  var ASSIGNMENTS = (typeof window.PICNIC_ASSIGNMENTS === "object" && window.PICNIC_ASSIGNMENTS) || null;

  var groupList = GROUPS && Array.isArray(GROUPS.groups) ? GROUPS.groups : [];

  var locationById = {};
  (LOCATIONS || []).forEach(function (loc) {
    if (loc && loc.id != null) locationById[String(loc.id)] = loc;
  });

  function locationForGroup(groupId) {
    if (!ASSIGNMENTS) return null;
    var locId = ASSIGNMENTS[String(groupId)];
    return locId != null ? locationById[String(locId)] || null : null;
  }

  // ---------- Helpers ----------

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function foldChar(ch) {
    // Lowercase + strip diacritics for a single character.
    var s = ch.toLowerCase();
    if (typeof s.normalize === "function") {
      s = s.normalize("NFD").replace(/[̀-ͯ]/g, "");
    }
    return s;
  }

  // Build a folded string plus a map from each folded char back to its
  // original index, so we can highlight the matched substring precisely
  // even when diacritics change string length.
  function foldWithMap(str) {
    var folded = "";
    var map = [];
    for (var i = 0; i < str.length; i++) {
      var f = foldChar(str[i]);
      for (var j = 0; j < f.length; j++) {
        folded += f[j];
        map.push(i);
      }
    }
    return { folded: folded, map: map };
  }

  function foldQuery(str) {
    var s = String(str).toLowerCase();
    if (typeof s.normalize === "function") {
      s = s.normalize("NFD").replace(/[̀-ͯ]/g, "");
    }
    return s.trim();
  }

  function fmt(n) {
    return typeof n === "number" ? n.toLocaleString("en-US") : String(n);
  }

  // ---------- Search index ----------

  // One entry per member (duplicate display names stay distinct entries).
  var memberIndex = [];
  groupList.forEach(function (group) {
    (Array.isArray(group.members) ? group.members : []).forEach(function (member) {
      if (!member || !member.name) return;
      var fm = foldWithMap(member.name);
      memberIndex.push({
        member: member,
        group: group,
        name: member.name,
        folded: fm.folded,
        map: fm.map
      });
    });
  });

  var hasData = memberIndex.length > 0;

  // ---------- Stat chips (recompute from data when available) ----------

  (function updateStats() {
    var g = document.getElementById("stat-guests");
    var gr = document.getElementById("stat-groups");
    var l = document.getElementById("stat-locations");
    if (GROUPS && g && typeof GROUPS.total_guests === "number") g.textContent = fmt(GROUPS.total_guests);
    if (gr && groupList.length) gr.textContent = fmt(groupList.length);
    if (l && LOCATIONS && LOCATIONS.length) l.textContent = fmt(LOCATIONS.length);
  })();

  // ---------- Missing-data notice ----------

  function dataNotice(what) {
    return (
      '<div class="data-notice"><strong>Almost ready!</strong> The ' + esc(what) +
      " data hasn’t been generated yet. Please check back soon — or find an organizer at the Main Picnic Area.</div>"
    );
  }

  // ---------- Guest search (type-ahead) ----------

  var searchInput = document.getElementById("guest-search");
  var resultsEl = document.getElementById("search-results");
  var cardSlot = document.getElementById("guest-card-slot");

  var currentResults = [];
  var activeIndex = -1;

  function search(query) {
    var q = foldQuery(query);
    if (!q) return [];
    var out = [];
    for (var i = 0; i < memberIndex.length && out.length < MAX_RESULTS; i++) {
      var entry = memberIndex[i];
      var at = entry.folded.indexOf(q);
      if (at !== -1) {
        out.push({ entry: entry, start: at, len: q.length });
      }
    }
    return out;
  }

  function highlightName(entry, start, len) {
    var name = entry.name;
    var s = entry.map[start];
    var endMapIdx = start + len - 1;
    var e = (endMapIdx < entry.map.length ? entry.map[endMapIdx] : name.length - 1) + 1;
    return esc(name.slice(0, s)) + "<mark>" + esc(name.slice(s, e)) + "</mark>" + esc(name.slice(e));
  }

  function resultMeta(entry) {
    var loc = locationForGroup(entry.group.id);
    var groupLabel = entry.group.name || "Group " + entry.group.id;
    return loc ? groupLabel + " · " + loc.name : groupLabel;
  }

  function renderResults(results) {
    currentResults = results;
    activeIndex = -1;

    if (!searchInput.value.trim()) {
      closeResults();
      return;
    }

    var html;
    if (!hasData) {
      html = '<li class="search-empty">Guest list data hasn’t been generated yet — check back soon.</li>';
    } else if (!results.length) {
      html = '<li class="search-empty">No guests match “' + esc(searchInput.value.trim()) + '”.</li>';
    } else {
      html = results
        .map(function (r, i) {
          return (
            '<li role="presentation"><button type="button" class="search-result" role="option" id="result-' + i +
            '" aria-selected="false" data-index="' + i + '">' +
            "<span>" + highlightName(r.entry, r.start, r.len) + "</span>" +
            '<span class="search-result-meta">' + esc(resultMeta(r.entry)) + "</span>" +
            "</button></li>"
          );
        })
        .join("");
    }

    resultsEl.innerHTML = html;
    resultsEl.hidden = false;
    searchInput.setAttribute("aria-expanded", "true");
  }

  function closeResults() {
    resultsEl.hidden = true;
    resultsEl.innerHTML = "";
    searchInput.setAttribute("aria-expanded", "false");
    searchInput.removeAttribute("aria-activedescendant");
    currentResults = [];
    activeIndex = -1;
  }

  function setActive(i) {
    var options = resultsEl.querySelectorAll(".search-result");
    if (!options.length) return;
    if (activeIndex >= 0 && options[activeIndex]) {
      options[activeIndex].setAttribute("aria-selected", "false");
    }
    activeIndex = i;
    if (activeIndex >= 0 && options[activeIndex]) {
      options[activeIndex].setAttribute("aria-selected", "true");
      searchInput.setAttribute("aria-activedescendant", options[activeIndex].id);
      options[activeIndex].scrollIntoView({ block: "nearest" });
    } else {
      searchInput.removeAttribute("aria-activedescendant");
    }
  }

  function selectResult(i) {
    var r = currentResults[i];
    if (!r) return;
    searchInput.value = r.entry.name;
    closeResults();
    showGuestCard(r.entry);
  }

  // Location-first guest card: the park location is the headline.
  function showGuestCard(entry) {
    var group = entry.group;
    var loc = locationForGroup(group.id);
    var groupLabel = group.name || "Group " + group.id;

    var locBlock;
    if (loc) {
      locBlock =
        '<p class="guest-card-loc-label">You’re at</p>' +
        '<h3 class="guest-card-loc-name">' + esc(loc.name) + "</h3>" +
        (loc.description ? '<p class="guest-card-loc-desc">' + esc(loc.description) + "</p>" : "");
    } else {
      locBlock =
        '<p class="guest-card-loc-label">You’re at</p>' +
        '<h3 class="guest-card-loc-name">Location coming soon</h3>' +
        '<p class="guest-card-loc-desc">Location assignments haven’t been generated yet — check back soon.</p>';
    }

    cardSlot.innerHTML =
      '<article class="guest-card">' +
      '<p class="guest-card-name"><strong>' + esc(entry.name) + "</strong> · " + esc(groupLabel) +
      " · " + fmt(group.size || (group.members || []).length) + " guests</p>" +
      locBlock +
      '<div class="guest-card-actions">' +
      (loc
        ? '<a class="action" href="./map.html?loc=' + encodeURIComponent(loc.id) +
          '">View on map <span aria-hidden="true">&rarr;</span></a>'
        : "") +
      '<button type="button" class="action" data-open-group="' + esc(group.id) + '">See full group</button>' +
      "</div>" +
      "</article>";

    var btn = cardSlot.querySelector("[data-open-group]");
    if (btn) {
      btn.addEventListener("click", function () {
        openGroupModal(group, entry.member);
      });
    }
  }

  if (searchInput) {
    if (!hasData) {
      // Friendly note under the search box when data is missing.
      cardSlot.innerHTML = dataNotice("guest list");
    }

    searchInput.addEventListener("input", function () {
      renderResults(search(searchInput.value));
    });

    searchInput.addEventListener("keydown", function (e) {
      if (resultsEl.hidden) {
        if (e.key === "ArrowDown" && searchInput.value.trim()) {
          renderResults(search(searchInput.value));
        }
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive(Math.min(activeIndex + 1, currentResults.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive(Math.max(activeIndex - 1, 0));
      } else if (e.key === "Enter") {
        if (activeIndex >= 0) {
          e.preventDefault();
          selectResult(activeIndex);
        } else if (currentResults.length === 1) {
          e.preventDefault();
          selectResult(0);
        }
      } else if (e.key === "Escape") {
        closeResults();
      }
    });

    resultsEl.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest(".search-result") : null;
      if (btn) selectResult(Number(btn.getAttribute("data-index")));
    });

    // Close dropdown when clicking elsewhere.
    document.addEventListener("click", function (e) {
      if (!resultsEl.hidden && !e.target.closest(".search-wrap")) closeResults();
    });
  }

  // ---------- Groups browser ----------

  var gridEl = document.getElementById("groups-grid");

  function renderGroupsGrid() {
    if (!gridEl) return;
    if (!groupList.length) {
      gridEl.innerHTML = dataNotice("group");
      return;
    }
    gridEl.innerHTML = groupList
      .map(function (group) {
        var loc = locationForGroup(group.id);
        var size = group.size || (group.members || []).length;
        var label = group.name || "Group " + group.id;
        var num = String(group.id);
        if (num.length === 1) num = "0" + num;
        return (
          '<button type="button" class="group-card" data-group-id="' + esc(group.id) +
          '" aria-label="' + esc(label + " — " + (loc ? loc.name : "Location TBA") + ", " + fmt(size) + " guests") + '">' +
          '<span class="group-card-num" aria-hidden="true">' + esc(num) + "</span>" +
          '<span class="group-card-body" aria-hidden="true">' +
          '<span class="group-card-loc">' + esc(loc ? loc.name : "Location TBA") + "</span>" +
          '<span class="group-card-size">' + fmt(size) + " guests</span>" +
          "</span>" +
          "</button>"
        );
      })
      .join("");

    gridEl.addEventListener("click", function (e) {
      var card = e.target.closest ? e.target.closest(".group-card") : null;
      if (!card) return;
      var id = card.getAttribute("data-group-id");
      var group = null;
      for (var i = 0; i < groupList.length; i++) {
        if (String(groupList[i].id) === id) { group = groupList[i]; break; }
      }
      if (group) openGroupModal(group, null);
    });
  }

  renderGroupsGrid();

  // ---------- Group roster modal ----------

  var modalOverlay = document.getElementById("group-modal");
  var modalBody = document.getElementById("modal-body");
  var modalClose = document.getElementById("modal-close");
  var lastFocused = null;

  function rosterSorted(members) {
    return members.slice().sort(function (a, b) {
      var al = (a.last || a.name || "").toLowerCase();
      var bl = (b.last || b.name || "").toLowerCase();
      if (al !== bl) return al < bl ? -1 : 1;
      var af = (a.first || "").toLowerCase();
      var bf = (b.first || "").toLowerCase();
      return af < bf ? -1 : af > bf ? 1 : 0;
    });
  }

  function openGroupModal(group, highlightMember) {
    if (!modalOverlay || !modalBody) return;
    var loc = locationForGroup(group.id);
    var members = Array.isArray(group.members) ? group.members : [];
    var sorted = rosterSorted(members);

    var locBlock = loc
      ? '<div class="modal-loc">' +
        '<p class="modal-loc-name">' + esc(loc.name) + "</p>" +
        (loc.description ? '<p class="modal-loc-desc">' + esc(loc.description) + "</p>" : "") +
        '<a class="action" href="./map.html?loc=' + encodeURIComponent(loc.id) +
        '">View on map <span aria-hidden="true">&rarr;</span></a>' +
        "</div>"
      : '<div class="modal-loc"><p class="modal-loc-desc">Location assignment coming soon.</p></div>';

    modalBody.innerHTML =
      '<h2 class="modal-group-name" id="modal-title">' + esc(group.name || "Group " + group.id) + "</h2>" +
      '<p class="modal-group-meta">' + fmt(group.size || members.length) + " guests</p>" +
      locBlock +
      '<p class="roster-title">Roster (A–Z by last name)</p>' +
      '<ul class="roster">' +
      sorted
        .map(function (m) {
          var hl = highlightMember && m === highlightMember;
          return '<li class="' + (hl ? "roster-highlight" : "") + '">' + esc(m.name || (m.first + " " + m.last)) + "</li>";
        })
        .join("") +
      "</ul>";

    lastFocused = document.activeElement;
    modalOverlay.hidden = false;
    document.body.style.overflow = "hidden";
    if (modalClose) modalClose.focus();

    var hlEl = modalBody.querySelector(".roster-highlight");
    if (hlEl) hlEl.scrollIntoView({ block: "center" });
  }

  function closeModal() {
    if (!modalOverlay || modalOverlay.hidden) return;
    modalOverlay.hidden = true;
    document.body.style.overflow = "";
    if (lastFocused && typeof lastFocused.focus === "function") lastFocused.focus();
  }

  if (modalOverlay) {
    modalOverlay.addEventListener("click", function (e) {
      if (e.target === modalOverlay) closeModal();
    });
  }
  if (modalClose) modalClose.addEventListener("click", closeModal);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeModal();
  });
})();
