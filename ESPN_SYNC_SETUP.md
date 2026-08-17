# ESPN sync — what Andre has to do

Everything else is built. These are the parts that need your accounts or your
money, in the order they should happen.

## 1. Supabase table (5 minutes, do this first)

Right now ESPN logins are saved to a **file on the Render disk**. Render wipes
that disk on every deploy, so **every deploy silently disconnects every ESPN
league** and people have to reconnect for no visible reason. That is the single
biggest reason to do this.

Open Supabase → your project → **SQL Editor** → paste and run:

```sql
create table if not exists espn_sessions (
  league_id     text primary key,
  espn_s2       text not null,   -- encrypted before it ever leaves the server
  swid          text not null,   -- encrypted before it ever leaves the server
  saved_at      timestamptz not null default now(),
  last_ok_at    timestamptz,
  last_error    text
);

-- Nobody reaches this table from a browser. Server only, service-role only.
alter table espn_sessions enable row level security;
```

That is the whole schema. The two cookie columns are already AES-256-GCM
encrypted by the server before they are written, so even with database access
nobody reads a usable ESPN session.

## 2. Two environment variables on Render

Render → your service → **Environment**:

| Key | Value | Why |
| --- | --- | --- |
| `ESPN_CRED_KEY` | any long random string, generated once | The key that encrypts ESPN sessions. **Never change it after launch** or every connected league has to reconnect. |
| `SUPABASE_SERVICE_ROLE_KEY` | from Supabase → Settings → API | Lets the server read and write the table above. |

Generate the first one however you like, e.g. in a terminal:

```bash
openssl rand -base64 48
```

Save it somewhere safe. Losing it means everyone reconnects.

**No new Render service.** The existing API handles all of this.

## 3. Chrome Web Store (the long pole)

This is the only thing that costs money and the only thing I cannot do.

1. Go to the Chrome Web Store developer dashboard and pay the **$5 one-time**
   registration fee.
2. Zip the `extension/` folder in this repo and upload it.
3. Fill in the listing. Fields it will ask for:
   - **Name:** Odds Gods ESPN Connector
   - **Summary:** Connect your ESPN fantasy league to Odds Gods. Read-only.
   - **Category:** Sports
   - **Privacy policy URL:** required. Needs a page on oddsgods.net.
   - **Screenshots:** 1280x800. The connect screen is enough.
4. **Permission justification** — they will ask why you need `cookies`. Say
   this, because it is true and it is what they want to hear:

   > The extension reads only the user's existing ESPN session cookie, only on
   > espn.com, and only when the user clicks Connect on oddsgods.net. It is
   > returned directly to that tab. Nothing is stored by the extension and no
   > browsing data is collected. This is the only way to read an HttpOnly
   > session cookie, which ESPN requires to access a user's own private league.

5. Submit. Review is usually **1 to 5 days**; the `cookies` permission can draw
   extra scrutiny, so budget a week before draft season.
6. When it is live, copy the listing URL and add it to Render:

   | Key | Value |
   | --- | --- |
   | `VITE_ESPN_EXTENSION_URL` | the Chrome Web Store listing URL |

   Until that is set, the connect screen says the connector is not published
   yet instead of showing a dead button.

**Edge:** the same zip works. Separate dashboard, separate review, also cheap.
Worth doing after Chrome is approved, not before.

## 4. What happens after

- **Public leagues:** nothing to install. Paste the league URL, done. This is
  most casual leagues.
- **Private leagues:** install the connector once on a computer. After that the
  server holds the session and syncs on its own, so **their phone works** and
  they never touch the connector again.
- **When a session expires:** ESPN sessions do not last forever. The user gets
  a reconnect prompt and does the one-click connect again on a computer.

## Known limits, stated plainly

- **No phone-only path exists.** Private ESPN leagues cannot be connected from
  a phone browser by anyone, including FantasyPros. First connect needs a
  computer. A native app would fix this and is a bigger project.
- **ESPN has no official API or agreement with us.** If they change something,
  sync breaks until it is fixed. Everyone in this category lives with that.
- **Some people will not install an extension.** Nothing to be done except make
  the public-league path effortless, which it now is.
