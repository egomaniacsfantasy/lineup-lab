import type { Player } from '../types';
import { playerFromManifest } from '../data/playerManifest';

function teamLogo(team: string) {
  return `https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/${team.toLowerCase()}.png&w=56`;
}

export const MOCK_PLAYERS: Record<string, Player> = {
  adams: playerFromManifest('adams-01', {
    bye: 10,
    teamLogoUrl: teamLogo('lv'),
  }),
  waddle: playerFromManifest('waddle-01', {
    bye: 6,
    teamLogoUrl: teamLogo('mia'),
  }),
  mahomes: playerFromManifest('mahomes-01', {
    bye: 6,
    teamLogoUrl: teamLogo('kc'),
  }),
  henry: playerFromManifest('henry-01', {
    bye: 14,
    teamLogoUrl: teamLogo('bal'),
  }),
  mclaurin: playerFromManifest('mclaurin-01', {
    bye: 14,
    teamLogoUrl: teamLogo('wsh'),
  }),
  kirk: playerFromManifest('kirk-01', {
    bye: 12,
    teamLogoUrl: teamLogo('jax'),
  }),
  kelce: playerFromManifest('kelce-01', {
    bye: 6,
    teamLogoUrl: teamLogo('kc'),
  }),
  tucker: playerFromManifest('tucker-01', {
    bye: 14,
    teamLogoUrl: teamLogo('bal'),
  }),
  sf_def: playerFromManifest('sf-def-01', {
    bye: 9,
    teamLogoUrl: teamLogo('sf'),
  }),
  robinson: playerFromManifest('robinson-01', {
    bye: 12,
    teamLogoUrl: teamLogo('atl'),
  }),
  jefferson: playerFromManifest('jefferson-01', {
    bye: 6,
    teamLogoUrl: teamLogo('min'),
  }),
  chase: playerFromManifest('chase-01', {
    bye: 12,
    teamLogoUrl: teamLogo('cin'),
  }),
  pollard: playerFromManifest('pollard-01', {
    bye: 5,
    teamLogoUrl: teamLogo('ten'),
  }),
  prescott: playerFromManifest('prescott-01', {
    bye: 7,
    teamLogoUrl: teamLogo('dal'),
  }),
  goedert: playerFromManifest('goedert-01', {
    bye: 5,
    teamLogoUrl: teamLogo('phi'),
  }),
  bass: playerFromManifest('bass-01', {
    bye: 12,
    teamLogoUrl: teamLogo('buf'),
  }),
  dal_def: playerFromManifest('dal-def-01', {
    bye: 7,
    teamLogoUrl: teamLogo('dal'),
  }),
  smith: playerFromManifest('smith-01', {
    bye: 5,
    teamLogoUrl: teamLogo('phi'),
  }),
  allen: playerFromManifest('allen-01', {
    bye: 12,
    teamLogoUrl: teamLogo('buf'),
  }),
  barkley: playerFromManifest('barkley-01', {
    bye: 5,
    teamLogoUrl: teamLogo('phi'),
  }),
};
