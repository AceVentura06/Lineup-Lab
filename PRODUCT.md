# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
The owner and the friends in their fantasy football leagues. They set lineups every week, checking quick start/sit calls on a phone and doing longer player research on a laptop, about equally.

## Product Purpose
A fantasy football evaluator: weekly start/sit projections, ESPN vs. Sleeper vs. CBS projections, player pages with usage and efficiency stats, waiver pickups, and rest-of-season tiers. Success is a better lineup decision made faster than by flipping between apps.

## Positioning
- Blends many sources in one place: Sleeper, ESPN, CBS, FantasyPros consensus, ESPN analysts and the site's own model, side by side.
- Surfaces deep usage stats most apps hide: air yards, WOPR, RACR, EPA, CPOE, Next Gen Stats separation and YAC over expected, FTN first-read/catchable/contested targets, end-zone and goal-line shares.

## Operating Context
Used weekly through the NFL season, heaviest Sunday morning before lineups lock. Data refreshes automatically every 15–30 minutes via GitHub Actions; the site moves to the next week early Tuesday.

## Capabilities and Constraints
- Single static `index.html` on GitHub Pages; data in generated `data/*.js` (never hand-edited).
- Some charts are React "islands" (Bklit UI) built from `charts/` into `assets/charts/`, loaded only on pages that show them; styled from the site's own tokens.
- Light and dark mode; team pages use team colours.
- Starred players are stored in the visitor's browser only. No accounts, no Yahoo (needs a signed-in league member).
- ESPN data comes from an unofficial endpoint; the site must keep working with Sleeper alone.

## Brand Commitments
Name: Ace Lineup Lab. Existing logo (Route A wordmark, app icons, link card) in `icons/` and `og.png`.

## Evidence on Hand
Real, live data from 14 sources in `data/`. No testimonials, user counts or accuracy claims beyond what the site's own accuracy chart computes; do not invent any.

## Product Principles
1. Show the sources side by side; let the user see where they agree and disagree.
2. Depth is the point: advanced stats stay visible, not buried.
3. Fast on a phone, rich on a laptop — both are first-class.
4. Degrade gracefully when any one source fails.
