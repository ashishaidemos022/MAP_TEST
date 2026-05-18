// src/pages/parent/Tests.tsx
// Tests tab router. ?tab= ∈ active|completed|templates, default active,
// unknown → active. Mirrors Library.tsx / KidDetail.tsx.
import { useSearchParams } from 'react-router-dom'
import { ActiveTab } from '../../components/parent/tests/ActiveTab'
import { CompletedTab } from '../../components/parent/tests/CompletedTab'
import { TemplatesTab } from '../../components/parent/tests/TemplatesTab'

const TABS = ['active', 'completed', 'templates'] as const
type Tab = (typeof TABS)[number]
const LABEL: Record<Tab, string> = {
  active: 'Active',
  completed: 'Completed',
  templates: 'Templates',
}

export default function Tests() {
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab')
  const tab: Tab = (TABS as readonly string[]).includes(raw ?? '')
    ? (raw as Tab)
    : 'active'
  return (
    <div>
      <header className="mb-5">
        <p className="font-display text-lg uppercase tracking-widest text-smoke">
          Parent view
        </p>
        <h1 className="font-display text-4xl">Tests</h1>
        <nav className="mt-4 flex gap-1 text-sm">
          {TABS.map((t) => (
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
      {tab === 'active' && <ActiveTab />}
      {tab === 'completed' && <CompletedTab />}
      {tab === 'templates' && <TemplatesTab />}
    </div>
  )
}
