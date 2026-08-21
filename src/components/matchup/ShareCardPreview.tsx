import { useEffect, useState } from 'react';
import { canvasToBlob } from '../../utils/cardKit';
import './ShareCardPreview.css';

type State = 'idle' | 'working' | 'shared' | 'saved' | 'failed';

/**
 * Show the card before it leaves.
 *
 * "Share the line" used to hand the image straight to the OS share sheet, or,
 * on a desktop browser with no share target, silently drop a PNG in Downloads.
 * Both are the same problem: you press a button and something happens
 * somewhere you are not looking, and you never see what you sent.
 *
 * A preview makes the button honest. You see the card, then you choose what to
 * do with it.
 */
export function ShareCardPreview({
  draw,
  filename = 'odds-gods.png',
  onClose,
}: {
  /** Draws the card. Called again without art if the canvas comes back
      tainted, which is how a cross-origin logo announces itself. */
  draw: (options?: { withArt?: boolean }) => Promise<HTMLCanvasElement>;
  filename?: string;
  onClose: () => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [state, setState] = useState<State>('idle');

  useEffect(() => {
    let cancelled = false;
    void draw().then(async (canvas) => {
      if (cancelled) return;
      try {
        setSrc(canvas.toDataURL('image/png'));
      } catch {
        /* Art from a host that sent no CORS headers taints the canvas and
           toDataURL throws. Redraw without it rather than show nothing. */
        const plain = await draw({ withArt: false });
        if (!cancelled) setSrc(plain.toDataURL('image/png'));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [draw]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const withBlob = async (run: (blob: Blob) => Promise<State>) => {
    setState('working');
    try {
      let blob = await canvasToBlob(await draw());
      if (!blob) blob = await canvasToBlob(await draw({ withArt: false }));
      if (!blob) {
        setState('failed');
        return;
      }
      setState(await run(blob));
    } catch {
      setState('failed');
    }
  };

  const onShare = () =>
    withBlob(async (blob) => {
      const file = new File([blob], filename, { type: 'image/png' });
      const nav = navigator as Navigator & {
        canShare?: (data: { files: File[] }) => boolean;
        share?: (data: { files: File[]; title?: string }) => Promise<void>;
      };
      if (nav.canShare?.({ files: [file] }) && nav.share) {
        await nav.share({ files: [file], title: 'Odds Gods' });
        return 'shared';
      }
      return 'failed';
    });

  const onSave = () =>
    withBlob(async (blob) => {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
      return 'saved';
    });

  const canShare =
    typeof navigator !== 'undefined' &&
    Boolean((navigator as Navigator & { canShare?: unknown }).canShare);

  return (
    <div className="sharecard" role="dialog" aria-label="Share this line" aria-modal="true">
      <button aria-label="Close" className="sharecard__scrim" onClick={onClose} type="button" />
      <div className="sharecard__panel">
        <div className="sharecard__art">
          {src ? (
            <img alt="Your line, as it will be shared" src={src} />
          ) : (
            <span className="sharecard__drawing">Drawing your card…</span>
          )}
        </div>

        <div className="sharecard__actions">
          {canShare ? (
            <button
              className="sharecard__btn sharecard__btn--primary"
              disabled={!src || state === 'working'}
              onClick={onShare}
              type="button"
            >
              {state === 'shared' ? 'Shared' : 'Share'}
            </button>
          ) : null}
          <button
            className={`sharecard__btn${canShare ? '' : ' sharecard__btn--primary'}`}
            disabled={!src || state === 'working'}
            onClick={onSave}
            type="button"
          >
            {state === 'saved' ? 'Saved' : 'Save image'}
          </button>
          <button className="sharecard__btn sharecard__btn--quiet" onClick={onClose} type="button">
            Close
          </button>
        </div>

        {state === 'failed' ? (
          <p className="sharecard__note">
            That did not go through. Save the image and post it yourself.
          </p>
        ) : null}
      </div>
    </div>
  );
}
