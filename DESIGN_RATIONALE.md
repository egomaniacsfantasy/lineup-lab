# Lineup Lab Design Rationale

## 1. Market Read

### Sleeper
Sleeper works because it treats fantasy as a high-frequency utility, not a content experience. The background is dark but not theatrical, surface contrast is crisp, and spacing does the job that borders would do in older fantasy products. Typography is modern and firm: labels are quiet, player names are bold, and numbers are allowed to dominate without decorative framing. On mobile, lists feel fast because rows are compact, avatars and pills create instant recognition, and almost every interaction target looks deliberate.

### DraftKings / FanDuel Sportsbook
Sportsbooks make odds feel trustworthy by using disciplined grids, strong monospace pricing, and very explicit selected states. The best betting UI is not flashy. It is dense, aligned, and repetitive in a good way. Every market cell feels like it belongs to the same system. When lines move, the feedback is small but sharp: color, direction, and immediate value change. That combination is what makes betting-native products feel authoritative.

### Apple Sports
Apple Sports is a study in restraint. It strips out almost all decorative noise, lets typography do the hierarchy work, and uses color only where meaning exists. That creates speed. Scores, status, and context are legible because the interface refuses to compete with them.

### Bracket Lab
Bracket Lab contributes the brand confidence: dark foundation, amber DNA, serious-math energy, and a premium feel. What does not translate directly is the cinematic atmosphere. Lineup Lab is a weekly tool, not a once-a-year event. It needs less fog, less theatrical texture, and more operational clarity.

## 2. Design Principles

1. **Odds are the product.** The line, probability, and deltas must read before decoration does.
2. **Tool over spectacle.** Atmosphere can support the experience, but it cannot compete with the data.
3. **Scan first, read second.** Every key surface should make sense from shape, spacing, and hierarchy before the user reads labels.
4. **Selection must feel consequential.** A start/sit choice should look like a sportsbook selection, not a generic card toggle.
5. **Numbers need trust language.** IBM Plex Mono owns prices, projections, percentages, and movement.
6. **Color is for signal, not ornament.** Amber marks priority, green/red mark movement, cyan marks live/system state.
7. **Weekly use demands lower friction.** Reduce decorative blur, reduce visual chatter, tighten row density, improve keyboard and motion accessibility.
8. **Odds Gods DNA stays visible.** Keep the dark luxury foundation and amber thread, but tune it for a repeat-use utility.

## 3. What Changed

- Shifted the palette cooler and cleaner so the app feels more like a trading terminal and less like a cinematic demo.
- Rebuilt the matchup hero into a tighter sportsbook-style board with explicit market cells, compressed team summaries, and a movement badge.
- Tightened roster density and changed decision rows from “highlighted list item” to “actionable lineup market.”
- Reworked comparison cards to behave more like selection slips: clearer active state, bigger line readout, stronger impact badge.
- Simplified the header and tab treatment so the shell feels more native and less ornamental.
- Reduced atmospheric noise by toning down film grain and dramatically reducing the floating canvas.

## 4. What Stayed

- The dark Odds Gods foundation.
- Amber as the primary family accent.
- IBM Plex Mono as the data voice.
- The live odds strip.
- The start/sit repricing mechanic and animated matchup updates.

## 5. Palette

- `#0b1018` `--bg`: app background
- `#070b12` `--bg-deep`: ticker and deepest surfaces
- `#111826` `--bg-surface`: primary panels
- `#162032` `--bg-surface-soft`: secondary raised surfaces
- `#1a2437` via `--bg-raised`: selected and elevated states
- `#d79a24` `--amber`: primary action accent
- `#ffd36c` `--amber-bright` / `--text-amber`: premium highlight, active odds, key emphasis
- `#4ad89a` `--green`: favorable movement
- `#ff6f7d` `--red`: unfavorable movement
- `#6dc8ff` `--cyan`: live/system status

### Usage Rules

- Amber is reserved for your side of the market, active navigation, and high-priority states.
- Green and red are only for directional movement and deltas.
- Cyan is only for live/state signaling.
- Neutrals carry structure. Borders and cards stay quiet.

## 6. Typography

- **IBM Plex Mono**: all odds, percentages, projections, spread/total, labels that behave like market metadata.
- **Manrope**: navigation, headings, player names, panel titles, and general UI.
- **Instrument Serif**: reserved to the product wordmark only, so it stays distinctive instead of becoming decorative clutter.

## 7. Component Decisions

### Matchup Card
Turned the hero into a sportsbook board. Team identity is compact. Prices and win odds are dominant. Spread, total, and win probability now live in explicit market cells. The card movement badge gives immediate directional context without stealing attention from the price.

### Roster List
Reduced visual clutter and improved scanability. Rows are denser, position tiles are clearer, and team logo overlays increase sports recognition without adding text. Decision rows now have a stronger action edge and the delta is treated as the most important sub-signal.

### Decision Panel
The panel now reads as a decision board, not a modal full of cards. Comparison cards emphasize “line if started” and impact more clearly. On mobile, the drawer got dialog semantics, focus trapping, and a cleaner top hierarchy.

### Header / Navigation
Simplified the brand lockup, promoted week/status to a utility signal, and made desktop nav feel more product-like than marketing-like. The bottom tab bar now reads closer to a native sports app.

### Odds Strip
Kept the feature, but made it feel more like a real sportsbook ticker and less like decoration.

## 8. What Was Reduced Or Removed

- The floating canvas was not removed, but it was heavily reduced in density, motion, and opacity.
- Film grain remains, but at lower opacity.
- Heavy glass blur and theatrical glow were dialed back.
- Instrument Serif was removed from core UI surfaces.

## 9. QA / Product Fixes Addressed

- Moved Google Fonts loading from CSS `@import` into `index.html` with `preconnect`.
- Added a shared `getInitials()` utility.
- Added avatar URL overrides and shared image failure caching so the broken Davante Adams headshot no longer burns repeated 404 attempts.
- Cleaned up the `DecisionPanel` close timer leak.
- Added semantic heading hierarchy across the page and panels.
- Added `prefers-reduced-motion` support.
- Added a focus trap and `Escape` handling for the decision drawer.
- Added a skip-to-content link.
- Tightened layout rules to prevent tablet overflow in the 768px pass.

## 10. What The Product Feels Like Now

**A betting-native fantasy tool: sharp, fast, dark, and confident enough to let the numbers do the talking.**
