import { useMicroscopeStore } from '../store/useMicroscopeStore'

interface Props {
  onHelp: () => void
}

export default function Toggles({ onHelp }: Props) {
  const showReticle = useMicroscopeStore((s) => s.showReticle)
  const showVignette = useMicroscopeStore((s) => s.showVignette)
  const toggleReticle = useMicroscopeStore((s) => s.toggleReticle)
  const toggleVignette = useMicroscopeStore((s) => s.toggleVignette)

  return (
    <div className="toggle-panel">
      <button
        className={`toggle-btn ${showReticle ? 'active' : ''}`}
        onClick={toggleReticle}
        aria-label="Toggle reticle overlay"
        title="Reticle overlay"
      >
        ✛
      </button>
      <button
        className={`toggle-btn ${showVignette ? 'active' : ''}`}
        onClick={toggleVignette}
        aria-label="Toggle vignette overlay"
        title="Vignette overlay"
      >
        ◎
      </button>
      <button
        className="toggle-btn"
        onClick={onHelp}
        aria-label="Show keyboard shortcuts"
        title="Help (H)"
      >
        ?
      </button>
    </div>
  )
}
