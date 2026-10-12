# Lineup Lab

A fantasy football evaluator: weekly start/sit projections, ESPN vs. Sleeper projections, player pages with usage and efficiency stats, and rest-of-season tiers. Built with Claude.

## How it stays up to date

`.github/workflows/update.yml` runs `scripts/update.mjs` on GitHub's servers:

- every 3 hours, all week
- every hour on Sundays, noon to midnight Eastern
- whenever you click **Actions → Update data → Run workflow**

The script pulls stats, projections, the schedule and injuries from Sleeper, plus projections from ESPN, and rewrites the files in `data/`. If nothing changed, it skips the commit. GitHub Pages then republishes the site within a few minutes.

## Files

| Path | What it is |
| --- | --- |
| `index.html` | The site |
| `data/*.js` | Generated data — don't edit by hand |
| `scripts/build.mjs` | Fetches and shapes the data |
| `scripts/update.mjs` | Runs the build and writes `data/` |

## One-time setup

1. **Settings → Pages:** Source = *Deploy from a branch*, Branch = `main`, folder `/ (root)`.
2. **Settings → Actions → General → Workflow permissions:** *Read and write permissions* (only needed if the update step fails with a 403 on push).

## Notes

- ESPN's data comes from an unofficial endpoint. If ESPN changes it, the site keeps working with Sleeper only.
- Yahoo requires a signed-in league member, so it isn't included.
- Your starred players are saved in your own browser, not in this repository.
