import type { ScoutingRead } from '../../services/leagueApi';

export function scoutingTags(read: ScoutingRead): string[] {
  const traits = read.traits ?? {};
  const tags: { label: string; score: number }[] = [];

  if (traits.team_bias?.team && traits.team_bias.strength >= 60) {
    tags.push({ label: `${traits.team_bias.team} homer`, score: traits.team_bias.strength });
  }
  if (typeof traits.trade_appetite === 'number') {
    if (traits.trade_appetite >= 70) tags.push({ label: 'Deal-maker', score: traits.trade_appetite });
    if (traits.trade_appetite <= 30) tags.push({ label: 'Stingy', score: 100 - traits.trade_appetite });
  }
  if (typeof traits.reach_tendency === 'number' && traits.reach_tendency >= 70) {
    tags.push({ label: 'Reaches on his guys', score: traits.reach_tendency });
  }
  if (typeof traits.waiver_aggression === 'number' && traits.waiver_aggression >= 70) {
    tags.push({ label: 'Waiver shark', score: traits.waiver_aggression });
  }
  if (typeof traits.activity === 'number' && traits.activity <= 25) {
    tags.push({ label: 'Ghost', score: 100 - traits.activity });
  }

  return tags.sort((a, b) => b.score - a.score).slice(0, 3).map((tag) => tag.label);
}
