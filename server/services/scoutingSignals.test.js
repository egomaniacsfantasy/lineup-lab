import assert from 'node:assert/strict';
import test from 'node:test';
import { computeScoutingReads } from './scoutingSignals.js';

const managers = [
  { manager_key: 'one' },
  { manager_key: 'two' },
  { manager_key: 'zero' },
];

function tradeEvent(manager_key, id) {
  return {
    league_id: 'league-2025',
    season: 2025,
    manager_key,
    provider: 'sleeper',
    event_type: 'trade',
    player_id: null,
    detail: { transaction_id: id },
    league_format: 'redraft',
  };
}

test('trade appetite evidence only renders real integer trade counts', () => {
  const reads = computeScoutingReads({
    events: [
      tradeEvent('one', 't1'),
      tradeEvent('two', 't2'),
      tradeEvent('two', 't3'),
      {
        league_id: 'league-2025',
        season: 2025,
        manager_key: 'zero',
        provider: 'sleeper',
        event_type: 'draft_pick',
        player_id: 'p1',
        detail: { pick_no: 1 },
        league_format: 'redraft',
      },
      {
        league_id: 'league-2026',
        season: 2026,
        manager_key: 'zero',
        provider: 'sleeper',
        event_type: 'draft_pick',
        player_id: 'p2',
        detail: { pick_no: 2 },
        league_format: 'redraft',
      },
    ],
    leagueId: 'league-2026',
    provider: 'sleeper',
    managers,
  });

  const byManager = new Map(reads.map((read) => [read.manager_key, read]));
  const oneEvidence = byManager.get('one')?.evidence.find((entry) => entry.trait === 'trade_appetite');
  const twoEvidence = byManager.get('two')?.evidence.find((entry) => entry.trait === 'trade_appetite');
  const zero = byManager.get('zero');

  assert.equal(oneEvidence?.text, 'Completed 1 trade in verified history');
  assert.equal(twoEvidence?.text, 'Completed 2 trades in verified history');
  assert.equal(zero?.traits.trade_appetite, undefined);
  assert.equal(zero?.evidence.some((entry) => entry.trait === 'trade_appetite'), false);
  assert.notEqual(byManager.get('one')?.traits.trade_appetite, byManager.get('two')?.traits.trade_appetite);
});
