import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ListChecks, Printer } from 'lucide-react'
import { useCurrentUser, useDB } from '../data/store'
import { Badge, Card, Empty, Stat } from './ui'
import { can } from '../access'
import { backlogCountOf, cgpaOf, fmtCgpa, transcript } from '../academics'
import { classLabel } from '../classes'
import { attendanceStats, fmtDate, isCurrentCourse, userName } from '../lib'
import { studentResults } from '../results'
import { isPan, KIND_LABEL, kindOf } from '../registration'
import { KindBadge, StudentRegistrationModal } from '../pages/Registration'
import type { Course, DB } from '../data/types'

type Attempt = ReturnType<typeof studentResults>[number]

/** Everything a student registered for, semester by semester (class courses by roster, baskets by registration). */
export function semesterCourses(db: DB, studentId: string) {
  const bySem = new Map<number, Course[]>()
  const add = (sem: number, c: Course) => { const l = bySem.get(sem) ?? []; if (!l.some((x) => x.id === c.id)) bySem.set(sem, [...l, c]) }
  for (const c of db.courses) if (!isPan(c) && c.studentIds.includes(studentId)) add(c.semester, c)
  for (const r of db.registrations) if (r.studentId === studentId && r.status === 'REGISTERED') { const c = db.courses.find((x) => x.id === r.courseId); if (c) add(r.semester, c) }
  return bySem
}

/**
 * A student's complete academic record for the Registrar of Evaluation (and other student-record offices):
 * every semester's registered courses with type, faculty, attendance, every exam attempt, grade and result,
 * SGPA/CGPA, backlogs and the registration history.
 */
export default function AcademicRecord({ studentId }: { studentId: string }) {
  const db = useDB()
  const me = useCurrentUser()!
  const [managing, setManaging] = useState(false)
  const s = db.users.find((u) => u.id === studentId)!
  const cls = db.classes.find((c) => c.id === s.classId)
  const sems = transcript(db, s.id)
  const attempts = studentResults(db, s.id)
  const bySem = semesterCourses(db, s.id)
  const semesters = [...bySem.keys()].sort((a, b) => b - a)
  const cgpa = cgpaOf(db, s)
  const earned = sems.reduce((t, x) => t + x.earned, 0) + (s.priorRecord?.credits ?? 0)
  const current = attendanceStats(db, s.id)
  const office = can(me, 'manageCourses')
  const regs = db.registrations.filter((r) => r.studentId === s.id).sort((a, b) => b.at - a.at)
  const maxSgpa = 10

  const statusOf = (c: Course, sem: number, mine: Attempt[]) => {
    const last = mine[0]
    if (last) return last.row.pass ? { label: mine.length > 1 || last.row.backlogAttempt ? 'Passed (supplementary)' : 'Passed', tone: 'success' as const } : { label: 'Backlog', tone: 'danger' as const }
    if (isCurrentCourse(db, c)) return { label: 'In progress', tone: 'info' as const }
    if (sem > (s.semester ?? 0)) return { label: 'Registered (upcoming)', tone: 'neutral' as const }
    return { label: 'No result', tone: 'warning' as const }
  }

  return (
    <div className="stack">
      <div className="print-only print-head">
        <h1 style={{ margin: 0 }}>Campus Portal University · Academic record</h1>
        <div>{s.name} · {s.rollNo} · {classLabel(cls)} · CGPA {fmtCgpa(cgpa)} · issued {new Date().toLocaleDateString('en-IN')}</div>
      </div>
      <div className="row between wrap gap no-print">
        <span className="small muted">{classLabel(cls)} · admitted {s.batch} · {s.residence === 'HOSTEL' ? 'Hosteller' : 'Day scholar'}{s.priorRecord?.semesters ? ` · lateral entry (Sem 1–${s.priorRecord.semesters} from earlier institution)` : ''}</span>
        <div className="row gap">
          {office && <button className="btn btn-outline btn-sm" onClick={() => setManaging(true)}><ListChecks size={14} /> Course registration</button>}
          {office && backlogCountOf(s) > 0 && <Link className="btn btn-outline btn-sm" to="/results">Register backlogs</Link>}
          <button className="btn btn-ghost btn-sm" onClick={() => window.print()}><Printer size={14} /> Print record</button>
        </div>
      </div>
      <div className="grid grid-4">
        <Stat label="CGPA" value={fmtCgpa(cgpa)} tone="brand" hint={`${sems.length} semester(s) of published results`} />
        <Stat label="Credits earned" value={earned} tone="success" />
        <Stat label="Backlogs" value={backlogCountOf(s)} tone={backlogCountOf(s) ? 'danger' : 'success'} hint={(s.backlogCourses ?? []).map((c) => db.courses.find((x) => x.id === c)?.code).join(', ') || 'None'} />
        <Stat label="Attendance this semester" value={`${current.pct}%`} tone={current.pct >= 75 ? 'success' : 'danger'} hint={`${current.attended}/${current.total} classes`} />
      </div>

      {sems.length > 0 && (
        <Card title="SGPA by semester">
          <div className="sgpa-chart">{sems.map((x) => (
            <div key={x.semester} className="sgpa-col" title={`Semester ${x.semester}: SGPA ${fmtCgpa(x.sgpa)}`}>
              <span className="small">{fmtCgpa(x.sgpa)}</span>
              <span className="sgpa-bar" style={{ height: `${((x.sgpa ?? 0) / maxSgpa) * 100}%`, background: (x.sgpa ?? 0) < 5 ? 'var(--danger)' : 'var(--brand)' }} />
              <span className="small muted">Sem {x.semester}</span>
            </div>
          ))}</div>
        </Card>
      )}

      {s.priorRecord && s.priorRecord.semesters > 0 && (
        <Card title={`Semesters 1–${s.priorRecord.semesters} · earlier institution`}>
          <div className="row gap wrap small"><Badge tone="brand">CGPA {s.priorRecord.cgpa.toFixed(2)}</Badge><Badge>{s.priorRecord.credits} credits</Badge>{s.priorRecord.backlogs > 0 && <Badge tone="danger">{s.priorRecord.backlogs} backlog(s)</Badge>}<span className="muted">Entered by the Registrar of Evaluation (Edit profile)</span></div>
        </Card>
      )}

      {semesters.length === 0 && <Card><Empty text="No courses registered yet." /></Card>}
      {semesters.map((sem) => {
        const courses = bySem.get(sem)!.sort((a, b) => kindOf(a).localeCompare(kindOf(b)) || a.code.localeCompare(b.code))
        const t = sems.find((x) => x.semester === sem)
        const credits = courses.reduce((n, c) => n + c.credits, 0)
        const label = sem === s.semester ? 'current' : sem > (s.semester ?? 0) ? 'next' : null
        const partial = !!t && courses.some((c) => !attempts.some((a) => a.course.id === c.id))
        return (
          <Card key={sem} title={<>Semester {sem} {label && <Badge tone={label === 'current' ? 'info' : 'neutral'}>{label}</Badge>}</>}
            action={<div className="row gap">{t && <Badge tone={partial ? 'warning' : 'success'}>{partial ? 'SGPA so far' : 'SGPA'} {fmtCgpa(t.sgpa)}</Badge>}<Badge>{courses.length} courses · {credits} credits{t ? ` · ${t.earned} earned` : ''}</Badge></div>}>
            <div className="table-wrap"><table>
              <thead><tr><th>Course</th><th>Type</th><th>Cr</th><th>Attend.</th><th title="Internal + external = final">Int + Ext = Final</th><th>Grade</th><th>Attempts</th><th>Status</th></tr></thead>
              <tbody>{courses.map((c) => {
                const mine = attempts.filter((a) => a.course.id === c.id) // newest first
                const last = mine[0]
                const att = attendanceStats(db, s.id, c.id)
                const st = statusOf(c, sem, mine)
                return (
                  <tr key={c.id}>
                    <td><strong>{c.code}</strong> {c.name}<div className="small muted">{userName(db, c.facultyId)}{isPan(c) ? ` · ${c.term}` : ''}</div></td>
                    <td>{isPan(c) ? <KindBadge c={c} /> : <span className="small">{KIND_LABEL.CORE}</span>}</td>
                    <td>{c.credits}</td>
                    <td>{att.total ? <Badge tone={att.pct >= 75 ? 'success' : 'danger'}>{att.pct}%</Badge> : <span className="muted small">—</span>}</td>
                    <td className="nowrap">{last ? <>{last.row.internal} + {last.row.absent ? 'AB' : last.row.external ?? '—'} = <strong>{last.row.final ?? '—'}</strong><span className="muted small">/{last.sheet.internalMax + last.sheet.externalMax}</span></> : '—'}</td>
                    <td>{last?.row.grade ? <Badge tone={last.row.pass ? 'success' : 'danger'}>{last.row.grade}</Badge> : '—'}</td>
                    <td className="small">{mine.length === 0 ? '—' : [...mine].reverse().map((a, i) => <div key={i} className="nowrap">{a.sheet.term === 'Supplementary' ? 'Supp.' : 'Regular'} · {a.row.grade}{a.sheet.publishedAt ? ` · ${new Date(a.sheet.publishedAt).toLocaleString('en-IN', { month: 'short', year: 'numeric' })}` : ''}</div>)}</td>
                    <td><Badge tone={st.tone}>{st.label}</Badge></td>
                  </tr>
                )
              })}</tbody>
            </table></div>
          </Card>
        )
      })}

      <Card title="Course registration history">
        {regs.length === 0 ? <Empty text="No foundation or open-elective registrations." /> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Course</th><th>Type</th><th>Term</th><th>Semester</th><th>Status</th><th>When</th><th>By</th></tr></thead>
            <tbody>{regs.map((r) => { const c = db.courses.find((x) => x.id === r.courseId); return (
              <tr key={r.id}><td><strong>{c?.code}</strong> {c?.name}</td><td>{c && <KindBadge c={c} />}</td><td>{r.term}</td><td>{r.semester}</td><td><Badge tone={r.status === 'REGISTERED' ? 'success' : 'neutral'}>{r.status === 'REGISTERED' ? 'Registered' : 'Dropped'}</Badge></td><td className="small">{fmtDate(r.at)}{r.droppedAt ? ` → dropped ${fmtDate(r.droppedAt)}` : ''}</td><td className="small">{r.by === s.id ? 'Student' : userName(db, r.by)}</td></tr>
            ) })}</tbody>
          </table></div>
        )}
      </Card>
      {managing && <StudentRegistrationModal studentId={s.id} manage={office} onClose={() => setManaging(false)} />}
    </div>
  )
}
