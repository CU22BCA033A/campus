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
import { AdminReports, AdminUsers } from './pages/Admin'
import Profile from './pages/Profile'

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
          <Route path="/fees" element={<RequireAuth roles={['student', 'admin']}><Fees /></RequireAuth>} />
          <Route path="/gate-pass" element={<GatePass />} />
          <Route path="/transport" element={<Transport />} />
          <Route path="/venues" element={<RequireAuth roles={['faculty', 'admin']}><Venues /></RequireAuth>} />
          <Route path="/admin/users" element={<RequireAuth roles={['admin']}><AdminUsers /></RequireAuth>} />
          <Route path="/admin/reports" element={<RequireAuth roles={['admin']}><AdminReports /></RequireAuth>} />
          <Route path="/profile" element={<Profile />} />
        </Route>
        <Route path="*" element={<Navigate to={user ? '/home' : '/login'} replace />} />
      </Routes>
    </HashRouter>
  )
}
