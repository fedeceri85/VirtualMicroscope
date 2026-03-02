import type { Sprite } from 'pixi.js'

/**
 * Zoom-change transition:
 * Animate sprite scale from 0.95→1.0 and alpha from 0.6→1.0 over ~200ms.
 */
export function animateZoomTransition(sprite: Sprite, baseScaleX: number, baseScaleY: number): void {
  const DURATION = 200 // ms
  const startScale = 0.95
  const startAlpha = 0.6
  const start = performance.now()

  function tick() {
    const elapsed = performance.now() - start
    const t = Math.min(elapsed / DURATION, 1) // 0→1
    // ease-out quad
    const ease = 1 - (1 - t) * (1 - t)

    const s = startScale + (1 - startScale) * ease
    sprite.scale.set(baseScaleX * s, baseScaleY * s)
    sprite.alpha = startAlpha + (1 - startAlpha) * ease

    if (t < 1) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

/**
 * Focus-change micro-fade:
 * Quick alpha dip 0.7→1.0 over ~80ms.
 */
export function animateFocusTransition(sprite: Sprite): void {
  const DURATION = 80
  const startAlpha = 0.7
  const start = performance.now()

  function tick() {
    const elapsed = performance.now() - start
    const t = Math.min(elapsed / DURATION, 1)
    sprite.alpha = startAlpha + (1 - startAlpha) * t
    if (t < 1) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}
