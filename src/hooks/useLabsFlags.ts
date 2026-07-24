import { useEffect, useState } from 'react';

const LABS_EVENT = 'og:labs-flags';
const DYNASTY_TRADES_KEY = 'og.labs.dynasty-trades-experimental';
const PLAYER_VOTES_KEY = 'og.labs.player-votes';

function acceptanceKey(leagueId: string) {
  return `og.scouting.acceptance.${leagueId}`;
}

function parseBoolean(value: string | null, fallback: boolean) {
  if (value == null) return fallback;
  return value !== '0';
}

function emitFlagChange(key: string, value: boolean) {
  window.dispatchEvent(new CustomEvent(LABS_EVENT, { detail: { key, value } }));
}

export function readDynastyTradesExperimental() {
  try {
    return parseBoolean(window.localStorage.getItem(DYNASTY_TRADES_KEY), true);
  } catch {
    return true;
  }
}

export function readPlayerVotesEnabled() {
  try {
    return parseBoolean(window.localStorage.getItem(PLAYER_VOTES_KEY), false);
  } catch {
    return false;
  }
}

export function writePlayerVotesEnabled(value: boolean) {
  try {
    window.localStorage.setItem(PLAYER_VOTES_KEY, value ? '1' : '0');
  } catch {
    // ignore storage failures
  }
  emitFlagChange(PLAYER_VOTES_KEY, value);
}

export function writeDynastyTradesExperimental(value: boolean) {
  try {
    window.localStorage.setItem(DYNASTY_TRADES_KEY, value ? '1' : '0');
  } catch {
    // ignore storage failures
  }
  emitFlagChange(DYNASTY_TRADES_KEY, value);
}

export function readScoutingAffectsAcceptance(leagueId: string | null | undefined) {
  if (!leagueId) return true;
  try {
    return parseBoolean(window.localStorage.getItem(acceptanceKey(leagueId)), true);
  } catch {
    return true;
  }
}

export function writeScoutingAffectsAcceptance(
  leagueId: string | null | undefined,
  value: boolean,
) {
  if (!leagueId) return;
  const key = acceptanceKey(leagueId);
  try {
    window.localStorage.setItem(key, value ? '1' : '0');
  } catch {
    // ignore storage failures
  }
  emitFlagChange(key, value);
}

function useFlagValue(key: string, initial: boolean) {
  const [value, setValue] = useState(initial);

  useEffect(() => {
    setValue(initial);
  }, [initial, key]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== key) return;
      setValue(parseBoolean(event.newValue, initial));
    };
    const handleFlag = (event: Event) => {
      const detail = (event as CustomEvent<{ key?: string; value?: boolean }>).detail;
      if (detail?.key !== key || typeof detail.value !== 'boolean') return;
      setValue(detail.value);
    };
    window.addEventListener('storage', handleStorage);
    window.addEventListener(LABS_EVENT, handleFlag);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(LABS_EVENT, handleFlag);
    };
  }, [initial, key]);

  return [value, setValue] as const;
}

export function useDynastyTradesExperimental() {
  const [value] = useFlagValue(DYNASTY_TRADES_KEY, readDynastyTradesExperimental());
  return value;
}

export function usePlayerVotesEnabled() {
  const [value] = useFlagValue(PLAYER_VOTES_KEY, readPlayerVotesEnabled());
  return value;
}

export function useScoutingAffectsAcceptance(leagueId: string | null | undefined) {
  const key = leagueId ? acceptanceKey(leagueId) : 'og.scouting.acceptance';
  const [value] = useFlagValue(key, readScoutingAffectsAcceptance(leagueId));
  return value;
}
