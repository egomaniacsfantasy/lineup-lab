/**
 * Which trades the rail shows, and what "refresh" means for them.
 *
 * The rail has room for a few ideas and the engine usually produces more than
 * that, so the ones past the cut were unreachable: the widget looked like it
 * had three suggestions when it had eight. Refresh turns the pool over a page
 * at a time.
 *
 * Pages, not single steps. Advancing by one would leave two of the three
 * trades sitting exactly where they were, which is the thing a refresh button
 * must never do — you press it because you did not want what you were looking
 * at, and being shown most of it again reads as a broken control rather than
 * as a short list.
 */

/** A page of trades, and whether pressing refresh again can show anything new. */
export interface TradePage<T> {
  visible: T[];
  /** The page actually used. Wraps, so it never runs off the end of the pool. */
  page: number;
  /** How many pages the pool divides into. */
  pages: number;
  /**
   * True when the pool is small enough that every page is the same page.
   * The caller uses this to decide whether refresh can rotate locally or has
   * to go and ask the engine for a fresh pool.
   */
  exhausted: boolean;
}

export function tradePage<T>(pool: readonly T[], page: number, size = 3): TradePage<T> {
  if (size <= 0 || pool.length === 0) {
    return { visible: [], page: 0, pages: 0, exhausted: true };
  }

  const pages = Math.ceil(pool.length / size);
  /* Wrap rather than clamp: pressing refresh past the end returns to the top
     of the list, which is a rotation. Clamping would leave the button looking
     alive while the rail stopped changing. */
  const wrapped = ((page % pages) + pages) % pages;
  const start = wrapped * size;

  return {
    visible: pool.slice(start, start + size),
    page: wrapped,
    pages,
    exhausted: pages <= 1,
  };
}

/**
 * Did the rail actually change?
 *
 * Used to decide whether a refresh needs to fall through to the engine. Keys
 * rather than objects because the pool is rebuilt on every reprice, so the
 * same trade is a different object each time and identity would report a
 * change that the reader cannot see.
 */
export function sameTrades(before: readonly string[], after: readonly string[]) {
  if (before.length !== after.length) return false;
  return before.every((key, index) => key === after[index]);
}
