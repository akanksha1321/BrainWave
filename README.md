# BrainWave

Seven short brain games in one installable web app: Quick Math, Sudoku, Word Unscramble,
Slide Puzzle, Pipe Connect, Connect Dots and Spot the Difference. Play them one at a time,
or start a **BrainWave Run** to play all seven back to back.

No build step and no dependencies. It is plain HTML, CSS and JavaScript.

## Run it locally

```bash
cd brainwave-app
python3 -m http.server 8000
# open http://localhost:8000
```

Opening `index.html` directly also works, but the service worker (offline mode) and the
install prompt only run on `http://localhost` or `https://`.

## Put it online

Upload the whole folder to any static host: GitHub Pages, Netlify, Cloudflare Pages or
Vercel. It must be served over HTTPS for "Install app" and offline mode to work.
After deploying, open the site on your phone and choose **Add to Home Screen**.

## What is inside

| File | Purpose |
| --- | --- |
| `index.html` | App shell and service worker registration |
| `styles.css` | Pastel design system, light and dark themes |
| `app.js` | All games, the run mode, progress and options screens |
| `manifest.webmanifest` | Install metadata (name, colours, icons) |
| `sw.js` | Caches the app so it works offline |
| `icons/` | 192, 512 and maskable 512 app icons |
| `favicon.svg` | Browser tab icon |

## Features

- Seven games with saved personal bests
- BrainWave Run: all seven games in one session with a final summary
- Day streak, rounds played and bests on the Progress screen
- Options: sound effects, vibration, light / dark / system theme, reset progress
- Installable, works offline after the first visit
- All data stays in the browser (`localStorage`); nothing is sent anywhere

## Changing things

- Colours and fonts: the tokens at the top of `styles.css`
- Word list: the `WORDS` array in `app.js`
- Connect-the-dots pictures: the `SHAPES` array in `app.js`
- After editing any file, bump `CACHE` in `sw.js` (for example `brainwave-v2`) so installed
  copies pick up the update.

## Notes

The Google Fonts stylesheet is optional. Offline, or if it is blocked, the app falls back to
system fonts.
