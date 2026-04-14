import { useEffect, useRef } from 'react';
import './AmbientCanvas.css';

const FLOATING_MARKS = [
  '-220',
  '+180',
  '68.8%',
  'PPR',
  'Spread',
  'O/U',
  'Δ',
  'Σ',
  '·',
  'WR',
  'RB1',
];

type Particle = {
  text: string;
  x: number;
  y: number;
  driftX: number;
  driftY: number;
  size: number;
  ttl: number;
  age: number;
  alpha: number;
  font: 'mono' | 'serif';
};

type CanvasPalette = {
  fillPrimary: string;
  fillSecondary: string;
  fontMono: string;
  fontSerif: string;
};

function readPalette(): CanvasPalette {
  const styles = getComputedStyle(document.documentElement);

  return {
    fillPrimary: styles.getPropertyValue('--text-soft').trim(),
    fillSecondary: styles.getPropertyValue('--text-muted').trim(),
    fontMono: styles.getPropertyValue('--font-mono').trim(),
    fontSerif: styles.getPropertyValue('--font-serif').trim(),
  };
}

export function AmbientCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return undefined;
    }

    const context = canvas.getContext('2d');

    if (!context) {
      return undefined;
    }

    let frameId = 0;
    let width = window.innerWidth;
    let height = window.innerHeight;
    let devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    let palette = readPalette();
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    if (prefersReducedMotion.matches) {
      context.clearRect(0, 0, width, height);
      return undefined;
    }

    const createParticle = (spawnFromBottom = false): Particle => {
      const ttl = 240 + Math.random() * 240;

      return {
        text: FLOATING_MARKS[Math.floor(Math.random() * FLOATING_MARKS.length)],
        x: Math.random() * width,
        y: spawnFromBottom ? height + Math.random() * 160 : Math.random() * height,
        driftX: (Math.random() - 0.5) * 0.12,
        driftY: 0.08 + Math.random() * 0.12,
        size: 10 + Math.random() * 4,
        ttl,
        age: Math.random() * ttl,
        alpha: 0.025 + Math.random() * 0.02,
        font: 'mono',
      };
    };

    const particles = Array.from({ length: 8 }, () => createParticle());

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * devicePixelRatio);
      canvas.height = Math.floor(height * devicePixelRatio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      context.textBaseline = 'top';
    };

    const themeObserver = new MutationObserver(() => {
      palette = readPalette();
    });

    const draw = () => {
      context.clearRect(0, 0, width, height);

      particles.forEach((particle, index) => {
        particle.age += 1;
        particle.y -= particle.driftY;
        particle.x += particle.driftX;

        const progress = particle.age / particle.ttl;
        const fade =
          progress < 0.18
            ? progress / 0.18
            : progress > 0.82
              ? (1 - progress) / 0.18
              : 1;

        if (
          particle.age >= particle.ttl ||
          particle.y < -40 ||
          particle.x < -120 ||
          particle.x > width + 120
        ) {
          particles[index] = createParticle(true);
          return;
        }

        context.save();
        context.globalAlpha = Math.max(0, fade) * particle.alpha;
        context.fillStyle =
          particle.font === 'mono' ? palette.fillPrimary : palette.fillSecondary;
        context.font = `${particle.size}px ${
          particle.font === 'mono' ? palette.fontMono : palette.fontSerif
        }`;
        context.fillText(particle.text, particle.x, particle.y);
        context.restore();
      });

      frameId = window.requestAnimationFrame(draw);
    };

    resize();
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'style', 'class'],
    });
    window.addEventListener('resize', resize);
    frameId = window.requestAnimationFrame(draw);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', resize);
      themeObserver.disconnect();
    };
  }, []);

  return <canvas className="ambient-canvas" ref={canvasRef} aria-hidden="true" />;
}
