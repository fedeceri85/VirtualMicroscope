import { useCallback, useEffect, useState } from 'react'
import { loadManifest, type Manifest, type MultiManifest } from './lib/manifest'
import { useMicroscopeStore } from './store/useMicroscopeStore'
import PixiStage from './pixi/PixiStage'
import Controls from './ui/Controls'
import Hud from './ui/Hud'
import Toggles from './ui/Toggles'
import HelpModal from './ui/HelpModal'
import IntroScreen from './ui/IntroScreen'
import './App.css'

function App() {
  const [multiManifest, setMultiManifest] = useState<MultiManifest | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [enteredMicroscope, setEnteredMicroscope] = useState(false)
  const init = useMicroscopeStore((s) => s.init)
  const switchDataset = useMicroscopeStore((s) => s.switchDataset)
  const datasetIndex = useMicroscopeStore((s) => s.datasetIndex)
  const datasetCount = useMicroscopeStore((s) => s.datasetCount)
  const setDataset = useMicroscopeStore((s) => s.setDataset)
  const storeError = useMicroscopeStore((s) => s.error)

  const currentManifest: Manifest | undefined = multiManifest?.datasets[datasetIndex]

  useEffect(() => {
    loadManifest()
      .then((mm) => {
        setMultiManifest(mm)
        const first = mm.datasets[0]
        init(mm.datasets.length, first.zoomLevels, first.zSlices)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err))
      })
  }, [init])

  /* When datasetIndex changes (from arrows), update store dimensions */
  useEffect(() => {
    if (!multiManifest) return
    const ds = multiManifest.datasets[datasetIndex]
    if (ds) {
      switchDataset(datasetIndex, ds.zoomLevels, ds.zSlices)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetIndex])

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

  if (!multiManifest || !currentManifest) {
    return <div style={{ padding: '2rem' }}>Loading manifest…</div>
  }

  return (
    <div className="app-layout">
      <h1 className="app-title">Virtual Microscope</h1>

      {!enteredMicroscope ? (
        <IntroScreen onEnter={() => setEnteredMicroscope(true)} />
      ) : (
        <>
          <div className="canvas-area-wrap">
            {datasetCount > 1 && (
              <button
                className="dataset-arrow dataset-arrow-left"
                onClick={() => setDataset(-1)}
                disabled={datasetIndex === 0}
                aria-label="Previous dataset"
              >
                ‹
              </button>
            )}

            <div className="canvas-area" style={{ position: 'relative' }}>
              <PixiStage manifest={currentManifest} />
              <Hud />
              <Toggles onHelp={toggleHelp} onBack={goBackToOutside} />
            </div>

            {datasetCount > 1 && (
              <button
                className="dataset-arrow dataset-arrow-right"
                onClick={() => setDataset(1)}
                disabled={datasetIndex === datasetCount - 1}
                aria-label="Next dataset"
              >
                ›
              </button>
            )}
          </div>

          {datasetCount > 1 && (
            <div className="dataset-label">
              {currentManifest.name}
              <span className="dataset-label-count">
                {datasetIndex + 1} / {datasetCount}
              </span>
            </div>
          )}

          {storeError && <div style={{ color: '#f88', fontSize: '0.85rem' }}>{storeError}</div>}

          <Controls />
        </>
      )}
      <HelpModal open={helpOpen} onClose={toggleHelp} />
    </div>
  )
}

export default App
