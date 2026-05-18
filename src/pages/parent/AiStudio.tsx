// src/pages/parent/AiStudio.tsx
import { useSearchParams } from 'react-router-dom'
import CustomBank from './CustomBank'
import ConnectAi from './ConnectAi'

const SUBTABS = ['review', 'connect'] as const
type SubTab = (typeof SUBTABS)[number]
const LABEL: Record<SubTab, string> = {
  review: 'Review queue',
  connect: 'Connect AI',
}

export default function AiStudio() {
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab')
  const tab: SubTab = (SUBTABS as readonly string[]).includes(raw ?? '')
    ? (raw as SubTab)
    : 'review'

  return (
    <div>
      <header className="mb-5">
        <h1 className="font-display text-3xl">AI Studio</h1>
        <nav className="mt-3 flex gap-1 text-sm">
          {SUBTABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setParams({ tab: t }, { replace: false })}
              className={`rounded-full px-3 py-1.5 font-semibold transition ${
                tab === t
                  ? 'bg-white text-ink shadow ring-1 ring-cloud'
                  : 'text-ink/60 hover:text-ink'
              }`}
            >
              {LABEL[t]}
            </button>
          ))}
        </nav>
      </header>
      {tab === 'review' ? <CustomBank /> : <ConnectAi />}
    </div>
  )
}
