# Odds Gods ESPN Connector

A tiny Manifest V3 browser extension that lets Odds Gods read your **private**
ESPN league. ESPN's `espn_s2` auth cookie is `HttpOnly` — a web page literally
cannot read it — so, exactly like FantasyPros, the only no-DevTools way to
connect a private league is a small extension that reads the cookie and hands
it to Odds Gods. It reads **only** `espn_s2` + `SWID` from `espn.com`, **only**
when the Odds Gods tab asks, and sends them **only** to that tab. Nothing is
stored or transmitted anywhere else.

## How it works

```
Odds Gods page ──postMessage──▶ content.js  ──chrome.runtime──▶ background.js
                                                                  (chrome.cookies.get)
Odds Gods page ◀──postMessage── content.js  ◀──response────────  background.js
```

The content script only injects on the Odds Gods origin; the worker only ever
reads the two ESPN cookies and only answers that tab.

## Load it (development / sideload)

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. **Load unpacked** → select this `extension/` folder.
4. Make sure you're logged into espn.com in the same browser.
5. On Odds Gods, connect ESPN → "Sync with the extension."

## Publish (production)

Submit this folder (zipped) to the Chrome Web Store under a developer account.
Review typically takes a few days. The justification for the `cookies` +
`espn.com` host permission is the HttpOnly constraint above (read-only league
linking, the standard pattern for ESPN fantasy tools).

Add a `128x128` PNG as `icon128.png` and reference it under `"icons"` in
`manifest.json` before submitting (optional for sideloading).
