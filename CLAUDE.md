# Clario One

Single-file HTML/JS/CSS personal/business CRM + task-management PWA. Everything lives in `index.html` — no build step, no framework, no server. `sw.js` + `manifest.json` make it installable (iOS/Android/Edge home screen).

## Brand & logo

- **Logo mark**: "machined titanium" 3D render — a brushed-steel hook/checkmark shape merged with a "1" and a small triangle flag. Supplied by the user as source artwork; never redraw or regenerate it from scratch without asking.
- Two derived assets, both cropped/resized from the same source (never re-colored or stylistically altered):
  - `logo-mark.png` — **transparent background**, used only for the in-app header logo (`<img class="gh-logo">`, currently 32×32). Transparency is required here: the metal reads clearly directly on the white header, and a solid backing looks like a heavy black box (tried and reverted — see git history around "Drop the dark chip from the in-app header logo").
  - `icon-192.png` / `icon-512.png` — composited onto an **opaque dark chip** (`#1a1a1e`-ish), used for favicon / `apple-touch-icon` / `manifest.json` icons. Must stay opaque — iOS fills transparent `apple-touch-icon` regions with black, which looks broken.
- **Small-size legibility is the recurring failure mode with this logo.** The photoreal shading only reads at ~64px+; below that (header/favicon scale) it needs either a tight crop with minimal dead space, or — for the header specifically — real transparency (see above). If asked to touch the logo again, test at 26/32/34px before shipping, the same way past rounds did (crop tight, check contrast against the actual background it'll sit on, don't assume a background choice that worked at one size works at another).
- **iOS/Android/Edge home-screen icon caching**: updating `icon-192.png`/`icon-512.png` does NOT refresh an already-installed home-screen icon or PWA title-bar icon — those are snapshotted at install/pin time by the OS. The fix is always "remove and re-add the icon" or "reinstall the PWA," never something fixable from app code. Don't re-diagnose this from scratch if reported again.
- Bump the service worker cache name (`sw.js`, `const C='clario-vN'`) whenever `index.html`, `logo-mark.png`, or the icon files change, so installed PWAs actually pick up the update.

## Color system (`:root` in `index.html`, ~line 20)

Accent color is a desaturated cool slate (`--blue` family — name is legacy, no longer literally blue), replacing an earlier vivid Salesforce-blue (`#0176d3`) specifically to match the logo's steel/graphite material. Current tokens:

```
--bg:#f3f2f2        page background
--card:#ffffff      (currently unused as a token — cards hardcode #fff instead; fix if touching cards broadly)
--sub:#fafaf9       table heads, addline bars
--bdr / --bdr2       hairline borders / input borders
--t1..--t4          text, darkest to lightest (--t4 is #767676 — was #939393, raised for WCAG AA, don't lower it back)
--blue / --blue-d / --blue-l / --blue-b   primary accent ladder (slate, not blue) — buttons, links, focus rings, nav-active, KPI accents
--grn / --grn-l     success / done / calls
--red / --red-l     errors, overdue, delete
--amb / --amb-d / --amb-l   warnings, "waiting" status, medium priority, notes. --amb-d exists specifically for text-on-tint (pills) because --amb itself fails contrast on --amb-l
--pur / --pur-l     accounts (search badge only), meeting-log dot
--ind                #5867e8, meeting badge in global search only — tokenized to avoid a raw hex, deliberately NOT unified with the calendar/log "meeting=blue" color (would collide with the search Task badge, which is also blue — search result-type badges are their own 5-color legend, not meant to match the calendar's event-type colors)
--steel               #332f2e, sampled directly from the logo's shadow tone; used narrowly (currently just the toast background) as the one deliberate "logo material in the UI" touchpoint — don't expand this broadly without checking contrast, it was scoped small on purpose
```

**Before changing any text/background color pairing, compute the actual WCAG contrast ratio** (relative luminance formula) rather than eyeballing — this codebase has shipped real contrast failures before (`--t4`, the amber pill) that only got caught by calculating, not looking.

**Semantic-color consistency is fragile across contexts** — the same concept (meeting, account, etc.) is colored differently in the month grid vs. day/week calendar vs. activity log vs. global search, because those are separate local systems, not one shared legend. If asked to make something "consistent," check all four places before assuming a single find-and-replace is safe (see git history: "Design audit medium-tier fixes" for the actual reasoning per concept).

**Type scale**: consolidated from 16 ad hoc `font-size` values down to ~11 (10, 11, 11.5, 12, 12.5, 13, 14, 15, 18, 19, 22px). Don't introduce new one-off sizes; pick from this set. Two exceptions that are NOT part of the visual scale and must stay untouched: the `16px` mobile input rule (prevents iOS Safari auto-zoom on focus) and the `17px` `.star` rating size under `@media(pointer:coarse)` (touch-target sizing, not typography).

## Sync

Two independent, unrelated sync systems — check which one is relevant before debugging:
1. **Linked local folder** (File System Access API, `_fsDir`). Browser permission for the folder handle is NOT guaranteed to persist across restarts (platform limitation, not a bug) — surfaces as a "Resume sync" banner (`#resumebar`) needing one click per new session. Can't be fully eliminated; `requestPermission` must run from a real user gesture.
2. **OneDrive account sign-in** (MSAL.js + Graph API, `_gAcct`/`_msal`). Auto-pushes changes ~1.2s after edits (`gSched`) and polls for remote changes every 20s (`gStart`) while the app is open — this should require zero manual action in normal operation. When the cached session goes stale (`_gNeedsReauth`), it now shows a prominent top banner (`#reauthbar`, added because the only prior signal was a small header dot that was easy to miss) with a one-click **Reconnect**. `acquireTokenPopup` (used by `gReconnect`) must only ever be called from a real user gesture — background timers silently retrying it hit browser popup-blocking, which is why re-auth is a manual click by design, not an oversight. MSAL is configured with `storeAuthStateInCookie:true` specifically for Safari/iOS silent-auth reliability.

## Workflow used throughout this project's history

- Syntax-check the inline script before testing: extract the largest `<script>` block and run it through `new Function(...)`.
- Local test server: `python3 -m http.server 8934` from the repo root, then Playwright (`chromium` at `/opt/pw-browsers/chromium`) against `http://localhost:8934/index.html`. Always dismiss the `#mAsk` modal if open before interacting (`askResolve(null)`), since the app can boot into a location-confirmation or other prompt.
- Always run the full navigation regression test before shipping, not just a targeted test for the change at hand.
- Git branch `claude/tasks-home-click-open-5btm8i` has been reused across many merged PRs. If it's already merged into `main`, restart it from `origin/main` (`git checkout -B <branch> origin/main`) rather than stacking on old history — check `merged` state before assuming the branch is still open.
