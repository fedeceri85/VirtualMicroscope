import { frameKey } from './path'
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
  zoomLevels: number,
  zSlices: number,
  pathPattern: string,
  cache: TextureLRU,
): void {
  const neighbours: [number, number][] = []

  // Focus ± 1, ± 2 at same zoom
  for (const df of [-2, -1, 1, 2]) {
    const f = focusIndex + df
    if (f >= 0 && f < zSlices) neighbours.push([zoomIndex, f])
  }

  // Zoom ± 1 at same focus
  for (const dz of [-1, 1]) {
    const z = zoomIndex + dz
    if (z >= 0 && z < zoomLevels) neighbours.push([z, focusIndex])
  }

  // Filter out already-cached entries
  const toFetch = neighbours.filter(([z, f]) => !cache.has(frameKey(z, f)))
  if (toFetch.length === 0) return

  // Concurrency-limited fetch (max 4 in-flight)
  const CONCURRENCY = 4
  let cursor = 0

  function next(): void {
    if (cursor >= toFetch.length) return
    const [z, f] = toFetch[cursor++]
    const key = frameKey(z, f)
    const url = pathPattern
      .replace('{ZZ}', String(z).padStart(2, '0'))
      .replace('{FFF}', String(f).padStart(3, '0'))

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
