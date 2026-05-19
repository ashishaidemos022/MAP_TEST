// src/components/parent/ParentShell.tsx
// 3-tab parent nav + Outlet. AI Studio gets a small amber count badge for
// pending drafts (passages + questions in status='draft' for this family) so
// a parent on another tab can see at a glance whether anything's waiting.
import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const navItems: { to: string; label: string; end?: boolean; badgeKind?: 'ai' }[] = [
  { to: '/parent', label: 'Classroom', end: true },
  { to: '/parent/tests', label: 'Tests & Banks' },
  { to: '/parent/ai-studio', label: 'AI Studio', badgeKind: 'ai' },
]

function useAiDraftCount(): number {
  const [n, setN] = useState(0)
  useEffect(() => {
    let alive = true
    void (async () => {
      const [p, q] = await Promise.all([
        supabase
          .from('map_custom_passages')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'draft')
          .is('soft_deleted_at', null),
        supabase
          .from('map_custom_questions')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'draft')
          .is('soft_deleted_at', null),
      ])
      if (!alive) return
      setN((p.count ?? 0) + (q.count ?? 0))
    })()
    return () => { alive = false }
  }, [])
  return n
}

export default function ParentShell() {
  const aiDrafts = useAiDraftCount()
  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 mt-2 flex items-center justify-between gap-4">
        <div className="flex items-center gap-5">
          <span className="text-xs font-semibold uppercase tracking-wider text-smoke">
            Parent
          </span>
          <nav className="flex items-center gap-1 text-sm">
            {navItems.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `inline-flex items-center gap-2 rounded-full px-3 py-1.5 transition ${
                    isActive
                      ? 'bg-white font-semibold text-ink ring-1 ring-cloud'
                      : 'text-smoke hover:text-ink'
                  }`
                }
              >
                <span>{n.label}</span>
                {n.badgeKind === 'ai' && aiDrafts > 0 && (
                  <span
                    className="rounded-full px-1.5 py-0 text-[11px] font-semibold leading-5"
                    style={{ background: '#FAEEDA', color: '#854F0B' }}
                    aria-label={`${aiDrafts} pending draft${aiDrafts === 1 ? '' : 's'}`}
                  >
                    {aiDrafts}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
        </div>
        <Link to="/" className="btn-ghost text-sm">
          Back to app
        </Link>
      </header>
      <Outlet />
    </div>
  )
}
