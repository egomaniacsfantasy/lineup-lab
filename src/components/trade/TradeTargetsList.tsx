import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { TradeTargetGroup } from '../../mocks/tradeTargets';
import { TradeTargetCard } from './TradeTargetCard';
import './TradeTargetsList.css';

interface TradeTargetsListProps {
  groups: TradeTargetGroup[];
}

export function TradeTargetsList({ groups }: TradeTargetsListProps) {
  const location = useLocation();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const sortedGroups = useMemo(
    () =>
      groups.map((group) => ({
        ...group,
        targets: [...group.targets].sort((targetA, targetB) => targetB.fitScore - targetA.fitScore),
      })),
    [groups],
  );

  useEffect(() => {
    const hash = location.hash.replace('#', '');

    if (!hash.startsWith('trade-target-')) {
      return;
    }

    const targetId = hash.replace('trade-target-', '');
    const expandTimer = window.setTimeout(() => {
      setExpandedId(targetId);
    }, 0);

    window.requestAnimationFrame(() => {
      document.getElementById(hash)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });

    return () => {
      window.clearTimeout(expandTimer);
    };
  }, [location.hash]);

  return (
    <section aria-labelledby="trade-targets-list-title" className="trade-targets-list">
      <div className="trade-targets-list__header">
        <p className="trade-targets-list__kicker">Trade targets</p>
        <h2 className="trade-targets-list__title" id="trade-targets-list-title">
          Players available from teams that need what you have
        </h2>
      </div>

      <div className="trade-targets-list__needs">
        <p className="trade-targets-list__needs-label">Your needs</p>
        <div className="trade-targets-list__needs-list">
          {sortedGroups.map((group) => (
            <div className="trade-targets-list__need" key={group.userNeed.position}>
              <span
                className={[
                  'trade-targets-list__need-dot',
                  `trade-targets-list__need-dot--${group.userNeed.severity}`,
                ].join(' ')}
              />
              <span className="trade-targets-list__need-position">{group.userNeed.position}</span>
              <span className="trade-targets-list__need-summary">{group.userNeed.summary}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="trade-targets-list__groups">
        {sortedGroups.map((group) => (
          <section className="trade-targets-list__group" key={group.userNeed.position}>
            <div className="trade-targets-list__group-header">
              <p className="trade-targets-list__group-kicker">{group.userNeed.position} targets</p>
            </div>

            <div className="trade-targets-list__group-list">
              {group.targets.map((target, index) => (
                <TradeTargetCard
                  isExpanded={expandedId === target.id}
                  isPrimary={index === 0}
                  key={target.id}
                  onToggle={() =>
                    setExpandedId((current) => (current === target.id ? null : target.id))
                  }
                  showLaunchNote
                  target={target}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
