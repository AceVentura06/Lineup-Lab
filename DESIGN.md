---
name: Ace Lineup Lab
description: Weekly fantasy football projections, start/sit calls and deep usage stats from many sources.
colors:
  bg: "#FAFAFA"
  surface: "#FFFFFF"
  surface-2: "#ECECEE"
  line: "#CDCDCF"
  ink: "#1A1B1E"
  muted: "#62656B"
  accent: "#C93C18"
  accent-fill: "#EC4D25"
  data: "#2BCFCE"
  data-ink: "#0E7C7B"
  good: "#1A7A42"
  warn: "#9A5B00"
  bad: "#C41E3A"
  dark-bg: "#111214"
  dark-surface: "#1C1D20"
  dark-accent: "#FF6B45"
typography:
  hero:
    fontFamily: "Archivo, Arial Black, sans-serif"
    fontSize: "clamp(2.8rem, 1.5rem + 5vw, 5rem)"
    fontWeight: 800
  headline:
    fontFamily: "Archivo, Arial Black, sans-serif"
    fontSize: "clamp(1.45rem, 1.3rem + .6vw, 1.9rem)"
    fontWeight: 800
  stat:
    fontFamily: "Barlow Semi Condensed, Arial Narrow, sans-serif"
    fontSize: "clamp(1.9rem, 1.5rem + 1.6vw, 2.6rem)"
    fontWeight: 700
    fontFeature: "tnum"
  body:
    fontFamily: "Barlow Semi Condensed, system-ui, sans-serif"
    fontSize: "clamp(1rem, .96rem + .1vw, 1.05rem)"
    fontWeight: 400
  label:
    fontFamily: "Barlow Semi Condensed, Arial Narrow, sans-serif"
    fontSize: "clamp(.8rem, .77rem + .12vw, .86rem)"
    fontWeight: 700
    letterSpacing: "0.04em"
rounded:
  sm: "4px"
  md: "4px"
  pill: "999px"
components:
  button:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "18px"
  chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "4px 12px"
---

# Design System: Ace Lineup Lab

## Overview

**Creative North Star: "Gossamer"** (the palette's own name in the code)

A dense, sports-broadcast data surface on a graphite base. Orange leads, teal carries data, green marks good outcomes. Type is bold and condensed so tables and stat tiles fit a phone without losing scanability; Archivo set expanded supplies the loud headline voice.

**Key Characteristics:**
- Graphite neutrals with a single orange brand accent and a teal data colour.
- Barlow Semi Condensed everywhere except headlines; tabular numerals on every stat.
- Hairlines, not shadows; sharp 4px corners; angled cuts on tabs only.
- Full light and dark themes via `data-theme` on `<html>`.

## Colors

### Primary
- **Ember Orange** (accent / accent-fill): the brand voice: primary buttons, active tabs, ranks, links on hover. `accent` is the AA text shade, `accent-fill` the brighter fill.

### Secondary
- **Data Teal** (data / data-ink): charts, highlights and the outline on cards, tiles and tables (`--box-line`) and the Week banner stripe, all plain teal in both themes.

### Neutral
- **Graphite Ink** (ink), **Slate Muted** (muted), **Paper** (bg/surface), **Fog** (surface-2), **Hairline** (line).

### Semantic
- Start = **good**, Sit = **bad** (a red kept distinct from the brand orange), Risky = **warn**; each has a `-soft` tint. Positions (`--qb --rb --wr --te --k --dst`) and sources (`--s-espn --s-sleeper --s-cbs`) have fixed colours.

**The Sit-Isn't-Orange Rule.** Negative verdicts use `--bad`, never the brand accent, so the brand never reads as "bad".

## Typography

**Headline Font:** Archivo (expanded, `font-stretch:125%`), fallback Arial Black
**Body / Label / Stat Font:** Barlow Semi Condensed

8-step fluid scale (`--t-xs` … `--t-hero`), each step easing from a 390px phone size to a 1440px desktop size.

**The Caps-For-Commands Rule.** Uppercase with .04em tracking on headlines and buttons only; tabs, labels and helper text stay sentence case.

**The Tabular Rule.** Every number (`.num`, `.big`, stat tiles) uses tabular numerals at weight 700.

## Layout

Phone-first, dense. Tables tighten to 7px 12px cells from 761px up. Bottom nav on phone, tabs on desktop.

## Elevation & Depth

Flat. Depth comes from tonal layering (bg → surface → surface-2) and hairline borders. The only shadows are a faint `0 1px 3px rgba(14,23,38,.08)` and sticky-column edge shadows on tables.

**The Hairline Rule.** Separate with 1px lines, not shadows.

## Shapes

Sharp 4px corners on cards, tiles, buttons and inputs; pills (999px) for chips; circles for avatars. Tabs alone get an angled parallelogram clip (8px cut).

## Components

### Buttons
- **Shape:** 4px rectangle. Uppercase, weight 700.
- **Default:** surface fill, hairline border. **Primary:** orange fill, white text. **Danger:** red text.
- **Focus:** 2px accent outline, 2px offset.

### Chips
- Pill, hairline border, surface fill, weight 600, small text.

### Cards / Tiles
- Surface fill, 1px teal border (box-line), 4px corners, 18px padding (tiles 12px 14px).

### Tabs
- Condensed uppercase 700, muted until selected; selected gets an accent underline/fill and the angled clip.

## Do's and Don'ts

### Do:
- **Do** use the CSS tokens (`--accent`, `--data`, `--line`…) so dark mode and team pages follow.
- **Do** keep stat numbers tabular and bold.

### Don't:
- **Don't** add drop shadows to cards; use hairlines.
- **Don't** use the brand orange for negative verdicts.
- **Don't** angle-clip buttons or chips; only tabs are angled.
