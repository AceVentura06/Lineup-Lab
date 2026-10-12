# Lineup Lab

A fantasy football evaluator: weekly start/sit projections, ESPN vs. Sleeper projections, player pages with usage and efficiency stats, and rest-of-season tiers. Built with Claude.

## How it stays up to date

`.github/workflows/update.yml` runs `scripts/update.mjs` on GitHub's servers:

- every 3 hours, all week
- every hour on Sundays, noon to midnight Eastern
- whenever you click **Actions → Update data → Run workflow**

The script pulls from 12 sources and rewrites the files in `data/`:

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

If any single source fails, the rest still update. If nothing changed, it skips the commit. GitHub Pages then republishes the site within a few minutes.

## Files

| Path | What it is |
| --- | --- |
| `index.html` | The site |
| `data/*.js` | Generated data — don't edit by hand |
| `scripts/build.mjs` | Sleeper and ESPN data |
| `scripts/adv.mjs` | Every other source |
| `scripts/update.mjs` | Runs the build and writes `data/` |

## One-time setup

1. **Settings → Pages:** Source = *Deploy from a branch*, Branch = `main`, folder `/ (root)`.
2. **Settings → Actions → General → Workflow permissions:** *Read and write permissions* (only needed if the update step fails with a 403 on push).

## Notes

- ESPN's data comes from an unofficial endpoint. If ESPN changes it, the site keeps working with Sleeper only.
- Yahoo requires a signed-in league member, so it isn't included.
- Your starred players are saved in your own browser, not in this repository.
