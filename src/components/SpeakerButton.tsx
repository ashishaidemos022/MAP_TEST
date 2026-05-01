import { useEffect, useState } from 'react'
import { isSpeaking, speak, stopSpeaking } from '../lib/tts'

export default function SpeakerButton({ text, label }: { text: string; label?: string }) {
  const [active, setActive] = useState(false)

  useEffect(() => {
    const tick = () => setActive(isSpeaking())
    const id = window.setInterval(tick, 250)
    return () => window.clearInterval(id)
  }, [])

  return (
    <button
      type="button"
      aria-label={label ?? 'Read aloud'}
      onClick={() => {
        if (active) {
          stopSpeaking()
          setActive(false)
        } else {
          speak(text)
          setActive(true)
        }
      }}
      className={`grid h-10 w-10 place-items-center rounded-full ring-1 ring-cloud transition ${
        active ? 'bg-sky text-white' : 'bg-white text-ink hover:bg-cream'
      }`}
      title={active ? 'Stop' : 'Read aloud'}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
        <path d="M3 10v4a1 1 0 0 0 1 1h3l4 4V5L7 9H4a1 1 0 0 0-1 1Z" />
        <path d="M16 8.5a4.5 4.5 0 0 1 0 7" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <path d="M18.5 6a8 8 0 0 1 0 12" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      </svg>
    </button>
  )
}
