# ESPN Login Worker

Standalone Tier-1 ESPN/Disney login worker for Odds Gods. The main app proxies
to this service through `POST /api/espn/login/start`; this worker exposes
`POST /login`.

## Legal gate

This flow handles a Disney password. It must stay behind flags until the founder
turns it on after legal review.

- App flag: `ESPN_LOGIN_ENABLED=true`
- App worker target: `ESPN_LOGIN_WORKER_URL=https://<worker-host>`
- Worker flag: `ESPN_LOGIN_WORKER_ENABLED=true`

With either flag off, the app falls back to the ESPN-site connector.

## Local

```bash
cd espn-login-worker
npm install
npm run install:browsers
ESPN_LOGIN_WORKER_ENABLED=true npm start
```

Health:

```bash
curl http://localhost:8787/health
```

Login contract:

```bash
curl -X POST http://localhost:8787/login \
  -H 'content-type: application/json' \
  -d '{"leagueId":"2107153357","season":"2026","email":"user@example.com","password":"..."}'
```

OTP continuation:

```bash
curl -X POST http://localhost:8787/login \
  -H 'content-type: application/json' \
  -d '{"leagueId":"2107153357","season":"2026","challengeId":"...","otp":"123456"}'
```

## Statuses

- `connected`: worker captured `espn_s2` + `SWID` and validated them against ESPN Fantasy.
- `otp_required`: Disney emailed a one-time code; call `/login` again with `challengeId` + `otp`.
- `fallback`: passkey account, CAPTCHA/bot challenge, bad credentials, timeout, queue full, or validation failure.

## Security notes

- Passwords are never stored and never logged. They live only in memory for one
  login attempt.
- The worker itself is stateless for successful sessions. The main app stores
  the minted ESPN session in its existing AES-256-GCM encrypted store.
- `npm test` includes a log scan that fails on obvious secret-shaped logging.
- Use clean egress in production via `PLAYWRIGHT_PROXY_SERVER`; datacenter IPs
  are expected to trigger Disney challenges.

## Render/Fly shape

- Build: `npm install && npm run install:browsers`
- Start: `npm start`
- Health check: `/health`
- Render blueprint: `espn-login-worker/render.yaml`
- Env:
  - `ESPN_LOGIN_WORKER_ENABLED=false` by default
  - `PORT`
  - `MAX_CONCURRENT_LOGINS`
  - `MAX_LOGIN_QUEUE`
  - `LOGIN_TIMEOUT_MS`
  - `PLAYWRIGHT_PROXY_SERVER`
  - `PLAYWRIGHT_USER_AGENT`
