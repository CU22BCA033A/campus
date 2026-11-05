import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Printer } from 'lucide-react'
import { useCurrentUser, useDB } from '../data/store'
import { Badge, Card, Empty, PageHeader, Stat } from '../components/ui'
import { backlogCountOf, cgpaOf, fmtCgpa, transcript } from '../academics'
import { classLabel } from '../classes'
import { coursesFor, matches, userName } from '../lib'
import { componentInfo, compKey, sheetFor, sheetRows } from '../results'
import { can } from '../access'

export default function Grades() {
  const user = useCurrentUser()!
  return user.role === 'student' ? <Transcript studentId={user.id} /> : <Gradebook />
}

/** Official record: only published results, exactly as set up by the Registrar of Evaluation. */
export function Transcript({ studentId, embedded = false }: { studentId: string; embedded?: boolean }) {
  const db = useDB()
  const student = db.users.find((u) => u.id === studentId)!
  const sems = transcript(db, studentId)
  const cgpa = cgpaOf(db, student)
  const prior = student.priorRecord
  const current = coursesFor(db, student).filter((c) => !sems.some((s) => s.rows.some((x) => x.course.id === c.id)))
  const credits = sems.reduce((t, s) => t + s.earned, 0) + (prior?.credits ?? 0)

  return (
    <>
      {!embedded && <PageHeader title="Grades & transcript" subtitle="Published results only: internal + external = final mark → grade, SGPA and CGPA" actions={<button className="btn btn-outline" onClick={() => window.print()}><Printer size={14} /> Print transcript</button>} />}
      <div className="grid grid-4">
        <Stat label="CGPA" value={fmtCgpa(cgpa)} tone="brand" hint={prior?.semesters ? `Includes Sem 1–${prior.semesters} record` : undefined} />
        <Stat label={sems.length ? `SGPA (Sem ${sems[sems.length - 1].semester})` : 'SGPA'} value={fmtCgpa(sems.length ? sems[sems.length - 1].sgpa : null)} tone="success" />
        <Stat label="Credits earned" value={credits} tone="info" />
        <Stat label="Backlogs" value={backlogCountOf(student)} tone={backlogCountOf(student) ? 'danger' : 'success'} hint={(student.backlogCourses ?? []).map((c) => db.courses.find((x) => x.id === c)?.code).join(', ') || undefined} />
      </div>
      {prior && prior.semesters > 0 && (
        <Card title={`Semesters 1–${prior.semesters} (record before the portal)`}>
          <div className="row gap wrap small"><Badge tone="brand">CGPA {prior.cgpa.toFixed(2)}</Badge><Badge>{prior.credits} credits</Badge>{prior.backlogs > 0 && <Badge tone="danger">{prior.backlogs} backlog(s)</Badge>}<span className="muted">Maintained by the Registrar of Evaluation</span></div>
        </Card>
      )}
      {sems.map((s) => (
        <Card key={s.semester} title={`Semester ${s.semester}`} action={<div className="row gap"><Badge tone="success">SGPA {fmtCgpa(s.sgpa)}</Badge><Badge>{s.earned}/{s.credits} credits earned</Badge></div>}>
          <div className="table-wrap"><table>
            <thead><tr><th>Course</th><th>Credits</th><th>Internal</th><th>External</th><th>Final</th><th>Grade</th><th>Points</th><th>Result</th></tr></thead>
            <tbody>{s.rows.map(({ sheet, course, row }) => (
              <tr key={course.id}>
                <td><strong>{course.code}</strong> {course.name}{row.backlogAttempt && <> <Badge tone="warning">Cleared via supplementary</Badge></>}</td>
                <td>{course.credits}</td>
                <td>{row.internal}/{sheet.internalMax}</td>
                <td>{row.absent ? 'Absent' : `${row.external ?? '—'}/${sheet.externalMax}`}</td>
                <td><strong>{row.final ?? '—'}/{sheet.internalMax + sheet.externalMax}</strong></td>
                <td><Badge tone={row.pass ? 'success' : 'danger'}>{row.grade}</Badge></td>
                <td>{row.point}</td>
                <td><Badge tone={row.pass ? 'success' : 'danger'}>{row.pass ? 'Pass' : 'Fail'}</Badge></td>
              </tr>
            ))}</tbody>
          </table></div>
        </Card>
      ))}
      {current.length > 0 && (
        <Card title={`Semester ${student.semester}: results not yet published`}>
          <div className="list">{current.map((c) => (
            <div key={c.id} className="list-item"><div className="grow"><strong>{c.code}</strong> {c.name}<div className="small muted">{c.credits} credits · {userName(db, c.facultyId)}</div></div><Badge>Not yet published</Badge></div>
          ))}</div>
        </Card>
      )}
      {sems.length === 0 && current.length === 0 && <Card><Empty text="No results yet." /></Card>}
      <p className="small muted">Grades: O ≥ 90 (10), A+ ≥ 80 (9), A ≥ 70 (8), B+ ≥ 60 (7), B ≥ 50 (6), C ≥ 40 (5), F / AB (0). Pass rules and internal/external split are set per course by the Registrar of Evaluation. CGPA counts each course's latest attempt.</p>
    </>
  )
}

/** Teachers: the live result sheet of their course, read-only here (edit in Result Sheets). */
function Gradebook() {
  const db = useDB()
  const user = useCurrentUser()!
  const courses = coursesFor(db, user).filter((c) => { const cl = db.classes.find((x) => x.id === c.classId); return !cl || cl.semester === c.semester })
  const [courseId, setCourseId] = useState(courses[0]?.id ?? '')
  const [term, setTerm] = useState('')
  const course = db.courses.find((c) => c.id === courseId)
  if (!course) return <><PageHeader title="Gradebook" /><Card><Empty text="No courses this semester." /></Card></>
  const sh = sheetFor(db, course.id, course.semester)
  const rows = sh ? sheetRows(db, sh).filter((r) => matches(term, r.student.name, r.student.rollNo)) : []
  const canOpen = can(user, 'manageResults') || sh?.evaluatorId === user.id || course.facultyId === user.id

  return (
    <>
      <PageHeader search={{ value: term, onChange: setTerm, placeholder: 'Search student or roll no.…' }} title="Gradebook" subtitle={`${classLabel(db.classes.find((c) => c.id === course.classId))} · same numbers as the Registrar of Evaluation's result sheet`} actions={<>
        <select className="select" style={{ width: 'auto' }} value={courseId} onChange={(e) => setCourseId(e.target.value)}>{courses.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</select>
        {canOpen && <Link className="btn" to="/results">Open result sheet</Link>}
      </>} />
      {!sh ? <Card><Empty text="The Registrar of Evaluation has not set up the result sheet for this course yet." /></Card> : (
        <Card title={<span>Internal {sh.internalMax} + External {sh.externalMax} <Badge tone={sh.status === 'PUBLISHED' ? 'success' : 'warning'}>{sh.status === 'PUBLISHED' ? 'Published' : sh.status === 'SUBMITTED' ? 'Submitted' : 'Draft'}</Badge></span>}>
          <div className="table-wrap"><table>
            <thead><tr><th>Student</th>{sh.components.map((c) => <th key={compKey(c)} title={componentInfo(db, c).label}>{componentInfo(db, c).label.slice(0, 14)}… /{componentInfo(db, c).max}</th>)}<th>Internal /{sh.internalMax}</th><th>External /{sh.externalMax}</th><th>Final</th><th>Grade</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.student.id}>
                <td>{r.student.name}<div className="small muted">{r.student.rollNo}{r.backlogAttempt ? ' · backlog' : ''}</div></td>
                {r.components.map((c) => <td key={c.key}>{c.value ?? '—'}{c.overridden && <span title="Edited by the Registrar of Evaluation"> *</span>}</td>)}
                <td><strong>{r.internal}</strong></td><td>{r.external ?? '—'}</td><td>{r.final ?? '—'}</td>
                <td>{r.grade ? <Badge tone={r.pass ? 'success' : 'danger'}>{r.grade}</Badge> : '—'}</td>
              </tr>
            ))}</tbody>
          </table></div>
          {sh.components.length === 0 && <div className="small muted" style={{ marginTop: 8 }}>No assignments, quizzes or tests are selected for internals yet.</div>}
        </Card>
      )}
    </>
  )
}
