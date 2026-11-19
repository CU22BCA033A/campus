import { lazy, Suspense } from 'react'
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { canAccess } from './access'
import { useCurrentUser } from './data/store'
import Layout from './components/Layout'
import Login from './pages/Login'
import Home from './pages/Home'

// Pages load on demand (one small chunk each) so the first screen downloads faster.
const Timetable = lazy(() => import('./pages/Timetable'))
const CourseDetail = lazy(() => import('./pages/Courses').then((m) => ({ default: m.CourseDetail })))
const Courses = lazy(() => import('./pages/Courses').then((m) => ({ default: m.Courses })))
const Assignments = lazy(() => import('./pages/Assignments'))
const Quizzes = lazy(() => import('./pages/Quizzes'))
const Attendance = lazy(() => import('./pages/Attendance'))
const Grades = lazy(() => import('./pages/Grades'))
const Feedback = lazy(() => import('./pages/Feedback'))
const Feed = lazy(() => import('./pages/Feed'))
const Clubs = lazy(() => import('./pages/Campus').then((m) => ({ default: m.Clubs })))
const Events = lazy(() => import('./pages/Campus').then((m) => ({ default: m.Events })))
const Notices = lazy(() => import('./pages/Campus').then((m) => ({ default: m.Notices })))
const Polls = lazy(() => import('./pages/Campus').then((m) => ({ default: m.Polls })))
const Fees = lazy(() => import('./pages/Services').then((m) => ({ default: m.Fees })))
const GatePass = lazy(() => import('./pages/Services').then((m) => ({ default: m.GatePass })))
const AdminReports = lazy(() => import('./pages/Admin').then((m) => ({ default: m.AdminReports })))
const AdminUsers = lazy(() => import('./pages/Admin').then((m) => ({ default: m.AdminUsers })))
const AuditLog = lazy(() => import('./pages/Admin').then((m) => ({ default: m.AuditLog })))
const Admissions = lazy(() => import('./pages/Admissions'))
const ApplyForm = lazy(() => import('./pages/Admissions').then((m) => ({ default: m.ApplyForm })))
const Exams = lazy(() => import('./pages/Exams'))
const Hostel = lazy(() => import('./pages/Hostel'))
const HR = lazy(() => import('./pages/HR'))
const Procurement = lazy(() => import('./pages/Procurement'))
const HelpCenter = lazy(() => import('./pages/HelpCenter'))
const Placements = lazy(() => import('./pages/Placements'))
const LibraryPage = lazy(() => import('./pages/Library'))
const Alumni = lazy(() => import('./pages/Alumni'))
const Classes = lazy(() => import('./pages/Classes'))
const Person = lazy(() => import('./pages/People'))
const Results = lazy(() => import('./pages/Results'))
const Profile = lazy(() => import('./pages/Profile'))
const Registration = lazy(() => import('./pages/Registration'))
const Venues = lazy(() => import('./pages/Venues'))
const Transport = lazy(() => import('./pages/Transport'))
const LostFound = lazy(() => import('./pages/LostFound'))

/** Signed-in, active, and allowed (by role/office) to open the current page. */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const user = useCurrentUser()
  const { pathname } = useLocation()
  if (!user || user.status !== 'ACTIVE') return <Navigate to="/login" replace />
  if (!canAccess(user, pathname)) return <Navigate to="/home" replace />
  return <>{children}</>
}

export default function App() {
  const user = useCurrentUser()
  return (
    // Hash routing mirrors the original portal's /V2/#/home URL scheme.
    <HashRouter>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/home" replace /> : <Login />} />
        <Route path="/apply" element={<Suspense fallback={null}><ApplyForm /></Suspense>} />
        <Route element={<RequireAuth><Layout /></RequireAuth>}>
          <Route path="/home" element={<Home />} />
          <Route path="/timetable" element={<Timetable />} />
          <Route path="/courses" element={<Courses />} />
          <Route path="/courses/:id" element={<CourseDetail />} />
          <Route path="/assignments" element={<Assignments />} />
          <Route path="/quizzes" element={<Quizzes />} />
          <Route path="/attendance" element={<Attendance />} />
          <Route path="/grades" element={<Grades />} />
          <Route path="/feedback" element={<Feedback />} />
          <Route path="/feed" element={<Feed />} />
          <Route path="/notices" element={<Notices />} />
          <Route path="/events" element={<Events />} />
          <Route path="/clubs" element={<Clubs />} />
          <Route path="/polls" element={<Polls />} />
          <Route path="/fees" element={<Fees />} />
          <Route path="/gate-pass" element={<GatePass />} />
          <Route path="/transport" element={<Transport />} />
          <Route path="/venues" element={<Venues />} />
          <Route path="/lost-found" element={<LostFound />} />
          <Route path="/admin/users" element={<AdminUsers />} />
          <Route path="/admin/reports" element={<AdminReports />} />
          <Route path="/exams" element={<Exams />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/placements" element={<Placements />} />
          <Route path="/alumni" element={<Alumni />} />
          <Route path="/hostel" element={<Hostel />} />
          <Route path="/help" element={<HelpCenter />} />
          <Route path="/hr" element={<HR />} />
          <Route path="/procurement" element={<Procurement />} />
          <Route path="/admissions" element={<Admissions />} />
          <Route path="/admin/audit" element={<AuditLog />} />
          <Route path="/classes" element={<Classes />} />
          <Route path="/results" element={<Results />} />
          <Route path="/registration" element={<Registration />} />
          <Route path="/people/:id" element={<Person />} />
          <Route path="/profile" element={<Profile />} />
        </Route>
        <Route path="*" element={<Navigate to={user ? '/home' : '/login'} replace />} />
      </Routes>
    </HashRouter>
  )
}
