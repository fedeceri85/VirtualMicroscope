import { useCallback, useEffect, useState } from 'react'
import { loadManifest, type Manifest } from './lib/manifest'
import { useMicroscopeStore } from './store/useMicroscopeStore'
import PixiStage from './pixi/PixiStage'
import Controls from './ui/Controls'
import Hud from './ui/Hud'
import Toggles from './ui/Toggles'
import HelpModal from './ui/HelpModal'
import IntroScreen from './ui/IntroScreen'
import './App.css'

function App() {
  const [manifest, setManifest] = useState<Manifest | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [enteredMicroscope, setEnteredMicroscope] = useState(false)
  const init = useMicroscopeStore((s) => s.init)
  const storeError = useMicroscopeStore((s) => s.error)

  useEffect(() => {
    loadManifest()
      .then((m) => {
        setManifest(m)
        init(m.zoomLevels, m.zSlices)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err))
      })
  }, [init])

  /* H key toggles help modal */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) return
      if (e.key === 'h' || e.key === 'H') {
        setHelpOpen((v) => !v)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const toggleHelp = useCallback(() => setHelpOpen((v) => !v), [])
  const goBackToOutside = useCallback(() => {
    setHelpOpen(false)
    setEnteredMicroscope(false)
  }, [])

  if (error) {
    return <div style={{ color: 'red', padding: '2rem' }}>Error loading manifest: {error}</div>
  }

  if (!manifest) {
    return <div style={{ padding: '2rem' }}>Loading manifest…</div>
  }

  return (
    <div className="app-layout">
      <h1 className="app-title">Virtual Microscope</h1>

      {!enteredMicroscope ? (
        <IntroScreen onEnter={() => setEnteredMicroscope(true)} />
      ) : (
        <>
          <div className="canvas-area" style={{ position: 'relative' }}>
            <PixiStage manifest={manifest} />
            <Hud />
            <Toggles onHelp={toggleHelp} onBack={goBackToOutside} />
          </div>

          {storeError && <div style={{ color: '#f88', fontSize: '0.85rem' }}>{storeError}</div>}

          <Controls />
        </>
      )}
      <HelpModal open={helpOpen} onClose={toggleHelp} />
    </div>
  )
}

export default App
