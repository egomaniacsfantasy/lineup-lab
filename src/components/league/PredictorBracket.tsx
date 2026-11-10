import { TeamAvatar } from './TeamAvatar';
import type { Bracket, BracketPick } from '../../services/predictor';
import { bracketRoundLabel, layoutBracket, type LayoutSide, type LayoutSlot } from '../../utils/bracketLayout';

interface TeamInfo {
  teamName: string;
  avatarUrl?: string | null;
  isUser?: boolean;
}

/**
 * The playoffs, as the thing everybody already knows how to read.
 *
 * The rounds used to be steps in the week picker: call the semifinals, press
 * Next, call the final. That hides the one fact a bracket exists to show,
 * which is who a win puts you up against. Here every round is on screen at
 * once and a pick visibly carries its team across to the next column.
 *
 * Before the regular season is fully called there is no bracket to pick,
 * because the seeds still change from one simulated season to the next. The
 * frame is drawn anyway, with seed numbers where the teams will go, so it is
 * plain what finishing the season unlocks.
 */
export function PredictorBracket({
  bracket,
  playoffTeams,
  picks,
  teams,
  projByWeekRoster,
  onPick,
}: {
  bracket: Bracket | null;
  playoffTeams: number;
  picks: readonly BracketPick[];
  teams: Map<string, TeamInfo>;
  projByWeekRoster?: Map<string, number>;
  onPick: (round: number, idx: number, rosterId: string) => void;
}) {
  const layout = layoutBracket(bracket, playoffTeams);
  const champion = bracket?.champion ? teams.get(bracket.champion) : null;

  const row = (slot: LayoutSlot, side: LayoutSide, week: number | null, index: number) => {
    const info = side.rosterId ? teams.get(side.rosterId) : null;
    const matchup = slot.matchup;
    const pick = matchup
      ? picks.find((entry) => entry.round === matchup.round && entry.idx === matchup.idx)
      : null;
    const chosen = pick != null && pick.winnerRosterId === side.rosterId;
    const beaten = pick != null && !chosen;
    const proj =
      side.rosterId && week != null ? projByWeekRoster?.get(`${week}:${side.rosterId}`) : undefined;
    const className = [
      'pbracket__team',
      chosen ? 'pbracket__team--picked' : '',
      beaten ? 'pbracket__team--beaten' : '',
      info?.isUser ? 'pbracket__team--you' : '',
      side.rosterId ? '' : 'pbracket__team--open',
    ].filter(Boolean).join(' ');
    const body = (
      <>
        {info ? <TeamAvatar avatarUrl={info.avatarUrl} name={info.teamName} /> : <span aria-hidden="true" className="pbracket__blank" />}
        <span className="pbracket__seed">{side.seed != null ? `#${side.seed}` : ''}</span>
        <span className="pbracket__name">
          {info?.teamName ?? (side.seed != null ? `Seed ${side.seed}` : 'To be decided')}
        </span>
        {typeof proj === 'number' && slot.kind === 'match' ? (
          <span className="pbracket__proj">
            <span className="predictor__side-label">Proj</span> {proj.toFixed(1)}
          </span>
        ) : null}
        {slot.kind === 'bye' ? <span className="pbracket__bye">Bye</span> : null}
      </>
    );
    const key = `${index}:${side.rosterId ?? 'open'}`;
    if (!matchup || !side.rosterId) {
      return <div className={className} key={key}>{body}</div>;
    }
    const rosterId = side.rosterId;
    return (
      <button
        aria-pressed={chosen}
        className={className}
        key={key}
        onClick={() => onPick(matchup.round, matchup.idx, rosterId)}
        type="button"
      >
        {body}
      </button>
    );
  };

  return (
    <div className="pbracket">
      {bracket ? null : (
        <p className="pbracket__note">
          Call every regular-season game to set the seeds. Then pick the bracket here.
        </p>
      )}
      {champion ? (
        <p className="pbracket__champ">
          <span className="predictor__side-label">Champion</span> {champion.teamName}
        </p>
      ) : null}
      <div className="pbracket__scroll">
        <div
          className={['pbracket__rounds', layout.connected ? 'pbracket__rounds--connected' : '']
            .filter(Boolean).join(' ')}
        >
          {layout.rounds.map((round) => (
            <div className="pbracket__round" key={round.round}>
              <p className="pbracket__round-head">
                {bracketRoundLabel(round.round, layout.rounds.length)}
                {round.week != null ? <span className="pbracket__round-week">Week {round.week}</span> : null}
              </p>
              <div className="pbracket__slots">
                {round.slots.map((slot) => (
                  <div className="pbracket__slot" key={slot.position}>
                    <div
                      className={[
                        'pbracket__card',
                        slot.kind === 'bye' ? 'pbracket__card--bye' : '',
                        slot.matchup ? 'pbracket__card--open' : '',
                      ].filter(Boolean).join(' ')}
                    >
                      {slot.sides.map((side, index) => row(slot, side, round.week, index))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
