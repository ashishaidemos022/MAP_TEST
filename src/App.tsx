import { Link, Route, Routes, useLocation } from 'react-router-dom'
import Boost from './pages/Boost'
import History from './pages/History'
import Home from './pages/Home'
import Login from './pages/Login'
import NewTest from './pages/NewTest'
import Onboarding from './pages/Onboarding'
import ProfilePicker from './pages/ProfilePicker'
import Results from './pages/Results'
import Signup from './pages/Signup'
import TestRunner from './pages/TestRunner'
import ConnectAi from './pages/parent/ConnectAi'
import CustomBank from './pages/parent/CustomBank'
import CustomTestBuilder from './pages/parent/CustomTestBuilder'
import NewCustomPassage from './pages/parent/NewCustomPassage'
import NewCustomQuestion from './pages/parent/NewCustomQuestion'
import ParentRoot from './pages/parent/ParentRoot'
import { RequireActiveStudent } from './lib/activeStudent'
import { RequireAuth } from './lib/auth'
import { RequireParentPin } from './lib/parentPin'

const HEADERLESS_ROUTES = new Set([
  '/',
  '/login',
  '/signup',
  '/onboarding',
])

export default function App() {
  const loc = useLocation()
  const inTest = loc.pathname.startsWith('/test/') && !loc.pathname.endsWith('/results')
  const hideHeader = inTest || HEADERLESS_ROUTES.has(loc.pathname)

  return (
    <div className="min-h-full">
      {!hideHeader && (
        <header className="px-6 pt-6">
          <div className="mx-auto flex max-w-5xl items-center justify-between">
            <Link to="/home" className="flex items-center gap-2">
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-sun text-ink shadow-card">
                <span className="font-display text-2xl">★</span>
              </span>
              <span className="font-display text-2xl tracking-wide">Practice</span>
            </Link>
            <nav className="flex items-center gap-2">
              <Link to="/home" className="btn-ghost text-sm">
                Home
              </Link>
              <Link to="/history" className="btn-ghost text-sm">
                History
              </Link>
              <Link to="/" className="btn-ghost text-sm">
                Switch profile
              </Link>
            </nav>
          </div>
        </header>
      )}

      <main className={inTest ? '' : 'px-6 py-8'}>
        <Routes>
          <Route
            path="/"
            element={
              <RequireAuth>
                <ProfilePicker />
              </RequireAuth>
            }
          />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route
            path="/onboarding"
            element={
              <RequireAuth>
                <Onboarding />
              </RequireAuth>
            }
          />
          <Route
            path="/home"
            element={
              <RequireAuth>
                <RequireActiveStudent>
                  <Home />
                </RequireActiveStudent>
              </RequireAuth>
            }
          />
          <Route
            path="/test/new"
            element={
              <RequireAuth>
                <RequireActiveStudent>
                  <NewTest />
                </RequireActiveStudent>
              </RequireAuth>
            }
          />
          <Route
            path="/test/:id"
            element={
              <RequireAuth>
                <RequireActiveStudent>
                  <TestRunner />
                </RequireActiveStudent>
              </RequireAuth>
            }
          />
          <Route
            path="/test/:id/results"
            element={
              <RequireAuth>
                <RequireActiveStudent>
                  <Results />
                </RequireActiveStudent>
              </RequireAuth>
            }
          />
          <Route
            path="/history"
            element={
              <RequireAuth>
                <RequireActiveStudent>
                  <History />
                </RequireActiveStudent>
              </RequireAuth>
            }
          />
          <Route
            path="/boost"
            element={
              <RequireAuth>
                <RequireActiveStudent>
                  <Boost />
                </RequireActiveStudent>
              </RequireAuth>
            }
          />
          <Route
            path="/parent/*"
            element={
              <RequireAuth>
                <RequireActiveStudent>
                  <RequireParentPin>
                    <ParentRoot />
                  </RequireParentPin>
                </RequireActiveStudent>
              </RequireAuth>
            }
          />
          <Route
            path="/parent/custom-test"
            element={
              <RequireAuth>
                <RequireActiveStudent>
                  <RequireParentPin>
                    <CustomTestBuilder />
                  </RequireParentPin>
                </RequireActiveStudent>
              </RequireAuth>
            }
          />
          <Route
            path="/parent/custom-bank"
            element={
              <RequireAuth>
                <RequireActiveStudent>
                  <RequireParentPin>
                    <CustomBank />
                  </RequireParentPin>
                </RequireActiveStudent>
              </RequireAuth>
            }
          />
          <Route
            path="/parent/custom-bank/new-question"
            element={
              <RequireAuth>
                <RequireActiveStudent>
                  <RequireParentPin>
                    <NewCustomQuestion />
                  </RequireParentPin>
                </RequireActiveStudent>
              </RequireAuth>
            }
          />
          <Route
            path="/parent/custom-bank/new-passage"
            element={
              <RequireAuth>
                <RequireActiveStudent>
                  <RequireParentPin>
                    <NewCustomPassage />
                  </RequireParentPin>
                </RequireActiveStudent>
              </RequireAuth>
            }
          />
          <Route
            path="/parent/connect-ai"
            element={
              <RequireAuth>
                <RequireParentPin>
                  <ConnectAi />
                </RequireParentPin>
              </RequireAuth>
            }
          />
          <Route path="*" element={<ProfilePicker />} />
        </Routes>
      </main>
    </div>
  )
}
