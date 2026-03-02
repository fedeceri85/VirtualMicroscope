import { useEffect } from 'react'
import { useMicroscopeStore } from '../store/useMicroscopeStore'

export default function Controls() {
  const setZoom = useMicroscopeStore((s) => s.setZoom)
  const setFocus = useMicroscopeStore((s) => s.setFocus)
  const zoomIndex = useMicroscopeStore((s) => s.zoomIndex)
  const focusIndex = useMicroscopeStore((s) => s.focusIndex)
  const zoomLevels = useMicroscopeStore((s) => s.zoomLevels)
  const zSlices = useMicroscopeStore((s) => s.zSlices)
  const isLoading = useMicroscopeStore((s) => s.isLoading)

  /* ---- Keyboard shortcuts ---- */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return
      }

      const store = useMicroscopeStore.getState()

      switch (e.key) {
        case 'a':
        case '[':
          store.setZoom(-1)
          break
        case 'd':
        case ']':
          store.setZoom(1)
          break
        case 'w':
        case 'ArrowUp':
          e.preventDefault()
          store.setFocus(1)
          break
        case 's':
        case 'ArrowDown':
          e.preventDefault()
          store.setFocus(-1)
          break
      }
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className="controls-bar">
      {/* Zoom controls */}
      <fieldset className="control-group">
        <legend>Zoom</legend>
        <div className="inner">
          <button
            className="control-btn"
            onClick={() => setZoom(-1)}
            disabled={zoomIndex === 0}
            aria-label="Zoom out (A or [)"
          >
            −
          </button>
          <span className="index-label">
            {zoomIndex + 1} / {zoomLevels}
          </span>
          <button
            className="control-btn"
            onClick={() => setZoom(1)}
            disabled={zoomIndex === zoomLevels - 1}
            aria-label="Zoom in (D or ])"
          >
            +
          </button>
        </div>
      </fieldset>

      {/* Focus controls */}
      <fieldset className="control-group">
        <legend>Focus</legend>
        <div className="inner">
          <button
            className="control-btn"
            onClick={() => setFocus(-1)}
            disabled={focusIndex === 0}
            aria-label="Focus down (S or ArrowDown)"
          >
            ↓
          </button>
          <span className="index-label">
            {focusIndex + 1} / {zSlices}
          </span>
          <button
            className="control-btn"
            onClick={() => setFocus(1)}
            disabled={focusIndex === zSlices - 1}
            aria-label="Focus up (W or ArrowUp)"
          >
            ↑
          </button>
        </div>
      </fieldset>

      {isLoading && <span style={{ color: '#888', fontSize: '0.85rem' }}>Loading…</span>}
    </div>
  )
}
