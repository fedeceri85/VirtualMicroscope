import { useMicroscopeStore } from '../store/useMicroscopeStore'

interface Props {
  onHelp: () => void
}

export default function Toggles({ onHelp }: Props) {
  const showReticle = useMicroscopeStore((s) => s.showReticle)
  const showVignette = useMicroscopeStore((s) => s.showVignette)
  const toggleReticle = useMicroscopeStore((s) => s.toggleReticle)
  const toggleVignette = useMicroscopeStore((s) => s.toggleVignette)

  const btnStyle: React.CSSProperties = {
    padding: '4px 10px',
    fontSize: '0.8rem',
    cursor: 'pointer',
    borderRadius: 4,
    border: '1px solid #555',
    background: 'transparent',
    color: '#ccc',
  }

  const activeStyle: React.CSSProperties = {
    ...btnStyle,
    background: '#444',
    color: '#fff',
    borderColor: '#888',
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: 8,
        right: 8,
        display: 'flex',
        gap: 6,
      }}
    >
      <button
        style={showReticle ? activeStyle : btnStyle}
        onClick={toggleReticle}
        aria-label="Toggle reticle overlay"
        title="Reticle"
      >
        ✛
      </button>
      <button
        style={showVignette ? activeStyle : btnStyle}
        onClick={toggleVignette}
        aria-label="Toggle vignette overlay"
        title="Vignette"
      >
        ◎
      </button>
      <button
        style={btnStyle}
        onClick={onHelp}
        aria-label="Show keyboard shortcuts"
        title="Help (H)"
      >
        ?
      </button>
    </div>
  )
}
