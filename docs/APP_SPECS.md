# Fluorescence Microscope Outreach App — Build Spec (MD)

## Goal
Create a web app that simulates using a fluorescence microscope by letting a student:
- **Zoom in/out** across *discrete zoom levels* (pre-recorded scans)
- **Change focus** up/down through a *z-stack* at each zoom level  
The app displays the corresponding pre-rendered image frame for the current `(zoomIndex, focusIndex)`.

This is intentionally a "glorified frame player" with a microscope-like UI and smooth feel.

---

## Target Dataset (assumed)
- `ZOOM_LEVELS = 50`
- `Z_SLICES = 50`
- Frame resolution: `512 x 512`
- Image format: `webp` (preferred for compatibility + decode speed), 8-bit
- Total frames: `2500`

**Note:** Source images can be TIFF, but the app consumes web-ready images (WebP/PNG/JPEG/AVIF). Keep TIFF as master, convert offline.


___
## Test data

- Generate a python scripts that generate a syntetic tiff dataset to test the code. 

___

---

## Tech Stack (required)
- **Frontend:** React + TypeScript (Vite)
- **Renderer:** PixiJS (WebGL) for fast texture swapping + overlays
- **State:** Zustand (minimal, simple)
- **Offline cache (optional but recommended):** Workbox service worker
- **Hosting:** static site (Vercel/Netlify/GitHub Pages)

---

## App UX Requirements

### Core Controls
Two button groups (also support keyboard):

1) Zoom  
- `Zoom -` decreases `zoomIndex` (min 0)  
- `Zoom +` increases `zoomIndex` (max `ZOOM_LEVELS-1`)  
- Keyboard: `A` / `D` or `[` / `]`

2) Focus  
- `Focus ↓` decreases `focusIndex` (min 0)  
- `Focus ↑` increases `focusIndex` (max `Z_SLICES-1`)  
- Keyboard: `W` / `S` or `ArrowUp` / `ArrowDown`

### Display
- Always show current frame for `(zoomIndex, focusIndex)`
- Show status text: `Zoom: 17/50  |  Focus: 23/50`
- Add subtle transitions:
  - When zoom changes, animate scale/fade (150–300 ms) to feel like a microscope zoom
  - Focus changes should feel instant (optional micro-fade 50–100 ms)

### Visual Overlays (microscope feel)
- Reticle/crosshair overlay (toggle)
- Optional vignette/eyepiece circular mask (toggle)
- Minimal HUD labels: zoom/focus indices; optionally objective name
- Keep it outreach-friendly: big buttons, simple UI

### Accessibility
- Buttons large enough for touch
- Keyboard shortcuts listed in a help tooltip or modal
- ARIA labels on controls

---

## Performance Requirements

### Frame loading strategy
- Frames are loaded **on demand** and cached
- Implement **prefetch** around current position:
  - Same zoom: `focusIndex ±2`
  - Same focus: `zoomIndex ±1`
- Maintain an **LRU cache** of Pixi textures to avoid GPU memory blow-up
  - Suggested cache size: 80–120 textures
  - On eviction: destroy texture/baseTexture safely

### Avoid jank
- No full re-render of Pixi stage on React state change; only swap sprite texture
- Use requestAnimationFrame only for transitions, not continuously

---

## Data Packaging & Manifest

### Folder Layout (required)
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

### Manifest format (required)
`public/manifest.json`
```json
{
  "zoomLevels": 50,
  "zSlices": 50,
  "width": 512,
  "height": 512,
  "format": "webp",
  "pathPattern": "assets/zoom_{ZZ}/z_{FFF}.webp",
  "labels": {
    "zoomNames": ["Z0","Z1","Z2","..."],
    "objectiveNames": ["4x","5x","..."]
  }
}
```

**Filename tokens:**
- `{ZZ}` = zero-padded 2-digit zoom index (`00..49`)
- `{FFF}` = zero-padded 3-digit focus index (`000..049`)

**Implementation must:**
- Load manifest at startup
- Validate counts and fallback safely if missing labels

---

## UI Layout

### Desktop
- Center: canvas area (512x512 scaled up responsively, maintain square aspect)
- Right or bottom panel: controls
- Top-left: HUD with zoom/focus
- Top-right: toggles (reticle, vignette, help)

### Mobile/Tablet
- Canvas fills width, buttons below
- Buttons large and spaced for touch

---

## Project Structure (suggested)
```
src/
  main.tsx
  App.tsx
  lib/
    manifest.ts
    path.ts
    lru.ts
    prefetch.ts
  store/
    useMicroscopeStore.ts
  pixi/
    PixiStage.tsx
    overlays.ts
    transitions.ts
  ui/
    Controls.tsx
    Hud.tsx
    Toggles.tsx
    HelpModal.tsx
public/
  manifest.json
  assets/...
```

---

## State Model (Zustand)

State:
- `zoomIndex: number`
- `focusIndex: number`
- `showReticle: boolean`
- `showVignette: boolean`
- `isLoading: boolean` (frame fetch in progress)
- `error?: string`

Actions:
- `setZoom(delta | absolute)`
- `setFocus(delta | absolute)`
- `toggleReticle()`
- `toggleVignette()`

Clamp indices to valid range.

---

## Pixi Rendering Requirements
- Create Pixi `Application` once
- Stage contains:
  1) `Sprite` for the image frame (centered, scaled to fit container)
  2) Reticle `Graphics` overlay (toggle)
  3) Vignette mask overlay (toggle)
  4) Optional label overlay handled by React outside canvas

Texture swapping:
- When new frame is ready, set `sprite.texture = newTexture`
- Implement zoom transition:
  - On zoom change: animate sprite scale from `0.95 -> 1.0` + alpha `0.6 -> 1.0` over ~200ms
- Focus change: instant swap (or short alpha fade ~80ms)

Resize:
- On container resize: scale sprite to fit while preserving aspect ratio, center it

---

## Image Loading Implementation

### Loader
- Use `fetch()` + `createImageBitmap()` where available for fast decode
- Convert to Pixi texture:
  - `Texture.from(imageBitmap)` or create BaseTexture

### Cache
- LRU cache keyed by `key = "${zoomIndex}:${focusIndex}"`
- Store:
  - `texture: PIXI.Texture`
  - `lastUsed` metadata
- On eviction:
  - `texture.destroy(true)` (ensure GPU resources freed)

### Prefetch
Whenever `(zoomIndex, focusIndex)` changes:
- compute neighbors to prefetch
- schedule prefetch with a small concurrency limit (e.g. 4)
- do not block rendering the requested frame

---

## Keyboard + Button Input
- Buttons call store actions
- Keyboard listener on document:
  - Zoom: `A/D` or `[/]`
  - Focus: `W/S` or `ArrowUp/ArrowDown`
  - `H` opens help modal
- Prevent default on arrow keys to avoid scrolling when focused on app

---

## Optional Feature: Offline Mode
Add "Download for offline use" toggle/button:
- Use Workbox to precache:
  - `manifest.json`
  - all assets (may be ~100–200MB)
- Show progress indicator while caching
- After cached, app works without internet

Optional: app must still work without service worker.

---

## Optional Feature: Autofocus
Outreach-friendly autofocus:
- Precompute best focus per zoom (offline) and store in manifest:
```json
"autofocus": [12, 14, 13, "..."]
```
- Autofocus button sets `focusIndex` to that value for current zoom

Do NOT implement computational autofocus in-browser unless trivial.

---

## Build Steps (LLM coder should implement)
1) Scaffold Vite React TS project
2) Add dependencies: `pixi.js`, `zustand`
3) Implement manifest loader + validation
4) Implement store
5) Build `PixiStage` component:
   - init pixi app once
   - load initial frame (0,0)
   - handle swaps, transitions, resize
6) Build `Controls` + `HUD` + `Toggles` + `Help` modal
7) Implement loader + LRU cache + prefetch
8) Ensure mobile-friendly layout
9) Provide a simple README with:
   - expected dataset structure
   - how to run locally
   - how to deploy

---

## Acceptance Tests
- App loads and displays frame (0,0) with no console errors
- Zoom/focus buttons update displayed image correctly
- Indices clamp at bounds and don't error
- Prefetch reduces wait when stepping focus repeatedly
- Cache eviction prevents unbounded memory growth
- Works on Chrome + Safari (iPad) + Firefox
