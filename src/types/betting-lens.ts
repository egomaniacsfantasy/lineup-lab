export type SignalType =
  | 'game-script'
  | 'pace-environment'
  | 'market-disagreement';

export type Sentiment = 'bullish' | 'bearish' | 'neutral';

export interface BettingSignal {
  type: SignalType;
  title: string;
  body: string;
  sentiment: Sentiment;
  badgeText: string;
  stat?: string;
}

export interface PlayerBettingContext {
  playerId: string;
  gameSpread: number;
  gameTotal: number;
  signals: BettingSignal[];
}
