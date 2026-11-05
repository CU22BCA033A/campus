import { useState } from 'react'
import { AlertTriangle, Armchair, CheckCircle2, FileText, Printer, Ticket } from 'lucide-react'
import { audit, notify, uid, update, useCurrentUser, useDB } from '../data/store'
import { Badge, Card, Empty, Field, Modal, PageHeader, Stat, Tabs } from '../components/ui'
import { sgpaOf, studentResults } from '../results'
import { classCourses, classLabel } from '../classes'
import { courseName, coursesFor, examEligibility, fmtDate, gradeResults, inr, userName, matches } from '../lib'
import { can, officeUsers } from '../access'
import { availableComponents, newSheet } from '../results'
import { Link } from 'react-router-dom'
import type { DB, Exam } from '../data/types'

const ROOMS = ['EB-101', 'EB-102', 'EB-103', 'EB-201']
const ROOM_SEATS = 6 // small for the demo so several rooms are used

/** Grades for one exam's published results. */
export function examGrades(db: DB, exam: Exam) {
  const rs = db.results.filter((r) => r.examId === exam.id)
  return gradeResults(rs.map((r) => ({ studentId: r.studentId, pct: (r.marks / exam.maxMarks) * 100 })), exam.grading)
}

/** SGPA from published results (credit-weighted). */
export function sgpaFor(db: DB, studentId: string) {
  let pts = 0, cr = 0
  for (const e of db.exams.filter((x) => x.resultsPublished)) {
    const g = examGrades(db, e).grades.get(studentId)
    const c = db.courses.find((x) => x.id === e.courseId)
    if (g && c) { pts += g.point * c.credits; cr += c.credits }
  }
  return cr ? pts / cr : null
}

export default function Exams() {
  const user = useCurrentUser()!
  return user.role === 'student' ? <StudentExams studentId={user.id} /> : <ExamAdmin />
}

export function StudentExams({ studentId, readOnly = false }: { studentId: string; readOnly?: boolean }) {
  const db = useDB()
  const student = db.users.find((u) => u.id === studentId)!
  const courses = coursesFor(db, student)
  // Own courses' exams, plus supplementary exams the student is registered for (backlogs).
  const suppExamIds = new Set(db.resultSheets.filter((sh) => sh.term === 'Supplementary' && sh.extraStudentIds.includes(studentId) && sh.examId).map((sh) => sh.examId!))
  const exams = db.exams.filter((e) => (courses.some((c) => c.id === e.courseId) && e.kind !== 'Supplementary') || suppExamIds.has(e.id))
  const upcoming = exams.filter((e) => !e.resultsPublished).sort((a, b) => a.date.localeCompare(b.date))
  const results = studentResults(db, studentId)
  const [tab, setTab] = useState<'schedule' | 'results' | 'reval'>('schedule')
  const [ticket, setTicket] = useState(false)
  const [reval, setReval] = useState<Exam | null>(null)
  const [reason, setReason] = useState('')
  const lastSem = Math.max(0, ...results.filter((x) => x.sheet.term === 'Regular' && !x.row.backlogAttempt).map((x) => x.sheet.semester))
  const sgpa = lastSem ? sgpaOf(db, studentId, lastSem) : null
  const elig = upcoming.map((e) => ({ e, ...examEligibility(db, studentId, e) }))
  const allEligible = elig.length > 0 && elig.every((x) => x.eligible)
  const anyEligible = elig.some((x) => x.eligible)

  const requestReval = () => {
    if (!reval) return
    const r = db.results.find((x) => x.examId === reval.id && x.studentId === studentId)!
    update((d) => { d.revaluations.push({ id: uid('rv'), examId: reval.id, studentId, reason, fee: 500, status: 'REQUESTED', oldMarks: r.marks, createdAt: Date.now() }) })
    notify(officeUsers(db, 'exam'), `Re-evaluation request from ${student.name} (${courseName(db, reval.courseId)})`, '/exams')
    setReval(null); setReason('')
  }

  return (
    <>
      {!readOnly && <PageHeader title="Examinations" subtitle="Schedule, hall ticket, results and re-evaluation" actions={<button className="btn" disabled={!anyEligible} title={anyEligible ? '' : 'Not eligible for any upcoming exam'} onClick={() => setTicket(true)}><Ticket size={14} /> Hall ticket</button>} />}
      <div className="grid grid-4">
        <Stat label="Upcoming exams" value={upcoming.length} tone="info" />
        <Stat label="Eligible" value={`${elig.filter((x) => x.eligible).length}/${elig.length}`} tone={allEligible ? 'success' : 'danger'} />
        <Stat label={lastSem ? `SGPA (Sem ${lastSem})` : 'SGPA'} value={sgpa !== null ? sgpa.toFixed(2) : '—'} tone="brand" hint={(student.backlogCourses?.length ?? 0) ? `${student.backlogCourses!.length} backlog course(s)` : undefined} />
        <Stat label="CGPA" value={student.cgpa?.toFixed(2) ?? '—'} tone="accent" />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'schedule', label: 'Schedule & eligibility' }, { id: 'results', label: 'Results', count: results.length }, ...(!readOnly ? [{ id: 'reval' as const, label: 'Re-evaluation' }] : [])]} />
      {tab === 'schedule' && (
        <Card>
          {elig.length === 0 ? <Empty text="No upcoming exams." /> : (
            <div className="table-wrap"><table>
              <thead><tr><th>Date</th><th>Course</th><th>Exam</th><th>Time</th><th>Seat</th><th>Eligibility</th></tr></thead>
              <tbody>{elig.map(({ e, eligible, reasons }) => {
                const seat = e.seating?.find((s) => s.studentId === studentId)
                return (
                  <tr key={e.id}>
                    <td>{fmtDate(e.date)}</td><td>{courseName(db, e.courseId)}</td><td>{e.title}</td><td>{e.start}–{e.end}</td>
                    <td>{seat ? `${seat.room} / ${seat.seat}` : <span className="muted">Not allotted</span>}</td>
                    <td>{eligible ? <Badge tone="success">Eligible</Badge> : <div><Badge tone="danger">Not eligible</Badge>{reasons.map((r) => <div key={r} className="small" style={{ color: 'var(--danger)' }}>{r}</div>)}</div>}</td>
                  </tr>
                )
              })}</tbody>
            </table></div>
          )}
        </Card>
      )}
      {tab === 'results' && (
        <Card action={<button className="btn btn-outline btn-sm" onClick={() => window.print()}><Printer size={14} /> Print grade sheet</button>} title="Grade sheet">
          {results.length === 0 ? <Empty text="No results published yet." /> : (
            <div className="table-wrap"><table>
              <thead><tr><th>Course</th><th>Semester</th><th>Attempt</th><th>Internal</th><th>External</th><th>Final</th><th>Grade</th><th>Result</th>{!readOnly && <th />}</tr></thead>
              <tbody>{results.map(({ sheet, course, row }) => {
                const ex = db.exams.find((e) => e.id === sheet.examId)
                const rv = ex && db.revaluations.find((x) => x.examId === ex.id && x.studentId === studentId)
                return (
                  <tr key={sheet.id}>
                    <td><strong>{course.code}</strong> {course.name}</td><td>{sheet.semester}</td>
                    <td>{row.backlogAttempt ? <Badge tone="warning">Backlog</Badge> : <Badge>Regular</Badge>}</td>
                    <td>{row.internal}/{sheet.internalMax}</td>
                    <td>{row.absent ? 'Absent' : `${row.external ?? '—'}/${sheet.externalMax}`}</td>
                    <td><strong>{row.final ?? '—'}/{sheet.internalMax + sheet.externalMax}</strong></td>
                    <td>{row.grade ? <Badge tone={row.pass ? 'success' : 'danger'}>{row.grade}</Badge> : '—'}</td>
                    <td>{row.pass ? <Badge tone="success">Pass</Badge> : <Badge tone="danger">Fail</Badge>}</td>
                    {!readOnly && <td>{ex && row.externalRaw !== undefined && !rv && <button className="btn btn-outline btn-sm" onClick={() => setReval(ex)}>Apply for re-evaluation</button>}{rv && <Badge tone="info">Re-eval: {rv.status}</Badge>}</td>}
                  </tr>
                )
              })}</tbody>
            </table></div>
          )}
          {(student.backlogCourses?.length ?? 0) > 0 && <div className="alert alert-warning small" style={{ marginTop: 10 }}>Backlogs: {student.backlogCourses!.map((c) => db.courses.find((x) => x.id === c)?.code).join(', ')}. The Registrar of Evaluation registers you for the supplementary exam.</div>}
        </Card>
      )}
      {tab === 'reval' && (
        <Card title="My re-evaluation requests">
          {db.revaluations.filter((r) => r.studentId === studentId).length === 0 ? <Empty text="No requests." /> : (
            <div className="list">{db.revaluations.filter((r) => r.studentId === studentId).map((r) => {
              const e = db.exams.find((x) => x.id === r.examId)!
              return <div key={r.id} className="list-item"><div className="grow"><strong>{courseName(db, e.courseId)}</strong><div className="small muted">{e.title} · fee {inr(r.fee)} · original {r.oldMarks}{r.newMarks !== undefined ? ` → revised ${r.newMarks}` : ''}</div></div><Badge tone={r.status === 'REVISED' ? 'success' : r.status === 'NO_CHANGE' ? 'neutral' : 'warning'}>{r.status}</Badge></div>
            })}</div>
          )}
        </Card>
      )}
      {ticket && (
        <Modal title="Hall ticket" onClose={() => setTicket(false)} footer={<button className="btn" onClick={() => window.print()}><Printer size={14} /> Print</button>}>
          <div className="row gap"><div className="brand-logo">CP</div><div><strong>Campus Portal University</strong><div className="small muted">Admit card · End Semester Examinations</div></div></div>
          <table><tbody>
            <tr><td className="muted">Name</td><td><strong>{student.name}</strong></td></tr>
            <tr><td className="muted">Roll number</td><td>{student.rollNo}</td></tr>
            <tr><td className="muted">Programme</td><td>{student.program} · Semester {student.semester}</td></tr>
          </tbody></table>
          <table><thead><tr><th>Date</th><th>Course</th><th>Time</th><th>Room / seat</th></tr></thead><tbody>
            {elig.filter((x) => x.eligible).map(({ e }) => { const s = e.seating?.find((x) => x.studentId === studentId); return <tr key={e.id}><td>{fmtDate(e.date)}</td><td>{courseName(db, e.courseId)}</td><td>{e.start}</td><td>{s ? `${s.room} / ${s.seat}` : 'TBA'}</td></tr> })}
          </tbody></table>
          {!allEligible && <div className="alert alert-warning small">Withheld: {elig.filter((x) => !x.eligible).map((x) => `${courseName(db, x.e.courseId)} (${x.reasons.join('; ')})`).join(', ')}</div>}
          <div className="small muted">Carry this hall ticket and your college ID card. Electronic devices are not permitted.</div>
        </Modal>
      )}
      {reval && (
        <Modal title="Apply for re-evaluation" onClose={() => setReval(null)} footer={<><button className="btn btn-ghost" onClick={() => setReval(null)}>Cancel</button><button className="btn" disabled={!reason.trim()} onClick={requestReval}>Pay {inr(500)} &amp; submit</button></>}>
          <div>{courseName(db, reval.courseId)}: {reval.title}</div>
          <Field label="Reason"><textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        </Modal>
      )}
    </>
  )
}

function ExamAdmin() {
  const db = useDB()
  const user = useCurrentUser()!
  const isAdmin = can(user, 'manageExams')
  const [term, setTerm] = useState('')
  const exams = db.exams.filter((e) => matches(term, e.title, courseName(db, e.courseId), db.courses.find((c) => c.id === e.courseId)?.code, e.date, userName(db, e.evaluatorId ?? ''))).filter((e) => isAdmin || e.evaluatorId === user.id || db.courses.find((c) => c.id === e.courseId)?.facultyId === user.id).sort((a, b) => a.date.localeCompare(b.date))
  const canMark = (e: Exam) => isAdmin || e.evaluatorId === user.id
  const sheetOf = (e: Exam) => db.resultSheets.find((sh) => sh.examId === e.id)
  const [bulk, setBulk] = useState<{ classId: string; title: string; date: string; gap: number; start: string; end: string; maxMarks: number; evaluators: Record<string, string> } | null>(null)
  const facultyList = db.users.filter((u) => u.role === 'faculty' && u.status === 'ACTIVE')
  /** Create one exam per course of a class, each with an allotted evaluator, plus result sheets linked to them. */
  const createForClass = () => {
    if (!bulk) return
    const cls = db.classes.find((c) => c.id === bulk.classId)!
    const courses = classCourses(db, cls)
    if (!bulk.date || !courses.length) return alert('Choose a class with courses and a first exam date.')
    update((d) => {
      courses.forEach((c, i) => {
        const date = new Date(new Date(bulk.date).getTime() + i * bulk.gap * 86_400_000).toISOString().slice(0, 10)
        const evaluatorId = bulk.evaluators[c.id] ?? c.facultyId
        const id = uid('ex')
        d.exams.push({ id, courseId: c.id, title: bulk.title, date, start: bulk.start, end: bulk.end, venue: 'Exam Block', maxMarks: bulk.maxMarks, minAttendance: 75, requireFeesCleared: true, minInternal: 0, resultsPublished: false, grading: 'ABSOLUTE', evaluatorId, kind: 'Regular' })
        const sh = d.resultSheets.find((x) => x.courseId === c.id && x.semester === cls.semester && x.term === 'Regular')
        if (sh) { sh.examId = id; sh.evaluatorId = evaluatorId }
        else d.resultSheets.push({ ...newSheet(c.id, cls.semester, evaluatorId, id), components: availableComponents(d, c.id, id).filter((x) => x.kind !== 'quiz') })
      })
    })
    for (const c of courses) notify([bulk.evaluators[c.id] ?? c.facultyId], `You are the evaluator for ${c.code} ${bulk.title}. Fill marks in Results.`, '/results')
    notify(classStudentsOf(cls.id), `${bulk.title} timetable published for ${classLabel(cls)}`, '/exams')
    audit(user.id, 'EXAM_CREATE_CLASS', `${bulk.title}: ${classLabel(cls)} (${courses.length} courses)`)
    setBulk(null)
  }
  const classStudentsOf = (cid: string) => db.users.filter((u) => u.role === 'student' && u.classId === cid).map((u) => u.id)
  const [tab, setTab] = useState<'exams' | 'reval'>('exams')
  const [marksFor, setMarksFor] = useState<Exam | null>(null)
  const [seatingFor, setSeatingFor] = useState<Exam | null>(null)
  const [eligFor, setEligFor] = useState<Exam | null>(null)
  const [marks, setMarks] = useState<Record<string, string>>({})
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState({ courseId: db.courses[0].id, title: 'End Semester Examination', date: '', start: '09:30', end: '12:30', maxMarks: 100, minAttendance: 75, requireFeesCleared: true, minInternal: 0, grading: 'ABSOLUTE' as Exam['grading'] })

  const studentsOf = (e: Exam) => db.courses.find((c) => c.id === e.courseId)!.studentIds.filter((sid) => db.users.find((u) => u.id === sid)?.status === 'ACTIVE')

  const generateSeating = (e: Exam) => {
    const eligible = studentsOf(e).filter((sid) => examEligibility(db, sid, e).eligible)
      .map((sid) => db.users.find((u) => u.id === sid)!).sort((a, b) => (a.rollNo ?? '').localeCompare(b.rollNo ?? ''))
    const faculty = db.users.filter((u) => u.role === 'faculty')
    const seating = eligible.map((s, i) => ({ studentId: s.id, room: ROOMS[Math.floor(i / ROOM_SEATS) % ROOMS.length], seat: `S${String((i % ROOM_SEATS) + 1).padStart(2, '0')}` }))
    const usedRooms = [...new Set(seating.map((s) => s.room))]
    const course = db.courses.find((c) => c.id === e.courseId)!
    // Invigilators: round-robin, never the course's own faculty.
    const pool = faculty.filter((f) => f.id !== course.facultyId)
    const invigilators = usedRooms.map((room, i) => ({ room, facultyId: (pool.length ? pool : faculty)[i % (pool.length || faculty.length)].id }))
    update((d) => { const x = d.exams.find((y) => y.id === e.id)!; x.seating = seating; x.invigilators = invigilators })
    notify(eligible.map((s) => s.id), `Hall ticket & seat allotted: ${course.name}`, '/exams')
    notify(invigilators.map((v) => v.facultyId), `Invigilation duty: ${course.code} on ${fmtDate(e.date)}`, '/exams')
    audit(user.id, 'EXAM_SEATING', `Seating generated for ${course.code} ${e.title} (${eligible.length} students, ${usedRooms.length} rooms)`)
    setSeatingFor({ ...e, seating, invigilators })
  }

  const saveMarks = () => {
    if (!marksFor) return
    update((d) => {
      for (const [sid, v] of Object.entries(marks)) {
        if (v === '') continue
        const n = Math.max(0, Math.min(marksFor.maxMarks, Number(v)))
        const ex = d.results.find((r) => r.examId === marksFor.id && r.studentId === sid)
        if (ex) ex.marks = n; else d.results.push({ id: uid('res'), examId: marksFor.id, studentId: sid, marks: n })
      }
    })
    audit(user.id, 'EXAM_MARKS', `Marks entered for ${courseName(db, marksFor.courseId)} ${marksFor.title}`)
    setMarksFor(null)
  }

  const publish = (e: Exam) => {
    update((d) => { d.exams.find((x) => x.id === e.id)!.resultsPublished = true })
    notify(studentsOf(e), `Results published: ${courseName(db, e.courseId)} ${e.title}`, '/exams')
    const parents = db.users.filter((u) => u.role === 'parent' && u.wardIds?.some((w) => studentsOf(e).includes(w))).map((u) => u.id)
    notify(parents, `Results published for your ward: ${courseName(db, e.courseId)}`, '/home')
    audit(user.id, 'EXAM_PUBLISH', `Published results for ${courseName(db, e.courseId)} ${e.title}`)
  }

  const create = () => {
    if (!draft.date) return
    update((d) => { d.exams.push({ id: uid('ex'), ...draft, venue: 'Exam Block', resultsPublished: false }) })
    audit(user.id, 'EXAM_CREATE', `Scheduled ${draft.title} for ${courseName(db, draft.courseId)}`)
    setCreating(false)
  }

  const reviewReval = (id: string, newMarks: number | null) => {
    const r = db.revaluations.find((x) => x.id === id)!
    update((d) => {
      const x = d.revaluations.find((y) => y.id === id)!
      if (newMarks === null || newMarks === r.oldMarks) x.status = 'NO_CHANGE'
      else {
        x.status = 'REVISED'; x.newMarks = newMarks
        d.results.find((y) => y.examId === r.examId && y.studentId === r.studentId)!.marks = newMarks
      }
    })
    notify([r.studentId], `Re-evaluation result: ${newMarks === null || newMarks === r.oldMarks ? 'no change' : `revised to ${newMarks}`}`, '/exams')
    audit(user.id, 'EXAM_REVAL', `Re-evaluation ${id} reviewed`)
  }

  return (
    <>
      <PageHeader search={{ value: term, onChange: setTerm, placeholder: 'Search exam, course or evaluator…' }} title="Examinations" subtitle={isAdmin ? 'Create exams per class, allot evaluators, seating & invigilation; results are published from the result sheets' : 'Exams you teach or evaluate. Enter marks here or in Results.'} actions={isAdmin && <><button className="btn btn-outline" onClick={() => { const c = db.classes[0]; setBulk({ classId: c.id, title: 'End Semester Examination', date: '', gap: 2, start: '09:30', end: '12:30', maxMarks: 100, evaluators: Object.fromEntries(classCourses(db, c).map((x) => [x.id, x.facultyId])) }) }}>Create exams for a class</button><button className="btn" onClick={() => setCreating(true)}>Schedule single exam</button></>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'exams', label: 'Exams', count: exams.length }, { id: 'reval', label: 'Re-evaluation', count: db.revaluations.filter((r) => r.status === 'REQUESTED').length }]} />
      {tab === 'exams' && (
        <div className="stack">
          {exams.map((e) => {
            const studs = studentsOf(e)
            const eligible = studs.filter((s) => examEligibility(db, s, e).eligible).length
            const entered = db.results.filter((r) => r.examId === e.id).length
            const g = e.resultsPublished ? examGrades(db, e) : null
            return (
              <Card key={e.id} title={<span>{courseName(db, e.courseId)} · {e.title}</span>} action={<Badge tone={e.resultsPublished ? 'success' : 'info'}>{e.resultsPublished ? 'Results published' : fmtDate(e.date)}</Badge>}>
                <div className="row gap small" style={{ marginBottom: 8 }}>
                  <span>Evaluator:</span>
                  {isAdmin && !e.resultsPublished ? (
                    <select className="select" style={{ width: 'auto', padding: '4px 8px' }} aria-label="Evaluator" value={e.evaluatorId ?? ''} onChange={(ev) => { const v = ev.target.value; update((d) => { d.exams.find((x) => x.id === e.id)!.evaluatorId = v; const sh = d.resultSheets.find((x) => x.examId === e.id); if (sh) sh.evaluatorId = v }); notify([v], `You are the evaluator for ${courseName(db, e.courseId)} ${e.title}`, '/results') }}>
                      <option value="">Not allotted</option>{facultyList.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                  ) : <strong>{e.evaluatorId ? userName(db, e.evaluatorId) : 'Not allotted'}</strong>}
                  {e.kind === 'Supplementary' && <Badge tone="warning">Supplementary</Badge>}
                </div>
                <div className="row gap wrap small" style={{ marginBottom: 12 }}>
                  <Badge tone={eligible === studs.length ? 'success' : 'warning'}>{eligible}/{studs.length} eligible</Badge>
                  <Badge>{e.grading === 'RELATIVE' ? 'Relative grading' : 'Absolute grading'}{g && g.schemeUsed !== e.grading ? ' (absolute fallback: small class)' : ''}</Badge>
                  <Badge tone="info">Gates: attendance ≥ {e.minAttendance}%{e.requireFeesCleared ? ', fees cleared' : ''}{e.minInternal ? `, internal ≥ ${e.minInternal}%` : ''}</Badge>
                  <Badge>{entered} marks entered</Badge>
                  {e.seating && <Badge tone="accent">{e.seating.length} seats · {e.invigilators?.length} rooms</Badge>}
                </div>
                <div className="row gap wrap">
                  <button className="btn btn-outline btn-sm" onClick={() => setEligFor(e)}><CheckCircle2 size={14} /> Eligibility list</button>
                  {isAdmin && !e.resultsPublished && <button className="btn btn-outline btn-sm" onClick={() => generateSeating(e)}><Armchair size={14} /> {e.seating ? 'Regenerate' : 'Generate'} seating &amp; invigilators</button>}
                  {e.seating && <button className="btn btn-outline btn-sm" onClick={() => setSeatingFor(e)}>View seating plan</button>}
                  {!e.resultsPublished && canMark(e) && <button className="btn btn-outline btn-sm" onClick={() => { setMarksFor(e); setMarks(Object.fromEntries(db.results.filter((r) => r.examId === e.id).map((r) => [r.studentId, String(r.marks)]))) }}><FileText size={14} /> Enter marks</button>}
                  {sheetOf(e) ? <Link className="btn btn-sm" to="/results">Result sheet ({sheetOf(e)!.status.toLowerCase()})</Link> : isAdmin && !e.resultsPublished && <button className="btn btn-sm" disabled={!entered} onClick={() => publish(e)}>Publish results</button>}
                </div>
              </Card>
            )
          })}
        </div>
      )}
      {tab === 'reval' && (
        <Card>
          {db.revaluations.length === 0 ? <Empty text="No re-evaluation requests." /> : (
            <div className="table-wrap"><table>
              <thead><tr><th>Student</th><th>Course</th><th>Reason</th><th>Marks</th><th>Status</th><th /></tr></thead>
              <tbody>{db.revaluations.map((r) => {
                const e = db.exams.find((x) => x.id === r.examId)!
                return <RevalRow key={r.id} r={r} label={courseName(db, e.courseId)} max={e.maxMarks} student={userName(db, r.studentId)} onReview={(n) => reviewReval(r.id, n)} canReview={isAdmin} />
              })}</tbody>
            </table></div>
          )}
        </Card>
      )}

      {eligFor && (
        <Modal title={`Eligibility: ${courseName(db, eligFor.courseId)}`} onClose={() => setEligFor(null)}>
          <table><thead><tr><th>Student</th><th>Attendance</th><th>Status</th></tr></thead><tbody>
            {studentsOf(eligFor).map((sid) => { const x = examEligibility(db, sid, eligFor); return <tr key={sid}><td>{userName(db, sid)}</td><td>{x.attendance}%</td><td>{x.eligible ? <Badge tone="success">Eligible</Badge> : <span className="small" style={{ color: 'var(--danger)' }}><AlertTriangle size={12} /> {x.reasons.join('; ')}</span>}</td></tr> })}
          </tbody></table>
        </Modal>
      )}
      {seatingFor && (
        <Modal title="Seating plan" onClose={() => setSeatingFor(null)} footer={<button className="btn" onClick={() => window.print()}><Printer size={14} /> Print</button>}>
          {(seatingFor.invigilators ?? []).map((v) => (
            <div key={v.room} className="stack" style={{ gap: 6 }}>
              <div className="row between"><h3>{v.room}</h3><span className="small muted">Invigilator: {userName(db, v.facultyId)}</span></div>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                {seatingFor.seating!.filter((s) => s.room === v.room).map((s) => <div key={s.studentId} className="card small" style={{ padding: 8 }}><strong>{s.seat}</strong><div className="ellipsis">{userName(db, s.studentId)}</div><div className="muted">{db.users.find((u) => u.id === s.studentId)?.rollNo}</div></div>)}
              </div>
            </div>
          ))}
        </Modal>
      )}
      {marksFor && (
        <Modal title={`Marks: ${courseName(db, marksFor.courseId)} (out of ${marksFor.maxMarks})`} onClose={() => setMarksFor(null)} footer={<><button className="btn btn-ghost" onClick={() => setMarksFor(null)}>Cancel</button><button className="btn" onClick={saveMarks}>Save marks</button></>}>
          {studentsOf(marksFor).map((sid) => {
            const ok = examEligibility(db, sid, marksFor).eligible
            return (
              <div key={sid} className="row gap">
                <span className="grow">{userName(db, sid)} <span className="muted small">{db.users.find((u) => u.id === sid)?.rollNo}</span> {!ok && <Badge tone="danger">Not eligible</Badge>}</span>
                <input className="input" style={{ width: 90 }} type="number" min={0} max={marksFor.maxMarks} disabled={!ok} value={marks[sid] ?? ''} onChange={(e) => setMarks({ ...marks, [sid]: e.target.value })} />
              </div>
            )
          })}
        </Modal>
      )}
      {bulk && (() => { const cls = db.classes.find((c) => c.id === bulk.classId)!; const courses = classCourses(db, cls); return (
        <Modal title="Create exams for a class" onClose={() => setBulk(null)} footer={<><button className="btn btn-ghost" onClick={() => setBulk(null)}>Cancel</button><button className="btn" onClick={createForClass}>Create {courses.length} exam(s)</button></>}>
          <Field label="Class"><select className="select" value={bulk.classId} onChange={(e) => { const c = db.classes.find((x) => x.id === e.target.value)!; setBulk({ ...bulk, classId: c.id, evaluators: Object.fromEntries(classCourses(db, c).map((x) => [x.id, x.facultyId])) }) }}>{db.classes.map((c) => <option key={c.id} value={c.id}>{classLabel(c)}</option>)}</select></Field>
          <div className="grid grid-2">
            <Field label="Exam"><select className="select" value={bulk.title} onChange={(e) => setBulk({ ...bulk, title: e.target.value })}>{['End Semester Examination', 'Mid-Semester Examination', 'Internal Test 1', 'Internal Test 2'].map((t) => <option key={t}>{t}</option>)}</select></Field>
            <Field label="Max marks"><input className="input" type="number" value={bulk.maxMarks} onChange={(e) => setBulk({ ...bulk, maxMarks: Number(e.target.value) })} /></Field>
            <Field label="First exam date"><input className="input" type="date" value={bulk.date} onChange={(e) => setBulk({ ...bulk, date: e.target.value })} /></Field>
            <Field label="Days between papers"><input className="input" type="number" min={0} value={bulk.gap} onChange={(e) => setBulk({ ...bulk, gap: Number(e.target.value) })} /></Field>
            <Field label="Start"><input className="input" type="time" value={bulk.start} onChange={(e) => setBulk({ ...bulk, start: e.target.value })} /></Field>
            <Field label="End"><input className="input" type="time" value={bulk.end} onChange={(e) => setBulk({ ...bulk, end: e.target.value })} /></Field>
          </div>
          <h3>Allot an evaluator for each course</h3>
          {courses.length === 0 ? <Empty text="This class has no courses this semester." /> : courses.map((c) => (
            <div key={c.id} className="row gap">
              <span className="grow"><strong>{c.code}</strong> {c.name} <span className="small muted">· teacher {userName(db, c.facultyId)}</span></span>
              <select className="select" style={{ width: 'auto' }} aria-label={`Evaluator for ${c.code}`} value={bulk.evaluators[c.id] ?? c.facultyId} onChange={(e) => setBulk({ ...bulk, evaluators: { ...bulk.evaluators, [c.id]: e.target.value } })}>{facultyList.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
            </div>
          ))}
          {bulk.title === 'End Semester Examination' && <div className="small muted">A result sheet is created for each course and linked to its exam. The evaluator enters the external marks there.</div>}
        </Modal>
      ) })()}
      {creating && (
        <Modal title="Schedule exam" onClose={() => setCreating(false)} footer={<><button className="btn btn-ghost" onClick={() => setCreating(false)}>Cancel</button><button className="btn" onClick={create}>Schedule</button></>}>
          <Field label="Course"><select className="select" value={draft.courseId} onChange={(e) => setDraft({ ...draft, courseId: e.target.value })}>{db.courses.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</select></Field>
          <Field label="Title"><input className="input" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></Field>
          <div className="grid grid-2">
            <Field label="Date"><input className="input" type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></Field>
            <Field label="Max marks"><input className="input" type="number" value={draft.maxMarks} onChange={(e) => setDraft({ ...draft, maxMarks: Number(e.target.value) })} /></Field>
            <Field label="Start"><input className="input" type="time" value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} /></Field>
            <Field label="End"><input className="input" type="time" value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} /></Field>
            <Field label="Min attendance %"><input className="input" type="number" value={draft.minAttendance} onChange={(e) => setDraft({ ...draft, minAttendance: Number(e.target.value) })} /></Field>
            <Field label="Min internal %"><input className="input" type="number" value={draft.minInternal} onChange={(e) => setDraft({ ...draft, minInternal: Number(e.target.value) })} /></Field>
          </div>
          <Field label="Grading"><select className="select" value={draft.grading} onChange={(e) => setDraft({ ...draft, grading: e.target.value as Exam['grading'] })}><option value="ABSOLUTE">Absolute</option><option value="RELATIVE">Relative (falls back to absolute for &lt; 10 students)</option></select></Field>
          <label className="row gap"><input type="checkbox" checked={draft.requireFeesCleared} onChange={(e) => setDraft({ ...draft, requireFeesCleared: e.target.checked })} /> Require fees cleared</label>
        </Modal>
      )}
    </>
  )
}

function RevalRow({ r, label, max, student, onReview, canReview }: { r: DB['revaluations'][number]; label: string; max: number; student: string; onReview: (n: number | null) => void; canReview: boolean }) {
  const [v, setV] = useState(String(r.oldMarks))
  return (
    <tr>
      <td>{student}</td><td>{label}</td><td className="ellipsis" style={{ maxWidth: 200 }}>{r.reason}</td>
      <td>{r.oldMarks}{r.newMarks !== undefined ? ` → ${r.newMarks}` : ''} / {max}</td>
      <td><Badge tone={r.status === 'REQUESTED' ? 'warning' : r.status === 'REVISED' ? 'success' : 'neutral'}>{r.status}</Badge></td>
      <td>{canReview && r.status === 'REQUESTED' && <div className="row gap"><input className="input" style={{ width: 70 }} type="number" value={v} onChange={(e) => setV(e.target.value)} /><button className="btn btn-sm" onClick={() => onReview(Math.min(max, Number(v)))}>Save</button><button className="btn btn-ghost btn-sm" onClick={() => onReview(null)}>No change</button></div>}</td>
    </tr>
  )
}
