/** Manifest shape matching public/manifest.json */
export interface Manifest {
  zoomLevels: number
  zSlices: number
  width: number
  height: number
  format: string
  pathPattern: string
  labels?: {
    zoomNames?: string[]
    objectiveNames?: string[]
  }
  autofocus?: number[]
}

/**
 * Fetch and validate the manifest from the public directory.
 * Throws on network error or invalid data.
 */
export async function loadManifest(url = `${import.meta.env.BASE_URL}manifest.json`): Promise<Manifest> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to fetch manifest: ${res.status} ${res.statusText}`)
  }

  const data: unknown = await res.json()
  return validateManifest(data)
}

/** Runtime validation — ensures the JSON has the required fields. */
function validateManifest(data: unknown): Manifest {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Manifest must be a JSON object')
  }

  const obj = data as Record<string, unknown>

  const requiredNumbers: (keyof Manifest)[] = ['zoomLevels', 'zSlices', 'width', 'height']
  for (const key of requiredNumbers) {
    if (typeof obj[key] !== 'number' || (obj[key] as number) <= 0) {
      throw new Error(`Manifest: "${key}" must be a positive number`)
    }
  }

  if (typeof obj['pathPattern'] !== 'string' || obj['pathPattern'].length === 0) {
    throw new Error('Manifest: "pathPattern" must be a non-empty string')
  }

  if (typeof obj['format'] !== 'string' || obj['format'].length === 0) {
    throw new Error('Manifest: "format" must be a non-empty string')
  }

  // Build validated manifest, falling back safely for optional fields
  const manifest: Manifest = {
    zoomLevels: obj['zoomLevels'] as number,
    zSlices: obj['zSlices'] as number,
    width: obj['width'] as number,
    height: obj['height'] as number,
    format: obj['format'] as string,
    pathPattern: obj['pathPattern'] as string,
  }

  // Optional labels
  if (typeof obj['labels'] === 'object' && obj['labels'] !== null) {
    const labels = obj['labels'] as Record<string, unknown>
    manifest.labels = {
      zoomNames: Array.isArray(labels['zoomNames']) ? (labels['zoomNames'] as string[]) : undefined,
      objectiveNames: Array.isArray(labels['objectiveNames'])
        ? (labels['objectiveNames'] as string[])
        : undefined,
    }
  }

  // Optional autofocus array
  if (Array.isArray(obj['autofocus'])) {
    manifest.autofocus = obj['autofocus'] as number[]
  }

  return manifest
}
