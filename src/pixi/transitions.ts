import type { Sprite } from 'pixi.js'

const TRANSITION_TOKEN = Symbol('transition-token')

/** Ease-out quadratic */
function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t)
}

/**
 * Zoom cross-fade transition.
 *
 * - `incoming` sprite fades in from 0 → 1
 * - `outgoing` sprite fades out from 1 → 0 and scales toward the zoom direction
 *   (zooming in = outgoing scales up and fades; zooming out = outgoing scales down)
 *
 * Both sprites must already have their textures set and be positioned/sized
 * via `fitSprite` before calling this.
 *
 * @param direction +1 = zooming in, -1 = zooming out
 */
export function animateZoomCrossfade(
  incoming: Sprite,
  outgoing: Sprite,
  direction: number,
  onComplete?: () => void,
): void {
  const DURATION = 220
  const SCALE_AMOUNT = 0.12 // outgoing grows/shrinks by 12%

  // Cancel any in-flight transition on these sprites
  const tokenIn = ((incoming as unknown as Record<symbol, number>)[TRANSITION_TOKEN] ?? 0) + 1
  ;(incoming as unknown as Record<symbol, number>)[TRANSITION_TOKEN] = tokenIn
  const tokenOut = ((outgoing as unknown as Record<symbol, number>)[TRANSITION_TOKEN] ?? 0) + 1
  ;(outgoing as unknown as Record<symbol, number>)[TRANSITION_TOKEN] = tokenOut

  // Snapshot outgoing start values
  const outStartW = outgoing.width
  const outStartH = outgoing.height
  const outStartX = outgoing.x
  const outStartY = outgoing.y

  incoming.alpha = 0
  outgoing.alpha = 1

  const scaleDir = direction // +1 → outgoing grows, -1 → outgoing shrinks

  const start = performance.now()
  function tick() {
    // Bail if either sprite's token has changed (new transition started)
    if (
      (incoming as unknown as Record<symbol, number>)[TRANSITION_TOKEN] !== tokenIn ||
      (outgoing as unknown as Record<symbol, number>)[TRANSITION_TOKEN] !== tokenOut
    ) {
      return
    }

    const elapsed = performance.now() - start
    const t = Math.min(elapsed / DURATION, 1)
    const e = easeOutQuad(t)

    // Incoming: fade in
    incoming.alpha = e

    // Outgoing: fade out + scale
    outgoing.alpha = 1 - e
    const s = 1 + scaleDir * SCALE_AMOUNT * e
    outgoing.width = outStartW * s
    outgoing.height = outStartH * s
    // Keep centered on same point
    outgoing.x = outStartX
    outgoing.y = outStartY

    if (t < 1) {
      requestAnimationFrame(tick)
    } else {
      // Ensure final state
      incoming.alpha = 1
      outgoing.alpha = 0
      outgoing.visible = false
      onComplete?.()
    }
  }
  requestAnimationFrame(tick)
}

/**
 * Focus-change micro-fade (same sprite, no scale).
 */
export function animateFocusTransition(sprite: Sprite): void {
  const DURATION = 90
  const START_ALPHA = 0.86

  const token = ((sprite as unknown as Record<symbol, number>)[TRANSITION_TOKEN] ?? 0) + 1
  ;(sprite as unknown as Record<symbol, number>)[TRANSITION_TOKEN] = token

  const start = performance.now()
  function tick() {
    if ((sprite as unknown as Record<symbol, number>)[TRANSITION_TOKEN] !== token) return

    const elapsed = performance.now() - start
    const t = Math.min(elapsed / DURATION, 1)
    sprite.alpha = START_ALPHA + (1 - START_ALPHA) * easeOutQuad(t)

    if (t < 1) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}
