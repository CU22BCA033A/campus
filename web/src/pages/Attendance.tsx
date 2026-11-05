import { useState } from 'react'
import { AlertTriangle, Bell, Check, Download } from 'lucide-react'
import { can } from '../access'
import { classLabel } from '../classes'
import { audit, notify, uid, update, useCurrentUser, useDB } from '../data/store'
import { Avatar, Badge, Card, PageHeader, Progress, Tabs } from '../components/ui'
import { attendanceStats, coursesFor, fmtDate, matches, userName } from '../lib'

export default function Attendance() {
  const user = useCurrentUser()!
  if (user.role === 'student') return <StudentAttendance />
  if (can(user, 'manageAttendance')) return <AttendanceOffice />
  return user.role === 'admin' ? <AttendanceReport /> : <MarkAttendance />
}

/** Registrar of Evaluation: institution-wide report plus marking / correcting any course. */
function AttendanceOffice() {
  const [tab, setTab] = useState<'report' | 'mark'>('report')
  return (
    <>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'report', label: 'Attendance report' }, { id: 'mark', label: 'Mark / correct attendance' }]} />
      {tab === 'report' ? <AttendanceReport /> : <MarkAttendance asOffice />}
    </>
  )
}

/** Read-only view for offices (e.g. Controller of Examinations): shortage list across all courses. */
function AttendanceReport() {
  const db = useDB()
  const [onlyShort, setOnlyShort] = useState(true)
  const [threshold, setThreshold] = useState(75)
  const [term, setTerm] = useState('')
  const students = db.users.filter((u) => u.role === 'student' && u.status === 'ACTIVE')
  const rows = students.map((s) => ({ s, overall: attendanceStats(db, s.id), per: db.courses.filter((c) => c.studentIds.includes(s.id)).map((c) => ({ c, a: attendanceStats(db, s.id, c.id) })) }))
    .filter((r) => matches(term, r.s.name, r.s.rollNo, r.s.program, r.s.batch)).filter((r) => !onlyShort || r.per.some((x) => x.a.pct < threshold)).sort((a, b) => a.overall.pct - b.overall.pct)
  const me = useCurrentUser()!
  const canNotify = can(me, 'manageAttendance')
  /** Warn students below the threshold (and their parents) course by course. */
  const notifyShortage = () => {
    let n = 0
    for (const r of rows) {
      const short = r.per.filter((x) => x.a.pct < threshold)
      if (!short.length) continue
      n++
      const msg = `Attendance shortage: ${short.map((x) => `${x.c.code} ${x.a.pct}%`).join(', ')}. Minimum ${threshold}% is required for exams.`
      notify([r.s.id, ...db.users.filter((u) => u.role === 'parent' && u.wardIds?.includes(r.s.id)).map((u) => u.id)], msg, '/attendance')
    }
    audit(me.id, 'ATTENDANCE_SHORTAGE_NOTICE', `${n} student(s) below ${threshold}%`)
    alert(`Shortage notices sent to ${n} student(s) and their parents.`)
  }
  const exportCsv = () => {
    const lines = [['Roll no', 'Name', 'Overall %', ...db.courses.map((c) => c.code)], ...rows.map((r) => [r.s.rollNo ?? '', r.s.name, String(r.overall.pct), ...db.courses.map((c) => String(r.per.find((x) => x.c.id === c.id)?.a.pct ?? ''))])]
    const el = document.createElement('a'); el.href = URL.createObjectURL(new Blob([lines.map((l) => l.join(',')).join('\n')], { type: 'text/csv' })); el.download = 'attendance-shortage.csv'; el.click()
  }
  return (
    <>
      <PageHeader search={{ value: term, onChange: setTerm, placeholder: 'Search student or roll no.…' }} title="Attendance report" subtitle="Read-only. Faculty mark attendance; students below the threshold are not eligible for exams." actions={<>
        {canNotify && rows.some((r) => r.per.some((x) => x.a.pct < threshold)) && <button className="btn btn-outline" onClick={notifyShortage}><Bell size={14} /> Notify shortage</button>}
        <button className="btn btn-outline" onClick={exportCsv}><Download size={14} /> Export CSV</button>
      </>} />
      <Card>
        <div className="row gap wrap" style={{ marginBottom: 12 }}>
          <label className="row gap"><input type="checkbox" checked={onlyShort} onChange={(e) => setOnlyShort(e.target.checked)} /> Only students with a shortage</label>
          <label className="row gap">Threshold <input className="input" style={{ width: 80 }} type="number" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} />%</label>
          <span className="muted small">{rows.length} student(s)</span>
        </div>
        <div className="table-wrap"><table>
          <thead><tr><th>Student</th><th>Overall</th>{db.courses.map((c) => <th key={c.id}>{c.code}</th>)}</tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.s.id}>
              <td>{r.s.name}<div className="small muted">{r.s.rollNo}</div></td>
              <td><Badge tone={r.overall.pct >= threshold ? 'success' : 'danger'}>{r.overall.pct}%</Badge></td>
              {db.courses.map((c) => { const x = r.per.find((y) => y.c.id === c.id); return <td key={c.id}>{x ? <span style={{ color: x.a.pct < threshold ? 'var(--danger)' : undefined, fontWeight: x.a.pct < threshold ? 700 : 400 }}>{x.a.pct}%</span> : '—'}</td> })}
            </tr>
          ))}</tbody>
        </table></div>
      </Card>
    </>
  )
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

function MarkAttendance({ asOffice = false }: { asOffice?: boolean }) {
  const db = useDB()
  const user = useCurrentUser()!
  const [classF, setClassF] = useState('all')
  // Office: every live course (its class is in that semester); teachers: their own courses.
  const courses = asOffice
    ? db.courses.filter((c) => { const cl = db.classes.find((x) => x.id === c.classId); return cl && cl.semester === c.semester && (classF === 'all' || cl.id === classF) })
    : coursesFor(db, user)
  const [courseId, setCourseId] = useState(courses[0]?.id ?? '')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const course = db.courses.find((c) => c.id === courseId)
  const existing = db.attendance.find((a) => a.courseId === courseId && a.date === date)
  const [present, setPresent] = useState<Set<string>>(() => new Set(existing?.present ?? course?.studentIds ?? []))
  const [saved, setSaved] = useState(false)
  const [term, setTerm] = useState('')

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
    if (asOffice) {
      audit(user.id, existing ? 'ATTENDANCE_CORRECT' : 'ATTENDANCE_MARK', `${course!.code} ${date}: ${present.size}/${course!.studentIds.length} present (on behalf of ${userName(db, course!.facultyId)})`)
      notify([course!.facultyId], `Registrar of Evaluation ${existing ? 'corrected' : 'marked'} ${course!.code} attendance for ${fmtDate(date)}`, '/attendance')
    }
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
      <PageHeader search={{ value: term, onChange: setTerm, placeholder: 'Search student or roll no.…' }} title={asOffice ? 'Mark or correct attendance' : 'Mark attendance'} subtitle={asOffice ? 'Any course, any date. Changes are logged and the teacher is notified.' : 'Select a course and date, then tap students to toggle'} actions={<button className="btn btn-outline" onClick={exportCsv}><Download size={14} /> Download report</button>} />
      <Card>
        <div className="row gap wrap">
          {asOffice && <select className="select" style={{ maxWidth: 260 }} aria-label="Class" value={classF} onChange={(e) => { setClassF(e.target.value); const first = db.courses.find((c) => { const cl = db.classes.find((x) => x.id === c.classId); return cl && cl.semester === c.semester && (e.target.value === 'all' || cl.id === e.target.value) }); if (first) { setCourseId(first.id); reload(first.id, date) } }}><option value="all">All classes</option>{db.classes.map((c) => <option key={c.id} value={c.id}>{classLabel(c)}</option>)}</select>}
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
        {course.studentIds.filter((sid) => matches(term, db.users.find((u) => u.id === sid)?.name, db.users.find((u) => u.id === sid)?.rollNo)).map((sid) => {
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
