import { useState } from 'react'
import { AlertTriangle, Check, Download } from 'lucide-react'
import { notify, uid, update, useCurrentUser, useDB } from '../data/store'
import { Avatar, Badge, Card, PageHeader, Progress } from '../components/ui'
import { attendanceStats, coursesFor, fmtDate } from '../lib'

export default function Attendance() {
  const user = useCurrentUser()!
  return user.role === 'student' ? <StudentAttendance /> : <MarkAttendance />
}

function StudentAttendance() {
  const db = useDB()
  const user = useCurrentUser()!
  const courses = coursesFor(db, user)
  const overall = attendanceStats(db, user.id)
  const [courseId, setCourseId] = useState<string>('all')

  // Calendar for the current month
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth(), 1)
  const daysIn = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const cells: { day: number; cls: string }[] = []
  for (let i = 1; i <= daysIn; i++) {
    const iso = new Date(now.getFullYear(), now.getMonth(), i, 12).toISOString().slice(0, 10)
    const recs = db.attendance.filter((a) => a.date === iso && (courseId === 'all' || a.courseId === courseId) && courses.some((c) => c.id === a.courseId))
    const p = recs.filter((r) => r.present.includes(user.id)).length
    const cls = recs.length === 0 ? '' : p === recs.length ? 'p' : p === 0 ? 'a' : 'm'
    cells.push({ day: i, cls: `${cls} ${i === now.getDate() ? 'today' : ''}` })
  }

  return (
    <>
      <PageHeader title="Attendance" subtitle="Minimum 75% attendance is required to sit for end-semester examinations" />
      {overall.pct < 75 && <div className="alert alert-danger"><AlertTriangle size={16} /> Your overall attendance is below 75%. Please contact your mentor.</div>}
      <div className="grid grid-2">
        <Card title="Course-wise attendance">
          <div className="list">
            {courses.map((c) => {
              const a = attendanceStats(db, user.id, c.id)
              const need = a.pct < 75 ? Math.ceil((0.75 * a.total - a.attended) / 0.25) : 0
              const canMiss = a.pct >= 75 ? Math.floor((a.attended - 0.75 * a.total) / 0.75) : 0
              return (
                <div key={c.id} className="list-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                  <div className="row between"><strong>{c.name}</strong><span><strong>{a.pct}%</strong> <span className="muted small">({a.attended}/{a.total})</span></span></div>
                  <Progress value={a.pct} />
                  <span className="small muted">{need > 0 ? `Attend the next ${need} classes to reach 75%` : `You can miss up to ${canMiss} more class${canMiss === 1 ? '' : 'es'} and stay above 75%`}</span>
                </div>
              )
            })}
          </div>
        </Card>
        <Card title={now.toLocaleString('en-IN', { month: 'long', year: 'numeric' })} action={
          <select className="select" style={{ width: 'auto' }} value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            <option value="all">All courses</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
          </select>
        }>
          <div className="cal">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <div key={d} className="cal-h">{d}</div>)}
            {Array.from({ length: first.getDay() }).map((_, i) => <div key={`e${i}`} />)}
            {cells.map((c) => <div key={c.day} className={`cal-d ${c.cls}`}>{c.day}</div>)}
          </div>
          <div className="row gap wrap small" style={{ marginTop: 12 }}>
            <Badge tone="success">Present</Badge><Badge tone="danger">Absent</Badge><Badge tone="warning">Partial</Badge>
          </div>
        </Card>
      </div>
    </>
  )
}

function MarkAttendance() {
  const db = useDB()
  const user = useCurrentUser()!
  const courses = coursesFor(db, user)
  const [courseId, setCourseId] = useState(courses[0]?.id ?? '')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const course = db.courses.find((c) => c.id === courseId)
  const existing = db.attendance.find((a) => a.courseId === courseId && a.date === date)
  const [present, setPresent] = useState<Set<string>>(() => new Set(existing?.present ?? course?.studentIds ?? []))
  const [saved, setSaved] = useState(false)

  const reload = (cid: string, dt: string) => {
    const c = db.courses.find((x) => x.id === cid)
    const ex = db.attendance.find((a) => a.courseId === cid && a.date === dt)
    setPresent(new Set(ex?.present ?? c?.studentIds ?? []))
    setSaved(false)
  }

  const save = () => {
    update((d) => {
      const ex = d.attendance.find((a) => a.courseId === courseId && a.date === date)
      if (ex) ex.present = [...present]
      else d.attendance.push({ id: uid('att'), courseId, date, present: [...present], markedBy: user.id })
    })
    const absent = course!.studentIds.filter((s) => !present.has(s))
    if (absent.length) notify(absent, `Marked absent in ${course!.name} on ${fmtDate(date)}`, '/attendance')
    setSaved(true)
  }

  const exportCsv = () => {
    if (!course) return
    const recs = db.attendance.filter((a) => a.courseId === course.id).sort((a, b) => a.date.localeCompare(b.date))
    const rows = [['Roll no', 'Name', ...recs.map((r) => r.date), 'Percentage']]
    for (const sid of course.studentIds) {
      const s = db.users.find((u) => u.id === sid)!
      const a = attendanceStats(db, sid, course.id)
      rows.push([s.rollNo ?? '', s.name, ...recs.map((r) => (r.present.includes(sid) ? 'P' : 'A')), `${a.pct}%`])
    }
    const el = document.createElement('a')
    el.href = URL.createObjectURL(new Blob([rows.map((r) => r.join(',')).join('\n')], { type: 'text/csv' }))
    el.download = `${course.code}-attendance.csv`
    el.click()
  }

  if (!course) return <PageHeader title="Attendance" subtitle="No courses assigned." />

  return (
    <>
      <PageHeader title="Mark attendance" subtitle="Select a course and date, then tap students to toggle" actions={<button className="btn btn-outline" onClick={exportCsv}><Download size={14} /> Download report</button>} />
      <Card>
        <div className="row gap wrap">
          <select className="select" style={{ maxWidth: 320 }} value={courseId} onChange={(e) => { setCourseId(e.target.value); reload(e.target.value, date) }}>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
          </select>
          <input className="input" style={{ maxWidth: 180 }} type="date" value={date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => { setDate(e.target.value); reload(courseId, e.target.value) }} />
          <div className="grow" />
          <button className="btn btn-ghost btn-sm" onClick={() => setPresent(new Set(course.studentIds))}>All present</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setPresent(new Set())}>All absent</button>
        </div>
      </Card>
      <div className="grid grid-4">
        {course.studentIds.map((sid) => {
          const s = db.users.find((u) => u.id === sid)!
          const p = present.has(sid)
          return (
            <button key={sid} className="card row gap" style={{ textAlign: 'left', borderColor: p ? 'var(--success)' : 'var(--danger)', background: p ? 'var(--success-bg)' : 'var(--danger-bg)' }}
              onClick={() => { const n = new Set(present); if (p) n.delete(sid); else n.add(sid); setPresent(n); setSaved(false) }}>
              <Avatar name={s.name} color={s.avatarColor} />
              <div className="grow"><div style={{ fontWeight: 600 }} className="ellipsis">{s.name}</div><div className="small muted">{s.rollNo}</div></div>
              <Badge tone={p ? 'success' : 'danger'}>{p ? 'P' : 'A'}</Badge>
            </button>
          )
        })}
      </div>
      <div className="row between">
        <span><strong>{present.size}</strong> present · <strong>{course.studentIds.length - present.size}</strong> absent {existing && <Badge tone="info">Already marked. Saving will update it</Badge>}</span>
        <button className="btn" onClick={save}>{saved ? <><Check size={14} /> Saved</> : 'Save attendance'}</button>
      </div>
    </>
  )
}
