import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Pencil } from 'lucide-react'
import { useCurrentUser, useDB } from '../data/store'
import { Avatar, Badge, Card, Empty, PageHeader, Progress } from '../components/ui'
import EditUser, { canEditProfile } from '../components/EditUser'
import { canAccess, personaLabel } from '../access'
import { classLabel } from '../classes'
import { attendanceStats, coursesFor, inr, studentDues } from '../lib'

/** Read-only profile for staff, with an Edit button for offices that may change it. */
export default function Person() {
  const { id } = useParams()
  const db = useDB()
  const me = useCurrentUser()!
  const [editing, setEditing] = useState(false)
  const u = db.users.find((x) => x.id === id)
  if (!u) return <Empty text="Person not found." />
  const cls = db.classes.find((c) => c.id === u.classId)
  const courses = u.role === 'faculty' || u.role === 'student' ? coursesFor(db, u) : []
  const att = u.role === 'student' ? attendanceStats(db, u.id) : null
  const showFees = u.role === 'student' && canAccess(me, '/fees')

  return (
    <>
      <PageHeader title={u.name} subtitle={personaLabel(u)} actions={canEditProfile(me, u) && <button className="btn" onClick={() => setEditing(true)}><Pencil size={14} /> Edit profile</button>} />
      <div className="grid grid-2">
        <Card>
          <div className="row gap" style={{ gap: 16 }}>
            <Avatar name={u.name} color={u.avatarColor} size={64} />
            <div className="stack" style={{ gap: 4 }}>
              <div className="row gap wrap"><Badge tone="brand">{personaLabel(u)}</Badge><Badge tone={u.status === 'ACTIVE' ? 'success' : 'danger'}>{u.status}</Badge></div>
              <span>{u.email}</span><span className="muted">{u.phone ?? '—'}</span>
            </div>
          </div>
          <table style={{ marginTop: 14 }}><tbody>
            {u.rollNo && <tr><td className="muted">Roll number</td><td>{u.rollNo}</td></tr>}
            {u.role === 'student' && <tr><td className="muted">Class</td><td>{classLabel(cls)}</td></tr>}
            {u.role === 'student' && <tr><td className="muted">CGPA / backlogs</td><td>{u.cgpa?.toFixed(2) ?? '—'} · {u.backlogs ?? 0} backlog(s)</td></tr>}
            {u.role !== 'student' && <tr><td className="muted">Department</td><td>{u.department}</td></tr>}
            {u.role === 'parent' && <tr><td className="muted">Wards</td><td>{(u.wardIds ?? []).map((w) => db.users.find((x) => x.id === w)?.name).join(', ') || '—'}</td></tr>}
            {showFees && <tr><td className="muted">Fee dues</td><td>{inr(studentDues(db, u.id))}</td></tr>}
          </tbody></table>
        </Card>
        {courses.length > 0 && (
          <Card title={u.role === 'faculty' ? 'Teaching' : 'Courses this semester'}>
            {att && <div style={{ marginBottom: 12 }}><div className="row between small"><span className="muted">Overall attendance</span><strong>{att.pct}%</strong></div><Progress value={att.pct} /></div>}
            <div className="list">{courses.map((c) => (
              <div key={c.id} className="list-item">
                <div className="grow"><strong>{c.code}</strong> {c.name}<div className="small muted">{classLabel(db.classes.find((x) => x.id === c.classId))}</div></div>
                {u.role === 'student' && <Badge tone={attendanceStats(db, u.id, c.id).pct >= 75 ? 'success' : 'danger'}>{attendanceStats(db, u.id, c.id).pct}%</Badge>}
                {canAccess(me, '/courses') && <Link className="btn btn-ghost btn-sm" to={`/courses/${c.id}`}>Open</Link>}
              </div>
            ))}</div>
          </Card>
        )}
      </div>
      {editing && <EditUser user={u} onClose={() => setEditing(false)} />}
    </>
  )
}
