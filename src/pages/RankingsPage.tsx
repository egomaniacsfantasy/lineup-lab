import { ConsensusTable } from '../components/rankings/ConsensusTable';
import { RankingMechanic } from '../components/rankings/RankingMechanic';
import { MOCK_CONSENSUS_RANKINGS } from '../mocks';
import './RankingsPage.css';

export function RankingsPage() {
  return (
    <div className="rankings-page">
      <h1 className="visually-hidden">Player rankings</h1>
      <div className="rankings-page__main">
        <RankingMechanic />
      </div>
      <div className="rankings-page__sidebar">
        <ConsensusTable rankings={MOCK_CONSENSUS_RANKINGS} />
      </div>
    </div>
  );
}
