let currentUtterance: SpeechSynthesisUtterance | null = null

export function speak(text: string): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.rate = 0.95
  u.pitch = 1.05
  u.volume = 1
  const voices = window.speechSynthesis.getVoices()
  const preferred =
    voices.find((v) => /female|samantha|victoria|karen|allison|google us/i.test(v.name)) ??
    voices.find((v) => v.lang.startsWith('en'))
  if (preferred) u.voice = preferred
  currentUtterance = u
  window.speechSynthesis.speak(u)
}

export function stopSpeaking(): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  window.speechSynthesis.cancel()
  currentUtterance = null
}

export function isSpeaking(): boolean {
  if (typeof window === 'undefined' || !window.speechSynthesis) return false
  return window.speechSynthesis.speaking
}

export function primeVoices(): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  window.speechSynthesis.getVoices()
}

export { currentUtterance }
