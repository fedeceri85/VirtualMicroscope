import { Graphics, type Application } from 'pixi.js'

export const VIGNETTE_RADIUS_FACTOR = 0.5

/* ------------------------------------------------------------------ */
/*  Reticle (crosshair)                                                */
/* ------------------------------------------------------------------ */

export function createReticle(): Graphics {
  const g = new Graphics()
  g.label = 'reticle'
  g.visible = false
  return g
}

export function drawReticle(g: Graphics, app: Application): void {
  g.clear()
  const { width: w, height: h } = app.screen

  const cx = w / 2
  const cy = h / 2
  const len = Math.min(w, h) * 0.06 // half-line length
  const gap = Math.min(w, h) * 0.015

  g.setStrokeStyle({ width: 1.5, color: 0xffffff, alpha: 0.6 })

  // Horizontal
  g.moveTo(cx - len, cy).lineTo(cx - gap, cy).stroke()
  g.moveTo(cx + gap, cy).lineTo(cx + len, cy).stroke()

  // Vertical
  g.moveTo(cx, cy - len).lineTo(cx, cy - gap).stroke()
  g.moveTo(cx, cy + gap).lineTo(cx, cy + len).stroke()

  // Center dot
  g.circle(cx, cy, 1.5).fill({ color: 0xffffff, alpha: 0.5 })
}

/* ------------------------------------------------------------------ */
/*  Vignette / eyepiece mask                                           */
/* ------------------------------------------------------------------ */

export function createVignette(): Graphics {
  const g = new Graphics()
  g.label = 'vignette'
  g.visible = false
  return g
}

/**
 * Draw a dark border with a circular transparent "hole" in the centre.
 * The effect is achieved by drawing a big opaque rect with a circle
 * cut out (using beginPath + arc + rect winding).
 */
export function drawVignette(g: Graphics, app: Application): void {
  g.clear()
  const { width: w, height: h } = app.screen
  const cx = w / 2
  const cy = h / 2
  const r = Math.min(w, h) * VIGNETTE_RADIUS_FACTOR

  // Soft inner ring for a subtle eyepiece feel
  g.setStrokeStyle({ width: 6, color: 0x000000, alpha: 0.35 })
  g.circle(cx, cy, r + 2).stroke()
  g.setStrokeStyle({ width: 3, color: 0x333333, alpha: 0.9 })
  g.circle(cx, cy, r).stroke()
}
