// src/components/parent/classroom/ClassroomQuickActions.tsx
import { Link } from 'react-router-dom'

export function ClassroomQuickActions() {
  return (
    <div className="mt-6 flex flex-wrap gap-2">
      <Link to="/parent/custom-test" className="btn-secondary text-sm">
        Build test for multiple kids
      </Link>
      <Link to="/parent/custom-bank" className="btn-secondary text-sm">
        Open content library
      </Link>
    </div>
  )
}
