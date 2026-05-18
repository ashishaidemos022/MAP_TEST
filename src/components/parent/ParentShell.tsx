// src/components/parent/ParentShell.tsx
// Flag-on parent shell: header + nav + routed content. Interim nav targets
// (Library/Tests/History) point at existing legacy routes per the 2a spec;
// 2b/2c flip these in one place.
import { Link, NavLink, Outlet } from 'react-router-dom'

const navItems: { to: string; label: string }[] = [
  { to: '/parent', label: 'Classroom' },
  { to: '/parent/custom-bank', label: 'Library' },
  { to: '/parent/custom-test', label: 'Tests' },
  { to: '/history', label: 'History' },
]

export default function ParentShell() {
  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 mt-2 flex items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <span className="font-display text-2xl">Practice</span>
          <nav className="flex items-center gap-1 text-sm">
            {navItems.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === '/parent'}
                className={({ isActive }) =>
                  `rounded-full px-3 py-1.5 font-semibold transition ${
                    isActive ? 'bg-white text-ink shadow ring-1 ring-cloud' : 'text-ink/60 hover:text-ink'
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <Link to="/" className="btn-ghost text-sm">
          Switch profile
        </Link>
      </header>
      <Outlet />
    </div>
  )
}
