import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { runnableSteps, type Tour, type TourStep } from './tourSteps';
import { markTourCompleted, markTourSkipped } from './tourStorage';
import './ProductTour.css';

interface ProductTourProps {
  /** The tour for the tab currently on screen, or null if it has none. */
  tour: Tour | null;
  open: boolean;
  /**
   * Whether somebody asked for this, as opposed to it offering itself.
   *
   * It decides what an empty tour does. Asked for, it owes an answer, even if
   * the answer is "there is nothing here yet". Offering itself, it owes
   * silence: interrupting a cold league to say it has nothing to show is the
   * worst version of onboarding there is.
   */
  explicit: boolean;
  onClose: () => void;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Breathing room around the spotlit element, so the ring is not a tourniquet. */
const PAD = 8;
const CARD_WIDTH = 340;
const CARD_GAP = 14;
const EDGE = 12;

/* How long to keep asking whether the missing stops have shown up.

   This was 1.5s, which is longer than a warm render and shorter than a cold
   one, so on a real account the Hub opened at "1 of 4" when it had five stops
   - the lineup board simply had not painted yet. Nothing on screen said a
   stop had been dropped; the tour was just quietly wrong about its own
   length. Eight seconds is long enough for a slow league, and nothing is
   shown until it settles, so the wait costs a beat rather than a wrong
   count. */
const RESOLVE_MS = 8_000;
const RESOLVE_TICK_MS = 120;

function rectFor(selector: string): Rect | null {
  const node = document.querySelector(selector);
  if (!node) return null;
  /* checkVisibility, not a bounding box. A closed <details> in Chromium uses
     content-visibility, which KEEPS the layout box, so a box-based test says
     a hidden element is on screen and the tour spotlights a rectangle nobody
     can see. */
  if (!node.checkVisibility()) return null;
  const box = node.getBoundingClientRect();
  if (box.width === 0 && box.height === 0) return null;

  /* Clamped to what is actually on screen.
   *
   * Unclamped, a target taller than the viewport drew a ring with its top and
   * bottom edges off the screen, which does not read as a highlight - it
   * reads as a box around the whole page - and the header nav produced a ring
   * at top -8, i.e. a rectangle with a missing top edge. Both were reported
   * as "the rectangles do not encapsulate the elements", and both were the
   * rectangle being honest about a target that does not fit.
   *
   * The scrim panels are built from the same rect, so clamping here keeps the
   * lit hole and the ring agreeing with each other. For an oversized target
   * the lit area becomes the visible part of it, which is the only part
   * anybody can look at anyway.
   */
  const top = Math.max(EDGE, box.top - PAD);
  const left = Math.max(EDGE, box.left - PAD);
  const bottom = Math.min(window.innerHeight - EDGE, box.bottom + PAD);
  const right = Math.min(window.innerWidth - EDGE, box.right + PAD);
  if (bottom <= top || right <= left) return null;

  return { top, left, width: right - left, height: bottom - top };
}

/**
 * Whether a stop has something to point at.
 *
 * Deliberately NOT rectFor. rectFor clamps to the viewport, which is right
 * for drawing and catastrophic for this: a lineup row two screens down has no
 * intersection with the viewport, so a clamped rect is empty and the stop got
 * dropped for being scrolled past. That is what left the Hub tour saying
 * "1 of 3" when it has four stops. Presence is about the document; the clamp
 * is about the paint, and they are asked at different times - this before the
 * tour opens, that after it has scrolled the target into view.
 */
function isPresent(selector: string) {
  const node = document.querySelector(selector);
  if (!node) return false;
  if (!node.checkVisibility()) return false;
  const box = node.getBoundingClientRect();
  return box.width > 0 || box.height > 0;
}

/**
 * A guided walk over the real product.
 *
 * Coach marks on live UI rather than a carousel of screenshots, because the
 * things worth explaining here are things you have to see in place: that a
 * price is a probability, that the toggle rewrites every number, that the
 * lineup below is what produced the line above.
 *
 * The scrim is four rectangles around the target rather than one sheet with a
 * hole in it. That is not a drawing trick - it is what leaves the spotlit
 * control genuinely clickable while everything else stays blocked, so the
 * step that says "press it now if you like" can mean it.
 */
export function ProductTour({ tour, open, explicit, onClose }: ProductTourProps) {
  const [steps, setSteps] = useState<TourStep[]>([]);
  /* Whether the step list is final. The card stays off screen until it is,
     because a tour that says "1 of 4" and should have said "1 of 5" has
     already misled somebody about how long it is. */
  const [settled, setSettled] = useState(false);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [cardHeight, setCardHeight] = useState(0);
  const cardRef = useRef<HTMLDivElement | null>(null);

  /* Which stops can run is settled once, at the start, and then left alone.
     Deciding it per render would let the list change length underneath
     somebody mid-tour - the Hub fills in as pricing lands - and "step 3 of 5"
     would quietly become "step 3 of 4" while they were reading it.

     But asking once, immediately, is how the tour opened at four stops
     instead of five: the Hub is still assembling when the tour is told to
     open, and a module that has not rendered yet is indistinguishable from a
     module that does not exist. So it asks again for a moment, keeps the
     best answer, and stops as soon as everything has turned up. The retry
     stops the moment anyone advances, so a short list someone has already
     started walking is never re-cut underneath them. */
  useEffect(() => {
    if (!open || !tour) return undefined;

    let timer = 0;
    let cancelled = false;
    const deadline = Date.now() + RESOLVE_MS;

    const attempt = (first: boolean) => {
      if (cancelled) return;
      const found = runnableSteps(tour.steps, isPresent);
      setSteps(found);
      if (first) setIndex(0);
      const complete = found.length === tour.steps.length;
      if (!complete && Date.now() < deadline) {
        timer = window.setTimeout(() => attempt(false), RESOLVE_TICK_MS);
        return;
      }
      setSettled(true);
    };

    setSettled(false);
    attempt(true);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, tour]);

  const step = steps[index] ?? null;

  const measure = useCallback(() => {
    if (!step) return;
    setRect(rectFor(step.selector));
  }, [step]);

  /* Bring the target into view first, then measure. Measuring before the
     scroll settles pins the ring to where the element used to be.

     Centring is right for a normal target and wrong for a tall one: the
     lineup board is taller than the viewport, and centring it puts its top
     off the top of the screen, which leaves the card nowhere sensible to go
     and the ring open at both ends. A target that cannot fit is scrolled to
     its top instead. */
  useLayoutEffect(() => {
    if (!open || !step) return undefined;
    const node = document.querySelector(step.selector);
    if (node) {
      const box = node.getBoundingClientRect();
      const tall = box.height > window.innerHeight * 0.6;
      if (tall) {
        /* scrollIntoView('start') puts the target's top at the top of the
           scrollport, which the fixed header then covers. Scroll by hand so
           it lands just below the header instead. */
        const header = Number.parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue('--shell-header-height'),
        );
        const offset = Number.isFinite(header) ? header : 0;
        window.scrollBy({ top: box.top - offset - PAD * 2, behavior: 'auto' });
      } else {
        node.scrollIntoView({ block: 'center', behavior: 'auto' });
      }
    }
    const frame = window.requestAnimationFrame(measure);
    return () => window.cancelAnimationFrame(frame);
  }, [measure, open, step]);

  /* The card's own height, which placement needs and cannot know in advance:
     the stops do not carry the same amount of text. */
  useLayoutEffect(() => {
    const node = cardRef.current;
    if (!node) return;
    setCardHeight(node.getBoundingClientRect().height);
  }, [index, steps.length, rect]);

  useEffect(() => {
    if (!open) return undefined;
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [measure, open]);

  const finish = useCallback(() => {
    if (tour) markTourCompleted(tour.id);
    onClose();
  }, [onClose, tour]);

  const skip = useCallback(() => {
    if (tour) markTourSkipped(tour.id);
    onClose();
  }, [onClose, tour]);

  const next = useCallback(() => {
    setIndex((current) => {
      if (current + 1 >= steps.length) {
        finish();
        return current;
      }
      return current + 1;
    });
  }, [finish, steps.length]);

  const back = useCallback(() => setIndex((current) => Math.max(0, current - 1)), []);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') skip();
      if (event.key === 'ArrowRight') next();
      if (event.key === 'ArrowLeft') back();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [back, next, open, skip]);

  useEffect(() => {
    if (open && step) cardRef.current?.focus();
  }, [open, step]);

  if (!open || !tour) return null;
  /* Still counting. Better a beat of nothing than a card that names a length
     it is about to change its mind about. */
  if (!settled) return null;

  /* Nothing to point at: a cold league whose pricing has not landed, or a
     board with no rows yet. If nobody asked, say nothing at all. */
  if (steps.length === 0 && !explicit) return null;

  if (steps.length === 0) {
    return createPortal(
      <div className="tour" role="dialog" aria-label="Product tour">
        <div className="tour__scrim tour__scrim--full" onClick={skip} role="presentation" />
        <div className="tour__card tour__card--centered" ref={cardRef} tabIndex={-1}>
          <p className="tour__title">Nothing to show yet</p>
          <p className="tour__body">
            This tab has nothing on it to walk through yet. Once your league
            finishes syncing, replay it from your account menu.
          </p>
          <div className="tour__actions">
            <button className="tour__next" onClick={skip} type="button">
              Got it
            </button>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  if (!step || !rect) return null;

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  /* Placement is a preference that has to survive contact with the page.
     Take the preferred side if the card fits there, the other side if it
     fits there, and then clamp into the viewport regardless - because a
     target taller than the screen has room on neither side, and the card
     going off the bottom is how a tour becomes a dead end. */
  const needed = cardHeight + CARD_GAP + EDGE;
  const roomBelow = viewportHeight - (rect.top + rect.height);
  const roomAbove = rect.top;
  const below =
    step.placement === 'bottom'
      ? roomBelow >= needed || roomAbove < needed
      : !(roomAbove >= needed) && roomBelow >= needed;

  const fitsSomewhere = roomBelow >= needed || roomAbove >= needed;
  /* Neither side has room, so the target is taller than the screen. Sit at
     the foot of the viewport rather than the head of it: the top of a module
     is its heading and its first rows, which is the part the words are
     about, and that is the last thing the card should be covering. */
  const rawTop = !fitsSomewhere
    ? viewportHeight - cardHeight - EDGE
    : below
      ? rect.top + rect.height + CARD_GAP
      : rect.top - cardHeight - CARD_GAP;
  const cardTop = Math.min(
    Math.max(EDGE, rawTop),
    Math.max(EDGE, viewportHeight - cardHeight - EDGE),
  );
  const cardLeft = Math.min(
    Math.max(EDGE, rect.left + rect.width / 2 - CARD_WIDTH / 2),
    Math.max(EDGE, viewportWidth - CARD_WIDTH - EDGE),
  );
  const cardStyle = { top: cardTop, left: cardLeft };

  const last = index === steps.length - 1;

  return createPortal(
    <div className="tour" role="dialog" aria-modal="true" aria-label="Product tour">
      {/* Four panels, not one sheet: the gap between them IS the spotlight,
          and it is the only part of the page still taking clicks. */}
      <div className="tour__scrim" style={{ top: 0, left: 0, width: '100%', height: Math.max(0, rect.top) }} />
      <div
        className="tour__scrim"
        style={{ top: rect.top + rect.height, left: 0, width: '100%', bottom: 0 }}
      />
      <div
        className="tour__scrim"
        style={{ top: rect.top, left: 0, width: Math.max(0, rect.left), height: rect.height }}
      />
      <div
        className="tour__scrim"
        style={{ top: rect.top, left: rect.left + rect.width, right: 0, height: rect.height }}
      />

      {/* A fifth panel, over the target itself, on every stop that is not
          about pressing it. Without this the nav is spotlit AND live, and one
          press navigates away from the page the rest of the tour points at. */}
      {step.interactive ? null : (
        <div
          className="tour__scrim tour__scrim--clear"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
          }}
        />
      )}

      <div
        aria-hidden="true"
        className="tour__ring"
        /* Keyed per stop so React replaces the node and the fade replays,
           rather than reusing one element that animates across the page. */
        key={step.id}
        style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
      />

      <div className="tour__card" ref={cardRef} style={cardStyle} tabIndex={-1}>
        <div className="tour__head">
          <span className="tour__count">
            {index + 1} of {steps.length}
          </span>
          <button className="tour__skip" onClick={skip} type="button">
            Skip
          </button>
        </div>
        <p className="tour__title">{step.title}</p>
        <p className="tour__body">{step.body}</p>
        <div className="tour__progress" aria-hidden="true">
          {steps.map((dot, dotIndex) => (
            <span
              className={[
                'tour__dot',
                dotIndex === index ? 'tour__dot--current' : '',
                dotIndex < index ? 'tour__dot--done' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              key={dot.id}
            />
          ))}
        </div>
        <div className="tour__actions">
          {index > 0 ? (
            <button className="tour__back" onClick={back} type="button">
              Back
            </button>
          ) : null}
          <button className="tour__next" onClick={last ? finish : next} type="button">
            {last ? 'Start using it' : 'Next'}
          </button>
        </div>
        {last ? (
          <p className="tour__replay">Each tab has its own. Replay them from your account menu.</p>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
