import { useMicroscopeStore } from '../store/useMicroscopeStore'

export default function Hud() {
  const isLoading = useMicroscopeStore((s) => s.isLoading)

  if (!isLoading) {
    return null
  }

  return (
    <div className="hud" aria-live="polite">
      {isLoading && <span className="hud-loading">⏳</span>}
    </div>
  )
}
