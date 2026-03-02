# Virtual Microscope

A web app that simulates a fluorescence microscope — browse discrete **zoom levels** and **z-stack focus planes** of pre-rendered image data with a fast, WebGL-powered viewer.

Built with **Vite + React + TypeScript**, **PixiJS** for rendering, and **Zustand** for state.

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Generate synthetic test images (requires Python 3.9+ & Pillow)
pip install Pillow
python scripts/generate_test_data.py          # creates public/assets/

# 3. Run dev server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## Controls

| Action       | Button | Keyboard        |
| ------------ | ------ | --------------- |
| Zoom out     | **−**  | `A` or `[`      |
| Zoom in      | **+**  | `D` or `]`      |
| Focus up     | **↑**  | `W` or `↑`      |
| Focus down   | **↓**  | `S` or `↓`      |
| Toggle help  | **?**  | `H`             |

Reticle (✛) and vignette (◎) overlays can be toggled from the top-right buttons.

---

## Dataset Structure

The app reads `public/manifest.json` and expects images at:

```
public/
  manifest.json
  assets/
    zoom_00/
      z_000.webp
      z_001.webp
      ...
    zoom_01/
      z_000.webp
      ...
    ...
```

### Manifest format

```json
{
  "zoomLevels": 50,
  "zSlices": 50,
  "width": 512,
  "height": 512,
  "format": "webp",
  "pathPattern": "assets/zoom_{ZZ}/z_{FFF}.webp",
  "labels": {
    "zoomNames": [],
    "objectiveNames": []
  }
}
```

- `{ZZ}` — zero-padded 2-digit zoom index (00–49)
- `{FFF}` — zero-padded 3-digit focus index (000–049)

---

## Generating Test Data

```bash
# Full dataset (50 × 50 = 2 500 frames)
python scripts/generate_test_data.py

# Smaller set for quick testing
python scripts/generate_test_data.py --zooms 5 --slices 10

# Custom output directory
python scripts/generate_test_data.py --outdir /tmp/test_assets
```

Requires **Pillow** (`pip install Pillow`). Generates green pseudo-fluorescence images with blob "cells" and focus-dependent blur.

---

## Build & Deploy

```bash
npm run build      # output in dist/
npm run preview    # preview the production build locally
```

The `dist/` folder is a fully static site — deploy to Vercel, Netlify, GitHub Pages, or any static host. Copy your `assets/` folder into `dist/` (or serve them from a CDN).

---

## Project Structure

```
src/
  main.tsx                  # React entry point
  App.tsx                   # Root component, manifest loading
  App.css                   # Global styles & responsive layout
  store/
    useMicroscopeStore.ts   # Zustand state (zoom, focus, toggles)
  lib/
    manifest.ts             # Fetch + validate manifest.json
    path.ts                 # Build asset URL from indices
    lru.ts                  # LRU texture cache + image loader
    prefetch.ts             # Neighbour prefetch scheduler
  pixi/
    PixiStage.tsx           # PixiJS Application wrapper
    overlays.ts             # Reticle + vignette Graphics
    transitions.ts          # Zoom/focus animations
  ui/
    Controls.tsx            # Zoom/Focus button groups + keyboard
    Hud.tsx                 # Status overlay (zoom/focus indices)
    Toggles.tsx             # Reticle / vignette / help buttons
    HelpModal.tsx           # Keyboard shortcuts modal
scripts/
  generate_test_data.py     # Synthetic dataset generator
```
