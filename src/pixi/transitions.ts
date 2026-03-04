import type { Sprite } from 'pixi.js'

const TRANSITION_TOKEN = Symbol('transition-token')

function animateAlpha(sprite: Sprite, durationMs: number, startAlpha: number): void {
  const token = ((sprite as unknown as Record<symbol, number>)[TRANSITION_TOKEN] ?? 0) + 1
  ;(sprite as unknown as Record<symbol, number>)[TRANSITION_TOKEN] = token

  const start = performance.now()
  function tick() {
    const currentToken = (sprite as unknown as Record<symbol, number>)[TRANSITION_TOKEN]
    if (currentToken !== token) return

    const elapsed = performance.now() - start
    const t = Math.min(elapsed / durationMs, 1)
    const ease = 1 - (1 - t) * (1 - t)
    sprite.alpha = startAlpha + (1 - startAlpha) * ease

    if (t < 1) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

/**
 * Zoom-change transition:
 * Smooth alpha-only transition (no scale change) to avoid perceived expansion.
 */
export function animateZoomTransition(sprite: Sprite): void {
  animateAlpha(sprite, 170, 0.78)
}

/**
 * Focus-change micro-fade:
 * Quick alpha-only transition.
 */
export function animateFocusTransition(sprite: Sprite): void {
  animateAlpha(sprite, 90, 0.86)
}
