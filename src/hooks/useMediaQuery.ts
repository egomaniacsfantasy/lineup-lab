import { useSyncExternalStore } from 'react';

function getInitialMatch(query: string) {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.matchMedia(query).matches;
}

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === 'undefined') {
        return () => {};
      }

      const mediaQueryList = window.matchMedia(query);
      mediaQueryList.addEventListener('change', onStoreChange);

      return () => {
        mediaQueryList.removeEventListener('change', onStoreChange);
      };
    },
    () => getInitialMatch(query),
    () => false,
  );
}
