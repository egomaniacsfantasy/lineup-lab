import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { TOUR_STEPS, runnableSteps, type TourStep } from './tourSteps';
import { markTourCompleted, markTourSkipped } from './tourStorage';
import './ProductTour.css';

interface ProductTourProps {
  open: boolean;
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

/* How long to keep asking whether the missing stops have shown up. Comfortably
   longer than a Hub render and shorter than anyone finishes reading card one,
   so a full tour is assembled before it can matter. */
const RESOLVE_MS = 1_500;
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
  return {
    top: box.top - PAD,
    left: box.left - PAD,
    width: box.width + PAD * 2,
    height: box.height + PAD * 2,
  };
}

function isPresent(selector: string) {
  return rectFor(selector) != null;
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
export function ProductTour({ open, onClose }: ProductTourProps) {
  const [steps, setSteps] = useState<TourStep[]>([]);
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
    if (!open) return undefined;

    let timer = 0;
    let cancelled = false;
    const deadline = Date.now() + RESOLVE_MS;

    const attempt = (first: boolean) => {
      if (cancelled) return;
      const found = runnableSteps(TOUR_STEPS, isPresent);
      setSteps(found);
      if (first) setIndex(0);
      if (found.length < TOUR_STEPS.length && Date.now() < deadline) {
        timer = window.setTimeout(() => attempt(false), RESOLVE_TICK_MS);
      }
    };

    attempt(true);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open]);

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
      const tall = node.getBoundingClientRect().height > window.innerHeight * 0.6;
      node.scrollIntoView({ block: tall ? 'start' : 'center', behavior: 'auto' });
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
    markTourCompleted();
    onClose();
  }, [onClose]);

  const skip = useCallback(() => {
    markTourSkipped();
    onClose();
  }, [onClose]);

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

  if (!open) return null;

  /* Nothing to point at. Rather than draw an empty tour, say so and get out
     of the way: this is a cold league whose pricing has not landed, and the
     honest move is to let them look at the app. */
  if (steps.length === 0) {
    return createPortal(
      <div className="tour" role="dialog" aria-label="Product tour">
        <div className="tour__scrim tour__scrim--full" onClick={skip} role="presentation" />
        <div className="tour__card tour__card--centered" ref={cardRef} tabIndex={-1}>
          <p className="tour__title">Nothing to show yet</p>
          <p className="tour__body">
            The tour walks through a priced week. Once your league finishes
            syncing, replay it from your account menu.
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
          <p className="tour__replay">Replay this any time from your account menu.</p>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
