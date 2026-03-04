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

  const tickCount = Math.max(8, Math.min(24, max - min + 1))
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
  const resetPan = useMicroscopeStore((s) => s.resetPan)
  const panEnabled = useMicroscopeStore((s) => s.panEnabled)
  const setPanEnabled = useMicroscopeStore((s) => s.setPanEnabled)
  const zoomIndex = useMicroscopeStore((s) => s.zoomIndex)
  const focusIndex = useMicroscopeStore((s) => s.focusIndex)
  const zoomLevels = useMicroscopeStore((s) => s.zoomLevels)
  const zSlices = useMicroscopeStore((s) => s.zSlices)
  const isLoading = useMicroscopeStore((s) => s.isLoading)
  const focusStep = 1
  const [controllerConnected, setControllerConnected] = useState(false)

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
          store.setFocus(focusStep)
          break
        case 's':
          store.setFocus(-focusStep)
          break
        case 'ArrowUp':
          e.preventDefault()
          if (store.panEnabled) store.nudgePan(0, -14)
          break
        case 'ArrowDown':
          e.preventDefault()
          if (store.panEnabled) store.nudgePan(0, 14)
          break
        case 'ArrowLeft':
          e.preventDefault()
          if (store.panEnabled) store.nudgePan(-14, 0)
          break
        case 'ArrowRight':
          e.preventDefault()
          if (store.panEnabled) store.nudgePan(14, 0)
          break
      }
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [focusStep])

  /* ---- External gamepad support (Xbox / PlayStation style) ---- */
  useEffect(() => {
    const DEADZONE = 0.55
    const REPEAT_MS = 120
    const PAN_STEP = 12
    const actionTimestamps: Record<string, number> = {
      zoomMinus: 0,
      zoomPlus: 0,
      focusPlus: 0,
      focusMinus: 0,
      panLeft: 0,
      panRight: 0,
      panUp: 0,
      panDown: 0,
    }

    let prevTogglePanPressed = false
    let prevResetPanPressed = false
    let lastConnected = false
    let rafId = 0

    const shouldRepeat = (name: keyof typeof actionTimestamps, active: boolean, now: number): boolean => {
      if (!active) {
        actionTimestamps[name] = 0
        return false
      }
      if (now - actionTimestamps[name] >= REPEAT_MS) {
        actionTimestamps[name] = now
        return true
      }
      return false
    }

    const loop = () => {
      const gamepads = navigator.getGamepads?.() ?? []
      const gamepad = gamepads.find((g): g is Gamepad => Boolean(g && g.connected))
      const connected = Boolean(gamepad)
      if (connected !== lastConnected) {
        lastConnected = connected
        setControllerConnected(connected)
      }

      if (gamepad) {
        const store = useMicroscopeStore.getState()
        const now = performance.now()

        const axisX = gamepad.axes[0] ?? 0
        const axisY = gamepad.axes[1] ?? 0
        const panAxisX = gamepad.axes[2] ?? 0
        const panAxisY = gamepad.axes[3] ?? 0

        const dpadUp = gamepad.buttons[12]?.pressed ?? false
        const dpadDown = gamepad.buttons[13]?.pressed ?? false
        const dpadLeft = gamepad.buttons[14]?.pressed ?? false
        const dpadRight = gamepad.buttons[15]?.pressed ?? false

        const l1 = gamepad.buttons[4]?.pressed ?? false
        const r1 = gamepad.buttons[5]?.pressed ?? false
        const l2 = (gamepad.buttons[6]?.value ?? 0) > 0.5
        const r2 = (gamepad.buttons[7]?.value ?? 0) > 0.5

        const togglePanPressed = gamepad.buttons[0]?.pressed ?? false // A / Cross
        const resetPanPressed = gamepad.buttons[1]?.pressed ?? false // B / Circle

        if (togglePanPressed && !prevTogglePanPressed) {
          store.setPanEnabled(!store.panEnabled)
        }
        if (resetPanPressed && !prevResetPanPressed) {
          store.resetPan()
        }
        prevTogglePanPressed = togglePanPressed
        prevResetPanPressed = resetPanPressed

        const zoomMinus = dpadLeft || axisX < -DEADZONE || l1
        const zoomPlus = dpadRight || axisX > DEADZONE || r1
        const focusPlusInput = dpadUp || axisY < -DEADZONE || l2
        const focusMinusInput = dpadDown || axisY > DEADZONE || r2

        if (shouldRepeat('zoomMinus', zoomMinus, now)) store.setZoom(-1)
        if (shouldRepeat('zoomPlus', zoomPlus, now)) store.setZoom(1)
        if (shouldRepeat('focusPlus', focusPlusInput, now)) store.setFocus(1)
        if (shouldRepeat('focusMinus', focusMinusInput, now)) store.setFocus(-1)

        if (store.panEnabled) {
          const panLeft = panAxisX < -DEADZONE
          const panRight = panAxisX > DEADZONE
          const panUp = panAxisY < -DEADZONE
          const panDown = panAxisY > DEADZONE

          if (shouldRepeat('panLeft', panLeft, now)) store.nudgePan(-PAN_STEP, 0)
          if (shouldRepeat('panRight', panRight, now)) store.nudgePan(PAN_STEP, 0)
          if (shouldRepeat('panUp', panUp, now)) store.nudgePan(0, -PAN_STEP)
          if (shouldRepeat('panDown', panDown, now)) store.nudgePan(0, PAN_STEP)
        }
      } else {
        prevTogglePanPressed = false
        prevResetPanPressed = false
      }

      rafId = window.requestAnimationFrame(loop)
    }

    rafId = window.requestAnimationFrame(loop)
    return () => window.cancelAnimationFrame(rafId)
  }, [])

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
        </div>
      </fieldset>

      <fieldset className="control-group pan-group">
        <legend>FOV Translate</legend>
        <div className="pan-controls">
          <button
            type="button"
            className={`pan-toggle ${panEnabled ? 'active' : ''}`}
            onClick={() => setPanEnabled(!panEnabled)}
            aria-label="Enable arrow-key translation of field of view"
          >
            {panEnabled ? 'Arrows On' : 'Arrows Off'}
          </button>
          <button
            type="button"
            className="pan-reset"
            onClick={resetPan}
            aria-label="Reset field-of-view translation"
          >
            Center
          </button>
        </div>
      </fieldset>

      {controllerConnected && <span className="controller-indicator">🎮 Controller connected</span>}
      {isLoading && <span className="loading-indicator">Loading…</span>}
    </div>
  )
}
