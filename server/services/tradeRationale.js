const narrationCache = new Map();
const EM_DASH = String.fromCharCode(8212);
const SPACED_EN_DASH = ` ${String.fromCharCode(8211)} `;

const POSITION_ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];

function round1(value) {
  return Number.isFinite(value) ? Number(value.toFixed(1)) : 0;
}

function signed(value, suffix = '') {
  const n = round1(value ?? 0);
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}${suffix}`;
}

function depthByPosition(playerIds, catalog) {
  const depth = {};
  for (const id of playerIds ?? []) {
    const pos = catalog[id]?.position;
    if (!pos) continue;
    depth[pos] = (depth[pos] ?? 0) + 1;
  }
  return depth;
}

function slotNeed(pos, slotLabels) {
  return (slotLabels ?? []).filter((slot) => {
    if (slot === pos) return true;
    if (slot === 'FLEX') return ['RB', 'WR', 'TE'].includes(pos);
    if (slot === 'SUPER_FLEX') return ['QB', 'RB', 'WR', 'TE'].includes(pos);
    return false;
  }).length;
}

function needsFromDepth(depth, slotLabels) {
  const weak = [];
  const surplus = [];
  for (const pos of POSITION_ORDER) {
    const need = slotNeed(pos, slotLabels);
    if (!need) continue;
    const count = depth[pos] ?? 0;
    if (count <= need) weak.push(pos);
    if (count >= need + 2) surplus.push(pos);
  }
  return { weak, surplus };
}

function playerProjection(id, projectionMap, catalog) {
  const row = projectionMap.get(id);
  const fallback = catalog[id] ?? {};
  return {
    id,
    name: row?.name ?? fallback.name ?? `Player ${id}`,
    position: row?.position ?? fallback.position ?? '',
    team: row?.team ?? fallback.team ?? '',
    mean: round1(row?.mean ?? 0),
    floor: row?.floor == null ? null : round1(row.floor),
    ceiling: row?.ceiling == null ? null : round1(row.ceiling),
    seasonTotal: row?.seasonTotal == null ? null : round1(row.seasonTotal),
    range: row?.floor == null || row?.ceiling == null ? null : round1(row.ceiling - row.floor),
  };
}

function sumKnown(players, key) {
  const values = players.map((player) => player[key]).filter((value) => Number.isFinite(value));
  if (values.length === 0) return null;
  return round1(values.reduce((sum, value) => sum + value, 0));
}

function sideBundle(label, beforeIds, afterIds, depthBefore, depthAfter, slotLabels) {
  return {
    label,
    depthBefore,
    depthAfter,
    needsBefore: needsFromDepth(depthBefore, slotLabels),
    needsAfter: needsFromDepth(depthAfter, slotLabels),
    rosterSizeBefore: beforeIds.length,
    rosterSizeAfter: afterIds.length,
  };
}

function deltaStat(side, key) {
  if (!side?.delta || !Number.isFinite(side.delta[key])) return null;
  return round1(side.delta[key]);
}

function probabilityDelta(before, after) {
  if (!Number.isFinite(before) || !Number.isFinite(after)) return null;
  return round1(after - before);
}

export function tradeRationaleSignature({
  leagueId,
  projectionVersion,
  scoringFamily,
  partnerRosterId,
  give,
  get,
}) {
  return [
    leagueId,
    projectionVersion ?? 'unknown-projection',
    scoringFamily ?? 'unknown-scoring',
    partnerRosterId,
    [...(give ?? [])].sort().join(','),
    [...(get ?? [])].sort().join(','),
  ].join('|');
}

export function buildTradeRationaleFactors({
  leagueId,
  projectionVersion,
  league,
  teams,
  catalog,
  projections,
  price,
  analysis,
  partnerRosterId,
  give,
  get,
}) {
  const slotLabels = (league.rosterPositions ?? []).filter((slot) => !['BN', 'IR', 'TAXI'].includes(slot));
  const projectionMap = new Map((projections ?? []).map((player) => [player.playerId, player]));
  const userTeam = teams.find((team) => team.isUser);
  const partnerTeam = teams.find((team) => team.rosterId === Number(partnerRosterId));
  if (!userTeam || !partnerTeam || !price?.available) {
    return { available: false, reason: price?.reason ?? 'trade_not_available' };
  }

  const giveSet = new Set((give ?? []).map(String));
  const getSet = new Set((get ?? []).map(String));
  const userAfter = [...userTeam.players.filter((id) => !giveSet.has(String(id))), ...(get ?? [])];
  const partnerAfter = [...partnerTeam.players.filter((id) => !getSet.has(String(id))), ...(give ?? [])];
  const getPlayers = (get ?? []).map((id) => playerProjection(id, projectionMap, catalog));
  const givePlayers = (give ?? []).map((id) => playerProjection(id, projectionMap, catalog));

  const userDepthBefore = price.you?.depthBefore ?? depthByPosition(userTeam.players, catalog);
  const userDepthAfter = price.you?.depthAfter ?? depthByPosition(userAfter, catalog);
  const partnerDepthBefore = depthByPosition(partnerTeam.players, catalog);
  const partnerDepthAfter = depthByPosition(partnerAfter, catalog);
  const userFloorDelta = sumKnown(getPlayers, 'floor') == null || sumKnown(givePlayers, 'floor') == null
    ? null
    : round1(sumKnown(getPlayers, 'floor') - sumKnown(givePlayers, 'floor'));
  const userCeilingDelta = sumKnown(getPlayers, 'ceiling') == null || sumKnown(givePlayers, 'ceiling') == null
    ? null
    : round1(sumKnown(getPlayers, 'ceiling') - sumKnown(givePlayers, 'ceiling'));
  const userRangeDelta = sumKnown(getPlayers, 'range') == null || sumKnown(givePlayers, 'range') == null
    ? null
    : round1(sumKnown(getPlayers, 'range') - sumKnown(givePlayers, 'range'));

  return {
    available: true,
    leagueId,
    projectionVersion,
    scoringFamily: league.scoringFamily,
    signature: tradeRationaleSignature({
      leagueId,
      projectionVersion,
      scoringFamily: league.scoringFamily,
      partnerRosterId,
      give,
      get,
    }),
    trade: {
      get: getPlayers,
      give: givePlayers,
      partnerRosterId: Number(partnerRosterId),
      partnerTeam: partnerTeam.teamName,
      userTeam: userTeam.teamName,
    },
    lineupImpact: {
      you: round1(price.you?.valueDelta ?? 0),
      them: round1(price.them?.valueDelta ?? 0),
    },
    depth: {
      you: sideBundle(userTeam.teamName, userTeam.players, userAfter, userDepthBefore, userDepthAfter, slotLabels),
      them: sideBundle(partnerTeam.teamName, partnerTeam.players, partnerAfter, partnerDepthBefore, partnerDepthAfter, slotLabels),
    },
    weeklyShape: {
      floorDelta: userFloorDelta,
      ceilingDelta: userCeilingDelta,
      rangeDelta: userRangeDelta,
    },
    seasonImpact: {
      you: {
        titleDelta: probabilityDelta(price.you?.titleProbBefore, price.you?.titleProbAfter),
        playoffDelta: deltaStat(analysis?.you, 'playoffProb'),
        expectedWinsDelta: deltaStat(analysis?.you, 'expWins'),
      },
      them: {
        titleDelta: deltaStat(analysis?.partner, 'titleProb'),
        playoffDelta: deltaStat(analysis?.partner, 'playoffProb'),
        expectedWinsDelta: deltaStat(analysis?.partner, 'expWins'),
      },
    },
    acceptance: {
      probability: price.acceptance?.probability ?? null,
      band: price.acceptance?.band ?? null,
      drivers: price.acceptance?.reasons ?? [],
    },
    value: {
      verdict: price.verdict ?? 'Fair',
      valueGap: price.valueGap ?? 0,
      bestPlayer: price.bestPlayer ?? null,
      fairCounter: price.fairCounter ?? null,
    },
    warnings: analysis?.warnings ?? null,
  };
}

function changedDepthLines(side) {
  return POSITION_ORDER
    .map((pos) => ({
      pos,
      before: side.depthBefore[pos] ?? 0,
      after: side.depthAfter[pos] ?? 0,
    }))
    .filter((row) => row.before !== row.after)
    .map((row) => `${row.pos} depth ${row.before} → ${row.after}.`);
}

export function renderStructuredTradeRationale(factors) {
  if (!factors?.available) {
    return {
      summary: 'This trade cannot be priced yet.',
      sections: [{ label: 'Status', facts: [factors?.reason ?? 'Trade data is missing.'] }],
    };
  }

  const sections = [
    {
      label: 'Lineup',
      facts: [
        `You ${signed(factors.lineupImpact.you, ' pts/wk')} to starters.`,
        `${factors.trade.partnerTeam} ${signed(factors.lineupImpact.them, ' pts/wk')} to starters.`,
      ],
    },
  ];

  const seasonFacts = [];
  if (factors.seasonImpact.you.titleDelta != null) {
    seasonFacts.push(`Your title odds ${signed(factors.seasonImpact.you.titleDelta, ' pts')}.`);
  }
  if (factors.seasonImpact.you.playoffDelta != null) {
    seasonFacts.push(`Your playoff odds ${signed(factors.seasonImpact.you.playoffDelta, ' pts')}.`);
  }
  if (factors.seasonImpact.you.expectedWinsDelta != null) {
    seasonFacts.push(`Expected wins ${signed(factors.seasonImpact.you.expectedWinsDelta)}.`);
  }
  if (seasonFacts.length) sections.push({ label: 'Season', facts: seasonFacts });

  const depthFacts = [
    ...changedDepthLines(factors.depth.you),
    factors.depth.you.needsAfter.weak.length
      ? `Still thin at ${factors.depth.you.needsAfter.weak.join('/')}.`
      : null,
    factors.depth.you.needsAfter.surplus.length
      ? `Surplus at ${factors.depth.you.needsAfter.surplus.join('/')}.`
      : null,
  ].filter(Boolean);
  if (depthFacts.length) sections.push({ label: 'Depth', facts: depthFacts });

  const shapeFacts = [];
  if (factors.weeklyShape.floorDelta != null) shapeFacts.push(`Weekly floor ${signed(factors.weeklyShape.floorDelta)}.`);
  if (factors.weeklyShape.ceilingDelta != null) shapeFacts.push(`Weekly ceiling ${signed(factors.weeklyShape.ceilingDelta)}.`);
  if (factors.weeklyShape.rangeDelta != null) shapeFacts.push(`Range ${signed(factors.weeklyShape.rangeDelta)}.`);
  if (shapeFacts.length) sections.push({ label: 'Risk', facts: shapeFacts });

  const acceptanceFacts = [];
  if (factors.acceptance.probability != null) {
    acceptanceFacts.push(`${factors.acceptance.probability}% to accept, ${factors.acceptance.band ?? 'unbanded'}.`);
  }
  acceptanceFacts.push(...factors.acceptance.drivers.slice(0, 2));
  if (acceptanceFacts.length) sections.push({ label: 'Acceptance', facts: acceptanceFacts });

  return {
    summary: `${factors.value.verdict}. ${factors.trade.get.map((p) => p.name).join(' + ')} for ${factors.trade.give.map((p) => p.name).join(' + ')}.`,
    sections,
  };
}

function collectNumbers(value, set = new Set()) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    set.add(String(Math.round(value)));
    set.add(value.toFixed(1));
  } else if (Array.isArray(value)) {
    value.forEach((item) => collectNumbers(item, set));
  } else if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => collectNumbers(item, set));
  }
  return set;
}

function collectEntityTokens(factors) {
  const allowed = new Set([
    'Acceptance',
    'Coin',
    'Fair',
    'Good',
    'Lineup',
    'Long',
    'Overpay',
    'QB',
    'RB',
    'Risk',
    'Season',
    'Smash',
    'TE',
    'The',
    'This',
    'Title',
    'WR',
    'You',
  ]);
  const addWords = (text) => String(text ?? '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .forEach((word) => allowed.add(word));
  addWords(factors.trade?.partnerTeam);
  addWords(factors.trade?.userTeam);
  for (const player of [...(factors.trade?.get ?? []), ...(factors.trade?.give ?? [])]) {
    addWords(player.name);
    addWords(player.team);
    addWords(player.position);
  }
  return allowed;
}

export function validateTradeNarration(text, factors) {
  if (!text || typeof text !== 'string') return false;
  if (text.includes(EM_DASH) || text.includes(SPACED_EN_DASH)) return false;

  const allowedNumbers = collectNumbers(factors);
  const numbers = text.match(/[+-]?\d+(?:\.\d+)?%?/g) ?? [];
  for (const raw of numbers) {
    const normalized = raw.replace('%', '').replace(/^\+/, '');
    if (!allowedNumbers.has(normalized) && !allowedNumbers.has(Number(normalized).toFixed(1))) {
      return false;
    }
  }

  const allowedTokens = collectEntityTokens(factors);
  const tokens = text.match(/\b[A-Z][A-Za-z0-9]+\b/g) ?? [];
  return tokens.every((token) => allowedTokens.has(token));
}

export async function maybeNarrateTradeRationale(factors, {
  enabled = false,
  provider = 'structured',
  model = '',
  apiKey = '',
  generator = null,
} = {}) {
  if (!enabled || !factors?.available) return null;
  const key = `${provider}|${model}|${factors.signature}`;
  if (narrationCache.has(key)) return { text: narrationCache.get(key), cached: true };

  let text = null;
  if (generator) {
    text = await generator(factors);
  } else if (provider === 'openai' && apiKey && model) {
    text = await callOpenAiNarrator({ factors, apiKey, model });
  }

  if (!validateTradeNarration(text, factors)) return null;
  narrationCache.set(key, text);
  return { text, cached: false };
}

async function callOpenAiNarrator({ factors, apiKey, model }) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            'You write Odds Gods trade rationale. Use only supplied facts. Two to four terse sentences. No em dashes or en dashes. No outside player takes.',
        },
        {
          role: 'user',
          content: JSON.stringify(factors),
        },
      ],
    }),
  });
  if (!response.ok) return null;
  const body = await response.json().catch(() => null);
  return body?.choices?.[0]?.message?.content?.trim() ?? null;
}
