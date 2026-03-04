interface Props {
  open: boolean
  onClose: () => void
}

export default function HelpModal({ open, onClose }: Props) {
  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#222',
          color: '#ddd',
          padding: '1.5rem 2rem',
          borderRadius: 12,
          maxWidth: 360,
          width: '90%',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}
      >
        <h2 style={{ margin: '0 0 1rem', fontSize: '1.1rem' }}>Keyboard Shortcuts</h2>
        <table style={{ width: '100%', borderSpacing: '0 4px', fontSize: '0.9rem' }}>
          <tbody>
            <Row keys="A / [" action="Zoom out" />
            <Row keys="D / ]" action="Zoom in" />
            <Row keys="W" action="Focus up" />
            <Row keys="S" action="Focus down" />
            <Row keys="← ↑ ↓ →" action="Translate FOV (when Arrows mode is ON)" />
            <Row keys="Gamepad D-Pad / L-Stick" action="Zoom & focus" />
            <Row keys="Gamepad R-Stick" action="Translate FOV (when Arrows mode is ON)" />
            <Row keys="A / Cross" action="Toggle Arrows mode" />
            <Row keys="B / Circle" action="Center FOV" />
            <Row keys="H" action="Toggle this help" />
          </tbody>
        </table>
        <button
          onClick={onClose}
          style={{
            marginTop: '1rem',
            padding: '0.4rem 1.2rem',
            fontSize: '0.85rem',
            cursor: 'pointer',
            borderRadius: 6,
            border: '1px solid #555',
            background: '#333',
            color: '#ddd',
          }}
        >
          Close
        </button>
      </div>
    </div>
  )
}

function Row({ keys, action }: { keys: string; action: string }) {
  return (
    <tr>
      <td style={{ paddingRight: 16 }}>
        <kbd style={{
          background: '#333',
          padding: '2px 6px',
          borderRadius: 4,
          fontSize: '0.85rem',
          fontFamily: 'monospace',
        }}>
          {keys}
        </kbd>
      </td>
      <td>{action}</td>
    </tr>
  )
}
