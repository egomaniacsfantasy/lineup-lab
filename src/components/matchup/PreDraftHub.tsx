import { Link } from 'react-router-dom';
import type { LeagueBootstrap } from '../../services/leagueApi';
import { PROVIDER_LABEL, type FantasyProvider } from '../../utils/provider';
import { formatDraftTime } from '../../utils/preDraft';
import './PreDraftHub.css';

const SCORING_LABEL: Record<string, string> = {
  ppr: 'PPR',
  'half-ppr': 'Half PPR',
  standard: 'Standard',
};

/**
 * The Hub before a draft.
 *
 * Everything the Hub normally says is derived from a roster, so with twelve
 * empty teams the page was answering questions nobody had asked: a 50/50 line
 * against an opponent with no players, "no bench options this week" for a
 * bench that does not exist yet, and a waiver claim worth +48.5% because every
 * player alive is a free agent. A price on nothing is not a small price. It is
 * not a price.
 *
 * So this screen says the one thing that is true and stops. The league facts
 * here — who is in it, how it scores, when it drafts — are read straight off
 * the provider and do not depend on a single roster being filled.
 */
/* What each tab has to say for itself before a draft. The Hub is the only one
   that leads with the team, because the Hub is the team; League and Trades are
   both looking at a league that has not happened yet. */
const SCOPE_COPY: Record<PreDraftScope, { copy: string; footnote: string }> = {
  hub: {
    copy: 'Every roster in this league is empty, so there is no lineup to weigh and nothing to price. The book opens when the draft does.',
    footnote:
      'Your board is live now. It is the one thing here that does not need a roster, and everything else fills in the moment you draft.',
  },
  league: {
    copy: 'Nobody has played a game, so every team is 0-0 and every price is the same +100. There is no board to read until there are results to read it from.',
    footnote: 'Standings, futures and the weekly slate all arrive with the first snap.',
  },
  trades: {
    copy: 'Nobody owns a player yet, so there is nothing to offer and nobody to offer it to. Trades open when rosters do.',
    footnote: 'Until then, your board is where the work happens.',
  },
};

export type PreDraftScope = 'hub' | 'league' | 'trades';

export function PreDraftHub({
  bootstrap,
  provider,
  officialUrl,
  scope = 'hub',
}: {
  bootstrap: LeagueBootstrap;
  provider: FantasyProvider;
  officialUrl: string | null;
  scope?: PreDraftScope;
}) {
  const userTeam = bootstrap.teams.find((team) => team.isUser) ?? null;
  const draftTime = formatDraftTime(bootstrap.league.draftAt);
  const scoring = SCORING_LABEL[bootstrap.league.scoringFamily] ?? bootstrap.league.scoringFamily;
  const { copy, footnote } = SCOPE_COPY[scope];

  return (
    <div className="matchup-page pre-draft">
      <h1 className="visually-hidden">Matchup</h1>

      <section className="pre-draft__card">
        <p className="pre-draft__eyebrow">Not drafted yet</p>
        <h2 className="pre-draft__headline">
          {scope === 'hub' && userTeam ? userTeam.teamName : bootstrap.league.name}
        </h2>
        <p className="pre-draft__league">
          {PROVIDER_LABEL[provider]} · {bootstrap.league.totalTeams} teams · {scoring}
        </p>

        <p className="pre-draft__copy">{copy}</p>

        {draftTime ? (
          <div className="pre-draft__draft">
            <span className="pre-draft__draft-label">Draft</span>
            <span className="pre-draft__draft-value">{draftTime}</span>
          </div>
        ) : null}

        <div className="pre-draft__actions">
          <Link className="pre-draft__action" to="/rankings">
            Open your board
          </Link>
          {officialUrl ? (
            <a
              className="pre-draft__action pre-draft__action--quiet"
              href={officialUrl}
              rel="noreferrer"
              target="_blank"
            >
              Open in {PROVIDER_LABEL[provider]} ↗︎
            </a>
          ) : null}
        </div>
      </section>

      <p className="pre-draft__footnote">{footnote}</p>
    </div>
  );
}
