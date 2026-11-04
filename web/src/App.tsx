import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useCurrentUser } from './data/store'
import type { Role } from './data/types'
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
import Profile from './pages/Profile'

const NON_PARENT: Role[] = ['student', 'faculty', 'admin']

function RequireAuth({ children, roles }: { children: React.ReactNode; roles?: Role[] }) {
  const user = useCurrentUser()
  if (!user || user.status !== 'ACTIVE') return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to="/home" replace />
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
          <Route path="/timetable" element={<RequireAuth roles={NON_PARENT}><Timetable /></RequireAuth>} />
          <Route path="/courses" element={<RequireAuth roles={NON_PARENT}><Courses /></RequireAuth>} />
          <Route path="/courses/:id" element={<RequireAuth roles={NON_PARENT}><CourseDetail /></RequireAuth>} />
          <Route path="/assignments" element={<RequireAuth roles={NON_PARENT}><Assignments /></RequireAuth>} />
          <Route path="/quizzes" element={<RequireAuth roles={NON_PARENT}><Quizzes /></RequireAuth>} />
          <Route path="/attendance" element={<RequireAuth roles={NON_PARENT}><Attendance /></RequireAuth>} />
          <Route path="/grades" element={<RequireAuth roles={NON_PARENT}><Grades /></RequireAuth>} />
          <Route path="/feedback" element={<RequireAuth roles={NON_PARENT}><Feedback /></RequireAuth>} />
          <Route path="/feed" element={<RequireAuth roles={NON_PARENT}><Feed /></RequireAuth>} />
          <Route path="/notices" element={<Notices />} />
          <Route path="/events" element={<Events />} />
          <Route path="/clubs" element={<RequireAuth roles={NON_PARENT}><Clubs /></RequireAuth>} />
          <Route path="/polls" element={<RequireAuth roles={NON_PARENT}><Polls /></RequireAuth>} />
          <Route path="/fees" element={<RequireAuth roles={['student', 'admin']}><Fees /></RequireAuth>} />
          <Route path="/gate-pass" element={<RequireAuth roles={NON_PARENT}><GatePass /></RequireAuth>} />
          <Route path="/transport" element={<Transport />} />
          <Route path="/venues" element={<RequireAuth roles={['faculty', 'admin']}><Venues /></RequireAuth>} />
          <Route path="/admin/users" element={<RequireAuth roles={['admin']}><AdminUsers /></RequireAuth>} />
          <Route path="/admin/reports" element={<RequireAuth roles={['admin']}><AdminReports /></RequireAuth>} />
          <Route path="/exams" element={<RequireAuth roles={NON_PARENT}><Exams /></RequireAuth>} />
          <Route path="/library" element={<RequireAuth roles={NON_PARENT}><LibraryPage /></RequireAuth>} />
          <Route path="/placements" element={<RequireAuth roles={['student', 'admin']}><Placements /></RequireAuth>} />
          <Route path="/alumni" element={<RequireAuth roles={NON_PARENT}><Alumni /></RequireAuth>} />
          <Route path="/hostel" element={<RequireAuth roles={['student', 'admin']}><Hostel /></RequireAuth>} />
          <Route path="/help" element={<HelpCenter />} />
          <Route path="/hr" element={<RequireAuth roles={['faculty', 'admin']}><HR /></RequireAuth>} />
          <Route path="/procurement" element={<RequireAuth roles={['faculty', 'admin']}><Procurement /></RequireAuth>} />
          <Route path="/admissions" element={<RequireAuth roles={['admin']}><Admissions /></RequireAuth>} />
          <Route path="/admin/audit" element={<RequireAuth roles={['admin']}><AuditLog /></RequireAuth>} />
          <Route path="/profile" element={<Profile />} />
        </Route>
        <Route path="*" element={<Navigate to={user ? '/home' : '/login'} replace />} />
      </Routes>
    </HashRouter>
  )
}
