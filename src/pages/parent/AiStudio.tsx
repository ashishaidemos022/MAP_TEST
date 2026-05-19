// src/pages/parent/AiStudio.tsx
// Thin router for the AI Studio area. Default view is the review queue
// (CustomBank). The Connect AI page mounts when ?tab=connect — same URL
// contract as before, but the duplicated sub-tab nav is gone; entry to
// Connect AI now lives as a settings-style button in CustomBank's action
// bar (see CustomBank.tsx).
import { useSearchParams } from 'react-router-dom'
import CustomBank from './CustomBank'
import ConnectAi from './ConnectAi'

export default function AiStudio() {
  const [params] = useSearchParams()
  const tab = params.get('tab') === 'connect' ? 'connect' : 'review'
  return tab === 'connect' ? <ConnectAi /> : <CustomBank />
}
