import { useState } from 'react'
import { Download } from 'lucide-react'
import { useCurrentUser, useDB } from '../data/store'
import { Badge, Card, PageHeader, Stat } from '../components/ui'
import { attendanceStats, coursesFor, gradeFor } from '../lib'
import type { DB } from '../data/types'

/** Internal marks: assignments (60%) + quizzes (40%), out of 100. */
function internal(db: DB, studentId: string, courseId: string) {
  const as = db.assignments.filter((a) => a.courseId === courseId)
  let got = 0, max = 0
  for (const a of as) {
    const s = db.submissions.find((x) => x.assignmentId === a.id && x.studentId === studentId)
    if (s?.marks !== undefined) { got += s.marks; max += a.maxMarks }
  }
  const qs = db.quizzes.filter((q) => q.courseId === courseId)
  let qgot = 0, qmax = 0
  for (const q of qs) {
    const at = db.attempts.find((x) => x.quizId === q.id && x.studentId === studentId)
    if (at) { qgot += at.score; qmax += q.questions.length }
  }
  const aPct = max ? got / max : null
  const qPct = qmax ? qgot / qmax : null
  if (aPct === null && qPct === null) return null
  const pct = aPct !== null && qPct !== null ? aPct * 0.6 + qPct * 0.4 : (aPct ?? qPct)!
  return Math.round(pct * 100)
}

export default function Grades() {
  const user = useCurrentUser()!
  return user.role === 'student' ? <StudentGrades /> : <Gradebook />
}

function StudentGrades() {
  const db = useDB()
  const user = useCurrentUser()!
  const courses = coursesFor(db, user)
  const rows = courses.map((c) => ({ c, pct: internal(db, user.id, c.id), att: attendanceStats(db, user.id, c.id).pct }))
  const graded = rows.filter((r) => r.pct !== null)
  const credits = graded.reduce((s, r) => s + r.c.credits, 0)
  const sgpa = credits ? graded.reduce((s, r) => s + gradeFor(r.pct!).point * r.c.credits, 0) / credits : 0

  return (
    <>
      <PageHeader title="Grades" subtitle="Internal assessment marks for the current semester" actions={<button className="btn btn-outline" onClick={() => window.print()}><Download size={14} /> Print / Save PDF</button>} />
      <div className="grid grid-4">
        <Stat label="Projected SGPA" value={sgpa.toFixed(2)} tone="brand" />
        <Stat label="CGPA (Sem 1–4)" value="8.42" tone="success" />
        <Stat label="Credits this semester" value={courses.reduce((s, c) => s + c.credits, 0)} tone="info" />
        <Stat label="Courses graded" value={`${graded.length}/${courses.length}`} tone="accent" />
      </div>
      <Card title="Course results">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Code</th><th>Course</th><th>Credits</th><th>Internal %</th><th>Grade</th><th>Attendance</th></tr></thead>
            <tbody>
              {rows.map(({ c, pct, att }) => (
                <tr key={c.id}>
                  <td>{c.code}</td><td>{c.name}</td><td>{c.credits}</td>
                  <td>{pct ?? '—'}</td>
                  <td>{pct !== null ? <Badge tone={pct >= 50 ? 'success' : 'danger'}>{gradeFor(pct).grade}</Badge> : <Badge>Pending</Badge>}</td>
                  <td><Badge tone={att >= 75 ? 'success' : 'danger'}>{att}%</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted" style={{ marginTop: 10 }}>Internal % = 60% assignments + 40% quizzes. Grades: O ≥ 90, A+ ≥ 80, A ≥ 70, B+ ≥ 60, B ≥ 50, C ≥ 40.</p>
      </Card>
    </>
  )
}

function Gradebook() {
  const db = useDB()
  const user = useCurrentUser()!
  const courses = coursesFor(db, user)
  const [courseId, setCourseId] = useState(courses[0]?.id ?? '')
  const course = db.courses.find((c) => c.id === courseId)
  if (!course) return null
  const as = db.assignments.filter((a) => a.courseId === course.id)
  const qs = db.quizzes.filter((q) => q.courseId === course.id)

  return (
    <>
      <PageHeader title="Gradebook" subtitle="Track student progress across assessments" actions={
        <select className="select" style={{ width: 'auto' }} value={courseId} onChange={(e) => setCourseId(e.target.value)}>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
        </select>
      } />
      <Card>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Student</th>{as.map((a) => <th key={a.id} title={a.title}>{a.title.slice(0, 14)}… /{a.maxMarks}</th>)}{qs.map((q) => <th key={q.id} title={q.title}>{q.title.slice(0, 12)}… /{q.questions.length}</th>)}<th>Internal %</th><th>Grade</th></tr></thead>
            <tbody>
              {course.studentIds.map((sid) => {
                const s = db.users.find((u) => u.id === sid)!
                const pct = internal(db, sid, course.id)
                return (
                  <tr key={sid}>
                    <td>{s.name}<div className="small muted">{s.rollNo}</div></td>
                    {as.map((a) => { const x = db.submissions.find((y) => y.assignmentId === a.id && y.studentId === sid); return <td key={a.id}>{x ? (x.marks ?? <Badge tone="warning">Ungraded</Badge>) : '—'}</td> })}
                    {qs.map((q) => { const x = db.attempts.find((y) => y.quizId === q.id && y.studentId === sid); return <td key={q.id}>{x ? x.score : '—'}</td> })}
                    <td><strong>{pct ?? '—'}</strong></td>
                    <td>{pct !== null ? <Badge tone={pct >= 50 ? 'success' : 'danger'}>{gradeFor(pct).grade}</Badge> : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}
