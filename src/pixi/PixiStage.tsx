import { useEffect, useRef } from 'react'
import { Application, Graphics, Sprite, Texture } from 'pixi.js'
import { useMicroscopeStore } from '../store/useMicroscopeStore'
import { framePath, frameKey } from '../lib/path'
import { TextureLRU, loadTexture } from '../lib/lru'
import { prefetchNeighbours } from '../lib/prefetch'
import { createReticle, drawReticle, createVignette, drawVignette } from './overlays'
import { animateZoomTransition, animateFocusTransition } from './transitions'
import type { Manifest } from '../lib/manifest'

/* Shared texture cache (lives for the app lifetime) */
const textureCache = new TextureLRU(100)

/* ------------------------------------------------------------------ */
/*  Standalone helpers                                                 */
/* ------------------------------------------------------------------ */

/** Load a frame into the cache (if missing) and show it on the sprite. */
async function loadAndSwap(
  zoom: number,
  focus: number,
  prevZoom: number,
  manifest: Manifest,
  sprite: Sprite,
  app: Application,
) {
  const key = frameKey(zoom, focus)

  const applyTexture = (tex: Texture) => {
    sprite.texture = tex
    fitSprite(sprite, app)

    // Transition
    if (zoom !== prevZoom) {
      animateZoomTransition(sprite, sprite.scale.x, sprite.scale.y)
    } else {
      animateFocusTransition(sprite)
    }
  }

  /* 1. Fast path — already cached */
  const cached = textureCache.get(key)
  if (cached) {
    applyTexture(cached)
    triggerPrefetch(zoom, focus, manifest)
    return
  }

  /* 2. Slow path — fetch, decode, cache */
  const url = framePath(manifest.pathPattern, zoom, focus)
  useMicroscopeStore.getState().setLoading(true)
  useMicroscopeStore.getState().setError(undefined)

  try {
    const texture = await loadTexture(url)
    textureCache.set(key, url, texture)

    // Only apply if indices haven't changed while we were loading
    const cur = useMicroscopeStore.getState()
    if (cur.zoomIndex === zoom && cur.focusIndex === focus) {
      applyTexture(texture)
    }
  } catch {
    const cur = useMicroscopeStore.getState()
    if (cur.zoomIndex === zoom && cur.focusIndex === focus) {
      cur.setError(`Failed to load frame (${zoom}, ${focus})`)
    }
  } finally {
    useMicroscopeStore.getState().setLoading(false)
  }

  triggerPrefetch(zoom, focus, manifest)
}

function triggerPrefetch(zoom: number, focus: number, manifest: Manifest) {
  prefetchNeighbours(
    zoom,
    focus,
    manifest.zoomLevels,
    manifest.zSlices,
    manifest.pathPattern,
    textureCache,
  )
}

/** Scale + center the sprite to fit the application screen. */
function fitSprite(sprite: Sprite, app: Application) {
  const tex = sprite.texture
  if (!tex || tex === Texture.EMPTY) return

  const { width: cw, height: ch } = app.screen
  const tw = tex.width
  const th = tex.height
  if (tw === 0 || th === 0) return

  const scale = Math.min(cw / tw, ch / th)
  sprite.width = tw * scale
  sprite.height = th * scale
  sprite.x = cw / 2
  sprite.y = ch / 2
}

/** Redraw overlay graphics when canvas resizes */
function redrawOverlays(reticle: Graphics, vignette: Graphics, app: Application) {
  drawReticle(reticle, app)
  drawVignette(vignette, app)
}

/* ------------------------------------------------------------------ */
/*  React component                                                    */
/* ------------------------------------------------------------------ */

interface Props {
  manifest: Manifest
}

export default function PixiStage({ manifest }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<Application | null>(null)
  const spriteRef = useRef<Sprite | null>(null)
  const reticleRef = useRef<Graphics | null>(null)
  const vignetteRef = useRef<Graphics | null>(null)
  const readyRef = useRef(false)
  const prevZoomRef = useRef(0)

  const manifestRef = useRef(manifest)
  manifestRef.current = manifest

  const zoomIndex = useMicroscopeStore((s) => s.zoomIndex)
  const focusIndex = useMicroscopeStore((s) => s.focusIndex)
  const showReticle = useMicroscopeStore((s) => s.showReticle)
  const showVignette = useMicroscopeStore((s) => s.showVignette)

  /* ---------- Pixi init (runs once) ---------- */
  useEffect(() => {
    let cancelled = false
    const app = new Application()
    const container = containerRef.current!

    ;(async () => {
      await app.init({
        background: 0x111111,
        resizeTo: container,
      })
      if (cancelled) {
        app.destroy(true)
        return
      }

      container.appendChild(app.canvas)

      const sprite = new Sprite()
      sprite.anchor.set(0.5)
      app.stage.addChild(sprite)

      const reticle = createReticle()
      app.stage.addChild(reticle)

      const vignette = createVignette()
      app.stage.addChild(vignette)

      // Initial overlay draw
      redrawOverlays(reticle, vignette, app)

      // Redraw overlays on resize
      const ro = new ResizeObserver(() => {
        if (readyRef.current) {
          redrawOverlays(reticle, vignette, app)
          fitSprite(sprite, app)
        }
      })
      ro.observe(container)

      appRef.current = app
      spriteRef.current = sprite
      reticleRef.current = reticle
      vignetteRef.current = vignette
      readyRef.current = true

      // Load the initial frame
      const { zoomIndex: z, focusIndex: f } = useMicroscopeStore.getState()
      loadAndSwap(z, f, z, manifestRef.current, sprite, app)
    })()

    return () => {
      cancelled = true
      readyRef.current = false
      appRef.current = null
      spriteRef.current = null
      reticleRef.current = null
      vignetteRef.current = null
      app.destroy(true, { children: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ---------- React to zoom / focus changes ---------- */
  useEffect(() => {
    if (!readyRef.current) return
    const prevZoom = prevZoomRef.current
    prevZoomRef.current = zoomIndex

    loadAndSwap(
      zoomIndex,
      focusIndex,
      prevZoom,
      manifestRef.current,
      spriteRef.current!,
      appRef.current!,
    )
  }, [zoomIndex, focusIndex])

  /* ---------- Toggle overlays ---------- */
  useEffect(() => {
    if (reticleRef.current) reticleRef.current.visible = showReticle
  }, [showReticle])

  useEffect(() => {
    if (vignetteRef.current) vignetteRef.current.visible = showVignette
  }, [showVignette])

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%' }}
    />
  )
}
