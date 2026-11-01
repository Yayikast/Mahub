import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { MOCK } from './api.js'
import RequireRole from './components/RequireRole.jsx'
import Shell from './components/Shell.jsx'
import Login from './pages/Login.jsx'
import NotRegistered from './pages/NotRegistered.jsx'
import ScanFailed from './pages/ScanFailed.jsx'
import NotFound from './pages/NotFound.jsx'
import MySections from './pages/MySections.jsx'
import SectionPage from './pages/SectionPage.jsx'
import Session from './pages/Session.jsx'
import Projector from './pages/Projector.jsx'
import Summary from './pages/Summary.jsx'
import Checkin from './pages/Checkin.jsx'
import MyClass from './pages/MyClass.jsx'
import MyAttendance from './pages/MyAttendance.jsx'
import Scan from './pages/Scan.jsx'
import Admin from './pages/Admin.jsx'

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
          {MOCK && <Route path="scan" element={<Scan />} />}

          <Route path="admin" element={only('admin', <Admin />)} />

          <Route path="instructor" element={only('instructor', <MySections />)} />
          <Route path="instructor/sections/:id" element={only('instructor', <SectionPage />)} />
          <Route path="session/:id" element={only('instructor', <Session />)} />
          <Route path="summary/:id" element={only('instructor', <Summary />)} />

        </Route>

        {/* Full-screen pages: no top bar (projector, and the student's phone check-in screens) */}
        <Route path="projector/:id" element={only('instructor', <Projector />)} />
        <Route path="checkin" element={only('student', <Checkin />)} />
        <Route path="me" element={only('student', <MyAttendance />)} />
        <Route path="me/classes/:id" element={only('student', <MyClass />)} />
        <Route path="scan-failed" element={<ScanFailed />} />
        <Route index element={<Login />} />
        <Route path="not-registered" element={<NotRegistered />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <Suspense fallback={null}><DevPanel /></Suspense>
    </>
  )
}
