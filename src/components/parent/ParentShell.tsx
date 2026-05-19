// src/components/parent/ParentShell.tsx
// 3-tab parent nav + Outlet. Nav idiom mirrors the shelved ParentShell
// (rounded-pill NavLinks) but with the agreed Classroom/Tests&Banks/AI Studio tabs.
import { Link, NavLink, Outlet } from 'react-router-dom'

const navItems: { to: string; label: string; end?: boolean }[] = [
  { to: '/parent', label: 'Classroom', end: true },
  { to: '/parent/tests', label: 'Tests & Banks' },
  { to: '/parent/ai-studio', label: 'AI Studio' },
]

export default function ParentShell() {
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
                  `rounded-full px-3 py-1.5 transition ${
                    isActive
                      ? 'bg-white font-semibold text-ink ring-1 ring-cloud'
                      : 'text-smoke hover:text-ink'
                  }`
                }
              >
                {n.label}
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
