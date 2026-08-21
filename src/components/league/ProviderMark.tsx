import { useState } from 'react';
import './ProviderMark.css';

const SRC: Record<string, string> = {
  sleeper: '/brand/sleeper-logo.png',
  espn: '/brand/espn-logo.png',
};

const NAME: Record<string, string> = {
  sleeper: 'Sleeper',
  espn: 'ESPN',
};

/**
 * A provider's wordmark, which must survive its own image not loading.
 *
 * The connect screen put the entire identity of each row in one <img>. When
 * those images failed, the screen degraded to two identical buttons reading
 * "Connect" next to a broken-image glyph, with nothing to say which was
 * Sleeper and which was ESPN. That is the whole screen: it is the front door,
 * and there is no tab bar behind it to escape to.
 *
 * The images were served fine and decoded fine, which points at the client
 * rather than the file, and the likeliest systematic cause on mobile is a
 * content blocker matching the path. That is a hypothesis. The fallback is
 * not: whatever eats the image, the row still says who it is.
 */
export function ProviderMark({
  provider,
  className = '',
}: {
  provider: 'sleeper' | 'espn';
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const name = NAME[provider] ?? provider;

  if (failed) {
    return (
      <span className={['provider-mark', `provider-mark--${provider}`, className].filter(Boolean).join(' ')}>
        {name}
      </span>
    );
  }

  return (
    <img
      alt={name}
      className={className}
      onError={() => setFailed(true)}
      src={SRC[provider]}
    />
  );
}
