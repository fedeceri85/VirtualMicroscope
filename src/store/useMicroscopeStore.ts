import { create } from 'zustand'
import type { RenderMode } from '../lib/manifest'

interface MicroscopeState {
  /* ---- data ---- */
  datasetIndex: number
  datasetCount: number
  renderMode: RenderMode
  zoomIndex: number
  focusIndex: number
  zoomLevels: number
  zSlices: number
  panX: number
  panY: number
  panEnabled: boolean

  /* ---- UI toggles ---- */
  showReticle: boolean
  showVignette: boolean
  isLoading: boolean
  error: string | undefined

  /* ---- actions ---- */
  init: (datasetCount: number, zoomLevels: number, zSlices: number, renderMode: RenderMode) => void
  setDataset: (delta: number) => void
  switchDataset: (index: number, zoomLevels: number, zSlices: number, renderMode: RenderMode) => void
  setZoom: (delta: number) => void
  setFocus: (delta: number) => void
  setZoomAbsolute: (index: number) => void
  setFocusAbsolute: (index: number) => void
  setPan: (x: number, y: number) => void
  nudgePan: (dx: number, dy: number) => void
  resetPan: () => void
  setPanEnabled: (enabled: boolean) => void
  toggleReticle: () => void
  toggleVignette: () => void
  setLoading: (v: boolean) => void
  setError: (msg: string | undefined) => void
}

export const useMicroscopeStore = create<MicroscopeState>()((set, get) => ({
  datasetIndex: 0,
  datasetCount: 1,
  renderMode: 'frame-stack',
  zoomIndex: 0,
  focusIndex: 0,
  zoomLevels: 1,
  zSlices: 1,
  panX: 0,
  panY: 0,
  panEnabled: false,
  showReticle: false,
  showVignette: false,
  isLoading: false,
  error: undefined,

  init: (datasetCount, zoomLevels, zSlices, renderMode) =>
    set({
      datasetCount,
      zoomLevels,
      zSlices,
      renderMode,
      datasetIndex: 0,
      zoomIndex: 0,
      focusIndex: 0,
      panX: 0,
      panY: 0,
      panEnabled: renderMode === 'single-image',
    }),

  setDataset: (delta) => {
    const { datasetIndex, datasetCount } = get()
    const next = Math.max(0, Math.min(datasetCount - 1, datasetIndex + delta))
    if (next !== datasetIndex) set({ datasetIndex: next })
  },

  switchDataset: (index, zoomLevels, zSlices, renderMode) =>
    set({
      datasetIndex: index,
      zoomLevels,
      zSlices,
      renderMode,
      zoomIndex: 0,
      focusIndex: 0,
      panX: 0,
      panY: 0,
      panEnabled: renderMode === 'single-image',
    }),

  setZoom: (delta) => {
    const { zoomIndex, zoomLevels } = get()
    const next = Math.max(0, Math.min(zoomLevels - 1, zoomIndex + delta))
    if (next !== zoomIndex) set({ zoomIndex: next })
  },

  setFocus: (delta) => {
    const { focusIndex, zSlices } = get()
    const next = Math.max(0, Math.min(zSlices - 1, focusIndex + delta))
    if (next !== focusIndex) set({ focusIndex: next })
  },

  setZoomAbsolute: (index) => {
    const { zoomLevels } = get()
    set({ zoomIndex: Math.max(0, Math.min(zoomLevels - 1, index)) })
  },

  setFocusAbsolute: (index) => {
    const { zSlices } = get()
    set({ focusIndex: Math.max(0, Math.min(zSlices - 1, index)) })
  },

  setPan: (x, y) => {
    const PAN_LIMIT = 4000
    set({
      panX: Math.max(-PAN_LIMIT, Math.min(PAN_LIMIT, x)),
      panY: Math.max(-PAN_LIMIT, Math.min(PAN_LIMIT, y)),
    })
  },

  nudgePan: (dx, dy) => {
    const { panX, panY } = get()
    const PAN_LIMIT = 4000
    set({
      panX: Math.max(-PAN_LIMIT, Math.min(PAN_LIMIT, panX + dx)),
      panY: Math.max(-PAN_LIMIT, Math.min(PAN_LIMIT, panY + dy)),
    })
  },

  resetPan: () => set({ panX: 0, panY: 0 }),
  setPanEnabled: (panEnabled) => set({ panEnabled }),

  toggleReticle: () => set((s) => ({ showReticle: !s.showReticle })),
  toggleVignette: () => set((s) => ({ showVignette: !s.showVignette })),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}))
