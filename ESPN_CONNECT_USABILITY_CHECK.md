# ESPN Connect Usability Check

Scope: private ESPN league connect flow from the Odds Gods `/connect` screen.

This is the founder's "normal person" test: the user only knows their league from ESPN, has never used technical browser tools, and follows only what Odds Gods puts on screen.

## Desktop path

| Step | On-screen instruction | User action | Requires outside knowledge? |
| --- | --- | --- | --- |
| 1 | `League URL or ID` | Paste ESPN league URL or league ID, then press `Find my league`. | No. |
| 2 | `This ESPN league is private.` | Read the private-league escalation. | No. |
| 3 | `Desktop` card: `Drag this button to your bookmarks bar.` | Drag `Connect Odds Gods` to bookmarks bar. | No, but browser bookmarks bar must be visible. |
| 4 | `Open ESPN league` | Click the link and sign in to ESPN if ESPN asks. | No. |
| 5 | `Click the bookmark. Odds Gods fills the box below.` | Click `Connect Odds Gods` while on the ESPN league page. | No. |
| 6 | `Connector output` | If ESPN exposes both values, Odds Gods returns and connects automatically. If ESPN exposes only part, the box/error names exactly what is missing. | No technical browser tools; blocked HttpOnly tokens are explained on-screen. |
| 7 | Team picker shows league name and season. | Pick your team. | No. |

## iPhone-width path

| Step | On-screen instruction | User action | Requires outside knowledge? |
| --- | --- | --- | --- |
| 1 | `League URL or ID` | Paste ESPN league URL or ID, then press `Find my league`. | No. |
| 2 | `This ESPN league is private.` | Read the private-league escalation. | No. |
| 3 | `iPhone` card: `Tap Copy connector.` | Tap `Copy connector`. | No. |
| 4 | `In Safari, save a bookmark named Connect Odds Gods and paste the copied address.` | Create the Safari bookmark once. | The screen gives the exact bookmark name and value to paste. |
| 5 | `Open your ESPN league, then tap that bookmark.` | Open ESPN league in Safari, tap bookmark. | No technical browser tools. |
| 6 | `Connector output` | Odds Gods consumes the captured output or names what ESPN did not expose. | No. |
| 7 | Team picker shows league name and season. | Pick your team. | No. |

## Known infrastructure limit

The app now provides a concrete browser connector artifact instead of asking for an invisible paste artifact. However, browser-page tools can only read cookies ESPN exposes to page JavaScript. If ESPN marks `espn_s2` as `HttpOnly`, neither a bookmarklet nor an iOS Shortcut running in-page can read it. In that case the flow must fall through to the Tier 1 Disney login worker.

Tier 1 is mounted through:

- Feature flag: `ESPN_LOGIN_ENABLED=true`
- Worker URL: `ESPN_LOGIN_WORKER_URL`
- Route: `POST /api/espn/login/start`

Until that worker exists in the deploy environment, the page routes cleanly to the ESPN-page connector and records a `login_fallback` funnel event.
