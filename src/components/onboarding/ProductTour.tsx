import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { mergeSteps, runnableSteps, type Tour, type TourSide, type TourStep } from './tourSteps';
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

interface Size {
  width: number;
  height: number;
}

/** Breathing room around the spotlit element, so the ring is not a tourniquet. */
const PAD = 8;
/** The hole's corner radius, and so the ring's. */
const RADIUS = 10;
/** Between the ring and the card: the caret's height plus a little air. */
const CARD_GAP = 16;
const EDGE = 12;
/** How far in from a card corner the caret may sit. */
const CARET_INSET = 22;

/* How long to keep asking whether the missing stops have shown up.

   This was 1.5s, which is longer than a warm render and shorter than a cold
   one, so on a real account the Hub opened at "1 of 4" when it had five stops
   - the lineup board simply had not painted yet. Nothing on screen said a
   stop had been dropped; the tour was just quietly wrong about its own
   length. Eight seconds is long enough for a slow league, and nothing is
   shown until it settles, so the wait costs a beat rather than a wrong
   count. A stop that lands after that is still picked up, by mergeSteps, the
   next time the walk advances. */
const RESOLVE_MS = 8_000;
const RESOLVE_TICK_MS = 120;

/**
 * The first match that can be seen.
 *
 * Not querySelector. `.matchup-page__hero-number` is also the class of the
 * price inside an opened game on the League board, and `.matchup-page__slot-card`
 * is every row of that game too. The first match in document order can be a
 * node inside a closed sheet, and a stop aimed at a hidden node is dropped
 * for being absent when its real target is sitting in plain view.
 */
function findTarget(selector: string): Element | null {
  for (const node of document.querySelectorAll(selector)) {
    /* checkVisibility, not a bounding box. A closed <details> in Chromium
       uses content-visibility, which KEEPS the layout box, so a box-based
       test says a hidden element is on screen and the tour spotlights a
       rectangle nobody can see. */
    if (!node.checkVisibility()) continue;
    const box = node.getBoundingClientRect();
    if (box.width === 0 && box.height === 0) continue;
    return node;
  }
  return null;
}

/** The box around the element's glyphs rather than the element. */
function textBox(node: Element): DOMRect {
  const range = document.createRange();
  range.selectNodeContents(node);
  const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0);
  range.detach();
  if (rects.length === 0) return node.getBoundingClientRect();
  const left = Math.min(...rects.map((r) => r.left));
  const top = Math.min(...rects.map((r) => r.top));
  const right = Math.max(...rects.map((r) => r.right));
  const bottom = Math.max(...rects.map((r) => r.bottom));
  return new DOMRect(left, top, right - left, bottom - top);
}

/**
 * @param floor The lowest the ring may reach. The viewport's bottom edge on
 * a desktop; on a phone, the top of the docked card, so a target taller than
 * the room above the sheet is cut off at the sheet rather than run under it.
 */
function rectFor(step: TourStep, floor: number): Rect | null {
  const node = findTarget(step.selector);
  if (!node) return null;
  const box = step.fit === 'text' ? textBox(node) : node.getBoundingClientRect();

  /* Clamped to what is actually on screen.
   *
   * Unclamped, a target taller than the viewport drew a ring with its top and
   * bottom edges off the screen, which does not read as a highlight - it
   * reads as a box around the whole page - and the header nav produced a ring
   * at top -8, i.e. a rectangle with a missing top edge. Both were reported
   * as "the rectangles do not encapsulate the elements", and both were the
   * rectangle being honest about a target that does not fit.
   *
   * The hole in the scrim is cut from the same rect, so clamping here keeps
   * the lit area and the ring agreeing with each other. For an oversized
   * target the lit area becomes the visible part of it, which is the only
   * part anybody can look at anyway.
   */
  const top = Math.max(EDGE, box.top - PAD);
  const left = Math.max(EDGE, box.left - PAD);
  const bottom = Math.min(floor, box.bottom + PAD);
  const right = Math.min(window.innerWidth - EDGE, box.right + PAD);
  if (bottom <= top || right <= left) return null;

  return { top, left, width: right - left, height: bottom - top };
}

function sameRect(a: Rect | null, b: Rect | null) {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    Math.abs(a.top - b.top) < 0.5
    && Math.abs(a.left - b.left) < 0.5
    && Math.abs(a.width - b.width) < 0.5
    && Math.abs(a.height - b.height) < 0.5
  );
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
  return findTarget(selector) != null;
}

/** The nearest ancestor that scrolls, which in the shell is `.app-content`. */
function scrollerOf(node: Element): Element | null {
  let current = node.parentElement;
  while (current) {
    const { overflowY } = getComputedStyle(current);
    if ((overflowY === 'auto' || overflowY === 'scroll') && current.scrollHeight > current.clientHeight) {
      return current;
    }
    current = current.parentElement;
  }
  return document.scrollingElement;
}

/** Where the ring has to stop: the screen's foot, or the docked sheet's top. */
function ringFloor(docked: boolean, cardHeight: number) {
  return docked ? window.innerHeight - cardHeight - EDGE - CARD_GAP : window.innerHeight - EDGE;
}

const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), Math.max(low, high));

/** The sides to try, in order, for a stated preference. */
const SIDE_ORDER: Record<TourSide, TourSide[]> = {
  right: ['right', 'left', 'bottom', 'top'],
  left: ['left', 'right', 'bottom', 'top'],
  bottom: ['bottom', 'top', 'right', 'left'],
  top: ['top', 'bottom', 'right', 'left'],
};

interface Placement {
  top: number;
  left: number;
  /** Which side of the TARGET the card sits on, or null if nowhere fit. */
  side: TourSide | null;
  /** Where the caret sits along the card's edge, in px from that edge's start. */
  caret: number;
}

/**
 * Where the card goes.
 *
 * Each side is a candidate only if the whole card fits there inside the
 * viewport. The first that fits wins, in the step's order of preference.
 * None fitting means the target is taller than the screen, and the card
 * then sits at the foot of the viewport with no caret: the top of a module
 * is its heading and its first rows, which is the part the words are about,
 * and that is the last thing the card should be covering.
 */
function placeCard(step: TourStep, rect: Rect, card: Size, vw: number, vh: number): Placement {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const maxLeft = vw - card.width - EDGE;
  const maxTop = vh - card.height - EDGE;
  const alongX = step.align === 'start' ? rect.left : cx - card.width / 2;

  for (const side of SIDE_ORDER[step.placement]) {
    if (side === 'bottom') {
      const top = rect.top + rect.height + CARD_GAP;
      if (top > maxTop) continue;
      const left = clamp(alongX, EDGE, maxLeft);
      return { top, left, side, caret: clamp(cx - left, CARET_INSET, card.width - CARET_INSET) };
    }
    if (side === 'top') {
      const top = rect.top - CARD_GAP - card.height;
      if (top < EDGE) continue;
      const left = clamp(alongX, EDGE, maxLeft);
      return { top, left, side, caret: clamp(cx - left, CARET_INSET, card.width - CARET_INSET) };
    }
    if (side === 'right') {
      const left = rect.left + rect.width + CARD_GAP;
      if (left > maxLeft) continue;
      const top = clamp(cy - card.height / 2, EDGE, maxTop);
      return { top, left, side, caret: clamp(cy - top, CARET_INSET, card.height - CARET_INSET) };
    }
    const left = rect.left - CARD_GAP - card.width;
    if (left < EDGE) continue;
    const top = clamp(cy - card.height / 2, EDGE, maxTop);
    return { top, left, side, caret: clamp(cy - top, CARET_INSET, card.height - CARET_INSET) };
  }

  return {
    top: Math.max(EDGE, maxTop),
    left: clamp(alongX, EDGE, maxLeft),
    side: null,
    caret: 0,
  };
}

/** The scrim: the viewport with a rounded hole cut where the target is. */
function maskPath(rect: Rect | null, vw: number, vh: number) {
  const outer = `M0 0H${vw}V${vh}H0Z`;
  if (!rect) return outer;
  const r = Math.min(RADIUS, rect.width / 2, rect.height / 2);
  const { top, left, width, height } = rect;
  const hole = [
    `M${left + r} ${top}`,
    `H${left + width - r}`,
    `A${r} ${r} 0 0 1 ${left + width} ${top + r}`,
    `V${top + height - r}`,
    `A${r} ${r} 0 0 1 ${left + width - r} ${top + height}`,
    `H${left + r}`,
    `A${r} ${r} 0 0 1 ${left} ${top + height - r}`,
    `V${top + r}`,
    `A${r} ${r} 0 0 1 ${left + r} ${top}`,
    'Z',
  ].join('');
  return `${outer}${hole}`;
}

const FOCUSABLE = 'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * A guided walk over the real product.
 *
 * Coach marks on live UI rather than a carousel of screenshots, because the
 * things worth explaining here are things you have to see in place: that a
 * price is a probability, that the toggle rewrites every number, that the
 * lineup below is what produced the line above.
 *
 * The scrim is one sheet with a hole cut in it, drawn as an SVG path with an
 * even-odd fill. The hole is not painted, so the browser does not count it
 * as part of the sheet, and the spotlit control underneath is genuinely
 * clickable while everything else stays blocked. That is what lets the step
 * that says "press it now if you like" mean it.
 *
 * The target is re-measured every frame while a stop is on screen. The Hub
 * fills in as pricing lands, and a season band arriving above the hero
 * pushes the hero down by its own height without firing a scroll or resize
 * event. Measured once, the ring stayed where the price used to be and sat
 * over the team name instead; one bounding-box read a frame is what it costs
 * to never be stale.
 */
export function ProductTour({ tour, open, explicit, onClose }: ProductTourProps) {
  const [steps, setSteps] = useState<TourStep[]>([]);
  /* Whether the step list is final. The card stays off screen until it is,
     because a tour that says "1 of 4" and should have said "1 of 5" has
     already misled somebody about how long it is. */
  const [settled, setSettled] = useState(false);
  /* -1 is the intro card, for a tour that has one. */
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [cardSize, setCardSize] = useState<Size>({ width: 0, height: 0 });
  const cardRef = useRef<HTMLDivElement | null>(null);
  /* On a phone the card is a sheet at the foot of the screen, and the target
     is scrolled into the room above it. Floating a 360px card beside a
     target on a 390px screen is how coach marks end up covering the thing
     they point at. */
  const docked = useMediaQuery('(max-width: 719px)');

  /* Which stops can run is settled once, at the start. Deciding it per
     render would let the list change length underneath somebody mid-tour -
     the Hub fills in as pricing lands - and "step 3 of 5" would quietly
     become "step 3 of 4" while they were reading it.

     But asking once, immediately, is how the tour opened at four stops
     instead of five: the Hub is still assembling when the tour is told to
     open, and a module that has not rendered yet is indistinguishable from a
     module that does not exist. So it asks again for a moment, keeps the
     best answer, and stops as soon as everything has turned up. */
  useEffect(() => {
    if (!open || !tour) return undefined;

    let timer = 0;
    let cancelled = false;
    const deadline = Date.now() + RESOLVE_MS;

    const attempt = (first: boolean) => {
      if (cancelled) return;
      const found = runnableSteps(tour.steps, isPresent);
      setSteps(found);
      if (first) setIndex(tour.intro ? -1 : 0);
      const complete = found.length === tour.steps.length;
      if (!complete && Date.now() < deadline) {
        timer = window.setTimeout(() => attempt(false), RESOLVE_TICK_MS);
        return;
      }
      setSettled(true);
    };

    setSettled(false);
    setRect(null);
    attempt(true);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, tour]);

  const onIntro = index < 0;
  const step = onIntro ? null : (steps[index] ?? null);

  /* Bring the target into view first, then let the frame loop measure it.
     Measuring before the scroll settles pins the ring to where the element
     used to be.

     The target is centred in the room the card leaves it: everything below
     the fixed header, and on a phone everything above the docked card too.
     scrollIntoView could not do this. Its "start" put the target under the
     Hub's sticky season band, and its "center" put it under the sheet on a
     phone. A target taller than the room has its top aligned to the room's
     top instead, so its heading and first rows are what shows. */
  useLayoutEffect(() => {
    if (!open || !step) return;
    const node = findTarget(step.selector);
    if (!node) return;
    const scroller = scrollerOf(node);
    if (!scroller) return;
    const header = document.querySelector('.app-header')?.getBoundingClientRect().bottom ?? 0;
    const roomTop = header + PAD;
    const roomBottom = ringFloor(docked, cardSize.height);
    const box = node.getBoundingClientRect();
    const fits = box.height + PAD * 2 <= roomBottom - roomTop;
    const wanted = fits ? (roomTop + roomBottom) / 2 - box.height / 2 : roomTop + PAD;
    scroller.scrollTop += box.top - wanted;
    /* Measured here, before paint, as well as by the frame loop. Leaving the
       first measurement to the loop meant one painted frame with no ring and
       no card between stops: the overlay waits for a rect, and the loop had
       not run yet. */
    setRect(rectFor(step, roomBottom));
  }, [cardSize.height, docked, open, step]);

  /* Follow the target for as long as the stop is on screen. One rect read a
     frame; state only changes when the box actually moves. A target that
     vanishes mid-stop keeps its last box rather than blanking the overlay. */
  useEffect(() => {
    if (!open || !step) return undefined;
    let frame = 0;
    let last: Rect | null = null;
    const floor = ringFloor(docked, cardSize.height);
    const tick = () => {
      const next = rectFor(step, floor);
      if (next && !sameRect(next, last)) {
        last = next;
        setRect(next);
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [cardSize.height, docked, open, step]);

  /* The card's own size, which placement needs and cannot know in advance:
     the stops do not carry the same amount of text. */
  useLayoutEffect(() => {
    const node = cardRef.current;
    if (!node) return;
    const box = node.getBoundingClientRect();
    if (box.width !== cardSize.width || box.height !== cardSize.height) {
      setCardSize({ width: box.width, height: box.height });
    }
    /* Re-measured when the content or the layout mode changes, which is
       what changes the size. cardSize itself is deliberately not a
       dependency: it is what this effect writes. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, steps.length, docked]);

  const finish = useCallback(() => {
    if (tour) markTourCompleted(tour.id);
    onClose();
  }, [onClose, tour]);

  const skip = useCallback(() => {
    if (tour) markTourSkipped(tour.id);
    onClose();
  }, [onClose, tour]);

  const next = useCallback(() => {
    if (!tour) return;
    /* Anything that turned up since the list was cut joins the walk here,
       after the stop being left, so the count grows but never renumbers. */
    const found = runnableSteps(tour.steps, isPresent);
    setSteps((current) => (index < 0 ? found : mergeSteps(current, index, found, tour.steps)));
    setIndex((current) => current + 1);
  }, [index, tour]);

  /* Whether this press would be the one that ends the walk, decided from
     the live step list rather than a stale closure over it. */
  const advance = useCallback(() => {
    if (!tour) return;
    if (index >= 0 && index + 1 >= steps.length) {
      finish();
      return;
    }
    next();
  }, [finish, index, next, steps.length, tour]);

  const back = useCallback(() => setIndex((current) => Math.max(tour?.intro ? -1 : 0, current - 1)), [tour]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') skip();
      if (event.key === 'ArrowRight') advance();
      if (event.key === 'ArrowLeft') back();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [advance, back, open, skip]);

  useEffect(() => {
    if (open && settled) cardRef.current?.focus();
  }, [open, settled, index]);

  /* Tab stays inside the card. Everything under the scrim is still in the
     tab order otherwise, and one press would move focus to a control nobody
     can see or click. */
  const trapTab = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;
    const card = cardRef.current;
    if (!card) return;
    const items = Array.from(card.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === card)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  if (!open || !tour) return null;
  /* Still counting. Better a beat of nothing than a card that names a length
     it is about to change its mind about. */
  if (!settled) return null;

  /* Nothing to point at: a cold league whose pricing has not landed, or a
     board with no rows yet. If nobody asked, say nothing at all. */
  if (steps.length === 0 && !explicit) return null;

  const eyebrow = (count: string) => (
    <span className="tour__eyebrow">
      <span className="tour__eyebrow-tab">{tour.label}</span>
      <span className="tour__eyebrow-sep" aria-hidden="true" />
      <span className="tour__count">{count}</span>
    </span>
  );

  if (steps.length === 0) {
    return createPortal(
      <div aria-labelledby="tour-title" aria-modal="true" className="tour" role="dialog">
        <div className="tour__scrim tour__scrim--full" onClick={skip} role="presentation" />
        <div className="tour__card tour__card--centered" onKeyDown={trapTab} ref={cardRef} tabIndex={-1}>
          <div className="tour__head">{eyebrow('Nothing to show yet')}</div>
          <p className="tour__title" id="tour-title">Nothing to show yet</p>
          <p className="tour__body">
            This tab has nothing on it to walk through yet. Once your league
            finishes syncing, replay it from the account menu or More.
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

  if (onIntro && tour.intro) {
    return createPortal(
      <div aria-describedby="tour-body" aria-labelledby="tour-title" aria-modal="true" className="tour" role="dialog">
        <div className="tour__scrim tour__scrim--full" role="presentation" />
        <div
          className="tour__card tour__card--centered tour__card--intro"
          onKeyDown={trapTab}
          ref={cardRef}
          tabIndex={-1}
        >
          <div className="tour__head">
            {eyebrow(`${steps.length} ${steps.length === 1 ? 'stop' : 'stops'}`)}
          </div>
          <p className="tour__title tour__title--intro" id="tour-title">{tour.intro.title}</p>
          <p className="tour__body" id="tour-body">{tour.intro.body}</p>
          <div className="tour__actions tour__actions--intro">
            <button className="tour__back" onClick={skip} type="button">
              Not now
            </button>
            <button className="tour__next tour__start" onClick={next} type="button">
              {tour.intro.cta}
            </button>
          </div>
          <p className="tour__hint">Arrow keys move between stops. Esc leaves.</p>
        </div>
      </div>,
      document.body,
    );
  }

  if (!step || !rect) return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const placement = docked ? null : placeCard(step, rect, cardSize, vw, vh);
  const cardStyle = placement ? { top: placement.top, left: placement.left } : undefined;
  const caretStyle = placement?.side
    ? ({ '--tour-caret': `${placement.caret}px` } as React.CSSProperties)
    : undefined;

  const last = index === steps.length - 1;

  return createPortal(
    <div aria-describedby="tour-body" aria-labelledby="tour-title" aria-modal="true" className="tour" role="dialog">
      {/* One sheet, one hole. The hole is unpainted, so it is the one part of
          the page still taking clicks. */}
      <svg aria-hidden="true" className="tour__mask" height={vh} width={vw}>
        <path className="tour__mask-path" d={maskPath(rect, vw, vh)} fillRule="evenodd" />
      </svg>

      {/* A clear panel over the target itself, on every stop that is not
          about pressing it. Without this the nav is spotlit AND live, and one
          press navigates away from the page the rest of the tour points at. */}
      {step.interactive ? null : (
        <div
          className="tour__scrim tour__scrim--clear"
          style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
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

      <div
        className={['tour__card', docked ? 'tour__card--docked' : ''].filter(Boolean).join(' ')}
        data-side={placement?.side ?? undefined}
        key={`card-${step.id}`}
        onKeyDown={trapTab}
        ref={cardRef}
        style={cardStyle}
        tabIndex={-1}
      >
        {placement?.side ? <span aria-hidden="true" className="tour__caret" style={caretStyle} /> : null}
        <div className="tour__head">
          {eyebrow(`${index + 1} of ${steps.length}`)}
          <button className="tour__skip" onClick={skip} type="button">
            Skip
          </button>
        </div>
        <p className="tour__title" id="tour-title">{step.title}</p>
        <p className="tour__body" id="tour-body">{step.body}</p>
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
          {index > 0 || tour.intro ? (
            <button className="tour__back" onClick={back} type="button">
              Back
            </button>
          ) : null}
          <button className="tour__next" onClick={advance} type="button">
            {last ? 'Done' : 'Next'}
          </button>
        </div>
        {last ? (
          <p className="tour__hint">Each tab has its own walk. Replay any time from the account menu.</p>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
