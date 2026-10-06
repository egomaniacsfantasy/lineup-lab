import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

/* State that lives in a query param, so a reload or a shared link lands on
   the same thing, but is HELD locally so a change applies in the same tick.

   React Router applies a navigation inside a transition, and a dialog that
   closes a frame after Escape reads as a dialog that did not close: the
   matchup detail tests check synchronously, and the first version of this,
   which derived the open game straight from the URL, failed them.

   The URL is written from the live location rather than the router's
   functional updater, because a write that fires from a timer (the Board's
   search box) would otherwise carry the params of the render that set the
   timer, and drop whatever was written in between. */
export function useUrlParamState(
  key: string,
): [string | null, (next: string | null) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const fromUrl = searchParams.get(key);
  const [value, setValue] = useState<string | null>(fromUrl);

  /* Back, forward, and a link arriving with the param set. After our own
     write the param already equals the value, so this is a no-op then. */
  useEffect(() => {
    setValue(fromUrl);
  }, [fromUrl]);

  const set = (next: string | null) => {
    setValue(next);
    setSearchParams(() => {
      const params = new URLSearchParams(window.location.search);
      if (next == null || next === '') params.delete(key);
      else params.set(key, next);
      return params;
    }, { replace: true });
  };

  return [value, set];
}
