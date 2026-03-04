import { useMicroscopeStore } from '../store/useMicroscopeStore'

function getObjectiveLabel(zoomIndex: number, zoomLevels: number): string {
  if (zoomLevels <= 1) return '4x'
  const normalized = zoomIndex / (zoomLevels - 1)
  if (normalized < 0.25) return '4x'
  if (normalized < 0.5) return '10x'
  if (normalized < 0.75) return '20x'
  return '40x'
}

export default function Hud() {
  const zoomIndex = useMicroscopeStore((s) => s.zoomIndex)
  const focusIndex = useMicroscopeStore((s) => s.focusIndex)
  const zoomLevels = useMicroscopeStore((s) => s.zoomLevels)
  const zSlices = useMicroscopeStore((s) => s.zSlices)
  const isLoading = useMicroscopeStore((s) => s.isLoading)
  const objective = getObjectiveLabel(zoomIndex, zoomLevels)

  return (
    <div className="hud" aria-live="polite">
      <span className="hud-chip">Objective {objective}</span>
      <span className="hud-sep" />
      <span className="hud-readout">Zoom {zoomIndex + 1}/{zoomLevels}</span>
      <span className="hud-readout">Focus {focusIndex + 1}/{zSlices}</span>
      {isLoading && <span className="hud-loading">⏳</span>}
    </div>
  )
}
