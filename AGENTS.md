# Copilot Instructions (Project)

## Source of truth
- Read `docs/APP_SPEC.md` before making changes. Implement exactly what it specifies.

## Tech stack (do not change)
- Vite + React + TypeScript
- PixiJS for rendering
- Zustand for state

## Data contract (do not change)
- Use `public/manifest.json` and the path pattern described in `docs/APP_SPEC.md`.
- Assets live under `public/assets/zoom_XX/z_YYY.webp`.

## Implementation priorities
1. Scaffold app and wire up Pixi stage
2. Manifest loader + validation
3. Zoom/focus controls + keyboard shortcuts
4. Image loader + LRU texture cache + prefetch
5. HUD + reticle/vignette toggles
6. Responsive layout

## Workflow
- Make small, reviewable changes (avoid huge one-shot rewrites)
- After each milestone, ensure `npm run build` succeeds
- Do not add backend or unnecessary libraries
