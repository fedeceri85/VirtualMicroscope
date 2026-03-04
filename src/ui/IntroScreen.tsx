import { useState } from 'react'

interface Props {
  onEnter: () => void
}

export default function IntroScreen({ onEnter }: Props) {
  const [src, setSrc] = useState(`${import.meta.env.BASE_URL}microscope_intro.png`)
  const [isEntering, setIsEntering] = useState(false)

  const handleEnter = () => {
    if (isEntering) return
    setIsEntering(true)
    window.setTimeout(() => onEnter(), 650)
  }

  return (
    <div className="intro-wrap" aria-label="Microscope introduction screen">
      <p className="intro-copy">Click the oculars to begin exploration</p>
      <div className={`intro-image-frame ${isEntering ? 'entering' : ''}`}>
        <img
          src={src}
          alt="Diagram of a microscope with labeled parts"
          className="intro-image"
          onError={() => setSrc(`${import.meta.env.BASE_URL}microscope_diagram_fallback.svg`)}
        />
        <button
          type="button"
          className="intro-ocular-hotspot"
          aria-label="Enter microscope view from oculars"
          onClick={handleEnter}
          title="Enter microscope view"
          disabled={isEntering}
        >
          {isEntering ? 'Entering…' : 'Enter view'}
        </button>
      </div>
    </div>
  )
}
