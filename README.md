# Ace Lineup Lab

A fantasy football evaluator: weekly start/sit projections, ESPN vs. Sleeper projections, player pages with usage and efficiency stats, and rest-of-season tiers. Built with Claude.

## How it stays up to date

`.github/workflows/update.yml` runs `scripts/update.mjs` on GitHub's servers:

- every 30 minutes, all week
- every 15 minutes on Sundays, noon to midnight Eastern
- extra runs Sunday late morning, after teams announce inactives, and early Tuesday, when the site moves to the next week
- whenever you click **Actions → Update data → Run workflow**

The script pulls from 16 sources and rewrites the files in `data/`:

| Source | Used for |
| --- | --- |
| Sleeper | Stats, snap counts, projections, injury tags, schedule |
| ESPN | Weekly projections |
| FantasyPros (via DynastyProcess) | Expert consensus rankings, start/sit grades, projected points |
| nflverse player stats | Full air yards, WOPR, RACR, EPA, CPOE |
| NFL Next Gen Stats (receiving, rushing, passing) | Separation, YAC over expected, rush yards over expected, time to throw |
| nflverse play-by-play | Expected fantasy points; end-zone, deep and goal-line shares |
| FTN charting | First-read, catchable and contested targets; play action |
| NFL injury reports | Practice participation and game status |
| Betting lines | Spreads, totals, implied team points |
| Open-Meteo | Game-time weather at outdoor stadiums |
| ESPN analysts | Weekly positional rankings |
| CBS Sports | Expert rankings (Eisenberg, Richard, Cummings) and projections |
| ffopportunity expected points, nflverse snap counts | The usage model in testing (not shown on the site) |

If any single source fails, the rest still update, and the failed source is named on the How It Works page. A source that comes back empty or nearly empty counts as failed (`scripts/checks.mjs`). An empty answer from Sleeper stops the run so the last good data stays up. If nothing changed, it skips the commit. GitHub Pages then republishes the site within a few minutes.

A run turns red in two ways. If the updater stops (exit code 1), nothing is committed. If it finishes but reports a `PROBLEM` (exit code 2: the accuracy scoreboard failed, the usage model produced nothing, or two players share a key), the data is committed first and the run fails afterwards; search the "Fetch fresh data" log for `PROBLEM`.

## Scoring and accuracy

Everything is projected and graded in ESPN default scoring (`scripts/scoring.mjs`). Each outside site publishes in its own rules, and the page converts from those: ESPN counts an interception as −2, CBS pays 6 points per passing touchdown, Sleeper and FantasyPros use 4 and −1.

Each update saves the week's projections to `data/history/` and freezes a player's numbers at his kickoff. Finished weeks are graded on a shared pool: players every graded source projected, averaging 5+ points. A player still projected at kickoff who did not play counts as zero. CBS is not graded on kickers or defenses.

## The usage model (in testing)

A second model built on workload is saved each week as the hidden source `mod2` and graded privately in `data/shadow.json`. Nothing on the site reads it. It goes live only if it beats the current model; see `docs/BACKTEST.md` for the measured results so far.

- `node scripts/fit.mjs` refits it on the last three seasons. Run by hand once per offseason; it rewrites `assets/model/coefficients.json`.
- `node scripts/backtest.mjs` re-runs the walk-forward test and rewrites `docs/BACKTEST.md`.

## Tests

`node --test scripts/*.test.mjs` (no network, no packages). The update workflow runs them after every data refresh.

## Files

| Path | What it is |
| --- | --- |
| `index.html` | The site |
| `data/*.js` | Generated data — don't edit by hand |
| `scripts/build.mjs` | Sleeper and ESPN data |
| `scripts/adv.mjs` | Every other source |
| `scripts/cbs.mjs` | CBS Sports pages |
| `scripts/update.mjs` | Runs the build and writes `data/` |
| `scripts/accuracy.mjs` | Saves weekly projections, grades finished weeks, tunes the blend |
| `scripts/scoring.mjs`, `keys.mjs`, `checks.mjs` | The scoring table, player keys and aliases, minimum rows per source |
| `scripts/usage.mjs`, `fit.mjs`, `backtest.mjs` | The usage model: inputs, yearly fit, walk-forward test |
| `assets/model/` | The usage model's formula and fitted weights |
| `scripts/backfill.mjs`, `migrate-history.mjs` | One-off history tools (rebuild early weeks; the 2026 ESPN/CBS quarterback correction) |
| `charts/` | Source for the React charts (Bklit UI components) — see below |
| `assets/charts/` | The built chart bundle — generated, don't edit by hand |

## One-time setup

1. **Settings → Pages:** Source = *Deploy from a branch*, Branch = `main`, folder `/ (root)`.
2. **Settings → Actions → General → Workflow permissions:** *Read and write permissions* (only needed if the update step fails with a 403 on push).

## Notes

- ESPN's data comes from an unofficial endpoint. If ESPN changes it, the site keeps working with Sleeper only.
- Yahoo requires a signed-in league member, so it isn't included.
- Your starred players are saved in your own browser, not in this repository.

## Charts (Bklit UI)

The site itself is plain HTML. A few charts are "islands": small React components from
[Bklit UI](https://github.com/bklit/bklit-ui) (MIT) that drop into the page.

- `index.html` renders each chart's spot as `<div class="ll-island" data-island="week" data-props='…'>`,
  with the hand-built HTML chart beside it as a fallback.
- The first time a page shows an island, the page loads `assets/charts/islands.js` and `.css`
  (React + the charts). The home page and tables never download them.
- `charts/` is a small Vite + React + Tailwind project. Bklit components were installed with
  `npx shadcn add @bklit/bar-chart` into `charts/src/components/charts/`. Everything its CSS
  produces is scoped under `.ll-island`, so it can't restyle the rest of the site.
- Chart colours come from the site's own tokens (`--line`, `--ink`, team colours…), so light/dark
  mode and team pages just work.
- Two local changes to Bklit, each marked "Lineup Lab patch": in `bar-chart.tsx`, tapping a bar on a
  phone opens its tooltip; in `use-chart-interaction.ts` (line and area charts), a tap opens the tooltip
  and leaves it open, and a swipe that starts on the chart still scrolls the page.

**Changing a chart:** edit `charts/src/islands/`, then `cd charts && npm install && npm run build`
(or just push to `main` — `.github/workflows/charts.yml` rebuilds and commits the bundle).
The build stamps a new `?v=` into `index.html` so visitors get the update.
