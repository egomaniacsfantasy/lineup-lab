import type { ReactNode } from 'react';
import './SeasonalNotice.css';

interface SeasonalNoticeProps {
  children: ReactNode;
}

export function SeasonalNotice({ children }: SeasonalNoticeProps) {
  return (
    <div className="seasonal-notice" role="status">
      {children}
    </div>
  );
}
