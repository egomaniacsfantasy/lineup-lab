import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

async function loadClaimModule() {
  const sourcePath = path.join(process.cwd(), 'src/utils/marketMoverClaim.ts');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: sourcePath,
  }).outputText;
  /* The transpiled copy runs from the OS temp dir, so its relative imports
     cannot resolve. Point the one runtime import at the real module by
     absolute URL rather than stubbing it, so this exercises the same apiUrl
     the app ships. */
  const resolved = transpiled.replace(
    "'../services/apiBase.ts'",
    JSON.stringify(pathToFileURL(path.join(process.cwd(), 'src/services/apiBase.ts')).href),
  );
  const tempPath = path.join(
    os.tmpdir(),
    `marketMoverClaim.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.mjs`,
  );
  fs.writeFileSync(tempPath, resolved, 'utf8');
  try {
    return await import(`${pathToFileURL(tempPath).href}?t=${Date.now()}`);
  } finally {
    fs.unlinkSync(tempPath);
  }
}

test('resolves waiver claim fallback name and kicker position from mover copy', async () => {
  const { resolveWaiverClaimPlayer } = await loadClaimModule();
  const player = resolveWaiverClaimPlayer(
    {
      playerId: '11533',
      headline: 'Claim Brandon Aubrey off waivers',
      detail: 'Upgrade over your current starter at K',
    },
    {},
  );

  assert.equal(player?.name, 'Brandon Aubrey');
  assert.equal(player?.shortName, 'B. Aubrey');
  assert.equal(player?.position, 'K');
  assert.equal(/^P\. \d+$/.test(player?.shortName ?? ''), false);
});

test('prefers catalog identity when the player exists in the connected league feed', async () => {
  const { resolveWaiverClaimPlayer } = await loadClaimModule();
  const player = resolveWaiverClaimPlayer(
    {
      playerId: '11533',
      headline: 'Claim Someone Else off waivers',
      detail: 'Upgrade over your current starter at WR',
    },
    {
      '11533': {
        id: '11533',
        name: 'Brandon Aubrey',
        team: 'DAL',
        position: 'K',
        status: null,
        injuryStatus: null,
      },
    },
  );

  assert.equal(player?.name, 'Brandon Aubrey');
  assert.equal(player?.position, 'K');
  assert.equal(player?.team, 'DAL');
});
