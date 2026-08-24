import { NO_RECORD_YET, type LeagueRecord } from '../../utils/leagueRecords';
import './LeagueRecords.css';

/**
 * The record book, written in prices.
 *
 * Every league already knows its high score. What none of them has is "the
 * longest shot that ever came in" or "the worst beat anybody has taken",
 * because those only exist for someone who kept what they quoted.
 *
 * Records with no holder still render, named and empty. Hiding them would make
 * the book appear from nowhere mid-season; showing them says what the book is
 * and that it starts now. Andre confirmed that is the behaviour he wants over
 * backfilling anything from before we were pricing.
 */
export function LeagueRecords({ records }: { records: LeagueRecord[] }) {
  /* Keyed on what is still UNHELD, not on what is held. A book where the high
     score has a holder and both priced records do not is still a book that is
     starting, and claiming "every record here is measured against a price"
     while two of three are blank is a small lie the reader can see. */
  const unheld = records.filter((record) => record.holder == null).length;

  return (
    <section aria-labelledby="league-records-title" className="league-records">
      <header className="league-records__head">
        <p className="league-records__kicker">The book</p>
        <h2 className="league-records__title" id="league-records-title">
          League records
        </h2>
        <p className="league-records__note">
          {unheld > 0
            ? 'Records start when we start pricing a league and grow from there. Nothing here is backfilled.'
            : 'Every record here is measured against a price we posted before the games were played.'}
        </p>
      </header>

      <div className="league-records__grid">
        {records.map((record) => (
          <article
            className={[
              'league-records__card',
              record.holder ? '' : 'league-records__card--empty',
            ].filter(Boolean).join(' ')}
            key={record.id}
          >
            <span className="league-records__label">{record.label}</span>
            <span className="league-records__value">{record.value ?? '—'}</span>
            <span className="league-records__holder">{record.holder ?? NO_RECORD_YET}</span>
            {record.detail ? (
              <span className="league-records__detail">{record.detail}</span>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
