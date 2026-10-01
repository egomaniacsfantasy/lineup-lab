import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

/**
 * The model's projections are the only projections. The agreement/consensus layer
 * (per-person 0-100 scores that tilted a player up to +/-10%) was removed outright
 * on 2026-10-01: no score can be entered, served, shown or priced.
 */
const read = (p) => fs.readFile(path.resolve(p), 'utf8');

test('no endpoint reads or writes agreement scores', async () => {
  const routes = await read('server/routes/projections.js');
  assert.doesNotMatch(routes, /['"]\/agreement/, 'an agreement endpoint is back');
  assert.doesNotMatch(routes, /['"]\/consensus/, 'the consensus feed is back');
  assert.doesNotMatch(routes, /olympus_agreement/, 'the projections API reads the agreement table');
});

test('pricing has no tilt input', async () => {
  const adjusted = await read('server/projections/adjusted.js');
  assert.doesNotMatch(adjusted, /tiltFromConsensus|olympus_agreement|loadConsensus/, 'pricing reads agreement scores');
  await assert.rejects(fs.access(path.resolve('server/projections/agreementTilt.js')), 'the server tilt module is back');
  await assert.rejects(fs.access(path.resolve('src/services/agreementTilt.ts')), 'the client tilt module is back');
});

test('the board has no Consensus view and no score editor', async () => {
  const board = await read('src/pages/MyBoardPage.tsx');
  assert.doesNotMatch(board, /Consensus/, 'the Consensus/Model toggle is back');
  assert.doesNotMatch(board, /olympus_agreement|AgreementEditor/, 'the agreement editor is back');
});

test('the old score columns never leave the server', async () => {
  const loader = await read('server/projections/loadFromRepo.js');
  assert.match(loader, /delete s\.vlahakis/);
  assert.match(loader, /delete s\.williams/);
});
