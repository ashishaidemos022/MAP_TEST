// src/pages/parent/AiStudio.tsx
// Router for the AI Studio area:
//   ?tab=connect      → ConnectAi
//   ?bank=<uuid>      → CustomBank (per-bank review)
//   ?legacy=1         → LegacyItems
//   (no param)        → ReviewBanks (default)
import { useSearchParams } from 'react-router-dom'
import CustomBank from './CustomBank'
import ConnectAi from './ConnectAi'
import ReviewBanks from './ReviewBanks'
import LegacyItems from './LegacyItems'

export default function AiStudio() {
  const [params] = useSearchParams()
  if (params.get('tab') === 'connect') return <ConnectAi />
  if (params.get('bank')) return <CustomBank />
  if (params.get('legacy') === '1') return <LegacyItems />
  return <ReviewBanks />
}
