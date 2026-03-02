import { useMicroscopeStore } from '../store/useMicroscopeStore'

export default function Hud() {
  const zoomIndex = useMicroscopeStore((s) => s.zoomIndex)
  const focusIndex = useMicroscopeStore((s) => s.focusIndex)
  const zoomLevels = useMicroscopeStore((s) => s.zoomLevels)
  const zSlices = useMicroscopeStore((s) => s.zSlices)
  const isLoading = useMicroscopeStore((s) => s.isLoading)

  return (
    <div
      className="hud"
      aria-live="polite"
      style={{
        position: 'absolute',
        top: 8,
        left: 8,
        padding: '4px 10px',
        background: 'rgba(0,0,0,0.55)',
        borderRadius: 6,
        fontSize: '0.8rem',
        color: '#ddd',
        fontVariantNumeric: 'tabular-nums',
        pointerEvents: 'none',
        userSelect: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      Zoom: {zoomIndex + 1}/{zoomLevels} &nbsp;|&nbsp; Focus: {focusIndex + 1}/{zSlices}
      {isLoading && <span style={{ marginLeft: 8, color: '#888' }}>⏳</span>}
    </div>
  )
}
