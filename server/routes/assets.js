/**
 * Asset proxy: player headshots, NFL team logos, and manager avatars
 * from Sleeper's CDN, cached on our disk with a long TTL so the client
 * never hotlinks per-render. 404s pass through so the client can show
 * its initials fallback (no broken-image icons, ever).
 */
import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'data',
  'img',
);

const DAY_MS = 24 * 60 * 60 * 1000;
const BROWSER_CACHE = 'public, max-age=86400';

const SOURCES = {
  headshot: {
    url: (id) => `https://sleepercdn.com/content/nfl/players/thumb/${id}.jpg`,
    type: 'image/jpeg',
    safe: /^[A-Za-z0-9_-]{1,24}$/,
  },
  logo: {
    url: (team) => `https://sleepercdn.com/images/team_logos/nfl/${team.toLowerCase()}.png`,
    type: 'image/png',
    safe: /^[A-Za-z]{2,4}$/,
  },
  avatar: {
    url: (id) => `https://sleepercdn.com/avatars/thumbs/${id}`,
    type: 'image/png',
    safe: /^[A-Za-z0-9_-]{1,64}$/,
  },
};

async function serveCached(kind, key, res) {
  const source = SOURCES[kind];

  if (!source.safe.test(key)) {
    res.status(400).end();
    return;
  }

  const dir = path.join(DIR, kind);
  const file = path.join(dir, key.toLowerCase());
  const missMarker = `${file}.404`;

  try {
    const stat = fs.statSync(file);
    if (Date.now() - stat.mtimeMs < DAY_MS) {
      res.set('Content-Type', source.type);
      res.set('Cache-Control', BROWSER_CACHE);
      fs.createReadStream(file).pipe(res);
      return;
    }
  } catch {
    // no fresh cache entry
  }

  // negative cache: don't re-hit the CDN for known-missing images all day
  try {
    if (Date.now() - fs.statSync(missMarker).mtimeMs < DAY_MS) {
      res.status(404).end();
      return;
    }
  } catch {
    // no miss marker
  }

  try {
    const upstream = await fetch(source.url(key));

    if (!upstream.ok) {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(missMarker, '');
      res.status(404).end();
      return;
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, buffer);

    res.set('Content-Type', source.type);
    res.set('Cache-Control', BROWSER_CACHE);
    res.send(buffer);
  } catch {
    res.status(502).end();
  }
}

export const assetsRouter = Router();

assetsRouter.get('/headshot/:id', (req, res) => serveCached('headshot', req.params.id, res));
assetsRouter.get('/logo/:team', (req, res) => serveCached('logo', req.params.team, res));
assetsRouter.get('/avatar/:id', (req, res) => serveCached('avatar', req.params.id, res));
