import { useEffect, useMemo, useState } from 'react';
import { PlayerHeadshot } from '../player/PlayerHeadshot';
import { fetchBoard, type BoardRow } from '../../services/leagueApi';
import { useLeagueConnection } from '../../contexts/LeagueConnectionContext';
import {
  comparisonsFromOrder,
  markPromptShown,
  pickVoteTrio,
  queueVote,
  readVoteState,
  snoozeVotes,
  type VoteTrio,
} from '../../utils/playerVotes';
import './PlayerVotePrompt.css';

/**
 * Crowdsourced ranking prompt.
 *
 * Two taps: best of three, then worst of the remaining two. That is a full
 * ordering, and a full ordering is three pairwise comparisons, which is what
 * a rating system consumes. Franco's numbers are deliberately NOT shown while
 * voting: showing them would anchor the answer to the model we are trying to
 * get an independent read on.
 */
export function PlayerVotePrompt({
  onClose,
  open,
}: {
  onClose: () => void;
  open: boolean;
}) {
  const { bootstrap, stored } = useLeagueConnection();
  const [board, setBoard] = useState<BoardRow[] | null>(null);
  const [trio, setTrio] = useState<VoteTrio | null>(null);
  const [best, setBest] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [submittedCount, setSubmittedCount] = useState(() => readVoteState().submitted ?? 0);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (!open || board) return;
    let cancelled = false;
    fetchBoard(300, bootstrap?.league.scoringFamily)
      .then((payload) => {
        if (cancelled || !payload.available) return;
        setBoard(payload.rankings ?? []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, board, bootstrap?.league.scoringFamily]);

  useEffect(() => {
    if (!open || !board || trio) return;
    setTrio(pickVoteTrio(board));
    setStartedAt(Date.now());
  }, [open, board, trio]);

  useEffect(() => {
    if (open) markPromptShown();
  }, [open]);

  const superflex = useMemo(() => {
    const slots = bootstrap?.league.rosterPositions ?? [];
    return slots.some((slot) => slot === 'SUPER_FLEX' || slot === 'SUPERFLEX' || slot === 'QB/RB/WR/TE');
  }, [bootstrap?.league.rosterPositions]);

  if (!open) return null;

  const remaining = trio ? trio.players.filter((row) => row.playerId !== best) : [];

  const submit = (worstId: string) => {
    if (!trio || !best) return;
    const middle = remaining.find((row) => row.playerId !== worstId);
    const ordered = [best, middle?.playerId ?? worstId, worstId];
    queueVote({
      submittedAt: Date.now(),
      trio: trio.players.map((row) => row.playerId),
      ordered,
      comparisons: comparisonsFromOrder(ordered),
      context: {
        leagueId: stored?.leagueId ?? null,
        scoring: bootstrap?.league.scoringFamily ?? null,
        superflex,
        teams: bootstrap?.league.totalTeams ?? null,
      },
      attentionCheck: {
        present: trio.attentionCheck,
        passed: trio.attentionCheck ? trio.expectedTop === best : null,
      },
      msToAnswer: Date.now() - startedAt,
    });
    setSubmittedCount((current) => current + 1);
    setFlash(true);
    window.setTimeout(() => setFlash(false), 260);
    setBest(null);
    setTrio(board ? pickVoteTrio(board) : null);
    setStartedAt(Date.now());
  };

  const stage = best ? 'worst' : 'best';

  return (
    <div className="vote-prompt__scrim" role="presentation" onClick={onClose}>
      <section
        aria-labelledby="vote-prompt-title"
        aria-modal="true"
        className="vote-prompt"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="vote-prompt__head">
          <div>
            <p className="vote-prompt__eyebrow">Rank three</p>
            <h2 className="vote-prompt__title" id="vote-prompt-title">
              {stage === 'best' ? 'Who would you rather have?' : 'And who would you drop first?'}
            </h2>
          </div>
          <button aria-label="Close" className="vote-prompt__close" onClick={onClose} type="button">
            ×
          </button>
        </header>

        <p className="vote-prompt__hint">
          {stage === 'best'
            ? 'Rest of season, any league. Two taps and you are done.'
            : 'Last one. Pick the player you would move on from.'}
        </p>

        {trio ? (
          <div className={['vote-prompt__cards', flash ? 'vote-prompt__cards--flash' : ''].filter(Boolean).join(' ')}>
            {(stage === 'best' ? trio.players : remaining).map((row) => (
              <button
                className="vote-prompt__card"
                key={row.playerId}
                onClick={() => (stage === 'best' ? setBest(row.playerId) : submit(row.playerId))}
                type="button"
              >
                <PlayerHeadshot
                  className="vote-prompt__shot"
                  fallbackClassName="vote-prompt__shot-fallback"
                  imageClassName="vote-prompt__shot-image"
                  name={row.name}
                  position={row.position}
                  slug={row.playerId}
                />
                <span className="vote-prompt__name">{row.name}</span>
                <span className="vote-prompt__meta">
                  {row.position} · {row.team || 'FA'}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="vote-prompt__loading">Pulling three players…</p>
        )}

        <footer className="vote-prompt__foot">
          <span className="vote-prompt__count">
            {submittedCount > 0
              ? `${submittedCount} ${submittedCount === 1 ? 'call' : 'calls'} banked`
              : 'Your calls feed the community board.'}
          </span>
          <div className="vote-prompt__foot-actions">
            {best ? (
              <button className="vote-prompt__text-btn" onClick={() => setBest(null)} type="button">
                Back
              </button>
            ) : null}
            <button
              className="vote-prompt__text-btn"
              onClick={() => {
                snoozeVotes(7);
                onClose();
              }}
              type="button"
            >
              Not now
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
