import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { canAccess } from './access'
import { useCurrentUser } from './data/store'
import Layout from './components/Layout'
import Login from './pages/Login'
import Home from './pages/Home'
import Timetable from './pages/Timetable'
import { CourseDetail, Courses } from './pages/Courses'
import Assignments from './pages/Assignments'
import Quizzes from './pages/Quizzes'
import Attendance from './pages/Attendance'
import Grades from './pages/Grades'
import Feedback from './pages/Feedback'
import Feed from './pages/Feed'
import { Clubs, Events, Notices, Polls } from './pages/Campus'
import { Fees, GatePass, Transport, Venues } from './pages/Services'
import { AdminReports, AdminUsers, AuditLog } from './pages/Admin'
import Admissions, { ApplyForm } from './pages/Admissions'
import Exams from './pages/Exams'
import Hostel from './pages/Hostel'
import HR from './pages/HR'
import Procurement from './pages/Procurement'
import HelpCenter from './pages/HelpCenter'
import Placements from './pages/Placements'
import LibraryPage from './pages/Library'
import Alumni from './pages/Alumni'
import Classes from './pages/Classes'
import Person from './pages/People'
import Results from './pages/Results'
import Profile from './pages/Profile'

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
        <Route path="/apply" element={<ApplyForm />} />
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
          <Route path="/people/:id" element={<Person />} />
          <Route path="/profile" element={<Profile />} />
        </Route>
        <Route path="*" element={<Navigate to={user ? '/home' : '/login'} replace />} />
      </Routes>
    </HashRouter>
  )
}
