# YC Startup School Picnic — Group Finder

Static site for the 2nd Annual YCombinator Startup School Picnic in Golden Gate Park, San Francisco. 1,126 guests are split into 23 groups (22×49 + 1×48), each assigned a picnic spot in the park.

## Pages

- **`index.html`** — type your name in the search bar to find your group and park location; browse all 23 group rosters.
- **`map.html`** — Leaflet map of Golden Gate Park with a pin for every location. Supports deep links: `map.html?loc=<locationId>`.

## Layout

- **Main Hub — Lindley Meadow Picnic Tables** (capacity 100): Groups 1–2 (98 people), the cycle space.
- **21 satellite spots** (Hippie Hill, Robin Williams Meadow, Marx Meadow, Hellman Hollow, Elk Glen, …): one group of 49 each, ordered east-to-west.

## Data

- `data/groups.json` / `data/groups.data.js` — group rosters (names only; emails, phones, and check-in links are deliberately excluded).
- `data/locations.json` / `data/locations.data.js` — 22 park locations with coordinates and descriptions.
- `data/assignments.data.js` — group → location mapping.
- `scripts/build_groups.py` — regenerates the groups from the source CSV (not in repo) with a fixed shuffle seed (`20260724`), so the grouping is reproducible.

## Running

No build step. Open `index.html` directly, or serve the folder with any static server. Works on GitHub Pages as-is (Settings → Pages → deploy from branch).
