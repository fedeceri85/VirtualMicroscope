import type { Manifest } from './manifest'
import { frameKey, framePath } from './path'
import { TextureLRU, loadTexture } from './lru'

/**
 * Prefetch neighbouring frames around the current position.
 * - Same zoom: focusIndex ± 2
 * - Same focus: zoomIndex ± 1
 *
 * Runs with a concurrency limit so we don't saturate the network.
 * Does not block the current frame render.
 */
export function prefetchNeighbours(
  zoomIndex: number,
  focusIndex: number,
  manifest: Manifest,
  cache: TextureLRU,
): void {
  const neighbours: [number, number][] = []
  const isSingleImage = manifest.renderMode === 'single-image'
  const sourceZoomIndex = sourceZoomFor(manifest, zoomIndex)

  // Focus ± 1, ± 2 at same zoom
  for (const df of [-2, -1, 1, 2]) {
    const f = focusIndex + df
    if (f >= 0 && f < manifest.zSlices) neighbours.push([sourceZoomIndex, f])
  }

  // Zoom ± 1 at same focus
  if (!isSingleImage || hasAppendedZooms(manifest)) {
    for (const dz of [-1, 1]) {
      const z = zoomIndex + dz
      if (z >= 0 && z < manifest.zoomLevels) {
        neighbours.push([sourceZoomFor(manifest, z), focusIndex])
      }
    }
  }

  // Filter out already-cached entries
  const uniqueNeighbours = Array.from(
    new Map(neighbours.map(([z, f]) => [`${z}:${f}`, [z, f] as [number, number]])).values(),
  )
  const toFetch = uniqueNeighbours.filter(([z, f]) => !cache.has(frameKey(manifest.id, z, f)))
  if (toFetch.length === 0) return

  // Concurrency-limited fetch (max 4 in-flight)
  const CONCURRENCY = 4
  let cursor = 0

  function next(): void {
    if (cursor >= toFetch.length) return
    const [z, f] = toFetch[cursor++]
    const key = frameKey(manifest.id, z, f)
    const url = framePath(manifest.pathPattern, z, f)

    loadTexture(url)
      .then((tex) => {
        // Only cache if still not present (another request may have beaten us)
        if (!cache.has(key)) cache.set(key, url, tex)
        else tex.destroy(true)
      })
      .catch(() => {
        /* prefetch failures are silent */
      })
      .finally(next)
  }

  for (let i = 0; i < Math.min(CONCURRENCY, toFetch.length); i++) {
    next()
  }
}

function sourceZoomFor(manifest: Manifest, zoomIndex: number): number {
  if (manifest.renderMode !== 'single-image') return zoomIndex
  return hasAppendedZooms(manifest) && zoomIndex >= manifest.appendedZoomStart! ? zoomIndex : 0
}

function hasAppendedZooms(manifest: Manifest): boolean {
  return typeof manifest.appendedZoomStart === 'number'
}
