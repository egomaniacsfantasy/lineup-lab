/**
 * Bug reports from inside the app.
 *
 * Deliberately unauthenticated. The reports worth having most are the ones
 * filed by someone who cannot get past the sign-in screen or whose league will
 * not load, and an auth check on this route would drop exactly those. What
 * protects it instead is that a report is inert: it is written to disk and
 * logged, and nothing reads it back except the owner-only admin listing.
 *
 * Reports live on the persistent disk under server/data/bug-reports, next to
 * projections and the player catalogue, so they survive a deploy. Screenshots
 * are written beside the JSON rather than inside it, which keeps the listing
 * cheap to read when there are hundreds of them.
 */
import { Router } from 'express';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'data',
  'bug-reports',
);

/* A screenshot of a 1600px-wide dark UI lands around 200-400KB as JPEG, and
   base64 inflates it by a third. 6MB is comfortable headroom for a 5K display
   without being an open door — express.json's 100KB default would reject every
   report that carried a picture, which is the failure this limit exists to
   avoid. */
const BODY_LIMIT = '6mb';
const MAX_DESCRIPTION = 4000;
const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;

/** Human-quotable and collision-resistant enough for the volume this will see. */
function newReference() {
  return `OG-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

function clampString(value, max) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

/**
 * A data: URL from a canvas is `data:image/jpeg;base64,...`. Anything else is
 * either a mistake or someone trying to get an arbitrary file written, so the
 * shape is checked rather than trusted and only the two image types the
 * capture path can produce are accepted.
 */
export function decodeScreenshot(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl) return null;
  const match = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) return null;
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length === 0 || buffer.length > MAX_SCREENSHOT_BYTES) return null;
  return { extension: match[1] === 'png' ? 'png' : 'jpg', buffer };
}

/** Newest first, screenshots referenced by filename rather than inlined. */
export function listReports(limit = 100) {
  let files;
  try {
    files = fs.readdirSync(DIR).filter((name) => name.endsWith('.json'));
  } catch {
    return [];
  }
  return files
    .sort()
    .reverse()
    .slice(0, limit)
    .map((name) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(DIR, name), 'utf8'));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export const supportRouter = Router();

supportRouter.post('/bug-report', express.json({ limit: BODY_LIMIT }), (req, res) => {
  const body = req.body ?? {};
  const description = clampString(body.description, MAX_DESCRIPTION);
  if (!description) {
    res.status(400).json({ error: 'description_required' });
    return;
  }

  const reference = newReference();
  const receivedAt = new Date().toISOString();
  /* Sortable filename: the listing is a directory sort, so time-ordered names
     mean no index file to keep consistent. */
  const stem = `${receivedAt.replace(/[:.]/g, '-')}-${reference}`;

  const shot = decodeScreenshot(body.screenshot);
  const record = {
    reference,
    receivedAt,
    description,
    provider: clampString(body.provider, 40),
    leagueId: clampString(body.leagueId, 64),
    leagueName: clampString(body.leagueName, 200),
    teamName: clampString(body.teamName, 200),
    email: clampString(body.email, 320),
    /* Recorded by the client; stored as-is because every field in it is
       already non-secret by construction (see src/utils/diagnostics.ts). */
    diagnostics: body.diagnostics ?? null,
    screenshot: shot ? `${stem}.${shot.extension}` : null,
  };

  try {
    fs.mkdirSync(DIR, { recursive: true });
    if (shot) fs.writeFileSync(path.join(DIR, `${stem}.${shot.extension}`), shot.buffer);
    fs.writeFileSync(path.join(DIR, `${stem}.json`), JSON.stringify(record, null, 2));
  } catch (error) {
    /* A full or read-only disk must not swallow the report silently: the log
       line below is the fallback copy, and it goes to Render where it is
       searchable. */
    console.error('[support] could not persist report', reference, error);
  }

  /* One line, greppable in Render's log search, carrying enough to triage
     without opening anything. */
  const failed = record.diagnostics?.requests?.filter((r) => r.status !== 200).length ?? 0;
  console.log(
    `[support] ${reference} route=${record.diagnostics?.route ?? '?'} `
      + `build=${record.diagnostics?.build ?? '?'} provider=${record.provider ?? '?'} `
      + `errors=${record.diagnostics?.errors?.length ?? 0} failedRequests=${failed} `
      + `shot=${shot ? 'yes' : 'no'} :: ${description.slice(0, 160)}`,
  );

  res.json({ ok: true, reference });
});

/* A body over the limit throws out of express.json before the handler runs,
   and the shared /api error handler turns anything it does not recognise into
   a 500 — so an oversized screenshot was reported as "something on our side
   broke" when the truth is "that picture is too big", which is a thing the
   reporter can actually act on. Answering 413 here also matches what the
   client already tells them. */
supportRouter.use((error, _req, res, next) => {
  if (error?.type === 'entity.too.large') {
    res.status(413).json({
      error: 'too_large',
      message: 'That screenshot was too large. Send the report without it.',
    });
    return;
  }
  next(error);
});

/**
 * Resolve a screenshot filename from the admin listing to a path on disk.
 *
 * The filename arrives as a URL parameter, so it is a value the caller
 * controls: `../../.env` would otherwise walk straight out of the directory.
 * Two independent checks, because one of them being wrong should not be
 * enough — the name must match the exact shape this module writes, and the
 * resolved path must still sit inside DIR after normalisation.
 */
export function reportScreenshotPath(file) {
  if (typeof file !== 'string') return null;
  if (!/^[0-9TZ-]+-OG-[0-9A-F]{4}\.(jpg|png)$/.test(file)) return null;

  const resolved = path.resolve(DIR, file);
  if (resolved !== path.join(path.resolve(DIR), file)) return null;
  if (!fs.existsSync(resolved)) return null;
  return resolved;
}
