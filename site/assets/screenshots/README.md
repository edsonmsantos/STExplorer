# Screenshots

The site references the following images. Drop them in this directory with these exact filenames and the placeholders disappear automatically.

| Filename | Used in | Suggested size | Suggested content |
|---|---|---|---|
| `hero.png` | Hero section | 1600 × 1000 | Full app, column view with a few folders drilled in. Make it look "alive". |
| `view-icons.png` | Three views grid | 1200 × 800 | Icons view with files selected, maybe one cut (50% opacity) |
| `view-list.png` | Three views grid | 1200 × 800 | List view sorted by size desc, one row selected |
| `view-columns.png` | Three views grid | 1200 × 800 | Columns view 3 levels deep, blue selection on deepest |
| `terminal.png` | Terminal section | 1600 × 900 | App with terminal panel open and 2-3 tabs |
| `transfers.png` | Transfers section | 1400 × 900 | Drop overlay visible OR transfer panel with active progress bars |

## Tips for nice screenshots

- Run the app at 1440 × 900 or 1600 × 1000 — bigger than that and details look tiny in the site cards.
- Use a remote with at least 8-10 visible items so each view feels populated.
- For the terminal screenshot, type a command like `htop` or `tree -L 2` so the screen has color and structure.
- For the transfers screenshot, time it during an actual upload of a 50-200 MB file so the progress bar is partially full.
- Optimize PNGs through [squoosh.app](https://squoosh.app) (OxiPNG / pngquant) before committing. Site total should stay under 2 MB.

## Optional: dark theme screenshots

If you want the screenshots to feel cohesive with the dark sections of the site (Terminal, final CTA), you can preserve the app's light chrome — the contrast against the dark background already looks great.

## OG image

Drop `og-image.png` (1200 × 630) in `site/assets/` for social previews on Reddit / X / etc. The `<meta property="og:image">` tag already points at it.
