/* Picnic map page logic (map.html only).
   Reads globals from data/*.data.js:
     window.PICNIC_LOCATIONS   [{id, name, main, capacity, lat, lng, description}]
     window.PICNIC_GROUPS      {groups: [{id, name, size, members}]}
     window.PICNIC_ASSIGNMENTS {"<groupId>": "<locationId>"}
   Degrades to a list-only page (or a notice) if Leaflet or data fail to load. */
(function () {
  "use strict";

  var PARK_CENTER = [37.7694, -122.4862];
  var PARK_ZOOM = 14;
  var FOCUS_ZOOM = 16;
  var MOBILE_QUERY = "(max-width: 720px)";

  // ── Data (guard every global) ──────────────────────────────────────
  var locations = Array.isArray(window.PICNIC_LOCATIONS) ? window.PICNIC_LOCATIONS : [];
  var groups = (window.PICNIC_GROUPS && Array.isArray(window.PICNIC_GROUPS.groups))
    ? window.PICNIC_GROUPS.groups
    : [];
  var assignments = (window.PICNIC_ASSIGNMENTS && typeof window.PICNIC_ASSIGNMENTS === "object")
    ? window.PICNIC_ASSIGNMENTS
    : {};

  var groupsById = {};
  groups.forEach(function (g) { groupsById[String(g.id)] = g; });

  // Invert assignments: locationId -> [{id, name, size}]
  var groupsByLocation = {};
  Object.keys(assignments).forEach(function (groupId) {
    var locId = assignments[groupId];
    if (!groupsByLocation[locId]) groupsByLocation[locId] = [];
    var g = groupsById[groupId];
    groupsByLocation[locId].push({
      id: groupId,
      name: (g && g.name) ? g.name : ("Group " + groupId),
      size: g ? g.size : null
    });
  });
  Object.keys(groupsByLocation).forEach(function (locId) {
    groupsByLocation[locId].sort(function (a, b) { return Number(a.id) - Number(b.id); });
  });

  // ── DOM refs ───────────────────────────────────────────────────────
  var noticeEl = document.getElementById("notice");
  var listEl = document.getElementById("location-list");
  var sidebarEl = document.getElementById("sidebar");
  var toggleBtn = document.getElementById("sidebar-toggle");
  var mapEl = document.getElementById("map");

  function showNotice(msg) {
    if (!noticeEl) return;
    noticeEl.textContent = msg;
    noticeEl.hidden = false;
  }

  function isMobile() {
    return window.matchMedia && window.matchMedia(MOBILE_QUERY).matches;
  }

  // ── Sidebar toggle (mobile) ────────────────────────────────────────
  function setSidebarCollapsed(collapsed) {
    if (!sidebarEl) return;
    sidebarEl.classList.toggle("collapsed", collapsed);
    if (toggleBtn) toggleBtn.setAttribute("aria-expanded", String(!collapsed));
  }
  if (toggleBtn && sidebarEl) {
    toggleBtn.addEventListener("click", function () {
      setSidebarCollapsed(!sidebarEl.classList.contains("collapsed"));
    });
  }
  // Start collapsed on small screens so the map is visible first.
  if (isMobile()) setSidebarCollapsed(true);

  // ── Text helpers ───────────────────────────────────────────────────
  function groupSummary(locId) {
    var assigned = groupsByLocation[locId] || [];
    if (!assigned.length) return "No groups assigned";
    return assigned.map(function (g) {
      return g.name + (g.size != null ? " (" + g.size + ")" : "");
    }).join(", ");
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function popupHtml(loc) {
    var assigned = groupsByLocation[loc.id] || [];
    var groupsLine = assigned.length
      ? assigned.map(function (g) {
          return esc(g.name) + (g.size != null ? " &middot; " + g.size + " people" : "");
        }).join("<br>")
      : "No groups assigned";
    return (
      '<h3 class="popup-title">' + esc(loc.name) + (loc.main ? " ★" : "") + "</h3>" +
      (loc.description ? '<p class="popup-desc">' + esc(loc.description) + "</p>" : "") +
      '<p class="popup-row"><strong>Capacity:</strong> ' + esc(loc.capacity) + "</p>" +
      '<p class="popup-row"><strong>Assigned:</strong><br>' + groupsLine + "</p>"
    );
  }

  // ── Sidebar list (always rendered; doubles as the fallback UI) ─────
  function renderList(onSelect) {
    if (!listEl) return;
    listEl.innerHTML = "";
    if (!locations.length) {
      var li = document.createElement("li");
      li.className = "location-empty";
      li.textContent = "Location data is unavailable.";
      listEl.appendChild(li);
      return;
    }
    var sorted = locations.slice().sort(function (a, b) {
      if (!!b.main !== !!a.main) return b.main ? 1 : -1;  // main first
      return String(a.name).localeCompare(String(b.name));
    });
    sorted.forEach(function (loc) {
      var li = document.createElement("li");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "location-card" + (loc.main ? " is-main" : "");
      btn.dataset.locId = loc.id;
      btn.innerHTML =
        '<span class="loc-name">' + esc(loc.name) +
          (loc.main ? ' <span class="badge-main">Main</span>' : "") + "</span>" +
        '<div class="loc-groups">' + esc(groupSummary(loc.id)) + "</div>" +
        '<div class="loc-meta">Capacity ' + esc(loc.capacity) + "</div>";
      if (onSelect) {
        btn.addEventListener("click", function () { onSelect(loc); });
      }
      li.appendChild(btn);
      listEl.appendChild(li);
    });
  }

  function highlightCard(locId) {
    if (!listEl) return;
    Array.prototype.forEach.call(listEl.querySelectorAll(".location-card"), function (el) {
      el.classList.toggle("is-active", el.dataset.locId === locId);
    });
  }

  // ── Fallback: no Leaflet or no usable data ─────────────────────────
  var leafletOk = typeof window.L !== "undefined" && window.L && typeof window.L.map === "function";

  if (!leafletOk || !locations.length) {
    document.body.classList.add("list-only");
    setSidebarCollapsed(false);
    if (!leafletOk && !locations.length) {
      showNotice("The map and location data could not be loaded. Please check your connection and refresh.");
    } else if (!leafletOk) {
      showNotice("The interactive map could not be loaded, so here is the plain list of picnic locations instead.");
    } else {
      showNotice("Location data could not be loaded, so the map has been hidden.");
    }
    renderList(null);
    return;
  }

  // ── Map ────────────────────────────────────────────────────────────
  var map = L.map(mapEl, {
    zoomControl: true,
    // Gentler scroll-wheel zoom: quarter-level steps and ~3x more scroll
    // distance per zoom level than Leaflet's defaults.
    zoomSnap: 0.25,
    zoomDelta: 0.5,
    wheelPxPerZoomLevel: 180,
    wheelDebounceTime: 60
  }).setView(PARK_CENTER, PARK_ZOOM);

  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  function makeIcon(isMain) {
    var size = isMain ? 26 : 16;
    return L.divIcon({
      className: "picnic-pin" + (isMain ? " pin-main" : ""),
      html: '<div class="pin-dot"></div>',
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      popupAnchor: [0, -size / 2 - 2]
    });
  }

  var markersByLocation = {};
  locations.forEach(function (loc) {
    if (typeof loc.lat !== "number" || typeof loc.lng !== "number") return;
    var marker = L.marker([loc.lat, loc.lng], {
      icon: makeIcon(!!loc.main),
      title: loc.name,
      zIndexOffset: loc.main ? 1000 : 0
    }).addTo(map);
    marker.bindPopup(popupHtml(loc), { maxWidth: 280 });
    marker.on("click", function () { highlightCard(loc.id); });
    markersByLocation[loc.id] = marker;
  });

  function focusLocation(loc, fromSidebar) {
    var marker = markersByLocation[loc.id];
    if (!marker) return;
    highlightCard(loc.id);
    if (fromSidebar && isMobile()) setSidebarCollapsed(true);
    map.flyTo(marker.getLatLng(), Math.max(map.getZoom(), FOCUS_ZOOM), { duration: 0.6 });
    marker.openPopup();
  }

  renderList(function (loc) { focusLocation(loc, true); });

  // ── ?loc=<locationId> deep link ────────────────────────────────────
  var requestedId = null;
  try {
    requestedId = new URLSearchParams(window.location.search).get("loc");
  } catch (e) { /* very old browser; ignore */ }

  if (requestedId) {
    var target = null;
    for (var i = 0; i < locations.length; i++) {
      if (locations[i].id === requestedId) { target = locations[i]; break; }
    }
    if (target) {
      // Wait a beat so the map has its final size before flying.
      setTimeout(function () { focusLocation(target, false); }, 150);
    } else {
      showNotice('Unknown location "' + requestedId + '" — showing the whole park.');
    }
  }
})();
