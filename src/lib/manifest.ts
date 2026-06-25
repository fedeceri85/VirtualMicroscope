export type RenderMode = 'frame-stack' | 'single-image'

export interface ChannelMetadata {
  index: number
  name?: string
  color?: string
}

/** Per-dataset manifest shape */
export interface Manifest {
  id: string
  name: string
  renderMode: RenderMode
  zoomLevels: number
  zSlices: number
  width: number
  height: number
  format: string
  pathPattern: string
  zoomScale?: {
    min?: number
    max?: number
  }
  appendedZoomStart?: number
  channels?: ChannelMetadata[]
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
    renderMode: validateRenderMode(obj['renderMode'], index),
    zoomLevels: obj['zoomLevels'] as number,
    zSlices: obj['zSlices'] as number,
    width: obj['width'] as number,
    height: obj['height'] as number,
    format: obj['format'] as string,
    pathPattern: obj['pathPattern'] as string,
  }

  if (typeof obj['zoomScale'] === 'object' && obj['zoomScale'] !== null) {
    const zoomScale = obj['zoomScale'] as Record<string, unknown>
    const min = typeof zoomScale['min'] === 'number' ? zoomScale['min'] : undefined
    const max = typeof zoomScale['max'] === 'number' ? zoomScale['max'] : undefined
    if ((min !== undefined && min <= 0) || (max !== undefined && max <= 0)) {
      throw new Error(`Manifest: dataset[${index}].zoomScale values must be positive numbers`)
    }
    if (min !== undefined && max !== undefined && max < min) {
      throw new Error(`Manifest: dataset[${index}].zoomScale.max must be greater than or equal to min`)
    }
    if (min !== undefined || max !== undefined) {
      manifest.zoomScale = { min, max }
    }
  }

  if (obj['appendedZoomStart'] !== undefined) {
    if (
      typeof obj['appendedZoomStart'] !== 'number' ||
      !Number.isInteger(obj['appendedZoomStart']) ||
      obj['appendedZoomStart'] <= 0 ||
      obj['appendedZoomStart'] >= manifest.zoomLevels
    ) {
      throw new Error(
        `Manifest: dataset[${index}].appendedZoomStart must be an integer between 1 and zoomLevels - 1`,
      )
    }
    manifest.appendedZoomStart = obj['appendedZoomStart']
  }

  if (Array.isArray(obj['channels'])) {
    manifest.channels = (obj['channels'] as unknown[]).map((channel, channelIndex) => {
      if (typeof channel !== 'object' || channel === null) {
        throw new Error(`Manifest: dataset[${index}].channels[${channelIndex}] must be an object`)
      }
      const ch = channel as Record<string, unknown>
      if (typeof ch['index'] !== 'number' || ch['index'] < 0) {
        throw new Error(`Manifest: dataset[${index}].channels[${channelIndex}].index must be a non-negative number`)
      }
      return {
        index: ch['index'] as number,
        name: typeof ch['name'] === 'string' ? ch['name'] : undefined,
        color: typeof ch['color'] === 'string' ? ch['color'] : undefined,
      }
    })
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

function validateRenderMode(value: unknown, index: number): RenderMode {
  if (value === undefined) return 'frame-stack'
  if (value === 'frame-stack' || value === 'single-image') return value
  throw new Error(`Manifest: dataset[${index}].renderMode must be "frame-stack" or "single-image"`)
}
