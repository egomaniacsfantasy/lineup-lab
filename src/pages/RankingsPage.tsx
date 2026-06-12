import { ConsensusTable } from '../components/rankings/ConsensusTable';
import { RankingMechanic } from '../components/rankings/RankingMechanic';
import { MOCK_CONSENSUS_RANKINGS } from '../mocks';
import './RankingsPage.css';

// SCOPE: POST-MVP — consensus rankings + Pro raffle are not in the mobile
// MVP (Matchup, Season, League, Trade analyzer, share cards). Keep the route;
// do not invest here until the MVP ships.
export function RankingsPage() {
  return (
    <div className="rankings-page">
      <h1 className="visually-hidden">Rank these five and the consensus line moves.</h1>
      <div className="rankings-page__main">
        <RankingMechanic />
      </div>
      <div className="rankings-page__sidebar">
        <ConsensusTable rankings={MOCK_CONSENSUS_RANKINGS} />
      </div>
    </div>
  );
}
