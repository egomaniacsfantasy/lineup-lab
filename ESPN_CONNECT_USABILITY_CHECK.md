# ESPN Connect Usability Check

Scope: private ESPN league connect flow from the Odds Gods `/connect` screen.

This is the founder's "normal person" test: the user only knows their league from ESPN, has never used technical browser tools, and follows only what Odds Gods puts on screen.

## Desktop path

| Step | On-screen instruction | User action | Requires outside knowledge? |
| --- | --- | --- | --- |
| 1 | `League URL or ID` | Paste ESPN league URL or league ID, then press `Find my league`. | No. |
| 2 | `This ESPN league is private.` | Read the private-league escalation. | No. |
| 3 | `Tap Copy launch code.` | Press `Copy launch code`. | No. |
| 4 | `Open ESPN league` | Click the link and sign in to ESPN if ESPN asks. | No. |
| 5 | `Paste the code into the address bar and hit Enter.` | Paste the copied code into the ESPN tab's address bar and press Enter. | No. |
| 6 | `Connector output` | If ESPN exposes both values, Odds Gods returns and connects automatically. If ESPN exposes only part, the box/error names exactly what is missing. | No technical browser tools. |
| 7 | Team picker shows league name and season. | Pick your team. | No. |

## iPhone-width path

| Step | On-screen instruction | User action | Requires outside knowledge? |
| --- | --- | --- | --- |
| 1 | `League URL or ID` | Paste ESPN league URL or ID, then press `Find my league`. | No. |
| 2 | `This ESPN league is private.` | Read the private-league escalation. | No. |
| 3 | `Tap Copy launch code.` | Press `Copy launch code`. | No. |
| 4 | `Open ESPN league` | Open the ESPN league in Safari and sign in if ESPN asks. | No. |
| 5 | `Paste the code into the address bar and hit Enter.` | Paste the copied code into Safari's address bar and press Go. | No technical browser tools. |
| 6 | `Connector output` | Odds Gods consumes the captured output or names what ESPN did not expose. | No. |
| 7 | Team picker shows league name and season. | Pick your team. | No. |

## Known infrastructure limit

The app now provides concrete launch code instead of asking for an invisible paste artifact. Browser-page tools can only read values ESPN exposes to page JavaScript. Live testing confirmed `espn_s2` and `SWID` are readable by page scripts, so the fallback can capture them and return to Odds Gods.

Tier 1 is mounted through:

- Feature flag: `ESPN_LOGIN_ENABLED=true`
- Worker URL: `ESPN_LOGIN_WORKER_URL`
- Route: `POST /api/espn/login/start`

Until that worker exists in the deploy environment, the page routes cleanly to the ESPN-page connector and records a `login_fallback` funnel event.
