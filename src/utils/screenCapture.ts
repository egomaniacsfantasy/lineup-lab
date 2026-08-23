/**
 * A picture of what the reporter is actually looking at.
 *
 * The obvious approach — html2canvas — is wrong for this codebase and it took
 * measuring to see why. html2canvas does not run the browser's CSS engine; it
 * reimplements enough of it to paint a canvas, and `color-mix()` is not in the
 * part it implements. 58 of our 79 stylesheets use `color-mix()`, so an
 * html2canvas screenshot would come back with most of the app's colours
 * flattened or dropped. That is worse than sending no picture at all: it makes
 * every bug report look like a rendering bug, and whoever reads it goes hunting
 * for a problem that exists only in the screenshotting library.
 *
 * So the browser takes the picture. getDisplayMedia hands back a real capture
 * of a real rendered surface — correct by construction, whatever CSS we use,
 * now and after any redesign. The cost is a permission prompt, which is why
 * this is offered as a button rather than done silently. That trade is the
 * right way round: a report is still useful without a picture, and a wrong
 * picture is actively harmful.
 */

/** Wide enough to read a table, small enough to post as JSON. */
const MAX_WIDTH = 1600;
const JPEG_QUALITY = 0.82;

export function screenCaptureSupported(): boolean {
  return (
    typeof navigator !== 'undefined'
    && typeof navigator.mediaDevices?.getDisplayMedia === 'function'
  );
}

function drawScaled(source: HTMLVideoElement): string | null {
  const width = source.videoWidth;
  const height = source.videoHeight;
  if (!width || !height) return null;

  const scale = Math.min(1, MAX_WIDTH / width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  /* JPEG, not PNG: a screenshot of a dark UI is ~10x smaller as JPEG and the
     artefacts do not hide anything a reader needs. */
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}

export type CaptureResult =
  | { ok: true; dataUrl: string }
  | { ok: false; reason: 'unsupported' | 'declined' | 'failed' };

/**
 * Prompts for a surface, grabs one frame, and stops the track immediately —
 * nothing keeps recording after the still is taken.
 */
export async function captureScreen(): Promise<CaptureResult> {
  if (!screenCaptureSupported()) return { ok: false, reason: 'unsupported' };

  let stream: MediaStream | null = null;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      /* `preferCurrentTab` is Chromium-only and merely a hint; where it is not
         understood it is ignored and the user picks from the normal list. */
      video: { displaySurface: 'browser' },
      audio: false,
      preferCurrentTab: true,
    } as DisplayMediaStreamOptions);
  } catch (error) {
    /* The user closing the picker is a NotAllowedError, same as a policy
       block. Either way it is "no picture", not "something is broken". */
    const declined = error instanceof DOMException
      && (error.name === 'NotAllowedError' || error.name === 'AbortError');
    return { ok: false, reason: declined ? 'declined' : 'failed' };
  }

  try {
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    await video.play();

    /* One frame is not necessarily ready the instant play() resolves; waiting
       for the next paint gives the compositor a chance to deliver one. */
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const dataUrl = drawScaled(video);
    video.pause();
    video.srcObject = null;
    return dataUrl ? { ok: true, dataUrl } : { ok: false, reason: 'failed' };
  } catch {
    return { ok: false, reason: 'failed' };
  } finally {
    /* Always: a live screen-share track left running is a privacy problem and
       the browser keeps showing the sharing indicator. */
    for (const track of stream.getTracks()) track.stop();
  }
}
