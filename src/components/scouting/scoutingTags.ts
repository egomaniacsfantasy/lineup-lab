import type { ScoutingRead } from '../../services/leagueApi';

export interface ScoutingTagCandidate {
  label: string;
  score: number;
}

export function scoutingTagCandidates(read: ScoutingRead): ScoutingTagCandidate[] {
  const traits = read.traits ?? {};
  const tags: { label: string; score: number }[] = [];

  if (traits.team_bias?.team && traits.team_bias.strength >= 60) {
    const label = traits.team_bias.team === 'DAL' ? 'Cowboys homer' : `${traits.team_bias.team} homer`;
    tags.push({ label, score: traits.team_bias.strength });
  }
  if (typeof traits.trade_appetite === 'number') {
    if (traits.trade_appetite >= 70) tags.push({ label: 'Deal-maker', score: traits.trade_appetite });
    if (traits.trade_appetite <= 30) tags.push({ label: 'Stingy', score: 100 - traits.trade_appetite });
  }
  if (typeof traits.reach_tendency === 'number') {
    if (traits.reach_tendency >= 82) tags.push({ label: 'Reaches on his guys', score: traits.reach_tendency });
    else if (traits.reach_tendency >= 68) tags.push({ label: 'Drafts favorites early', score: traits.reach_tendency });
  }
  if (typeof traits.waiver_aggression === 'number' && traits.waiver_aggression >= 70) {
    tags.push({ label: 'Waiver shark', score: traits.waiver_aggression });
  }
  if (typeof traits.activity === 'number' && traits.activity <= 25) {
    tags.push({ label: 'Ghost', score: 100 - traits.activity });
  }
  const negotiationStyle = read.edit?.negotiation_style ?? traits.negotiation_style;
  if (negotiationStyle === 'clean') tags.push({ label: 'Takes clean offers', score: 78 });
  if (negotiationStyle === 'counters') tags.push({ label: 'Always counters', score: 78 });
  if (negotiationStyle === 'ghosts') tags.push({ label: 'Ghost', score: 78 });

  return tags.sort((a, b) => b.score - a.score);
}

export function scoutingTags(read: ScoutingRead): string[] {
  return scoutingTagCandidates(read).slice(0, 3).map((tag) => tag.label);
}
