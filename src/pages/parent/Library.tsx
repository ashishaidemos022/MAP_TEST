// src/pages/parent/Library.tsx
// Library tab router. ?tab= ∈ vetted|my_questions|ai_studio, default vetted,
// unknown → vetted. Mirrors KidDetail's tab mechanic. The ai_studio pill is
// amber-tinted — the only non-neutral tab (brief §5.3).
import { useSearchParams } from 'react-router-dom'
import { VettedTab } from '../../components/parent/library/VettedTab'
import { MyQuestionsTab } from '../../components/parent/library/MyQuestionsTab'
import { AiStudioTab } from '../../components/parent/library/AiStudioTab'

const TABS = ['vetted', 'my_questions', 'ai_studio'] as const
type Tab = (typeof TABS)[number]
const LABEL: Record<Tab, string> = {
  vetted: 'Vetted',
  my_questions: 'My questions',
  ai_studio: 'AI Studio',
}

export default function Library() {
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab')
  const tab: Tab = (TABS as readonly string[]).includes(raw ?? '')
    ? (raw as Tab)
    : 'vetted'

  return (
    <div>
      <header className="mb-5">
        <p className="font-display text-lg uppercase tracking-widest text-smoke">
          Parent view
        </p>
        <h1 className="font-display text-4xl">Library</h1>
        <nav className="mt-4 flex gap-1 text-sm">
          {TABS.map((t) => {
            const active = tab === t
            const amber = t === 'ai_studio'
            return (
              <button
                key={t}
                type="button"
                onClick={() => setParams({ tab: t }, { replace: false })}
                className={`rounded-full px-3 py-1.5 font-semibold transition ${
                  active
                    ? amber
                      ? 'bg-sun/20 text-ink shadow ring-1 ring-sun/50'
                      : 'bg-white text-ink shadow ring-1 ring-cloud'
                    : amber
                      ? 'text-amber-700/70 hover:text-amber-700'
                      : 'text-ink/60 hover:text-ink'
                }`}
              >
                {LABEL[t]}
              </button>
            )
          })}
        </nav>
      </header>

      {tab === 'vetted' && <VettedTab />}
      {tab === 'my_questions' && <MyQuestionsTab />}
      {tab === 'ai_studio' && <AiStudioTab />}
    </div>
  )
}
