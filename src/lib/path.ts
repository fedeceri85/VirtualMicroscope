/**
 * Build the asset URL for a given (zoomIndex, focusIndex)
 * using the pathPattern from the manifest.
 *
 * Tokens:
 *   {ZZ}  → zero-padded 2-digit zoom index  (00–99)
 *   {FFF} → zero-padded 3-digit focus index  (000–999)
 */
export function framePath(pathPattern: string, zoomIndex: number, focusIndex: number): string {
  const zz = String(zoomIndex).padStart(2, '0')
  const fff = String(focusIndex).padStart(3, '0')
  const rel = pathPattern.replace('{ZZ}', zz).replace('{FFF}', fff)
  return `${import.meta.env.BASE_URL}${rel}`
}

/**
 * Convenience: build a unique cache key for a frame.
 */
export function frameKey(zoomIndex: number, focusIndex: number): string {
  return `${zoomIndex}:${focusIndex}`
}
