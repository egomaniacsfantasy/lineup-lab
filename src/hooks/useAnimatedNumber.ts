import { useCallback, useEffect, useRef, useState } from 'react';

interface UseAnimatedNumberOptions {
  duration?: number;
  decimals?: number;
  prefix?: string;
  formatter?: (n: number) => string;
}

function easeOutCubic(progress: number) {
  return 1 - Math.pow(1 - progress, 3);
}

export function useAnimatedNumber(
  target: number,
  options: UseAnimatedNumberOptions = {},
): string {
  const {
    duration = 400,
    decimals = 1,
    prefix = '',
    formatter,
  } = options;

  const animationFrameRef = useRef<number | null>(null);
  const currentValueRef = useRef(target);
  const prefersReducedMotionRef = useRef(false);

  const formatValue = useCallback((value: number) => {
    if (formatter) {
      return formatter(value);
    }

    return `${prefix}${value.toFixed(decimals)}`;
  }, [decimals, formatter, prefix]);

  const [displayValue, setDisplayValue] = useState(() => formatValue(target));

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const mediaQueryList = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncPreference = () => {
      prefersReducedMotionRef.current = mediaQueryList.matches;
    };

    syncPreference();
    mediaQueryList.addEventListener('change', syncPreference);

    return () => {
      mediaQueryList.removeEventListener('change', syncPreference);
    };
  }, []);

  useEffect(() => {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
    }

    const from = currentValueRef.current;
    const to = target;

    if (from === to || duration <= 0 || prefersReducedMotionRef.current) {
      currentValueRef.current = to;
      animationFrameRef.current = window.requestAnimationFrame(() => {
        setDisplayValue(formatValue(to));
        animationFrameRef.current = null;
      });

      return () => {
        if (animationFrameRef.current !== null) {
          window.cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
      };
    }

    const startedAt = performance.now();

    const tick = (timestamp: number) => {
      const progress = Math.min(1, (timestamp - startedAt) / duration);
      const easedProgress = easeOutCubic(progress);
      const nextValue = from + (to - from) * easedProgress;

      currentValueRef.current = nextValue;
      setDisplayValue(formatValue(nextValue));

      if (progress < 1) {
        animationFrameRef.current = window.requestAnimationFrame(tick);
        return;
      }

      currentValueRef.current = to;
      setDisplayValue(formatValue(to));
      animationFrameRef.current = null;
    };

    animationFrameRef.current = window.requestAnimationFrame(tick);

    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [target, duration, formatValue]);

  return displayValue;
}
