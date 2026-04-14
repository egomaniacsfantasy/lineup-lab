import type { PlayerBettingContext } from '../types';

export const MOCK_ADAMS_CONTEXT: PlayerBettingContext = {
  playerId: 'adams-01',
  gameSpread: 2.5,
  gameTotal: 44.5,
  signals: [
    {
      type: 'game-script',
      title: 'Game Script',
      body: "Adams's team LV is a +2.5 underdog. Historically, WR1s on slight underdogs see 1.4 more targets per game as teams trail and throw more in the second half.",
      sentiment: 'bullish',
      badgeText: 'SCRIPT',
      stat: '+1.4 tgt/gm',
    },
    {
      type: 'pace-environment',
      title: 'Pace & Environment',
      body: "This game's O/U is 44.5 (12th highest this week). Games with totals between 43-47 produce average WR1 scoring - not a strong pace signal either way.",
      sentiment: 'neutral',
      badgeText: 'PACE',
    },
  ],
};

export const MOCK_WADDLE_CONTEXT: PlayerBettingContext = {
  playerId: 'waddle-01',
  gameSpread: -3.0,
  gameTotal: 48.5,
  signals: [
    {
      type: 'game-script',
      title: 'Game Script',
      body: "Waddle's team MIA is a -3 favorite. Slight favorites maintain balanced game scripts. No significant target volume adjustment expected.",
      sentiment: 'neutral',
      badgeText: 'SCRIPT',
    },
    {
      type: 'pace-environment',
      title: 'Pace & Environment',
      body: "This game's O/U is 48.5 (3rd highest this week). High-total games correlate with +2.8 PPR points for WR1s historically. Strong environment for Waddle's ceiling.",
      sentiment: 'bullish',
      badgeText: 'PACE',
      stat: '+2.8 PPR pts',
    },
  ],
};
