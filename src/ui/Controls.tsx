import { useEffect, useMemo, useState } from 'react'
import { useMicroscopeStore } from '../store/useMicroscopeStore'

interface RotaryKnobProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  ariaLabel: string
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function RotaryKnob({
  label,
  value,
  min,
  max,
  step,
  onChange,
  ariaLabel,
}: RotaryKnobProps) {
  const [isDragging, setIsDragging] = useState(false)

  const range = Math.max(1, max - min)
  const ratio = (value - min) / range
  const angle = -135 + ratio * 270

  const tickCount = Math.max(8, max - min + 1)
  const ticks = useMemo(() => {
    const arr: Array<{ active: boolean; angle: number }> = []
    for (let i = 0; i < tickCount; i++) {
      const t = tickCount <= 1 ? 0 : i / (tickCount - 1)
      arr.push({
        active: t <= ratio + 0.0001,
        angle: -135 + t * 270,
      })
    }
    return arr
  }, [tickCount, ratio])

  const updateFromDelta = (startValue: number, dy: number) => {
    const deltaSteps = Math.round(-dy / 10)
    const next = clamp(startValue + deltaSteps * step, min, max)
    onChange(next)
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    const target = e.currentTarget
    target.setPointerCapture(e.pointerId)
    setIsDragging(true)

    const startY = e.clientY
    const startValue = value

    const move = (ev: PointerEvent) => updateFromDelta(startValue, ev.clientY - startY)
    const up = () => {
      setIsDragging(false)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault()
    const direction = e.deltaY < 0 ? 1 : -1
    onChange(clamp(value + direction * step, min, max))
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
      e.preventDefault()
      onChange(clamp(value + step, min, max))
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
      e.preventDefault()
      onChange(clamp(value - step, min, max))
      return
    }
    if (e.key === 'Home') {
      e.preventDefault()
      onChange(min)
      return
    }
    if (e.key === 'End') {
      e.preventDefault()
      onChange(max)
    }
  }

  return (
    <div className="knob-block">
      <span className="knob-label">{label}</span>
      <div className="knob-ticks" aria-hidden="true">
        {ticks.map((tick, index) => (
          <span
            key={index}
            className={`knob-tick ${tick.active ? 'active' : ''}`}
            style={{ transform: `translate(-50%, -50%) rotate(${tick.angle}deg)` }}
          />
        ))}
      </div>
      <div
        className={`knob-face ${isDragging ? 'dragging' : ''}`}
        role="slider"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        onPointerDown={onPointerDown}
        onWheel={onWheel}
        onKeyDown={onKeyDown}
      >
        <span className="knob-cap" style={{ transform: `translate(-50%, -50%) rotate(${angle}deg)` }} />
        <span className="knob-center" />
      </div>
    </div>
  )
}

export default function Controls() {
  const setZoomAbsolute = useMicroscopeStore((s) => s.setZoomAbsolute)
  const setFocusAbsolute = useMicroscopeStore((s) => s.setFocusAbsolute)
  const zoomIndex = useMicroscopeStore((s) => s.zoomIndex)
  const focusIndex = useMicroscopeStore((s) => s.focusIndex)
  const zoomLevels = useMicroscopeStore((s) => s.zoomLevels)
  const zSlices = useMicroscopeStore((s) => s.zSlices)
  const isLoading = useMicroscopeStore((s) => s.isLoading)
  const [focusMode, setFocusMode] = useState<'fine' | 'coarse'>('fine')

  const focusStep = focusMode === 'fine' ? 1 : 3

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
          store.setFocus(focusStep)
          break
        case 's':
        case 'ArrowDown':
          e.preventDefault()
          store.setFocus(-focusStep)
          break
      }
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [focusStep])

  return (
    <div className="controls-bar">
      <fieldset className="control-group mechanical">
        <legend>Magnification</legend>
        <div className="dial-wrap rotary-wrap">
          <RotaryKnob
            label="Zoom"
            min={0}
            max={Math.max(0, zoomLevels - 1)}
            value={zoomIndex}
            step={1}
            onChange={setZoomAbsolute}
            ariaLabel="Zoom knob (A/D or [ ])"
          />
          <span className="index-label">{zoomIndex + 1} / {zoomLevels}</span>
        </div>
      </fieldset>

      <fieldset className="control-group mechanical">
        <legend>Focus Drive</legend>
        <div className="dial-wrap rotary-wrap">
          <RotaryKnob
            label="Focus"
            min={0}
            max={Math.max(0, zSlices - 1)}
            value={focusIndex}
            step={focusStep}
            onChange={setFocusAbsolute}
            ariaLabel="Focus knob (W/S or ArrowUp/ArrowDown)"
          />
          <span className="index-label">{focusIndex + 1} / {zSlices}</span>
          <div className="mode-toggle" role="group" aria-label="Focus step mode">
            <button
              type="button"
              className={focusMode === 'fine' ? 'active' : ''}
              onClick={() => setFocusMode('fine')}
            >
              Fine
            </button>
            <button
              type="button"
              className={focusMode === 'coarse' ? 'active' : ''}
              onClick={() => setFocusMode('coarse')}
            >
              Coarse
            </button>
          </div>
        </div>
      </fieldset>

      <fieldset className="control-group mechanical auxiliary">
        <legend>Drive Status</legend>
        <div className="status-stack">
          <span>Zoom: A/D or [ ]</span>
          <span>Focus: W/S or ↑/↓</span>
          {isLoading && <span className="loading-indicator">Loading frame…</span>}
        </div>
      </fieldset>
    </div>
  )
}
