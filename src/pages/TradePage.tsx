import { TradeTargetsList } from '../components/trade/TradeTargetsList';
import { MOCK_TRADE_TARGET_GROUPS } from '../mocks';
import './TradePage.css';

export function TradePage() {
  return (
    <div className="trade-page">
      <h1 className="visually-hidden">Trade targets</h1>
      <TradeTargetsList groups={MOCK_TRADE_TARGET_GROUPS} />
    </div>
  );
}
