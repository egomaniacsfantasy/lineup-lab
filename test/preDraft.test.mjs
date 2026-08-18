import assert from 'node:assert/strict';
import test from 'node:test';
import { formatDraftTime, isLeaguePreDraft } from '../src/utils/preDraft.ts';

const team = (players = []) => ({ players });

test('a league the provider calls pre_draft is pre-draft', () => {
  assert.equal(
    isLeaguePreDraft({ league: { status: 'pre_draft' }, teams: [team(['a']), team(['b'])] }),
    true,
  );
});

/* ESPN infers status from the current matchup period, so a league can report
   in_season while every roster is still empty — which is exactly the state
   that produced a 50/50 line and a +48.5% waiver claim on the Hub. */
test('empty rosters are pre-draft even when the provider says in_season', () => {
  assert.equal(
    isLeaguePreDraft({ league: { status: 'in_season' }, teams: [team(), team(), team()] }),
    true,
  );
});

test('one drafted roster is enough to stop being pre-draft', () => {
  assert.equal(
    isLeaguePreDraft({ league: { status: 'in_season' }, teams: [team(), team(['a'])] }),
    false,
  );
});

test('a league with no teams is not pre-draft, it is broken', () => {
  assert.equal(isLeaguePreDraft({ league: { status: 'in_season' }, teams: [] }), false);
});

test('an unscheduled draft has no time to print', () => {
  assert.equal(formatDraftTime(null), null);
  assert.equal(formatDraftTime(0), null);
  assert.equal(formatDraftTime(undefined), null);
  assert.equal(formatDraftTime(Number.NaN), null);
});

test('a scheduled draft formats to something a person can read', () => {
  const out = formatDraftTime(Date.UTC(2026, 7, 30, 20, 0));
  assert.equal(typeof out, 'string');
  assert.match(out, /2026|August|Aug/);
});
