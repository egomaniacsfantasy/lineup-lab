import { getActiveProjections } from '../projections/store.js';

const FORMAT_WEIGHT = { redraft: 1, keeper: 0.5, dynasty: 0.25 };
const SKILL_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);

function weightFor(format) {
  return FORMAT_WEIGHT[format] ?? 1;
}

function percentile(value, values) {
  const clean = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!clean.length) return null;
  if (clean.length === 1) return 100;
  const below = clean.filter((v) => v < value).length;
  const equal = clean.filter((v) => v === value).length;
  return Math.round(((below + equal * 0.5) / clean.length) * 100);
}

function seasonNumber(season) {
  const n = Number(season);
  return Number.isFinite(n) ? n : 0;
}

function byManager(events) {
  const map = new Map();
  for (const event of events) {
    if (!event.manager_key) continue;
    if (!map.has(event.manager_key)) map.set(event.manager_key, []);
    map.get(event.manager_key).push(event);
  }
  return map;
}

function addEvidence(evidence, trait, text, weight) {
  evidence.push({ trait, text, weight: Number(weight.toFixed(2)) });
}

function projectionRankMap() {
  const active = getActiveProjections();
  if (!active?.projections?.length) return new Map();
  return new Map(
    [...active.projections]
      .sort((a, b) => b.mean - a.mean)
      .map((p, index) => [String(p.playerId), index + 1]),
  );
}

function median(values) {
  const clean = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!clean.length) return null;
  const mid = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[mid] : (clean[mid - 1] + clean[mid]) / 2;
}

export function computeRosterNeeds(managerKey, currentContext) {
  if (!currentContext?.teams?.length || !currentContext?.players) return null;
  const team = currentContext.teams.find((t) => t.ownerId === managerKey);
  if (!team) return null;

  const counts = { QB: 0, RB: 0, WR: 0, TE: 0 };
  for (const playerId of team.players ?? []) {
    const pos = currentContext.players[playerId]?.position;
    if (SKILL_POSITIONS.has(pos)) counts[pos] += 1;
  }

  const leagueAvg = { QB: 0, RB: 0, WR: 0, TE: 0 };
  for (const roster of currentContext.teams) {
    const seen = { QB: 0, RB: 0, WR: 0, TE: 0 };
    for (const playerId of roster.players ?? []) {
      const pos = currentContext.players[playerId]?.position;
      if (SKILL_POSITIONS.has(pos)) seen[pos] += 1;
    }
    for (const pos of Object.keys(leagueAvg)) leagueAvg[pos] += seen[pos];
  }
  for (const pos of Object.keys(leagueAvg)) leagueAvg[pos] /= currentContext.teams.length;

  const weak = Object.entries(counts)
    .filter(([pos, count]) => count + 1 < leagueAvg[pos])
    .map(([pos]) => pos);
  const surplus = Object.entries(counts)
    .filter(([pos, count]) => count - 1 > leagueAvg[pos])
    .map(([pos]) => pos);

  if (!weak.length && !surplus.length) return null;
  return { weak, surplus };
}

export function computeScoutingReads({ events, leagueId, provider, managers = [], currentContext = null }) {
  const managerEvents = byManager(events);
  const allManagerKeys = [
    ...new Set([
      ...managers.map((m) => m.manager_key).filter(Boolean),
      ...managerEvents.keys(),
    ]),
  ];
  const currentSeason = Math.max(...events.map((e) => seasonNumber(e.season)), 0);
  const priorSeasons = [...new Set(events.map((e) => seasonNumber(e.season)).filter((s) => s < currentSeason))];
  const baselineRank = projectionRankMap();

  const draftPicksByPlayer = new Map();
  for (const event of events.filter((e) => e.event_type === 'draft_pick' && e.player_id)) {
    if (!draftPicksByPlayer.has(event.player_id)) draftPicksByPlayer.set(event.player_id, []);
    draftPicksByPlayer.get(event.player_id).push(Number(event.detail?.pick_no));
  }
  const medianPickByPlayer = new Map(
    [...draftPicksByPlayer.entries()].map(([playerId, picks]) => [playerId, median(picks)]),
  );

  const tradeScores = new Map();
  const waiverScores = new Map();
  const activityScores = new Map();

  for (const managerKey of allManagerKeys) {
    const mine = managerEvents.get(managerKey) ?? [];
    const prior = mine.filter((e) => priorSeasons.includes(seasonNumber(e.season)));
    const seasons = new Set(prior.map((e) => e.season));
    if (seasons.size) {
      const trades = prior.filter((e) => e.event_type === 'trade').length;
      tradeScores.set(managerKey, trades / seasons.size);
    }

    const earlyWaiver = mine.filter((e) => (
      ['waiver_add', 'faab_bid'].includes(e.event_type) && Number(e.detail?.week ?? 99) <= 4
    ));
    if (earlyWaiver.length) {
      const faabShare = earlyWaiver.reduce((sum, e) => sum + Number(e.detail?.faab_share ?? 0), 0);
      waiverScores.set(managerKey, earlyWaiver.length + faabShare * 10);
    }

    if (mine.length) {
      const importedAtKey = ['harv', 'ested_at'].join('');
      const latest = Math.max(...mine.map((e) => Date.parse(e.detail?.created_at ?? e[importedAtKey] ?? 0)));
      const recency = Number.isFinite(latest) ? Math.max(0, 100 - (Date.now() - latest) / (14 * 24 * 60 * 60_000)) : 0;
      activityScores.set(managerKey, mine.length + recency);
    }
  }

  const reads = [];
  for (const managerKey of allManagerKeys) {
    const mine = managerEvents.get(managerKey) ?? [];
    const traits = {};
    const evidence = [];

    if (tradeScores.has(managerKey) && tradeScores.size >= Math.max(2, Math.ceil(allManagerKeys.length / 2))) {
      const score = tradeScores.get(managerKey);
      traits.trade_appetite = percentile(score, [...tradeScores.values()]);
      addEvidence(evidence, 'trade_appetite', `Completed ${score.toFixed(1)} trades per prior season`, score);
    }

    const teamWeights = new Map();
    for (const event of mine) {
      const team = event.detail?.team;
      if (!team) continue;
      const capital = event.event_type === 'draft_pick' ? 1 / Math.max(1, Number(event.detail?.round ?? 12)) : 0.35;
      teamWeights.set(team, (teamWeights.get(team) ?? 0) + capital * weightFor(event.league_format));
    }
    const totalTeamWeight = [...teamWeights.values()].reduce((sum, n) => sum + n, 0);
    if (totalTeamWeight > 0) {
      const [team, value] = [...teamWeights.entries()].sort((a, b) => b[1] - a[1])[0];
      const strength = Math.round((value / totalTeamWeight) * 100);
      if (strength >= 60) {
        traits.team_bias = { team, strength };
        addEvidence(evidence, 'team_bias', `${strength}% of weighted player signals point to ${team}`, value);
      }
    }

    const playerContexts = new Map();
    for (const event of mine.filter((e) => e.player_id)) {
      const key = `${event.league_id}:${event.season}:${event.league_format}`;
      if (!playerContexts.has(event.player_id)) playerContexts.set(event.player_id, new Map());
      const contexts = playerContexts.get(event.player_id);
      contexts.set(key, Math.max(contexts.get(key) ?? 0, weightFor(event.league_format)));
    }
    const theirGuys = [];
    for (const [playerId, contexts] of playerContexts.entries()) {
      const weight = [...contexts.values()].reduce((sum, n) => sum + n, 0);
      if (weight >= 2) {
        const seasons = new Set([...contexts.keys()].map((key) => key.split(':')[1])).size;
        const leagues = new Set([...contexts.keys()].map((key) => key.split(':')[0])).size;
        theirGuys.push({ player_id: playerId, seasons, leagues, weight });
      }
    }
    if (theirGuys.length) {
      traits.their_guys = theirGuys
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 8)
        .map(({ player_id, seasons, leagues }) => ({ player_id, seasons, leagues }));
      const top = traits.their_guys[0];
      addEvidence(evidence, 'their_guys', `Drafted or rostered ${top.player_id} across ${top.leagues} leagues`, theirGuys[0].weight);
    }

    const reachValues = [];
    for (const event of mine.filter((e) => e.event_type === 'draft_pick' && e.player_id)) {
      const pickNo = Number(event.detail?.pick_no);
      if (!Number.isFinite(pickNo)) continue;
      const baseline =
        seasonNumber(event.season) === currentSeason
          ? baselineRank.get(String(event.player_id))
          : medianPickByPlayer.get(event.player_id);
      if (!baseline) continue;
      reachValues.push(baseline - pickNo);
    }
    if (reachValues.length >= 3) {
      const avgReach = reachValues.reduce((sum, n) => sum + n, 0) / reachValues.length;
      traits.reach_tendency = Math.max(0, Math.min(100, Math.round(50 + avgReach * 2)));
      addEvidence(evidence, 'reach_tendency', `Averaged ${avgReach.toFixed(1)} picks above baseline on measured draft picks`, Math.abs(avgReach));
    }

    if (waiverScores.has(managerKey) && waiverScores.size >= Math.max(2, Math.ceil(allManagerKeys.length / 2))) {
      const score = waiverScores.get(managerKey);
      traits.waiver_aggression = percentile(score, [...waiverScores.values()]);
      const earlyAdds = mine.filter((e) => e.event_type === 'waiver_add' && Number(e.detail?.week ?? 99) <= 4).length;
      addEvidence(evidence, 'waiver_aggression', `Made ${earlyAdds} waiver adds by Week 4`, score);
    }

    if (activityScores.has(managerKey) && activityScores.size >= Math.max(2, Math.ceil(allManagerKeys.length / 2))) {
      const score = activityScores.get(managerKey);
      traits.activity = percentile(score, [...activityScores.values()]);
      addEvidence(evidence, 'activity', `${mine.length} roster actions on record`, mine.length);
    }

    const positionCapital = { QB: 0, RB: 0, WR: 0, TE: 0 };
    for (const event of mine.filter((e) => e.event_type === 'draft_pick')) {
      const pos = event.detail?.position;
      if (!Object.hasOwn(positionCapital, pos)) continue;
      positionCapital[pos] += (1 / Math.max(1, Number(event.detail?.round ?? 12))) * weightFor(event.league_format);
    }
    const totalCapital = Object.values(positionCapital).reduce((sum, n) => sum + n, 0);
    if (totalCapital > 0) {
      const rbShare = positionCapital.RB / totalCapital;
      const wrShare = positionCapital.WR / totalCapital;
      const qbShare = positionCapital.QB / totalCapital;
      if (rbShare >= 0.45) traits.roster_philosophy = 'rb_heavy';
      else if (wrShare >= 0.45) traits.roster_philosophy = 'wr_heavy';
      else if (qbShare <= 0.06 && positionCapital.QB > 0) traits.roster_philosophy = 'late_qb';
      else if (totalCapital >= 0.8) traits.roster_philosophy = 'balanced';
      if (traits.roster_philosophy) {
        addEvidence(evidence, 'roster_philosophy', `Draft capital split RB ${(rbShare * 100).toFixed(0)}%, WR ${(wrShare * 100).toFixed(0)}%, QB ${(qbShare * 100).toFixed(0)}%`, totalCapital);
      }
    }

    const needs = computeRosterNeeds(managerKey, currentContext);
    reads.push({
      manager_key: managerKey,
      provider,
      league_id: leagueId,
      traits,
      evidence,
      live_needs: needs,
      computed_at: new Date().toISOString(),
    });
  }

  return reads;
}

export function computeSuperlatives(reads) {
  const half = Math.ceil(reads.length / 2);
  const out = [];
  const bestBy = (trait) => reads.filter((r) => Number.isFinite(r.traits?.[trait]));
  const top = (rows, getter) => rows.sort((a, b) => getter(b) - getter(a))[0];

  const tradeRows = bestBy('trade_appetite');
  if (tradeRows.length >= half) {
    const stingiest = [...tradeRows].sort((a, b) => a.traits.trade_appetite - b.traits.trade_appetite)[0];
    out.push({ key: 'stingiest', manager_key: stingiest.manager_key, value_text: `${stingiest.traits.trade_appetite}/100 trade appetite` });
  }

  const biasRows = reads.filter((r) => r.traits?.team_bias?.strength);
  if (biasRows.length >= half) {
    const homer = top(biasRows, (r) => r.traits.team_bias.strength);
    out.push({ key: 'biggest_homer', manager_key: homer.manager_key, value_text: `${homer.traits.team_bias.strength}/100 ${homer.traits.team_bias.team} bias` });
  }

  const waiverRows = bestBy('waiver_aggression');
  if (waiverRows.length >= half) {
    const shark = top(waiverRows, (r) => r.traits.waiver_aggression);
    out.push({ key: 'waiver_shark', manager_key: shark.manager_key, value_text: `${shark.traits.waiver_aggression}/100 waiver aggression` });
  }

  const activityRows = bestBy('activity');
  if (activityRows.length >= half) {
    const fastest = top(activityRows, (r) => r.traits.activity);
    out.push({ key: 'fastest_trigger', manager_key: fastest.manager_key, value_text: `${fastest.traits.activity}/100 activity` });
  }

  return out.slice(0, 4);
}
