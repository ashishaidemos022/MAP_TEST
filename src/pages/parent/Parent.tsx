import { Link } from 'react-router-dom'
import CustomTestList from './CustomTestList'
import ParentDashboard from './ParentDashboard'
import ParentSettings from './ParentSettings'

export default function Parent() {
  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 mt-2 flex items-center justify-between">
        <div>
          <p className="font-display text-lg uppercase tracking-widest text-smoke">
            Parent view
          </p>
          <h1 className="font-display text-4xl">Mastery dashboard</h1>
        </div>
        <Link to="/" className="btn-ghost text-sm">
          Back to app
        </Link>
      </header>
      <ParentSettings />
      <CustomTestList />
      <ParentDashboard />
    </div>
  )
}
