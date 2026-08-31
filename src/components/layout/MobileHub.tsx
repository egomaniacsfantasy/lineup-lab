import { useMemo, useState } from 'react';
import { useLeagueConnection } from '../../contexts/LeagueConnectionContext';
import { buildPeekMatchup } from '../../hooks/usePeek';
import { switchableLeagues } from '../../utils/leagueSwitcher';
import { NO_VALUE, formatAmericanOdds, formatProbOrOdds, formatProjectionPoints } from '../../utils/formatOdds';
import { DynastyScopeNote } from './DynastyScopeNote';
import { ShareCardPreview } from '../matchup/ShareCardPreview';
import { drawShareCard, type ShareCardLine } from '../../utils/shareCard';
import { TeamAvatar } from '../league/TeamAvatar';
import { SimulationLoader } from '../ui/SimulationLoader';
import { apiUrl, resolveApiUrl } from '../../services/apiBase';
import './MobileHub.css';

/**
 * The Hub, for a phone, for somebody who signed up.
 *
 * The gate turns an anonymous phone away because the desktop layout is a book
 * that does not fit one. That was the whole answer for a while, and it made
 * the funnel end in a wall: create an account on your phone and the next thing
 * you saw was the pitch again.
 *
 * So a signed-in phone gets this. Not the desktop Hub reflowed, and not a
 * placeholder either: the four or five things from that screen worth reading
 * on a phone, and nothing else.
 *
 * WHAT IS DELIBERATELY NOT HERE, and why each one:
 *
 *   Trades to try, and the suggested-trades rail. A trade is a decision you
 *     make with two rosters open. Every version of it on a phone is either a
 *     summary you cannot act on or a table you cannot read.
 *   The start/sit swap. Same shape of problem, and it needs the lineup beside
 *     it to mean anything.
 *   The line-movement chart. A thirty-point sparkline in a 340px column is a
 *     smudge, and the number it is about is already on this screen.
 *   Lineup vs lineup. Eighteen rows of two-column comparison is the single
 *     most desktop-shaped thing in the product.
 *
 * What is here is the book: what this week costs, what the season is worth,
 * and where you sit. Those are the three questions somebody opens the app on
 * a phone to answer, and they are all one number each.
 */
export function MobileHub() {
  const { bootstrap, pricing, stored, leagues, switchLeague, isLoading, error } =
    useLeagueConnection();
  const [sharing, setSharing] = useState(false);
  const [switching, setSwitching] = useState(false);

  /* Everywhere the league name can take you. See switchableLeagues: the
     comparison is by provider AND id, because the two providers mint ids
     independently. */
  const others = switchableLeagues(leagues, stored);

  const rows = useMemo(() => {
    const crests = new Map(
      (bootstrap?.teams ?? []).map((team) => [String(team.rosterId), team.avatarUrl ?? null]),
    );
    return [...(pricing?.futures ?? [])]
      .sort((a, b) => b.titleProb - a.titleProb)
      .map((team) => ({
        rosterId: String(team.rosterId),
        teamName: team.teamName,
        avatarUrl: crests.get(String(team.rosterId)) ?? null,
        isUser: Boolean(team.isUser),
        titleProb: team.titleProb,
        playoffProb: team.playoffProb,
        projRecord:
          team.projRecord
          ?? (team.projWins != null && team.projLosses != null
            ? `${team.projWins.toFixed(1)}-${team.projLosses.toFixed(1)}`
            : null),
        avgSeed: team.avgSeed ?? null,
      }));
  }, [bootstrap, pricing]);

  const you = rows.find((row) => row.isUser) ?? null;
  const game = useMemo(
    () => (bootstrap && pricing && you ? buildPeekMatchup(bootstrap, pricing, you.rosterId) : null),
    [bootstrap, pricing, you],
  );

  if (error && !bootstrap) {
    return (
      <div className="mobile-hub mobile-hub--message">
        <p>{error}</p>
      </div>
    );
  }

  if (!bootstrap || !pricing || !you) {
    return (
      <div className="mobile-hub mobile-hub--message">
        <SimulationLoader
          label={isLoading ? 'Pricing' : 'Loading'}
          messages={['Reading your league...', 'Running the season...', 'Setting the price...']}
          size="compact"
          variant="scan"
        />
      </div>
    );
  }

  const card: ShareCardLine = {
    eyebrow: game ? `Week ${game.week}` : 'The book',
    leagueName: bootstrap.league.name,
    you: you.teamName,
    record: game?.you.record ?? null,
    yourAvatar: resolveApiUrl(you.avatarUrl ?? undefined) ?? null,
    titleOdds: formatProbOrOdds(you.titleProb),
    playoffs: you.playoffProb != null ? `${Math.round(you.playoffProb)}%` : null,
    finish: you.projRecord,
    seed: you.avgSeed != null ? you.avgSeed.toFixed(1) : null,
    standing: { rank: rows.findIndex((row) => row.isUser) + 1, of: rows.length },
    ladder: rows.map((row) => ({ prob: row.titleProb, isUser: row.isUser })),
    starters: (bootstrap.teams ?? [])
      .find((team) => String(team.rosterId) === you.rosterId)
      ?.starters
      .map((id) => bootstrap.players?.[id])
      .filter((player) => player && player.position !== 'DEF' && player.position !== 'K')
      .slice(0, 6)
      .map((player) => ({
        name: player!.name,
        position: player!.position,
        headshotUrl: apiUrl(`/api/img/headshot/${player!.id}`),
      })) ?? [],
    week: game ? `${formatAmericanOdds(game.you.moneyline)} to win this week` : null,
    opponent: game?.them.teamName ?? null,
    opponentAvatar: resolveApiUrl(game?.them.avatarUrl ?? undefined) ?? null,
  };

  return (
    <div className="mobile-hub">
      <header className="mobile-hub__head">
        <img alt="" className="mobile-hub__mark" height={128} src="/og-mark.png" width={128} />
        {/* The league name is the switcher, because it is the only thing on
            this screen that names what you are looking at, and somebody in
            three leagues opening the app on a phone is as likely to want a
            different one as the one they left. Only a control when there is
            somewhere to go: a lone league dressed as a menu is a promise the
            screen cannot keep. */}
        {others.length > 0 ? (
          <button
            aria-expanded={switching}
            aria-haspopup="listbox"
            className="mobile-hub__league mobile-hub__league--switch"
            onClick={() => setSwitching((open) => !open)}
            type="button"
          >
            {bootstrap.league.name}
            <span aria-hidden="true" className="mobile-hub__caret">
              {switching ? '\u25B4' : '\u25BE'}
            </span>
          </button>
        ) : (
          <span className="mobile-hub__league">{bootstrap.league.name}</span>
        )}
      </header>

      {switching ? (
        <ul aria-label="Your leagues" className="mobile-hub__leagues" role="listbox">
          {others.map((entry) => (
            <li key={`${entry.provider}:${entry.leagueId}`}>
              <button
                className="mobile-hub__league-option"
                onClick={() => {
                  setSwitching(false);
                  switchLeague(entry.provider, entry.leagueId);
                }}
                type="button"
              >
                {entry.leagueName ?? entry.leagueId}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <DynastyScopeNote leagueType={bootstrap.league.leagueType} />

      {/* This week, priced. One number each side and the bar underneath. */}
      {game ? (
        <section aria-label={`Week ${game.week}`} className="mobile-hub__game">
          <span className="mobile-hub__week">Week {game.week}</span>
          <div className="mobile-hub__grid">
            {[game.you, game.them].map((side, index) => (
              <div
                className={
                  index === 0 ? 'mobile-hub__side mobile-hub__side--you' : 'mobile-hub__side'
                }
                key={side.teamName + String(index)}
              >
                <TeamAvatar avatarUrl={side.avatarUrl} name={side.teamName} />
                <span className="mobile-hub__side-name">{side.teamName}</span>
                <span className="mobile-hub__side-record">{side.record}</span>
                <span className="mobile-hub__side-price">
                  {game.priced ? formatAmericanOdds(side.moneyline) : NO_VALUE}
                </span>
                <span className="mobile-hub__side-proj">
                  {formatProjectionPoints(side.projection, game.priced)} pts
                </span>
              </div>
            ))}
          </div>
          <div
            aria-label={`Win probability ${game.you.winProbability.toFixed(1)} percent`}
            className="mobile-hub__bar"
            role="img"
          >
            <span
              className="mobile-hub__bar-fill"
              style={{
                width: `${game.priced ? Math.max(2, Math.min(98, game.you.winProbability)) : 0}%`,
              }}
            />
          </div>
          <span className="mobile-hub__bar-label">
            {game.priced ? `${game.you.winProbability.toFixed(1)}% you` : 'Pricing this week now.'}
          </span>
        </section>
      ) : null}

      {/* The season, in one number and the three that qualify it. */}
      <section className="mobile-hub__season" aria-label="Your season">
        <span className="mobile-hub__title-label">To win it all</span>
        <span className="mobile-hub__title-price">{formatProbOrOdds(you.titleProb)}</span>
        <span className="mobile-hub__title-team">{you.teamName}</span>
        <dl className="mobile-hub__stats">
          <div>
            <dt>Make playoffs</dt>
            <dd>{you.playoffProb != null ? `${Math.round(you.playoffProb)}%` : NO_VALUE}</dd>
          </div>
          <div>
            <dt>Projected</dt>
            <dd>{you.projRecord ?? NO_VALUE}</dd>
          </div>
          <div>
            <dt>Average seed</dt>
            <dd>{you.avgSeed != null ? you.avgSeed.toFixed(1) : NO_VALUE}</dd>
          </div>
        </dl>
      </section>

      {/* And where everybody sits. No locks: this is their league now. */}
      <ol className="mobile-hub__table" aria-label="Title odds">
        {rows.map((row, index) => (
          <li
            className={row.isUser ? 'mobile-hub__row mobile-hub__row--you' : 'mobile-hub__row'}
            key={row.rosterId}
          >
            <span className="mobile-hub__rank">{index + 1}</span>
            <TeamAvatar avatarUrl={row.avatarUrl} name={row.teamName} />
            <span className="mobile-hub__row-name">{row.teamName}</span>
            <span className="mobile-hub__row-price">{formatProbOrOdds(row.titleProb)}</span>
          </li>
        ))}
      </ol>

      <button className="mobile-hub__share" onClick={() => setSharing(true)} type="button">
        Share my card
      </button>

      {/* Said once, at the bottom, where somebody who has read the whole screen
          will find it. Above the fold it would read as an apology for the
          screen they are on. */}
      <p className="mobile-hub__desktop-note">
        This is the short version. Trades, the predictor, the bet slip and the
        full board open on a laptop at oddsgods.net.
      </p>

      {sharing ? (
        <ShareCardPreview
          draw={(options) => drawShareCard(card, options)}
          message={`${you.teamName} is ${formatProbOrOdds(you.titleProb)} to win ${bootstrap.league.name}.`}
          onClose={() => setSharing(false)}
        />
      ) : null}

      <span className="mobile-hub__stamp">{stored?.username ? `@${stored.username}` : ''}</span>
    </div>
  );
}
