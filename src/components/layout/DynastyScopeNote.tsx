import './DynastyScopeNote.css';

/**
 * What this product is not, yet, in a dynasty or keeper league.
 *
 * The same claim the app shell makes, said on the screens that sit ABOVE the
 * shell. The phone gate and the landing page both render before the shell
 * exists, so a dynasty manager peeking at their league from an advert saw
 * trade and ranking claims that do not apply to their league, with nothing on
 * screen saying so. That is the one audience most likely to conclude the
 * product is broken rather than early.
 *
 * Shorter than the shell's version on purpose: this sits under a number
 * somebody is still reading, not above a product they are already using.
 */
export function DynastyScopeNote({
  leagueType,
}: {
  leagueType: 'redraft' | 'keeper' | 'dynasty';
}) {
  if (leagueType !== 'dynasty' && leagueType !== 'keeper') return null;

  return (
    <p className="dynasty-scope" role="note">
      <strong>{leagueType === 'dynasty' ? 'Dynasty' : 'Keeper'} league.</strong> Trade
      pricing is off until the engine can value picks and future seasons, and every
      player value here is for this season alone.
    </p>
  );
}
