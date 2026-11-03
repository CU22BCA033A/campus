import { Link } from 'react-router-dom'
import { BookOpen, CalendarCheck, ClipboardList, CreditCard, DoorOpen, FileQuestion, Megaphone, PartyPopper, Users, UserX } from 'lucide-react'
import { useCurrentUser, useDB } from '../data/store'
import { Badge, Card, Empty, Progress, Stat } from '../components/ui'
import { attendanceStats, courseName, coursesFor, DAYS, fmtDate, fmtDateTime, inr, timeAgo, userName } from '../lib'

export default function Home() {
  const db = useDB()
  const user = useCurrentUser()!
  const courses = coursesFor(db, user)
  const ids = new Set(courses.map((c) => c.id))
  const today = new Date().getDay()
  const todays = db.timetable.filter((t) => t.day === today && ids.has(t.courseId)).sort((a, b) => a.start.localeCompare(b.start))
  const notices = db.notices.filter((n) => n.audience === 'all' || n.audience === user.role).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt).slice(0, 4)
  const events = db.events.filter((e) => e.startsAt > Date.now()).sort((a, b) => a.startsAt - b.startsAt).slice(0, 3)
  const hour = new Date().getHours()
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <>
      <div className="hero">
        <div>
          <p className="small">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
          <h1>{greet}, {user.role === 'student' ? user.name.split(' ')[0] : user.name}</h1>
          <p>{user.role === 'student' ? `${user.program} · Semester ${user.semester} · Section ${user.section}` : user.department}</p>
        </div>
        <div className="row gap wrap" style={{ position: 'relative', zIndex: 1 }}>
          {user.role === 'student' && <Link className="btn btn-accent" to="/assignments">View assignments</Link>}
          {user.role === 'faculty' && <Link className="btn btn-accent" to="/attendance">Mark attendance</Link>}
          {user.role === 'admin' && <Link className="btn btn-accent" to="/notices">Post a notice</Link>}
        </div>
      </div>

      {user.role === 'student' && <StudentStats />}
      {user.role === 'faculty' && <FacultyStats />}
      {user.role === 'admin' && <AdminStats />}

      <div className="grid grid-2">
        <Card title={`Today's classes · ${DAYS[today]}`} action={<Link to="/timetable" className="small">Full timetable</Link>}>
          {todays.length === 0 ? <Empty text="No classes scheduled today." /> : (
            <div className="list">
              {todays.map((t) => (
                <div key={t.id} className="list-item">
                  <div style={{ width: 92 }} className="small"><strong>{t.start}</strong><br /><span className="muted">{t.end}</span></div>
                  <div className="grow">
                    <div style={{ fontWeight: 600 }}>{courseName(db, t.courseId)}</div>
                    <div className="small muted">{t.room} · {userName(db, db.courses.find((c) => c.id === t.courseId)!.facultyId)}</div>
                  </div>
                  <Badge tone="brand">{db.courses.find((c) => c.id === t.courseId)?.code}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Notice board" action={<Link to="/notices" className="small">All notices</Link>}>
          <div className="list">
            {notices.map((n) => (
              <div key={n.id} className="list-item" style={{ alignItems: 'flex-start' }}>
                <Megaphone size={18} className="muted" style={{ marginTop: 2 }} />
                <div className="grow">
                  <div className="row gap"><strong className="ellipsis">{n.title}</strong>{n.pinned && <Badge tone="accent">Pinned</Badge>}</div>
                  <div className="small muted">{n.category} · {timeAgo(n.createdAt)}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {user.role === 'student' && <UpcomingWork />}

        <Card title="Upcoming events" action={<Link to="/events" className="small">All events</Link>}>
          {events.length === 0 ? <Empty text="No upcoming events." /> : (
            <div className="list">
              {events.map((e) => (
                <div key={e.id} className="list-item">
                  <div style={{ textAlign: 'center', width: 48, background: 'var(--brand-light)', color: 'var(--brand)', borderRadius: 8, padding: '4px 0' }}>
                    <div style={{ fontWeight: 700, fontSize: 18, lineHeight: 1.1 }}>{new Date(e.startsAt).getDate()}</div>
                    <div className="small">{new Date(e.startsAt).toLocaleString('en-IN', { month: 'short' })}</div>
                  </div>
                  <div className="grow"><div style={{ fontWeight: 600 }}>{e.title}</div><div className="small muted">{e.venue} · {fmtDateTime(e.startsAt)}</div></div>
                  <Badge tone={e.rsvps.includes(user.id) ? 'success' : 'neutral'}>{e.rsvps.includes(user.id) ? 'Going' : `${e.rsvps.length} going`}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  )
}

function StudentStats() {
  const db = useDB()
  const user = useCurrentUser()!
  const att = attendanceStats(db, user.id)
  const courses = coursesFor(db, user)
  const pendingAssign = db.assignments.filter((a) => courses.some((c) => c.id === a.courseId) && a.dueAt > Date.now() && !db.submissions.some((s) => s.assignmentId === a.id && s.studentId === user.id)).length
  const due = db.fees.filter((f) => f.studentId === user.id && !f.paidAt).reduce((s, f) => s + f.amount, 0)
  const openQuizzes = db.quizzes.filter((q) => courses.some((c) => c.id === q.courseId) && q.opensAt < Date.now() && q.closesAt > Date.now() && !db.attempts.some((a) => a.quizId === q.id && a.studentId === user.id)).length
  return (
    <div className="grid grid-4">
      <Link to="/attendance" style={{ textDecoration: 'none', color: 'inherit' }}>
        <Stat label="Overall attendance" value={`${att.pct}%`} hint={`${att.attended}/${att.total} classes`} tone={att.pct >= 75 ? 'success' : 'danger'} icon={<CalendarCheck size={22} />} />
      </Link>
      <Link to="/assignments" style={{ textDecoration: 'none', color: 'inherit' }}>
        <Stat label="Pending assignments" value={pendingAssign} tone="warning" icon={<ClipboardList size={22} />} />
      </Link>
      <Link to="/quizzes" style={{ textDecoration: 'none', color: 'inherit' }}>
        <Stat label="Open quizzes" value={openQuizzes} tone="info" icon={<FileQuestion size={22} />} />
      </Link>
      <Link to="/fees" style={{ textDecoration: 'none', color: 'inherit' }}>
        <Stat label="Fee due" value={inr(due)} tone={due ? 'danger' : 'success'} icon={<CreditCard size={22} />} />
      </Link>
    </div>
  )
}

function FacultyStats() {
  const db = useDB()
  const user = useCurrentUser()!
  const courses = coursesFor(db, user)
  const students = new Set(courses.flatMap((c) => c.studentIds)).size
  const toGrade = db.submissions.filter((s) => s.marks === undefined && courses.some((c) => c.id === db.assignments.find((a) => a.id === s.assignmentId)?.courseId)).length
  const passes = db.gatePasses.filter((g) => g.status === 'PENDING').length
  return (
    <div className="grid grid-4">
      <Stat label="My courses" value={courses.length} icon={<BookOpen size={22} />} />
      <Stat label="Students" value={students} tone="info" icon={<Users size={22} />} />
      <Link to="/assignments" style={{ textDecoration: 'none', color: 'inherit' }}><Stat label="Submissions to grade" value={toGrade} tone="warning" icon={<ClipboardList size={22} />} /></Link>
      <Link to="/gate-pass" style={{ textDecoration: 'none', color: 'inherit' }}><Stat label="Gate passes pending" value={passes} tone="accent" icon={<DoorOpen size={22} />} /></Link>
    </div>
  )
}

function AdminStats() {
  const db = useDB()
  const students = db.users.filter((u) => u.role === 'student')
  const collected = db.fees.filter((f) => f.paidAt).reduce((s, f) => s + f.amount, 0)
  const outstanding = db.fees.filter((f) => !f.paidAt).reduce((s, f) => s + f.amount, 0)
  return (
    <div className="grid grid-4">
      <Link to="/admin/users" style={{ textDecoration: 'none', color: 'inherit' }}><Stat label="Students" value={students.length} hint={`${db.users.filter((u) => u.role === 'faculty').length} faculty`} icon={<Users size={22} />} /></Link>
      <Stat label="Inactive accounts" value={db.users.filter((u) => u.status !== 'ACTIVE').length} tone="danger" icon={<UserX size={22} />} />
      <Link to="/admin/reports" style={{ textDecoration: 'none', color: 'inherit' }}><Stat label="Fees collected" value={inr(collected)} hint={`${inr(outstanding)} outstanding`} tone="success" icon={<CreditCard size={22} />} /></Link>
      <Link to="/events" style={{ textDecoration: 'none', color: 'inherit' }}><Stat label="Upcoming events" value={db.events.filter((e) => e.startsAt > Date.now()).length} tone="accent" icon={<PartyPopper size={22} />} /></Link>
    </div>
  )
}

function UpcomingWork() {
  const db = useDB()
  const user = useCurrentUser()!
  const courses = coursesFor(db, user)
  const items = db.assignments
    .filter((a) => courses.some((c) => c.id === a.courseId) && a.dueAt > Date.now())
    .sort((a, b) => a.dueAt - b.dueAt)
  return (
    <Card title="Upcoming deadlines" action={<Link to="/assignments" className="small">All work</Link>}>
      {items.length === 0 ? <Empty text="Nothing due. Nice!" /> : (
        <div className="list">
          {items.map((a) => {
            const done = db.submissions.some((s) => s.assignmentId === a.id && s.studentId === user.id)
            return (
              <div key={a.id} className="list-item">
                <ClipboardList size={18} className="muted" />
                <div className="grow"><div style={{ fontWeight: 600 }} className="ellipsis">{a.title}</div><div className="small muted">{courseName(db, a.courseId)} · due {fmtDate(a.dueAt)}</div></div>
                <Badge tone={done ? 'success' : 'warning'}>{done ? 'Submitted' : timeAgo(a.dueAt)}</Badge>
              </div>
            )
          })}
        </div>
      )}
      <div style={{ marginTop: 14 }}>
        <div className="row between small"><span className="muted">Semester progress</span><span>62%</span></div>
        <Progress value={62} tone="brand" />
      </div>
    </Card>
  )
}
