export interface ParsedEspnLeagueInput {
  leagueId: string;
  season: string;
}

export interface ParsedEspnSession {
  creds: { espnS2: string; swid: string } | null;
  missing: string[];
}

export function parseEspnLeagueInput(raw: string): ParsedEspnLeagueInput;
export function parseEspnLeagueId(raw: string): string;
export function parseEspnSessionPaste(raw: string): ParsedEspnSession;
export function parseEspnCookiePaste(raw: string): { espnS2: string; swid: string } | null;
export function espnSessionPasteError(missing?: string[]): string | null;
export const espnLoginEnabled: boolean;
