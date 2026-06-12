import { SeasonalNotice } from '../components/layout/SeasonalNotice';
import { TradeTargetsList } from '../components/trade/TradeTargetsList';
import { useSeasonMode } from '../hooks/useSeasonMode';
import { MOCK_TRADE_TARGET_GROUPS } from '../mocks';
import './TradePage.css';

export function TradePage() {
  const { mode } = useSeasonMode();

  return (
    <div className="trade-page">
      <h1 className="visually-hidden">Trade targets</h1>
      {mode === 'preseason' ? (
        <SeasonalNotice>
          Trade analyzer opens Week 1. This preview prices the 2024 replay
          rosters.
        </SeasonalNotice>
      ) : null}
      <TradeTargetsList groups={MOCK_TRADE_TARGET_GROUPS} />
    </div>
  );
}
