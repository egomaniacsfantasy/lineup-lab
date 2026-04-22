import type { Player } from '../types';
import { PLAYER_MANIFEST, playerFromManifest } from '../data/playerManifest';

export const MOCK_PLAYERS: Record<string, Player> = {
  mahomes: playerFromManifest('p-mahomes'),
  lamar: playerFromManifest('l-jackson'),
  allen: playerFromManifest('j-allen'),
  burrow: playerFromManifest('j-burrow'),
  barkley: playerFromManifest('s-barkley'),
  henry: playerFromManifest('d-henry'),
  robinson: playerFromManifest('b-robinson'),
  gibbs: playerFromManifest('j-gibbs'),
  jacobs: playerFromManifest('j-jacobs'),
  jefferson: playerFromManifest('j-jefferson'),
  chase: playerFromManifest('j-chase'),
  lamb: playerFromManifest('c-lamb'),
  stbrown: playerFromManifest('a-stbrown'),
  nacua: playerFromManifest('p-nacua'),
  london: playerFromManifest('d-london'),
  mclaurin: playerFromManifest('t-mclaurin'),
  smith: playerFromManifest('d-smith'),
  kelce: playerFromManifest('t-kelce'),
  bowers: playerFromManifest('b-bowers'),
  mcbride: playerFromManifest('t-mcbride'),
  aubrey: playerFromManifest('b-aubrey'),
  fairbairn: playerFromManifest('k-fairbairn'),
  phi_def: playerFromManifest('phi-def'),
  sf_def: playerFromManifest('sf-def'),
  min_def: playerFromManifest('min-def'),
};

export const MOCK_PLAYER_POOL = Object.keys(PLAYER_MANIFEST).map((slug) =>
  playerFromManifest(slug as keyof typeof PLAYER_MANIFEST),
);
