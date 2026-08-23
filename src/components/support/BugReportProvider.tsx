/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { BugReportDialog } from './BugReportDialog';

interface BugReportValue {
  /** `prefill` seeds the description — used when a crash already knows what broke. */
  open: (prefill?: string) => void;
}

const BugReportContext = createContext<BugReportValue | null>(null);

/**
 * Hosts the report dialog once, at the top of the tree, so anything below can
 * open it: the account menu, an empty state that knows it should not be empty,
 * or the error boundary after a crash.
 */
export function BugReportProvider({ children }: { children: ReactNode }) {
  const [prefill, setPrefill] = useState<string | null>(null);

  const open = useCallback((seed?: string) => setPrefill(seed ?? ''), []);
  const value = useMemo<BugReportValue>(() => ({ open }), [open]);

  return (
    <BugReportContext.Provider value={value}>
      {children}
      {prefill !== null ? (
        <BugReportDialog onClose={() => setPrefill(null)} prefill={prefill} />
      ) : null}
    </BugReportContext.Provider>
  );
}

/**
 * Returns a no-op opener outside the provider rather than throwing. A missing
 * provider should not be able to crash the app on the way to reporting a
 * crash — that failure mode would be silent and self-defeating.
 */
export function useBugReport(): BugReportValue {
  return useContext(BugReportContext) ?? { open: () => undefined };
}
