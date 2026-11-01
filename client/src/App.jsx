import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { MOCK } from './api.js'
import RequireRole from './components/RequireRole.jsx'
import Shell from './components/Shell.jsx'
import Login from './pages/Login.jsx'
import Home from './pages/Home.jsx'
import NotRegistered from './pages/NotRegistered.jsx'
import ScanFailed from './pages/ScanFailed.jsx'
import NotFound from './pages/NotFound.jsx'
import SectionPage from './pages/SectionPage.jsx'
import Session from './pages/Session.jsx'
import Projector from './pages/Projector.jsx'
import Summary from './pages/Summary.jsx'
import Checkin from './pages/Checkin.jsx'
import MyClass from './pages/MyClass.jsx'
import Scan from './pages/Scan.jsx'

// lazy() loads a component's code only when it is first rendered. In a real build MOCK is a
// constant false, so the mock tools are never even downloaded.
const DevPanel = import.meta.env.VITE_MOCK === '1' ? lazy(() => import('./components/DevPanel.jsx')) : () => null

const only = (role, el) => <RequireRole role={role}>{el}</RequireRole>

export default function App() {
  return (
    <>
      <Routes>
        {/* Routes inside <Shell> get the top bar */}
        <Route element={<Shell />}>
          <Route index element={<Login />} />
          <Route path="not-registered" element={<NotRegistered />} />
          <Route path="scan-failed" element={<ScanFailed />} />
          {MOCK && <Route path="scan" element={<Scan />} />}

          <Route path="admin" element={only('admin', <Home title="Admin" />)} />

          <Route path="instructor" element={only('instructor', <Home title="My sections" />)} />
          <Route path="instructor/sections/:id" element={only('instructor', <SectionPage />)} />
          <Route path="session/:id" element={only('instructor', <Session />)} />
          <Route path="summary/:id" element={only('instructor', <Summary />)} />

          <Route path="checkin" element={only('student', <Checkin />)} />
          <Route path="me" element={only('student', <Home title="My classes" />)} />
          <Route path="me/classes/:id" element={only('student', <MyClass />)} />

          <Route path="*" element={<NotFound />} />
        </Route>

        {/* The projector page is full-screen: no top bar */}
        <Route path="projector/:id" element={only('instructor', <Projector />)} />
      </Routes>
      <Suspense fallback={null}><DevPanel /></Suspense>
    </>
  )
}
