import { useEffect, useRef, type ReactNode } from 'react';
import { DynastyNotice } from './DynastyNotice';
import { StaleSeasonNotice } from './StaleSeasonNotice';
import './ShellNotices.css';

/**
 * The one fixed strip under the header, and the only thing that measures it.
 *
 * There are two notices that describe the whole app rather than one page, and
 * they can both be true at once: a dynasty league whose season has also rolled
 * over. Left to themselves they were two independently fixed bars at the same
 * offset, which is one bar covering the other.
 *
 * So they stack in here, and the measuring happens once, on the stack. One
 * number goes out: --shell-notice-height, how tall the stack is, so
 * .app-content can pad itself and nothing renders underneath it.
 *
 * That padding is the whole mechanism, and it is enough. A page's own sticky
 * bars measure their offset from the SCROLLPORT'S CONTENT BOX, and the
 * scrollport is .app-content, so once it is padded by this height, `top: 0`
 * on a page bar already means "just below whatever is fixed above me". An
 * earlier version also published the stack's bottom edge for those bars to
 * offset against, which double-counted padding that was already applied and
 * left a band of empty page under the notice.
 *
 * Measured rather than assumed: a notice wraps to two lines on a narrow
 * window and to one on a wide one. It is 0px when the stack is empty, so
 * every consumer's fallback is the behaviour it had before any of this.
 */
export function ShellNotices() {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    const root = document.documentElement;
    if (!node) return undefined;

    const publish = () => {
      const rect = node.getBoundingClientRect();
      /* An empty stack still has a box. Reading its height rather than its
         child count keeps this honest when a notice renders null. */
      root.style.setProperty('--shell-notice-height', `${Math.ceil(rect.height)}px`);
    };

    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(node);
    return () => {
      observer.disconnect();
      root.style.setProperty('--shell-notice-height', '0px');
    };
  }, []);

  return (
    <div className="shell-notices" ref={ref}>
      <StaleSeasonNotice />
      <DynastyNotice />
    </div>
  );
}

/** Shared shell for one notice, so the two cannot drift apart visually. */
export function ShellNotice({
  children,
  onDismiss,
  tone,
  role = 'status',
}: {
  children: ReactNode;
  onDismiss?: () => void;
  /** alert is red and stays; note is amber and can be put away. */
  tone: 'alert' | 'note';
  role?: 'alert' | 'status';
}) {
  return (
    <aside className={`shell-notice shell-notice--${tone}`} role={role}>
      <span className="shell-notice__body">{children}</span>
      {onDismiss ? (
        <button
          aria-label="Dismiss"
          className="shell-notice__dismiss"
          onClick={onDismiss}
          type="button"
        >
          ×
        </button>
      ) : null}
    </aside>
  );
}
