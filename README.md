# Market Brief

A free daily briefing on markets, investing and biotech: about 30 minutes of reading, every story explained, and a quiz at the end.

## How it works

| When | What |
|------|------|
| ~6:15 AM daily | A Claude scheduled task researches the news, writes `content/<date>.json` following `docs/EDITION_GUIDE.md`, then runs `scripts/publish.ps1` |
| On every push | GitHub Actions (`.github/workflows/pages.yml`) runs `node scripts/build.js` and deploys `public/` to GitHub Pages |
| 7:00 AM daily | A Windows notification opens the live site (or the local copy before it's published) |

Readers can subscribe by email (Buttondown sends each edition from `feed.xml`) or follow the RSS feed.

## Layout

- `content/*.json`: the editions (source of truth)
- `site/`: page template, script, styles, favicon and share image
- `site.config.json`: site name, tagline, public URL and Buttondown username
- `scripts/build.js`: validates editions and builds the static site into `public/` (git-ignored)
- `scripts/publish.ps1`: build, secret check, commit and push
- `scripts/serve.js`: local preview at http://localhost:8787 (`node scripts/build.js` first)
- `scripts/make-og.ps1`: redraws the social share image after a name change
- `scripts/notify.ps1`, `scripts/install-reminder.ps1`: the morning Windows reminder

Read locally without a server: open `public/index.html` after a build.

Educational news analysis written by Claude, an AI model, from public reporting. Not investment advice.
