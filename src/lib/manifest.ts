/** Per-dataset manifest shape */
export interface Manifest {
  id: string
  name: string
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

/** Top-level manifest containing all datasets */
export interface MultiManifest {
  datasets: Manifest[]
}

/**
 * Fetch and validate the manifest from the public directory.
 * Returns all dataset manifests.
 */
export async function loadManifest(url = `${import.meta.env.BASE_URL}manifest.json`): Promise<MultiManifest> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to fetch manifest: ${res.status} ${res.statusText}`)
  }

  const data: unknown = await res.json()
  return validateMultiManifest(data)
}

/** Validate the top-level multi-dataset manifest. */
function validateMultiManifest(data: unknown): MultiManifest {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Manifest must be a JSON object')
  }

  const obj = data as Record<string, unknown>

  if (!Array.isArray(obj['datasets']) || obj['datasets'].length === 0) {
    throw new Error('Manifest: "datasets" must be a non-empty array')
  }

  const datasets = (obj['datasets'] as unknown[]).map((d, i) => validateDataset(d, i))
  return { datasets }
}

/** Runtime validation for a single dataset entry. */
function validateDataset(data: unknown, index: number): Manifest {
  if (typeof data !== 'object' || data === null) {
    throw new Error(`Manifest: dataset[${index}] must be a JSON object`)
  }

  const obj = data as Record<string, unknown>

  if (typeof obj['id'] !== 'string' || obj['id'].length === 0) {
    throw new Error(`Manifest: dataset[${index}].id must be a non-empty string`)
  }

  const requiredNumbers: (keyof Manifest)[] = ['zoomLevels', 'zSlices', 'width', 'height']
  for (const key of requiredNumbers) {
    if (typeof obj[key] !== 'number' || (obj[key] as number) <= 0) {
      throw new Error(`Manifest: dataset[${index}].${key} must be a positive number`)
    }
  }

  if (typeof obj['pathPattern'] !== 'string' || obj['pathPattern'].length === 0) {
    throw new Error(`Manifest: dataset[${index}].pathPattern must be a non-empty string`)
  }

  if (typeof obj['format'] !== 'string' || obj['format'].length === 0) {
    throw new Error(`Manifest: dataset[${index}].format must be a non-empty string`)
  }

  const manifest: Manifest = {
    id: obj['id'] as string,
    name: typeof obj['name'] === 'string' ? obj['name'] : obj['id'] as string,
    zoomLevels: obj['zoomLevels'] as number,
    zSlices: obj['zSlices'] as number,
    width: obj['width'] as number,
    height: obj['height'] as number,
    format: obj['format'] as string,
    pathPattern: obj['pathPattern'] as string,
  }

  if (typeof obj['labels'] === 'object' && obj['labels'] !== null) {
    const labels = obj['labels'] as Record<string, unknown>
    manifest.labels = {
      zoomNames: Array.isArray(labels['zoomNames']) ? (labels['zoomNames'] as string[]) : undefined,
      objectiveNames: Array.isArray(labels['objectiveNames'])
        ? (labels['objectiveNames'] as string[])
        : undefined,
    }
  }

  if (Array.isArray(obj['autofocus'])) {
    manifest.autofocus = obj['autofocus'] as number[]
  }

  return manifest
}
