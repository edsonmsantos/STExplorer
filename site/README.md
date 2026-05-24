# ST Explorer — landing page

The marketing site for [ST Explorer](../), to be hosted at <https://stexplorer.stivetec.com>.

Vanilla HTML + CSS + JS. No build step. No framework. Just open `index.html` to preview locally.

## Structure

```
site/
├── index.html              # Single-page layout
├── style.css               # All styles, including glass + ambient blobs
├── script.js               # Sticky nav, reveal animations, parallax
├── CNAME                   # GitHub Pages custom domain
├── favicon.ico             # Copied from /images/icon.ico
└── assets/
    ├── logo.png            # Copied from /images/icon.png
    ├── og-image.png        # (You add — 1200×630 social preview)
    └── screenshots/        # (You add — see screenshots/README.md)
```

## Preview locally

Just open `index.html` in any browser. No server needed — relative paths only.

For a quick local server (handy if you add OG metadata that requires absolute URLs):

```powershell
cd site
python -m http.server 8000
# then visit http://localhost:8000
```

## Deploy on GitHub Pages with a custom domain

1. Push the repo to GitHub.
2. In **Settings → Pages**, set:
   - Source: **Deploy from a branch**
   - Branch: `main`
   - Folder: `/site`
3. The `CNAME` file is already in place — Pages will pick it up.
4. In your DNS (Cloudflare/Route53/etc) add a `CNAME` record:
   - Host: `stexplorer`
   - Target: `<your-github-user>.github.io`
   - Proxy: off (or "DNS only" on Cloudflare)
5. Back on the Pages settings, **enable "Enforce HTTPS"**. Wait ~15 minutes for the cert.

## Deploy elsewhere

Any static host works — Netlify, Vercel, Cloudflare Pages, Surge, plain S3. Drag-and-drop the `site/` folder and you're done.

## What to do before launch

- [ ] Add screenshots in `assets/screenshots/` (see [screenshots/README.md](assets/screenshots/README.md))
- [ ] Add `assets/og-image.png` (1200 × 630) for social previews
- [ ] Update GitHub URLs in `index.html` if your repo name isn't `edsonsantos/STExplorer`
- [ ] Double-check the download link points to a real `releases/latest` once you cut one
- [ ] Run [Lighthouse](https://pagespeed.web.dev) — target >95 on Performance / Accessibility / SEO
