import { Fragment, useState } from 'react'
import { AlertTriangle, Armchair, FileText, Pencil, Plus, Printer, Ticket, Trash2 } from 'lucide-react'
import { applySessionRules, sessionDates, sessionOf, sessionPapers } from '../exams'
import { audit, getDB, notify, uid, update, useCurrentUser, useDB } from '../data/store'
import { Badge, Card, Empty, Field, Modal, PageHeader, Stat, Tabs } from '../components/ui'
import { sgpaOf, studentResults } from '../results'
import { backlogCountOf, cgpaOf, fmtCgpa } from '../academics'
import { classCourses, classLabel } from '../classes'
import { courseName, coursesFor, examEligibility, fmtDate, inr, userName, matches } from '../lib'
import { can, officeUsers } from '../access'
import { availableComponents, newSheet } from '../results'
import { Link } from 'react-router-dom'
import type { DB, Exam, ExamKind } from '../data/types'

const ROOMS = ['EB-101', 'EB-102', 'EB-103', 'EB-201']
const ROOM_SEATS = 6 // small for the demo so several rooms are used

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
  const upcoming = exams.filter((e) => !e.resultsPublished).sort((a, b) => (a.sessionId ?? '').localeCompare(b.sessionId ?? '') || a.date.localeCompare(b.date))
  const results = studentResults(db, studentId)
  const [tab, setTab] = useState<'schedule' | 'results' | 'reval'>('schedule')
  const [ticket, setTicket] = useState<string | null>(null) // exam session id
  const [reval, setReval] = useState<Exam | null>(null)
  const [reason, setReason] = useState('')
  const lastSem = Math.max(0, ...results.filter((x) => x.sheet.term === 'Regular' && !x.row.backlogAttempt).map((x) => x.sheet.semester))
  const sgpa = lastSem ? sgpaOf(db, studentId, lastSem) : null
  const elig = upcoming.map((e) => ({ e, ...examEligibility(db, studentId, e) }))
  // Upcoming exams, each made of subject papers.
  const upcomingSessions = [...new Set(upcoming.map((e) => e.sessionId))].map((sid) => db.examSessions.find((x) => x.id === sid)).filter(Boolean) as DB['examSessions']
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
      {!readOnly && <PageHeader title="Examinations" subtitle="Schedule, hall ticket, results and re-evaluation" actions={<button className="btn" disabled={!anyEligible} title={anyEligible ? '' : 'Not eligible for any upcoming exam'} onClick={() => setTicket(upcomingSessions.find((s) => elig.some((x) => x.eligible && x.e.sessionId === s.id))?.id ?? null)}><Ticket size={14} /> Hall ticket</button>} />}
      <div className="grid grid-4">
        <Stat label="Upcoming exams" value={upcoming.length} tone="info" />
        <Stat label="Eligible" value={`${elig.filter((x) => x.eligible).length}/${elig.length}`} tone={allEligible ? 'success' : 'danger'} />
        <Stat label={lastSem ? `SGPA (Sem ${lastSem})` : 'SGPA'} value={sgpa !== null ? sgpa.toFixed(2) : '—'} tone="brand" hint={(student.backlogCourses?.length ?? 0) ? `${student.backlogCourses!.length} backlog course(s)` : undefined} />
        <Stat label="CGPA" value={fmtCgpa(cgpaOf(db, student))} tone="accent" hint={`${backlogCountOf(student)} backlog(s)`} />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'schedule', label: 'Schedule & eligibility' }, { id: 'results', label: 'Results', count: results.length }, ...(!readOnly ? [{ id: 'reval' as const, label: 'Re-evaluation' }] : [])]} />
      {tab === 'schedule' && (
        <Card>
          {elig.length === 0 ? <Empty text="No upcoming exams." /> : (
            <div className="table-wrap"><table>
              <thead><tr><th>Date</th><th>Subject</th><th>Time</th><th>Seat</th><th>Eligibility</th></tr></thead>
              <tbody>{elig.map(({ e, eligible, reasons }, i) => {
                const seat = e.seating?.find((s) => s.studentId === studentId)
                const firstOfExam = i === 0 || elig[i - 1].e.sessionId !== e.sessionId
                const sess = sessionOf(db, e)
                return (
                  <Fragment key={e.id}>
                  {firstOfExam && <tr><td colSpan={5} style={{ background: 'var(--brand-light)' }}><strong>{sess?.title ?? e.title}</strong> <Badge tone="brand">{sess?.kind ?? ''}</Badge> <span className="small muted">{sessionPapers(db, e.sessionId ?? '').length} subject(s)</span></td></tr>}
                  <tr>
                    <td>{fmtDate(e.date)}</td><td>{courseName(db, e.courseId)}</td><td>{e.start}–{e.end}</td>
                    <td>{seat ? `${seat.room} / ${seat.seat}` : <span className="muted">Not allotted</span>}</td>
                    <td>{eligible ? <Badge tone="success">Eligible</Badge> : <div><Badge tone="danger">Not eligible</Badge>{reasons.map((r) => <div key={r} className="small" style={{ color: 'var(--danger)' }}>{r}</div>)}</div>}</td>
                  </tr>
                  </Fragment>
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
          {(() => {
            // Published tests that are not end-semester papers (e.g. mid-semester), as set up by the Registrar of Evaluation.
            const tests = db.exams.filter((e) => e.resultsPublished && !db.resultSheets.some((sh) => sh.examId === e.id) && courses.some((c) => c.id === e.courseId))
            const mine = tests.map((e) => ({ e, r: db.results.find((x) => x.examId === e.id && x.studentId === studentId) })).filter((x) => x.r)
            return mine.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <h3>Tests (count towards internals where selected)</h3>
                <div className="table-wrap"><table>
                  <thead><tr><th>Exam</th><th>Course</th><th>Marks</th></tr></thead>
                  <tbody>{mine.map(({ e, r }) => <tr key={e.id}><td>{sessionOf(db, e)?.title ?? e.title}</td><td>{courseName(db, e.courseId)}</td><td>{r!.marks}/{e.maxMarks}</td></tr>)}</tbody>
                </table></div>
              </div>
            )
          })()}
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
      {ticket && (() => { const sess = db.examSessions.find((x) => x.id === ticket); const tElig = elig.filter((x) => x.e.sessionId === ticket); return (
        <Modal title="Hall ticket" onClose={() => setTicket(null)} footer={<button className="btn" onClick={() => window.print()}><Printer size={14} /> Print</button>}>
          {upcomingSessions.length > 1 && <Field label="Exam"><select className="select" value={ticket} onChange={(e) => setTicket(e.target.value)}>{upcomingSessions.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}</select></Field>}
          <div className="row gap"><div className="brand-logo">CP</div><div><strong>Campus Portal University</strong><div className="small muted">Admit card · {sess?.title}</div></div></div>
          <table><tbody>
            <tr><td className="muted">Name</td><td><strong>{student.name}</strong></td></tr>
            <tr><td className="muted">Roll number</td><td>{student.rollNo}</td></tr>
            <tr><td className="muted">Programme</td><td>{student.program} · Semester {student.semester}</td></tr>
          </tbody></table>
          <table><thead><tr><th>Date</th><th>Course</th><th>Time</th><th>Room / seat</th></tr></thead><tbody>
            {tElig.filter((x) => x.eligible).map(({ e }) => { const s = e.seating?.find((x) => x.studentId === studentId); return <tr key={e.id}><td>{fmtDate(e.date)}</td><td>{courseName(db, e.courseId)}</td><td>{e.start}</td><td>{s ? `${s.room} / ${s.seat}` : 'TBA'}</td></tr> })}
          </tbody></table>
          {tElig.some((x) => !x.eligible) && <div className="alert alert-warning small">Withheld: {tElig.filter((x) => !x.eligible).map((x) => `${courseName(db, x.e.courseId)} (${x.reasons.join('; ')})`).join(', ')}</div>}
          <div className="small muted">Carry this hall ticket and your college ID card. Electronic devices are not permitted.</div>
        </Modal>
      ) })()}
      {reval && (
        <Modal title="Apply for re-evaluation" onClose={() => setReval(null)} footer={<><button className="btn btn-ghost" onClick={() => setReval(null)}>Cancel</button><button className="btn" disabled={!reason.trim()} onClick={requestReval}>Pay {inr(500)} &amp; submit</button></>}>
          <div>{courseName(db, reval.courseId)}: {reval.title}</div>
          <Field label="Reason"><textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        </Modal>
      )}
    </>
  )
}

type PaperDraft = { courseId: string; include: boolean; date: string; start: string; end: string; maxMarks: number; evaluatorId: string }
const KINDS: ExamKind[] = ['End Semester', 'Mid-Semester', 'Internal Test', 'Supplementary', 'Other']
const defaultTitle = (k: ExamKind) => (k === 'End Semester' ? 'End Semester Examination' : k === 'Mid-Semester' ? 'Mid-Semester Examination' : k === 'Internal Test' ? 'Internal Test' : k === 'Supplementary' ? 'Supplementary Examination' : 'Examination')

function ExamAdmin() {
  const db = useDB()
  const user = useCurrentUser()!
  const isAdmin = can(user, 'manageExams')
  const [term, setTerm] = useState('')
  const canMark = (e: Exam) => isAdmin || e.evaluatorId === user.id
  const mine = (e: Exam) => isAdmin || e.evaluatorId === user.id || db.courses.find((c) => c.id === e.courseId)?.facultyId === user.id
  const sheetOf = (e: Exam) => db.resultSheets.find((sh) => sh.examId === e.id)
  const facultyList = db.users.filter((u) => u.role === 'faculty' && u.status === 'ACTIVE')
  const [tab, setTab] = useState<'exams' | 'reval'>('exams')
  const [marksFor, setMarksFor] = useState<Exam | null>(null)
  const [seatingFor, setSeatingFor] = useState<Exam | null>(null)
  const [eligFor, setEligFor] = useState<Exam | null>(null)
  const [marks, setMarks] = useState<Record<string, string>>({})
  const [creating, setCreating] = useState<{ id?: string; title: string; kind: ExamKind; classId: string; minAttendance: number; requireFeesCleared: boolean; grading: Exam['grading']; firstDate: string; gap: number; papers: PaperDraft[] } | null>(null)
  const [paperEdit, setPaperEdit] = useState<{ sessionId: string; examId?: string; courseId: string; date: string; start: string; end: string; maxMarks: number; evaluatorId: string } | null>(null)
  const [openIds, setOpenIds] = useState<Set<string>>(new Set())

  const studentsOf = (e: Exam) => {
    const sh = db.resultSheets.find((x) => x.examId === e.id)
    const ids = e.kind === 'Supplementary' && sh ? sh.extraStudentIds : db.courses.find((c) => c.id === e.courseId)!.studentIds
    return ids.filter((sid) => db.users.find((u) => u.id === sid)?.status === 'ACTIVE')
  }
  const sessions = db.examSessions
    .map((s) => ({ s, papers: sessionPapers(db, s.id).filter(mine) }))
    .filter((x) => x.papers.length || (isAdmin && sessionPapers(db, x.s.id).length === 0))
    .filter((x) => matches(term, x.s.title, x.s.kind, classLabel(db.classes.find((c) => c.id === x.s.classId)), ...x.papers.map((p) => `${courseName(db, p.courseId)} ${db.courses.find((c) => c.id === p.courseId)?.code} ${userName(db, p.evaluatorId ?? '')}`)))
    .sort((a, b) => (sessionDates(db, b.s.id)?.from ?? '9').localeCompare(sessionDates(db, a.s.id)?.from ?? '9'))

  /* ---------- create / edit an exam with its subjects ---------- */
  const draftFor = (classId: string, kind: ExamKind): PaperDraft[] => {
    const cls = db.classes.find((c) => c.id === classId)
    return (cls ? classCourses(db, cls) : []).map((c) => ({ courseId: c.id, include: true, date: '', start: kind === 'End Semester' ? '09:30' : '10:00', end: kind === 'End Semester' ? '12:30' : '11:30', maxMarks: kind === 'End Semester' ? 100 : 50, evaluatorId: c.facultyId }))
  }
  const startCreate = () => { const c = db.classes[0]; setCreating({ title: defaultTitle('End Semester'), kind: 'End Semester', classId: c.id, minAttendance: 75, requireFeesCleared: true, grading: 'ABSOLUTE', firstDate: '', gap: 2, papers: draftFor(c.id, 'End Semester') }) }
  const autoDates = () => {
    if (!creating?.firstDate) return alert('Choose the first paper date.')
    let i = 0
    setCreating({ ...creating, papers: creating.papers.map((p) => {
      if (!p.include) return p
      let dt = new Date(new Date(creating.firstDate).getTime() + i++ * creating.gap * 86_400_000)
      if (dt.getDay() === 0) dt = new Date(dt.getTime() + 86_400_000) // skip Sundays
      return { ...p, date: dt.toISOString().slice(0, 10) }
    }) })
  }
  const linkSheet = (d: DB, examId: string, courseId: string, evaluatorId: string) => {
    const course = d.courses.find((c) => c.id === courseId)!
    const sh = d.resultSheets.find((x) => x.courseId === courseId && x.semester === course.semester && x.term === 'Regular')
    if (sh) { sh.examId = examId; sh.evaluatorId = evaluatorId }
    else d.resultSheets.push({ ...newSheet(courseId, course.semester, evaluatorId, examId), components: availableComponents(d, courseId, examId).filter((x) => x.kind !== 'quiz') })
  }
  const saveExam = () => {
    const c = creating!
    const chosen = c.papers.filter((p) => p.include)
    if (!c.title.trim()) return alert('Give the exam a name.')
    if (!c.id && !chosen.length) return alert('Add at least one subject.')
    if (chosen.some((p) => !p.date)) return alert('Every subject needs a date (use "Fill dates").')
    const clash = chosen.find((p, i) => chosen.some((q, j) => j !== i && q.date === p.date && q.start < p.end && p.start < q.end))
    if (clash && !confirm(`Two subjects overlap on ${fmtDate(clash.date)}. The class can only sit one paper at a time. Save anyway?`)) return
    const cls = db.classes.find((x) => x.id === c.classId)
    const sid = c.id ?? uid('es')
    update((d) => {
      if (c.id) { const s = d.examSessions.find((x) => x.id === c.id)!; Object.assign(s, { title: c.title, minAttendance: c.minAttendance, requireFeesCleared: c.requireFeesCleared, grading: c.grading }); applySessionRules(d, s); return }
      d.examSessions.push({ id: sid, title: c.title.trim(), kind: c.kind, classId: c.kind === 'Supplementary' ? undefined : c.classId, minAttendance: c.minAttendance, requireFeesCleared: c.requireFeesCleared, grading: c.grading, createdAt: Date.now() })
      for (const p of chosen) {
        const id = uid('ex')
        d.exams.push({ id, sessionId: sid, courseId: p.courseId, title: c.title.trim(), date: p.date, start: p.start, end: p.end, venue: 'Exam Block', maxMarks: p.maxMarks, minAttendance: c.minAttendance, requireFeesCleared: c.requireFeesCleared, minInternal: 0, resultsPublished: false, grading: c.grading, evaluatorId: p.evaluatorId, kind: c.kind === 'Supplementary' ? 'Supplementary' : 'Regular' })
        if (c.kind === 'End Semester') linkSheet(d, id, p.courseId, p.evaluatorId)
      }
    })
    if (!c.id) {
      for (const p of chosen) notify([p.evaluatorId], `You are the evaluator for ${db.courses.find((x) => x.id === p.courseId)?.code} in ${c.title}`, c.kind === 'End Semester' ? '/results' : '/exams')
      if (cls) notify(db.users.filter((u) => u.role === 'student' && u.classId === cls.id).map((u) => u.id), `${c.title} timetable published: ${chosen.length} subject(s)`, '/exams')
      setOpenIds(new Set([...openIds, sid]))
    }
    audit(user.id, c.id ? 'EXAM_EDIT' : 'EXAM_CREATE', `${c.title}${cls ? ` · ${classLabel(cls)}` : ''}${c.id ? '' : ` with ${chosen.length} subject(s)`}`)
    setCreating(null)
  }
  const savePaper = () => {
    const p = paperEdit!
    const s = db.examSessions.find((x) => x.id === p.sessionId)!
    if (!p.date || !p.courseId) return alert('Choose the subject and date.')
    const others = sessionPapers(db, s.id).filter((x) => x.id !== p.examId)
    if (!p.examId && others.some((x) => x.courseId === p.courseId)) return alert('This subject is already part of the exam.')
    const overlap = others.find((x) => x.date === p.date && x.start < p.end && p.start < x.end)
    if (overlap && s.kind !== 'Supplementary' && !confirm(`Overlaps ${courseName(db, overlap.courseId)} on the same day. Save anyway?`)) return
    update((d) => {
      if (p.examId) {
        const e = d.exams.find((x) => x.id === p.examId)!
        Object.assign(e, { date: p.date, start: p.start, end: p.end, maxMarks: p.maxMarks, evaluatorId: p.evaluatorId })
        const sh = d.resultSheets.find((x) => x.examId === e.id); if (sh) sh.evaluatorId = p.evaluatorId
      } else {
        const id = uid('ex')
        d.exams.push({ id, sessionId: s.id, courseId: p.courseId, title: s.title, date: p.date, start: p.start, end: p.end, venue: 'Exam Block', maxMarks: p.maxMarks, minAttendance: s.minAttendance, requireFeesCleared: s.requireFeesCleared, minInternal: 0, resultsPublished: false, grading: s.grading, evaluatorId: p.evaluatorId, kind: s.kind === 'Supplementary' ? 'Supplementary' : 'Regular' })
        if (s.kind === 'End Semester') linkSheet(d, id, p.courseId, p.evaluatorId)
      }
    })
    notify([p.evaluatorId], `${p.examId ? 'Updated' : 'Added'}: ${courseName(db, p.courseId)} in ${s.title} on ${fmtDate(p.date)}`, '/exams')
    audit(user.id, p.examId ? 'EXAM_PAPER_EDIT' : 'EXAM_PAPER_ADD', `${s.title}: ${courseName(db, p.courseId)} ${p.date}`)
    setPaperEdit(null)
  }
  const removePaper = (e: Exam) => {
    if (db.results.some((r) => r.examId === e.id)) return alert('Marks have been entered for this subject; it cannot be removed.')
    if (!confirm(`Remove ${courseName(db, e.courseId)} from ${e.title}?`)) return
    update((d) => { d.exams = d.exams.filter((x) => x.id !== e.id); d.resultSheets.forEach((sh) => { if (sh.examId === e.id) sh.examId = undefined }) })
    audit(user.id, 'EXAM_PAPER_REMOVE', `${e.title}: ${courseName(db, e.courseId)}`)
  }
  const removeSession = (sid: string) => {
    if (sessionPapers(db, sid).length) return alert('Remove its subjects first.')
    update((d) => { d.examSessions = d.examSessions.filter((x) => x.id !== sid) })
  }

  /* ---------- seating, marks, publishing ---------- */
  const seatPaper = (d: DB, e: Exam) => {
    const eligible = studentsOf(e).filter((sid) => examEligibility(d, sid, e).eligible)
      .map((sid) => d.users.find((u) => u.id === sid)!).sort((a, b) => (a.rollNo ?? '').localeCompare(b.rollNo ?? ''))
    const faculty = d.users.filter((u) => u.role === 'faculty')
    const seating = eligible.map((s, i) => ({ studentId: s.id, room: ROOMS[Math.floor(i / ROOM_SEATS) % ROOMS.length], seat: `S${String((i % ROOM_SEATS) + 1).padStart(2, '0')}` }))
    const usedRooms = [...new Set(seating.map((s) => s.room))]
    const course = d.courses.find((c) => c.id === e.courseId)!
    const pool = faculty.filter((f) => f.id !== course.facultyId) // never invigilate your own subject
    const invigilators = usedRooms.map((room, i) => ({ room, facultyId: (pool.length ? pool : faculty)[i % (pool.length || faculty.length)].id }))
    const x = d.exams.find((y) => y.id === e.id)!; x.seating = seating; x.invigilators = invigilators
    return { eligible, invigilators }
  }
  const generateSeating = (e: Exam) => {
    let res: ReturnType<typeof seatPaper> | undefined
    update((d) => { res = seatPaper(d, e) })
    notify(res!.eligible.map((s) => s.id), `Seat allotted: ${courseName(db, e.courseId)} on ${fmtDate(e.date)}`, '/exams')
    notify(res!.invigilators.map((v) => v.facultyId), `Invigilation duty: ${courseName(db, e.courseId)} on ${fmtDate(e.date)}`, '/exams')
    audit(user.id, 'EXAM_SEATING', `${e.title}: ${courseName(db, e.courseId)}`)
    setSeatingFor(getDB().exams.find((x) => x.id === e.id)!)
  }
  const seatSession = (sid: string) => {
    const papers = sessionPapers(db, sid).filter((e) => !e.resultsPublished)
    const duty = new Set<string>(); const seated = new Set<string>()
    update((d) => { for (const e of papers) { const r = seatPaper(d, e); r.eligible.forEach((s) => seated.add(s.id)); r.invigilators.forEach((v) => duty.add(v.facultyId)) } })
    const s = db.examSessions.find((x) => x.id === sid)!
    notify([...seated], `Hall ticket ready: ${s.title}`, '/exams')
    notify([...duty], `Invigilation duties assigned for ${s.title}`, '/exams')
    audit(user.id, 'EXAM_SEATING_ALL', `${s.title}: ${papers.length} paper(s)`)
    alert(`Seating and invigilators generated for ${papers.length} subject(s).`)
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
  /** Publish marks for exams without result sheets (mid-semester tests etc.). */
  const publishSession = (sid: string) => {
    const papers = sessionPapers(db, sid).filter((e) => !sheetOf(e) && !e.resultsPublished)
    const withMarks = papers.filter((e) => db.results.some((r) => r.examId === e.id))
    if (!withMarks.length) return alert('No marks have been entered yet.')
    if (withMarks.length < papers.length && !confirm(`${papers.length - withMarks.length} subject(s) have no marks yet. Publish the others?`)) return
    update((d) => { for (const e of withMarks) d.exams.find((x) => x.id === e.id)!.resultsPublished = true })
    const s = db.examSessions.find((x) => x.id === sid)!
    const studs = [...new Set(withMarks.flatMap(studentsOf))]
    notify(studs, `${s.title}: marks published`, '/exams')
    notify(db.users.filter((u) => u.role === 'parent' && u.wardIds?.some((w) => studs.includes(w))).map((u) => u.id), `${s.title} marks published for your ward`, '/home')
    audit(user.id, 'EXAM_PUBLISH', `${s.title}: ${withMarks.length} subject(s)`)
  }
  const reviewReval = (id: string, newMarks: number | null) => {
    const r = db.revaluations.find((x) => x.id === id)!
    update((d) => {
      const x = d.revaluations.find((y) => y.id === id)!
      if (newMarks === null || newMarks === r.oldMarks) x.status = 'NO_CHANGE'
      else { x.status = 'REVISED'; x.newMarks = newMarks; d.results.find((y) => y.examId === r.examId && y.studentId === r.studentId)!.marks = newMarks }
    })
    notify([r.studentId], `Re-evaluation result: ${newMarks === null || newMarks === r.oldMarks ? 'no change' : `revised to ${newMarks}`}`, '/exams')
    audit(user.id, 'EXAM_REVAL', `Re-evaluation ${id} reviewed`)
  }
  const toggle = (id: string) => { const n = new Set(openIds); if (n.has(id)) n.delete(id); else n.add(id); setOpenIds(n) }

  return (
    <>
      <PageHeader search={{ value: term, onChange: setTerm, placeholder: 'Search exam, class, subject or evaluator…' }} title="Examinations"
        subtitle={isAdmin ? 'Create an exam for a class and add its subjects as papers. Each paper has its date, time and evaluator.' : 'Exams with subjects you teach or evaluate. Enter marks here or in Result Sheets.'}
        actions={isAdmin && <button className="btn" onClick={startCreate}><Plus size={14} /> Create exam</button>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'exams', label: 'Exams', count: sessions.length }, { id: 'reval', label: 'Re-evaluation', count: db.revaluations.filter((r) => r.status === 'REQUESTED').length }]} />
      {tab === 'exams' && (
        <div className="stack">
          {sessions.length === 0 && <Card><Empty text="No exams yet." /></Card>}
          {sessions.map(({ s, papers }) => {
            const all = sessionPapers(db, s.id)
            const dates = sessionDates(db, s.id)
            const published = all.length > 0 && all.every((e) => e.resultsPublished)
            const cls = db.classes.find((c) => c.id === s.classId)
            const open = openIds.has(s.id) || !!term || !published
            const hasSheets = all.some(sheetOf)
            return (
              <Card key={s.id} title={<span className="row gap wrap"><button className="btn btn-ghost btn-sm" onClick={() => toggle(s.id)} aria-label={open ? 'Collapse' : 'Expand'}>{open ? '▾' : '▸'}</button>{s.title} <Badge tone={s.kind === 'Supplementary' ? 'warning' : s.kind === 'End Semester' ? 'brand' : 'info'}>{s.kind}</Badge></span>}
                action={<Badge tone={published ? 'success' : 'neutral'}>{published ? 'Results published' : dates ? `${fmtDate(dates.from)}${dates.to !== dates.from ? ` – ${fmtDate(dates.to)}` : ''}` : 'No subjects yet'}</Badge>}>
                <div className="row gap wrap small" style={{ marginBottom: 10 }}>
                  <span><strong>{cls ? classLabel(cls) : 'Backlog students from any class'}</strong></span>
                  <Badge>{all.length} subject(s)</Badge>
                  <Badge tone="info">Eligibility: attendance ≥ {s.minAttendance}%{s.requireFeesCleared ? ', fees cleared' : ''}</Badge>
                  <Badge>{s.grading === 'RELATIVE' ? 'Relative grading' : 'Absolute grading'}</Badge>
                  <div className="grow" />
                  {isAdmin && !published && <button className="btn btn-outline btn-sm" onClick={() => { const papersDraft = (cls ? classCourses(db, cls) : []).filter((c) => !all.some((e) => e.courseId === c.id)); setPaperEdit({ sessionId: s.id, courseId: papersDraft[0]?.id ?? '', date: dates?.to ?? '', start: all[0]?.start ?? '09:30', end: all[0]?.end ?? '12:30', maxMarks: all[0]?.maxMarks ?? 100, evaluatorId: papersDraft[0]?.facultyId ?? facultyList[0]?.id ?? '' }) }}><Plus size={12} /> Add subject</button>}
                  {isAdmin && !published && all.length > 0 && <button className="btn btn-outline btn-sm" onClick={() => seatSession(s.id)}><Armchair size={12} /> Seating for all subjects</button>}
                  {isAdmin && <button className="btn btn-ghost btn-sm" onClick={() => setCreating({ id: s.id, title: s.title, kind: s.kind, classId: s.classId ?? '', minAttendance: s.minAttendance, requireFeesCleared: s.requireFeesCleared, grading: s.grading, firstDate: '', gap: 0, papers: [] })}><Pencil size={12} /> Settings</button>}
                  {hasSheets ? <Link className="btn btn-sm" to="/results">Result sheets</Link> : isAdmin && !published && all.length > 0 && <button className="btn btn-sm" onClick={() => publishSession(s.id)}>Publish marks</button>}
                  {isAdmin && all.length === 0 && <button className="btn btn-ghost btn-sm" onClick={() => removeSession(s.id)}><Trash2 size={12} /> Delete</button>}
                </div>
                {open && papers.length > 0 && (
                  <div className="table-wrap"><table>
                    <thead><tr><th>Subject</th><th>Date &amp; time</th><th>Max</th><th>Evaluator</th><th>Eligible</th><th>Marks</th><th>Seating</th><th /></tr></thead>
                    <tbody>{papers.map((e) => {
                      const studs = studentsOf(e)
                      const eligible = studs.filter((x) => examEligibility(db, x, e).eligible).length
                      const entered = db.results.filter((r) => r.examId === e.id).length
                      const c = db.courses.find((x) => x.id === e.courseId)
                      return (
                        <tr key={e.id}>
                          <td><strong>{c?.code}</strong> {c?.name}{s.kind === 'Supplementary' && <div className="small muted">{classLabel(db.classes.find((x) => x.id === c?.classId))}</div>}</td>
                          <td className="small">{fmtDate(e.date)}<div className="muted">{e.start}–{e.end}</div></td>
                          <td>{e.maxMarks}</td>
                          <td>{isAdmin && !e.resultsPublished ? (
                            <select className="select" style={{ width: 'auto', padding: '4px 8px' }} aria-label={`Evaluator for ${c?.code}`} value={e.evaluatorId ?? ''} onChange={(ev) => { const v = ev.target.value; update((d) => { d.exams.find((x) => x.id === e.id)!.evaluatorId = v; const sh = d.resultSheets.find((x) => x.examId === e.id); if (sh) sh.evaluatorId = v }); notify([v], `You are the evaluator for ${c?.code} in ${e.title}`, '/results') }}>
                              <option value="">Not allotted</option>{facultyList.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                            </select>
                          ) : e.evaluatorId ? userName(db, e.evaluatorId) : '—'}</td>
                          <td><button className="btn btn-ghost btn-sm" onClick={() => setEligFor(e)}><Badge tone={eligible === studs.length ? 'success' : 'warning'}>{eligible}/{studs.length}</Badge></button></td>
                          <td className="small">{entered}/{studs.length}{e.resultsPublished && <> · <Badge tone="success">Published</Badge></>}</td>
                          <td>{e.seating ? <button className="btn btn-ghost btn-sm" onClick={() => setSeatingFor(e)}>{e.invigilators?.length} room(s)</button> : isAdmin && !e.resultsPublished ? <button className="btn btn-ghost btn-sm" onClick={() => generateSeating(e)}>Generate</button> : <span className="muted small">—</span>}</td>
                          <td><div className="row gap">
                            {!e.resultsPublished && canMark(e) && <button className="btn btn-outline btn-sm" onClick={() => { setMarksFor(e); setMarks(Object.fromEntries(db.results.filter((r) => r.examId === e.id).map((r) => [r.studentId, String(r.marks)]))) }}><FileText size={12} /> Marks</button>}
                            {isAdmin && !e.resultsPublished && <button className="icon-btn" aria-label={`Edit ${c?.code}`} onClick={() => setPaperEdit({ sessionId: s.id, examId: e.id, courseId: e.courseId, date: e.date, start: e.start, end: e.end, maxMarks: e.maxMarks, evaluatorId: e.evaluatorId ?? '' })}><Pencil size={14} /></button>}
                            {isAdmin && !e.resultsPublished && <button className="icon-btn" aria-label={`Remove ${c?.code}`} onClick={() => removePaper(e)}><Trash2 size={14} /></button>}
                          </div></td>
                        </tr>
                      )
                    })}</tbody>
                  </table></div>
                )}
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

      {creating && (() => { const c = creating; const isNew = !c.id; return (
        <Modal wide={isNew} title={isNew ? 'Create exam' : `Exam settings: ${c.title}`} onClose={() => setCreating(null)} footer={<><button className="btn btn-ghost" onClick={() => setCreating(null)}>Cancel</button><button className="btn" onClick={saveExam}>{isNew ? `Create exam with ${c.papers.filter((p) => p.include).length} subject(s)` : 'Save settings'}</button></>}>
          <div className="grid grid-2">
            {isNew && <Field label="Type"><select className="select" value={c.kind} onChange={(e) => { const k = e.target.value as ExamKind; setCreating({ ...c, kind: k, title: defaultTitle(k), papers: k === 'Supplementary' ? [] : draftFor(c.classId, k) }) }}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select></Field>}
            <Field label="Exam name"><input className="input" value={c.title} onChange={(e) => setCreating({ ...c, title: e.target.value })} placeholder="End Semester Examination – Nov 2026" /></Field>
            {isNew && c.kind !== 'Supplementary' && <Field label="Class"><select className="select" value={c.classId} onChange={(e) => setCreating({ ...c, classId: e.target.value, papers: draftFor(e.target.value, c.kind) })}>{db.classes.map((x) => <option key={x.id} value={x.id}>{classLabel(x)}</option>)}</select></Field>}
            <Field label="Minimum attendance %"><input className="input" type="number" min={0} max={100} value={c.minAttendance} onChange={(e) => setCreating({ ...c, minAttendance: Number(e.target.value) })} /></Field>
            <Field label="Grading"><select className="select" value={c.grading} onChange={(e) => setCreating({ ...c, grading: e.target.value as Exam['grading'] })}><option value="ABSOLUTE">Absolute</option><option value="RELATIVE">Relative (absolute for &lt; 10 students)</option></select></Field>
          </div>
          <label className="row gap"><input type="checkbox" checked={c.requireFeesCleared} onChange={(e) => setCreating({ ...c, requireFeesCleared: e.target.checked })} /> Students must have cleared fees</label>
          {!isNew && <div className="small muted">Rules apply to every subject in this exam. Add, edit or remove subjects from the exam card.</div>}
          {isNew && c.kind === 'Supplementary' && <div className="alert alert-info small">Supplementary subjects are added when you register backlog students (Result Sheets → Backlog registration), or with "Add subject" after creating.</div>}
          {isNew && c.kind !== 'Supplementary' && (
            <>
              <div className="row gap wrap" style={{ alignItems: 'flex-end' }}>
                <h3 className="grow">Subjects in this exam</h3>
                <Field label="First paper"><input className="input" type="date" value={c.firstDate} onChange={(e) => setCreating({ ...c, firstDate: e.target.value })} /></Field>
                <Field label="Days between"><input className="input" style={{ width: 90 }} type="number" min={0} value={c.gap} onChange={(e) => setCreating({ ...c, gap: Number(e.target.value) })} /></Field>
                <button className="btn btn-outline" onClick={autoDates}>Fill dates</button>
              </div>
              {c.papers.length === 0 ? <Empty text="This class has no courses this semester." /> : (
                <div className="table-wrap"><table>
                  <thead><tr><th>Include</th><th>Subject</th><th>Date</th><th>Start</th><th>End</th><th>Max marks</th><th>Evaluator</th></tr></thead>
                  <tbody>{c.papers.map((p, i) => { const co = db.courses.find((x) => x.id === p.courseId)!; const set = (patch: Partial<PaperDraft>) => setCreating({ ...c, papers: c.papers.map((x, j) => (j === i ? { ...x, ...patch } : x)) }); return (
                    <tr key={p.courseId} style={{ opacity: p.include ? 1 : 0.5 }}>
                      <td><input type="checkbox" aria-label={`Include ${co.code}`} checked={p.include} onChange={(e) => set({ include: e.target.checked })} /></td>
                      <td><strong>{co.code}</strong> {co.name}</td>
                      <td><input className="input" style={{ width: 150 }} type="date" aria-label={`${co.code} date`} value={p.date} onChange={(e) => set({ date: e.target.value })} /></td>
                      <td><input className="input" style={{ width: 110 }} type="time" value={p.start} onChange={(e) => set({ start: e.target.value })} /></td>
                      <td><input className="input" style={{ width: 110 }} type="time" value={p.end} onChange={(e) => set({ end: e.target.value })} /></td>
                      <td><input className="input" style={{ width: 80 }} type="number" min={1} value={p.maxMarks} onChange={(e) => set({ maxMarks: Number(e.target.value) })} /></td>
                      <td><select className="select" aria-label={`Evaluator for ${co.code}`} value={p.evaluatorId} onChange={(e) => set({ evaluatorId: e.target.value })}>{facultyList.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></td>
                    </tr>
                  ) })}</tbody>
                </table></div>
              )}
              {c.kind === 'End Semester' && <div className="small muted">Each subject gets a result sheet linked to its paper; the evaluator enters the external marks there.</div>}
            </>
          )}
        </Modal>
      ) })()}
      {paperEdit && (() => { const s = db.examSessions.find((x) => x.id === paperEdit.sessionId)!; const cls = db.classes.find((x) => x.id === s.classId); const taken = sessionPapers(db, s.id).map((e) => e.courseId); const options = (cls ? classCourses(db, cls) : db.courses).filter((c) => paperEdit.examId ? c.id === paperEdit.courseId : !taken.includes(c.id)); return (
        <Modal title={paperEdit.examId ? `Edit ${courseName(db, paperEdit.courseId)}` : `Add subject to ${s.title}`} onClose={() => setPaperEdit(null)} footer={<><button className="btn btn-ghost" onClick={() => setPaperEdit(null)}>Cancel</button><button className="btn" onClick={savePaper}>Save</button></>}>
          <Field label="Subject"><select className="select" disabled={!!paperEdit.examId} value={paperEdit.courseId} onChange={(e) => setPaperEdit({ ...paperEdit, courseId: e.target.value, evaluatorId: db.courses.find((c) => c.id === e.target.value)?.facultyId ?? paperEdit.evaluatorId })}>{options.length === 0 && <option value="">All subjects already added</option>}{options.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</select></Field>
          <div className="grid grid-2">
            <Field label="Date"><input className="input" type="date" value={paperEdit.date} onChange={(e) => setPaperEdit({ ...paperEdit, date: e.target.value })} /></Field>
            <Field label="Max marks"><input className="input" type="number" min={1} value={paperEdit.maxMarks} onChange={(e) => setPaperEdit({ ...paperEdit, maxMarks: Number(e.target.value) })} /></Field>
            <Field label="Start"><input className="input" type="time" value={paperEdit.start} onChange={(e) => setPaperEdit({ ...paperEdit, start: e.target.value })} /></Field>
            <Field label="End"><input className="input" type="time" value={paperEdit.end} onChange={(e) => setPaperEdit({ ...paperEdit, end: e.target.value })} /></Field>
          </div>
          <Field label="Evaluator"><select className="select" value={paperEdit.evaluatorId} onChange={(e) => setPaperEdit({ ...paperEdit, evaluatorId: e.target.value })}>{facultyList.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></Field>
        </Modal>
      ) })()}
      {eligFor && (
        <Modal title={`Eligibility: ${courseName(db, eligFor.courseId)}`} onClose={() => setEligFor(null)}>
          <table><thead><tr><th>Student</th><th>Attendance</th><th>Status</th></tr></thead><tbody>
            {studentsOf(eligFor).map((sid) => { const x = examEligibility(db, sid, eligFor); return <tr key={sid}><td>{userName(db, sid)}</td><td>{x.attendance}%</td><td>{x.eligible ? <Badge tone="success">Eligible</Badge> : <span className="small" style={{ color: 'var(--danger)' }}><AlertTriangle size={12} /> {x.reasons.join('; ')}</span>}</td></tr> })}
          </tbody></table>
        </Modal>
      )}
      {seatingFor && (
        <Modal title={`Seating: ${courseName(db, seatingFor.courseId)} · ${fmtDate(seatingFor.date)}`} onClose={() => setSeatingFor(null)} footer={<button className="btn" onClick={() => window.print()}><Printer size={14} /> Print</button>}>
          {(seatingFor.invigilators ?? []).map((v) => (
            <div key={v.room} className="stack" style={{ gap: 6 }}>
              <div className="row between"><h3>{v.room}</h3><span className="small muted">Invigilator: {userName(db, v.facultyId)}</span></div>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                {seatingFor.seating!.filter((s) => s.room === v.room).map((s) => <div key={s.studentId} className="card small" style={{ padding: 8 }}><strong>{s.seat}</strong><div className="ellipsis">{userName(db, s.studentId)}</div><div className="muted">{db.users.find((u) => u.id === s.studentId)?.rollNo}</div></div>)}
              </div>
            </div>
          ))}
          {!seatingFor.invigilators?.length && <Empty text="No eligible students to seat." />}
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
