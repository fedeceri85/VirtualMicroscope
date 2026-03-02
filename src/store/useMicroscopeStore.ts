import { create } from 'zustand'

interface MicroscopeState {
  /* ---- data ---- */
  zoomIndex: number
  focusIndex: number
  zoomLevels: number
  zSlices: number

  /* ---- UI toggles ---- */
  showReticle: boolean
  showVignette: boolean
  isLoading: boolean
  error: string | undefined

  /* ---- actions ---- */
  init: (zoomLevels: number, zSlices: number) => void
  setZoom: (delta: number) => void
  setFocus: (delta: number) => void
  setZoomAbsolute: (index: number) => void
  setFocusAbsolute: (index: number) => void
  toggleReticle: () => void
  toggleVignette: () => void
  setLoading: (v: boolean) => void
  setError: (msg: string | undefined) => void
}

export const useMicroscopeStore = create<MicroscopeState>()((set, get) => ({
  zoomIndex: 0,
  focusIndex: 0,
  zoomLevels: 1,
  zSlices: 1,
  showReticle: false,
  showVignette: false,
  isLoading: false,
  error: undefined,

  init: (zoomLevels, zSlices) =>
    set({ zoomLevels, zSlices, zoomIndex: 0, focusIndex: 0 }),

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

  toggleReticle: () => set((s) => ({ showReticle: !s.showReticle })),
  toggleVignette: () => set((s) => ({ showVignette: !s.showVignette })),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}))
