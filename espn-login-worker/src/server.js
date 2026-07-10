import http from 'node:http';
import { readConfig } from './config.js';
import { LoginQueue } from './queue.js';
import { ChallengeStore } from './sessionStore.js';
import { createLoginMachine } from './loginStateMachine.js';
import { fallback, REASON } from './status.js';
import { safeLog } from './redaction.js';

const BODY_LIMIT = 32 * 1024;

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > BODY_LIMIT) throw new Error('body_too_large');
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function send(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

function normalizeLoginBody(body) {
  const leagueId = String(body?.leagueId ?? body?.leagueHint ?? '').trim();
  const season = String(body?.season ?? new Date().getUTCFullYear()).trim();
  const email = String(body?.email ?? '').trim();
  const password = String(body?.password ?? '');
  const otp = String(body?.otp ?? '').trim();
  const challengeId = String(body?.challengeId ?? '').trim();
  return { leagueId, season, email, password, otp, challengeId };
}

function validateBody(body) {
  if (!body.leagueId || !body.season) {
    return fallback(
      REASON.MISSING_FIELDS,
      'ESPN login needs a league and season.',
    );
  }
  if (body.challengeId) {
    if (!body.otp) {
      return fallback(
        REASON.MISSING_FIELDS,
        'Enter the ESPN code to continue.',
      );
    }
    return null;
  }
  if (!body.email || !body.password) {
    return fallback(
      REASON.MISSING_FIELDS,
      'Enter your ESPN email and password.',
    );
  }
  return null;
}

export async function createServer({
  config = readConfig(),
  logger = console,
  loginMachine,
  queue = new LoginQueue(config),
} = {}) {
  const challengeStore = new ChallengeStore({ ttlMs: config.otpTtlMs });
  const machine =
    loginMachine ??
    (await createLoginMachine({
      config,
      challengeStore,
    }));

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://worker.local');

      if (req.method === 'GET' && url.pathname === '/health') {
        send(res, 200, {
          ok: true,
          enabled: config.workerEnabled,
          running: queue.running,
          queued: queue.size,
        });
        return;
      }

      if (req.method !== 'POST' || url.pathname !== '/login') {
        send(res, 404, { error: 'not_found' });
        return;
      }

      if (!config.workerEnabled) {
        send(
          res,
          503,
          fallback(
            REASON.DISABLED,
            'Log in with ESPN is off for this deploy. Use the ESPN-site connector instead.',
          ),
        );
        return;
      }

      const body = normalizeLoginBody(await readJson(req));
      const validation = validateBody(body);
      if (validation) {
        send(res, 400, validation);
        return;
      }

      safeLog(logger, 'info', '[espn-login] attempt', {
        leagueId: body.leagueId,
        season: body.season,
        hasOtp: Boolean(body.otp),
        challengeId: body.challengeId || null,
      });

      const result = await queue.run(() =>
        body.challengeId
          ? machine.continueOtp(body)
          : machine.startLogin(body),
      );

      const statusCode =
        result.reason === REASON.BAD_CREDENTIALS ? 401 :
        result.reason === REASON.QUEUE_FULL ? 429 :
        result.status === 'fallback' ? 200 :
        200;
      send(res, statusCode, result);
    } catch (error) {
      safeLog(logger, 'error', '[espn-login] unhandled', {
        message: error?.message,
        stack: error?.stack,
      });
      send(
        res,
        500,
        fallback(
          REASON.NETWORK,
          'ESPN login could not finish. Use the ESPN-site connector instead.',
        ),
      );
    }
  });

  server.closeWorker = async () => {
    await machine.close?.();
    await challengeStore.closeAll();
  };

  return server;
}
