import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, ClipboardCheck, Clock, Download, Lock, Pencil, Plus, Send, Trash2, Unlock, Users } from 'lucide-react'
import { audit, getDB, notify, uid, update, useCurrentUser, useDB } from '../data/store'
import { Badge, Card, Empty, Field, Modal, PageHeader, Stat, Tabs } from '../components/ui'
import { FilterBar, opts, useFilters } from '../components/Filters'
import { STUDENT_KEYS, studentDefs, studentOk } from '../facets'
import { can } from '../access'
import { classColor, classLabel, resyncRosters } from '../classes'
import { fmtDate, matches, userName } from '../lib'
import { dropCourse, eligibleCourses, isPan, KIND_LABEL, kindOf, registerCourse, registrationStatus, seatsLeft, semesterCourses, sessionState, timeLimitMin } from '../registration'
import type { Course, CourseKind, DB, User } from '../data/types'
import { studentResults } from '../results'

export default function Registration() {
  const user = useCurrentUser()!
  return user.role === 'student' ? <StudentRegistration /> : <RegistrationOffice />
}

const kindTone = (k: CourseKind) => (k === 'FOUNDATION' ? 'info' : k === 'OPEN_ELECTIVE' ? 'accent' : 'brand')
export const KindBadge = ({ c }: { c: Course }) => <Badge tone={kindTone(kindOf(c))}>{KIND_LABEL[kindOf(c)]}</Badge>

/** Small coloured class chips for the classes a course is offered to. */
function OfferedTo({ db, c }: { db: DB; c: Course }) {
  const ids = isPan(c) ? c.classIds ?? [] : c.classId ? [c.classId] : []
  return (
    <span className="row gap wrap" style={{ gap: 4 }}>
      {ids.map((id) => { const cl = db.classes.find((x) => x.id === id); const col = classColor(cl); return cl ? <span key={id} className="mini-chip" style={{ color: col.fg, background: col.bg, borderColor: col.fg }}>{cl.program} {cl.batch}{isPan(c) ? '' : ` · Sem ${c.semester}`}</span> : null })}
    </span>
  )
}

function Seats({ c }: { c: Course }) {
  if (!c.slots) return <span className="small">{c.studentIds.length} students</span>
  const pct = Math.min(100, (c.studentIds.length / c.slots) * 100)
  return (
    <div style={{ minWidth: 110 }}>
      <div className="row between small"><span>{c.studentIds.length}/{c.slots}</span>{c.studentIds.length >= c.slots ? <Badge tone="danger">Full</Badge> : <span className="muted">{c.slots - c.studentIds.length} left</span>}</div>
      <span className="seat-bar"><span style={{ width: `${pct}%`, background: pct >= 100 ? 'var(--danger)' : pct >= 80 ? 'var(--warning)' : 'var(--info, #2563a8)' }} /></span>
    </div>
  )
}

/* ============================ Registrar of Evaluation ============================ */

function RegistrationOffice() {
  const db = useDB()
  const me = useCurrentUser()!
  const manage = can(me, 'manageCourses')
  const settings = db.registration
  const [tab, setTab] = useState<'catalogue' | 'students' | 'settings'>('catalogue')
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Partial<Course> | null>(null)
  const [roster, setRoster] = useState<string | null>(null)
  const [managing, setManaging] = useState<string | null>(null)

  // Catalogue: this term, the registration term, next-semester class courses; earlier terms on request.
  const cf = useFilters(['when', 'kind', 'cls', 'faculty'] as const)
  const whenOf = (c: Course) => {
    if (isPan(c)) return c.term === settings.registrationTerm ? 'registration' : c.term === settings.currentTerm ? 'current' : 'past'
    const cl = db.classes.find((x) => x.id === c.classId)
    return !cl ? 'past' : c.semester === cl.semester ? 'current' : c.semester > cl.semester ? 'registration' : 'past'
  }
  const WHEN = { registration: `Registration: ${settings.registrationTerm}`, current: `Running now: ${settings.currentTerm}`, past: 'Earlier terms' }
  const catDefs = [
    { key: 'when' as const, label: 'Terms', options: (['registration', 'current', 'past'] as const).filter((w, i, a) => a.indexOf(w) === i && (w !== 'registration' || settings.registrationTerm !== settings.currentTerm)).map((w) => ({ value: w, label: WHEN[w] })) },
    { key: 'kind' as const, label: 'Course types', options: (['CORE', 'FOUNDATION', 'OPEN_ELECTIVE'] as const).map((k) => ({ value: k, label: KIND_LABEL[k] })) },
    { key: 'cls' as const, label: 'Classes', options: db.classes.map((c) => ({ value: c.id, label: classLabel(c) })) },
    { key: 'faculty' as const, label: 'Faculty', options: opts(db.courses.map((c) => c.facultyId), (id) => userName(db, id)) },
  ]
  const catalogue = db.courses
    .filter((c) => (cf.values.when ? whenOf(c) === cf.values.when : whenOf(c) !== 'past'))
    .filter((c) => cf.ok('kind', kindOf(c)) && cf.ok('faculty', c.facultyId) && (!cf.values.cls || c.classId === cf.values.cls || (c.classIds ?? []).includes(cf.values.cls)))
    .filter((c) => matches(q, c.code, c.name, userName(db, c.facultyId), KIND_LABEL[kindOf(c)]))
    .sort((a, b) => ['registration', 'current', 'past'].indexOf(whenOf(a)) - ['registration', 'current', 'past'].indexOf(whenOf(b)) || kindOf(a).localeCompare(kindOf(b)) || a.code.localeCompare(b.code))

  // Students: where each stands for the registration term.
  const students = db.users.filter((u) => u.role === 'student' && u.status === 'ACTIVE' && u.classId)
  const sf = useFilters([...STUDENT_KEYS, 'status'] as const)
  const sDefs = [...studentDefs(db, students), { key: 'status' as const, label: 'Statuses', options: [{ value: 'complete', label: 'Registration complete' }, { value: 'pending', label: 'Pending' }] }]
  const statusRows = students.map((s) => ({ s, st: registrationStatus(db, s) }))
  const shownStudents = statusRows.filter(({ s, st }) => studentOk(sf, s) && sf.ok('status', st.complete ? 'complete' : 'pending') && matches(q, s.name, s.rollNo))
  const pending = statusRows.filter((x) => !x.st.complete)
  const open = panTermCourses(db, settings.registrationTerm)
  const seats = open.reduce((t, c) => t + (c.slots ?? 0), 0)
  const filled = open.reduce((t, c) => t + c.studentIds.length, 0)

  const deleteCourse = (c: Course) => {
    const exams = db.exams.filter((e) => e.courseId === c.id)
    const published = db.resultSheets.some((sh) => sh.courseId === c.id && sh.status === 'PUBLISHED')
    if (published) return alert(`${c.code} has published results, so it is part of students' academic records and cannot be deleted. Edit it instead.`)
    if (!confirm(`Delete ${c.code} ${c.name}? ${c.studentIds.length} registration(s)${exams.length ? `, ${exams.length} exam paper(s)` : ''} and its unpublished result sheet, attendance, assignments and timetable slots are removed too.`)) return
    update((d) => {
      const examIds = new Set(d.exams.filter((e) => e.courseId === c.id).map((e) => e.id))
      d.courses = d.courses.filter((x) => x.id !== c.id)
      d.registrations = d.registrations.filter((r) => r.courseId !== c.id)
      d.resultSheets = d.resultSheets.filter((sh) => sh.courseId !== c.id)
      d.exams = d.exams.filter((e) => !examIds.has(e.id)); d.results = d.results.filter((r) => !examIds.has(r.examId))
      d.attendance = d.attendance.filter((a) => a.courseId !== c.id); d.timetable = d.timetable.filter((t) => t.courseId !== c.id)
      const asg = new Set(d.assignments.filter((a) => a.courseId === c.id).map((a) => a.id)); d.assignments = d.assignments.filter((a) => !asg.has(a.id)); d.submissions = d.submissions.filter((x) => !asg.has(x.assignmentId))
      const qz = new Set(d.quizzes.filter((q) => q.courseId === c.id).map((q) => q.id)); d.quizzes = d.quizzes.filter((q) => !qz.has(q.id)); d.attempts = d.attempts.filter((x) => !qz.has(x.quizId))
      for (const u of d.users) if (u.backlogCourses?.includes(c.id)) u.backlogCourses = u.backlogCourses.filter((x) => x !== c.id)
    })
    notify([c.facultyId, ...c.studentIds], `${c.code} ${c.name} was withdrawn by the Registrar of Evaluation`, '/registration')
    audit(me.id, 'COURSE_DELETE', `${c.code} ${c.name}`)
  }
  const toggleWindow = () => {
    update((d) => { d.registration.open = !d.registration.open })
    if (!settings.open) notify(students.map((s) => s.id), `Course registration for ${settings.registrationTerm} is open${settings.closesAt ? ` until ${fmtDate(settings.closesAt)}` : ''}. Choose your foundation course and open elective.`, '/registration')
    audit(me.id, settings.open ? 'REGISTRATION_CLOSE' : 'REGISTRATION_OPEN', settings.registrationTerm)
  }
  const remind = () => {
    notify(pending.map((x) => x.s.id), `Reminder: complete your course registration for ${settings.registrationTerm}${settings.closesAt ? ` before ${fmtDate(settings.closesAt)}` : ''}.`, '/registration')
    audit(me.id, 'REGISTRATION_REMIND', `${pending.length} student(s)`)
    alert(`Reminder sent to ${pending.length} student(s).`)
  }
  const exportCsv = () => {
    const lines = [['Roll no', 'Name', 'Class', 'Semester', 'Foundation', 'Open elective', 'Credits', 'Status'], ...shownStudents.map(({ s, st }) => [s.rollNo ?? '', s.name, classLabel(db.classes.find((c) => c.id === s.classId)), String(st.nextSem), st.foundation.map((c) => c.code).join(' '), st.open.map((c) => c.code).join(' '), String(st.credits), st.complete ? 'Complete' : 'Pending'])]
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([lines.map((l) => l.map((v) => `"${v}"`).join(',')).join('\n')], { type: 'text/csv' })); a.download = `registration-${settings.registrationTerm}.csv`; a.click()
  }

  return (
    <>
      <PageHeader title="Course Registration" subtitle="Create courses, open baskets to classes, and monitor every student's registration"
        search={{ value: q, onChange: setQ, placeholder: 'Search course, faculty or student…' }}
        actions={manage && <button className="btn" onClick={() => setEditing({ kind: 'CORE', credits: 4, slots: 60 })}><Plus size={14} /> New course</button>} />
      <div className={`alert ${settings.open ? 'alert-success' : 'alert-warning'} row between wrap`}>
        <span>Registration for <strong>{settings.registrationTerm}</strong> is <strong>{settings.open ? 'open' : 'closed'}</strong>{settings.closesAt ? ` · closes ${fmtDate(settings.closesAt)}` : ''}. Each student takes {settings.minFoundation} foundation course and {settings.minOpenElective} open elective{settings.minCredits ? `, at least ${settings.minCredits} credits` : ''}{settings.maxCredits ? ` (max ${settings.maxCredits})` : ''}. Running now: {settings.currentTerm}.</span>
        {manage && <button className="btn btn-sm btn-outline" onClick={toggleWindow}>{settings.open ? <><Lock size={12} /> Close registration</> : <><Unlock size={12} /> Open registration</>}</button>}
      </div>
      <div className="grid grid-4">
        <Stat label="Registration complete" value={`${students.length - pending.length}/${students.length}`} tone="success" icon={<ClipboardCheck size={22} />} />
        <Stat label="Pending students" value={pending.length} tone="warning" icon={<Users size={22} />} />
        <Stat label="Basket seats filled" value={seats ? `${filled}/${seats}` : '—'} tone="info" hint={`${open.length} foundation / open-elective courses`} />
        <Stat label="Full courses" value={open.filter((c) => seatsLeft(c) <= 0).length} tone="danger" />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'catalogue', label: 'Course catalogue', count: catalogue.length }, { id: 'students', label: 'Student registrations', count: pending.length }, { id: 'settings', label: 'Registration settings' }]} />

      {tab === 'catalogue' && (
        <>
          <FilterBar defs={catDefs} f={cf} count={catalogue.length} noun="course" />
          <Card>
            {catalogue.length === 0 ? <Empty text="No courses match." /> : (
              <div className="table-wrap"><table>
                <thead><tr><th>Course</th><th>Type</th><th>Offered to</th><th>When</th><th>Faculty</th><th>Credits</th><th>Seats</th><th /></tr></thead>
                <tbody>{catalogue.map((c) => (
                  <tr key={c.id}>
                    <td><strong>{c.code}</strong> {c.name}</td>
                    <td><KindBadge c={c} /></td>
                    <td><OfferedTo db={db} c={c} /></td>
                    <td className="small">{isPan(c) ? c.term : `Semester ${c.semester}`}<div className="muted">{WHEN[whenOf(c) as keyof typeof WHEN].split(':')[0]}</div></td>
                    <td className="small">{userName(db, c.facultyId)}</td>
                    <td>{c.credits}</td>
                    <td><Seats c={c} /></td>
                    <td className="row gap">
                      <button className="btn btn-outline btn-sm" onClick={() => setRoster(c.id)}><Users size={12} /> Students</button>
                      {manage && <button className="icon-btn" aria-label={`Edit ${c.code}`} onClick={() => setEditing(c)}><Pencil size={14} /></button>}
                      {manage && <button className="icon-btn" aria-label={`Delete ${c.code}`} onClick={() => deleteCourse(c)}><Trash2 size={14} /></button>}
                    </td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </Card>
        </>
      )}

      {tab === 'students' && (
        <>
          <div className="row between wrap gap">
            <FilterBar defs={sDefs} f={sf} count={shownStudents.length} noun="student" />
            <div className="row gap">
              {manage && pending.length > 0 && <button className="btn btn-outline btn-sm" onClick={remind}><Send size={12} /> Remind {pending.length} pending</button>}
              <button className="btn btn-ghost btn-sm" onClick={exportCsv}><Download size={12} /> CSV</button>
            </div>
          </div>
          <Card>
            <div className="table-wrap"><table>
              <thead><tr><th>Student</th><th>Class</th><th>Class courses (Sem)</th><th>Foundation</th><th>Open elective</th><th>Credits</th><th>Timer</th><th>Status</th><th /></tr></thead>
              <tbody>{shownStudents.map(({ s, st }) => (
                <tr key={s.id}>
                  <td><Link to={`/people/${s.id}`}>{s.name}</Link><div className="small muted">{s.rollNo}</div></td>
                  <td className="small">{classLabel(db.classes.find((c) => c.id === s.classId))}</td>
                  <td className="small">{st.core.length ? `${st.core.length} · Sem ${st.nextSem}` : <span className="muted">Sem {st.nextSem}: not set up</span>}</td>
                  <td>{st.foundation.length ? st.foundation.map((c) => <Badge key={c.id} tone="info">{c.code}</Badge>) : <span className="muted small">—</span>}</td>
                  <td>{st.open.length ? st.open.map((c) => <Badge key={c.id} tone="accent">{c.code}</Badge>) : <span className="muted small">—</span>}</td>
                  <td>{st.credits}</td>
                  <td className="small">{(() => { const x = sessionState(db, s.id); return x.state === 'none' ? <span className="muted">Not started</span> : x.state === 'active' ? <Badge tone="info">{Math.ceil(x.left / 60000)} min left</Badge> : x.state === 'submitted' ? <Badge tone="success">Submitted</Badge> : <Badge tone="warning">Time up</Badge> })()}</td>
                  <td><Badge tone={st.complete ? 'success' : 'warning'}>{st.complete ? 'Complete' : 'Pending'}</Badge></td>
                  <td><button className="btn btn-outline btn-sm" onClick={() => setManaging(s.id)}>{manage ? 'Manage' : 'View'}</button></td>
                </tr>
              ))}</tbody>
            </table></div>
          </Card>
        </>
      )}

      {tab === 'settings' && <SettingsPanel manage={manage} />}

      {editing && <CourseEditor draft={editing} onClose={() => setEditing(null)} />}
      {roster && <RosterModal courseId={roster} manage={manage} onClose={() => setRoster(null)} />}
      {managing && <StudentRegistrationModal studentId={managing} manage={manage} onClose={() => setManaging(null)} />}
    </>
  )
}

const panTermCourses = (db: DB, term: string) => db.courses.filter((c) => isPan(c) && c.term === term)

function SettingsPanel({ manage }: { manage: boolean }) {
  const db = useDB()
  const me = useCurrentUser()!
  const [s, setS] = useState({ ...db.registration, closes: db.registration.closesAt ? new Date(db.registration.closesAt).toISOString().slice(0, 10) : '' })
  const save = () => {
    if (!s.registrationTerm.trim() || !s.currentTerm.trim()) return alert('Name both terms.')
    update((d) => { d.registration = { currentTerm: s.currentTerm.trim(), registrationTerm: s.registrationTerm.trim(), open: s.open, closesAt: s.closes ? new Date(`${s.closes}T23:59`).getTime() : undefined, minFoundation: s.minFoundation, minOpenElective: s.minOpenElective, minCredits: s.minCredits || undefined, maxCredits: s.maxCredits, basketLimits: s.basketLimits, timeLimitMin: s.timeLimitMin || 15, sessions: d.registration.sessions } })
    audit(me.id, 'REGISTRATION_SETTINGS', `${s.registrationTerm}: ${s.minFoundation} foundation, ${s.minOpenElective} open elective, ${s.timeLimitMin ?? 15} min`)
    alert('Registration settings saved.')
  }
  const startTerm = () => {
    if (db.registration.registrationTerm === db.registration.currentTerm) return alert('The registration term is already running. Set the next term to register for first.')
    if (!confirm(`Start ${db.registration.registrationTerm}? Its foundation and open-elective courses start running (attendance, assignments, exams), ${db.registration.currentTerm}'s become history, and registration closes. Promote classes from Classes & Promotion as usual.`)) return
    update((d) => { d.registration.currentTerm = d.registration.registrationTerm; d.registration.open = false; resyncRosters(d) })
    audit(me.id, 'TERM_START', getDB().registration.currentTerm)
    setS({ ...getDB().registration, closes: '' })
  }
  return (
    <div className="grid grid-2">
      <Card title="Registration window">
        <div className="grid grid-2">
          <Field label="Term running now" hint="Its foundation / open-elective courses are live"><input className="input" disabled={!manage} value={s.currentTerm} onChange={(e) => setS({ ...s, currentTerm: e.target.value })} /></Field>
          <Field label="Registering for" hint="Usually the next term; same as above for a late window"><input className="input" disabled={!manage} value={s.registrationTerm} onChange={(e) => setS({ ...s, registrationTerm: e.target.value })} /></Field>
          <Field label="Time to register (minutes)" hint="Starts when the student clicks Register the first time"><input className="input" type="number" min={1} max={120} disabled={!manage} value={s.timeLimitMin ?? 15} onChange={(e) => setS({ ...s, timeLimitMin: Number(e.target.value) })} /></Field>
          <Field label="Foundation courses per student (default)"><input className="input" type="number" min={0} max={3} disabled={!manage} value={s.minFoundation} onChange={(e) => setS({ ...s, minFoundation: Number(e.target.value) })} /></Field>
          <Field label="Open electives per student (default)"><input className="input" type="number" min={0} max={3} disabled={!manage} value={s.minOpenElective} onChange={(e) => setS({ ...s, minOpenElective: Number(e.target.value) })} /></Field>
          <Field label="Minimum credits per semester" hint="Class courses + baskets; below this the student stays pending"><input className="input" type="number" min={0} max={60} disabled={!manage} value={s.minCredits ?? 0} onChange={(e) => setS({ ...s, minCredits: Number(e.target.value) })} /></Field>
          <Field label="Maximum credits per semester" hint="Students cannot exceed it; the office can"><input className="input" type="number" min={0} max={60} disabled={!manage} value={s.maxCredits ?? ''} placeholder="No limit" onChange={(e) => setS({ ...s, maxCredits: e.target.value ? Number(e.target.value) : undefined })} /></Field>
          <Field label="Last date to register"><input className="input" type="date" disabled={!manage} value={s.closes} onChange={(e) => setS({ ...s, closes: e.target.value })} /></Field>
          <Field label="Window"><label className="row gap"><input type="checkbox" disabled={!manage} checked={s.open} onChange={(e) => setS({ ...s, open: e.target.checked })} /> Open for students</label></Field>
        </div>
        <Field label="Courses to choose in each basket, by class" hint="Empty = the default above. A student must choose exactly this many and cannot choose more.">
          <div className="table-wrap"><table>
            <thead><tr><th>Class</th><th>Foundation</th><th>Open elective</th></tr></thead>
            <tbody>{db.classes.map((c) => { const lim = s.basketLimits?.[c.id]; const setLim = (k: 'FOUNDATION' | 'OPEN_ELECTIVE', v: string) => { const cur = { FOUNDATION: lim?.FOUNDATION ?? s.minFoundation, OPEN_ELECTIVE: lim?.OPEN_ELECTIVE ?? s.minOpenElective, [k]: v === '' ? (k === 'FOUNDATION' ? s.minFoundation : s.minOpenElective) : Number(v) }; setS({ ...s, basketLimits: { ...s.basketLimits, [c.id]: cur } }) }; return (
              <tr key={c.id}>
                <td className="small">{classLabel(c)}</td>
                {(['FOUNDATION', 'OPEN_ELECTIVE'] as const).map((k) => <td key={k}><input className="input" type="number" min={0} max={5} style={{ width: 80 }} aria-label={`${classLabel(c)} ${KIND_LABEL[k]} limit`} disabled={!manage} value={lim?.[k] ?? ''} placeholder={String(k === 'FOUNDATION' ? s.minFoundation : s.minOpenElective)} onChange={(e) => setLim(k, e.target.value)} /></td>)}
              </tr>
            ) })}</tbody>
          </table></div>
        </Field>
        {manage && <button className="btn" onClick={save}>Save settings</button>}
      </Card>
      <Card title="How registration works">
        <ol className="small" style={{ paddingLeft: 18, lineHeight: 1.7 }}>
          <li><strong>Class courses</strong> belong to one class and semester; every student of the class is registered automatically (and when the class is promoted).</li>
          <li><strong>Foundation</strong> and <strong>open-elective</strong> courses are pan-university: pick the classes that may opt, the faculty and the number of seats.</li>
          <li>While the window is open, students choose from each basket; a course closes when its seats are full. You can register or drop any student, even over capacity.</li>
          <li>Every registration records the student's semester, so attendance, exams, result sheets, SGPA/CGPA and the academic record all follow it.</li>
          <li>When the new term begins, <strong>start the term</strong> here: its baskets go live and the previous term becomes history.</li>
        </ol>
        {manage && <button className="btn btn-outline" onClick={startTerm} disabled={db.registration.registrationTerm === db.registration.currentTerm}>Start {db.registration.registrationTerm}</button>}
      </Card>
    </div>
  )
}

/** Create or edit a course: class course (one class) or pan-university basket course (many classes). */
function CourseEditor({ draft, onClose }: { draft: Partial<Course>; onClose: () => void }) {
  const db = useDB()
  const me = useCurrentUser()!
  const settings = db.registration
  const faculty = db.users.filter((u) => u.role === 'faculty' && u.status === 'ACTIVE')
  const [c, setC] = useState<Partial<Course>>({ facultyId: faculty[0]?.id, classId: db.classes[0]?.id, semester: db.classes[0]?.semester, term: settings.registrationTerm, classIds: [], description: '', ...draft, kind: draft.kind ?? 'CORE' })
  // Basket courses are usually 2–3 credits; class courses 4.
  const set = (p: Partial<Course>) => setC((x) => ({ ...x, ...p, ...(p.kind && !x.id ? { credits: p.kind === 'CORE' ? 4 : p.kind === 'FOUNDATION' ? 2 : 3, slots: p.kind === 'CORE' ? 60 : 30 } : {}) }))
  const isNew = !c.id
  const pan = c.kind !== 'CORE'
  const cls = db.classes.find((x) => x.id === c.classId)
  const taken = c.studentIds?.length ?? 0
  const save = () => {
    if (!c.code?.trim() || !c.name?.trim()) return alert('Enter the course code and name.')
    if (!c.facultyId) return alert('Assign a faculty member.')
    if (pan && !(c.classIds ?? []).length) return alert('Select at least one class whose students may opt for this course.')
    if (c.slots !== undefined && c.slots < taken) return alert(`${taken} students are already registered; seats cannot be fewer.`)
    const dup = db.courses.find((x) => x.id !== c.id && x.code.toUpperCase() === c.code!.trim().toUpperCase() && (pan ? x.term === c.term : x.classId === c.classId && x.semester === c.semester))
    if (dup) return alert(`${dup.code} already exists ${pan ? `in ${c.term}` : 'for this class and semester'}.`)
    const id = c.id ?? uid('crs')
    update((d) => {
      const base = { code: c.code!.trim().toUpperCase(), name: c.name!.trim(), credits: c.credits ?? 3, facultyId: c.facultyId!, slots: c.slots || undefined, description: c.description ?? '', kind: c.kind as CourseKind }
      const fields = pan ? { ...base, classIds: c.classIds, term: c.term, semester: 0, classId: undefined } : { ...base, classId: c.classId, semester: c.semester ?? cls?.semester ?? 1, classIds: undefined, term: undefined }
      const ex = d.courses.find((x) => x.id === id)
      if (ex) Object.assign(ex, fields)
      else d.courses.push({ id, studentIds: [], ...fields } as Course)
      // Registered students whose class is no longer offered the course stay registered (the office can drop them).
      resyncRosters(d)
    })
    notify([c.facultyId!], `${isNew ? 'You are assigned to' : 'Updated:'} ${c.code} ${c.name}`, '/courses')
    if (isNew && pan && settings.open && c.term === settings.registrationTerm) notify(db.users.filter((u) => u.role === 'student' && (c.classIds ?? []).includes(u.classId ?? '')).map((u) => u.id), `New ${KIND_LABEL[c.kind as CourseKind].toLowerCase()} course open for registration: ${c.code} ${c.name}`, '/registration')
    audit(me.id, isNew ? 'COURSE_CREATE' : 'COURSE_EDIT', `${c.code} ${c.name} (${KIND_LABEL[c.kind as CourseKind]})`)
    onClose()
  }
  const allIds = db.classes.map((x) => x.id)
  return (
    <Modal wide title={isNew ? 'New course' : `Edit ${c.code}`} onClose={onClose} footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn" onClick={save}>{isNew ? 'Create course' : 'Save'}</button></>}>
      <Field label="Course type">
        <div className="row gap wrap">{(['CORE', 'FOUNDATION', 'OPEN_ELECTIVE'] as const).map((k) => (
          <button key={k} type="button" className={`chip ${c.kind === k ? 'active' : ''}`} disabled={!isNew} onClick={() => set({ kind: k })}>{KIND_LABEL[k]}{k !== 'CORE' && ' (pan-university)'}</button>
        ))}</div>
      </Field>
      {!pan ? (
        <div className="grid grid-2">
          <Field label="Class" hint="Everyone in the class is registered automatically"><select className="select" value={c.classId} onChange={(e) => { const cl = db.classes.find((x) => x.id === e.target.value); set({ classId: e.target.value, semester: cl?.semester }) }}>{db.classes.map((x) => <option key={x.id} value={x.id}>{classLabel(x)}</option>)}</select></Field>
          <Field label="Semester" hint="Next semester's courses start when the class is promoted"><select className="select" value={c.semester} onChange={(e) => set({ semester: Number(e.target.value) })}>{cls && [cls.semester, cls.semester + 1].filter((s) => s <= cls.maxSemesters).map((s) => <option key={s} value={s}>Semester {s}{s === cls.semester ? ' (current)' : ' (next)'}</option>)}</select></Field>
        </div>
      ) : (
        <>
          <Field label="Term"><select className="select" value={c.term} onChange={(e) => set({ term: e.target.value })}>{[...new Set([settings.registrationTerm, settings.currentTerm])].map((t) => <option key={t} value={t}>{t}{t === settings.registrationTerm && t !== settings.currentTerm ? ' (registration)' : t === settings.currentTerm ? ' (running now)' : ''}</option>)}</select></Field>
          <Field label="Classes whose students may opt for it" hint={`${(c.classIds ?? []).length} of ${db.classes.length} classes selected`}>
            <div className="row gap wrap">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ classIds: (c.classIds ?? []).length === allIds.length ? [] : allIds })}>{(c.classIds ?? []).length === allIds.length ? 'Clear' : 'All classes'}</button>
              {db.classes.map((x) => { const on = (c.classIds ?? []).includes(x.id); const col = classColor(x); return (
                <button key={x.id} type="button" className="chip class-chip" aria-pressed={on} onClick={() => set({ classIds: on ? (c.classIds ?? []).filter((y) => y !== x.id) : [...(c.classIds ?? []), x.id] })}
                  style={{ borderColor: col.fg, color: on ? '#fff' : col.fg, background: on ? col.fg : col.bg }}>{on ? '✓ ' : ''}{classLabel(x)}</button>
              ) })}
            </div>
          </Field>
        </>
      )}
      <div className="grid grid-3">
        <Field label="Course code"><input className="input" value={c.code ?? ''} placeholder={pan ? (c.kind === 'FOUNDATION' ? 'FND401' : 'OEL401') : `${cls?.program ?? ''}${c.semester ?? ''}05`} onChange={(e) => set({ code: e.target.value.toUpperCase() })} /></Field>
        <Field label="Credits"><input className="input" type="number" min={1} max={10} value={c.credits ?? 3} onChange={(e) => set({ credits: Number(e.target.value) })} /></Field>
        <Field label="Seats (slots)" hint={taken ? `${taken} registered` : pan ? 'Course closes when full' : 'Optional for class courses'}><input className="input" type="number" min={0} value={c.slots ?? ''} onChange={(e) => set({ slots: e.target.value ? Number(e.target.value) : undefined })} /></Field>
      </div>
      <Field label="Course name"><input className="input" value={c.name ?? ''} onChange={(e) => set({ name: e.target.value })} /></Field>
      <Field label="Faculty" hint="Gets the course for attendance, assignments, quizzes and marks"><select className="select" value={c.facultyId} onChange={(e) => set({ facultyId: e.target.value })}>{faculty.map((f) => <option key={f.id} value={f.id}>{f.name} · {f.department}</option>)}</select></Field>
      <Field label="Description"><textarea className="textarea" value={c.description ?? ''} onChange={(e) => set({ description: e.target.value })} /></Field>
    </Modal>
  )
}

/** Students on a course; the office can add (even over capacity) or drop. */
function RosterModal({ courseId, manage, onClose }: { courseId: string; manage: boolean; onClose: () => void }) {
  const db = useDB()
  const me = useCurrentUser()!
  const c = db.courses.find((x) => x.id === courseId)!
  const [add, setAdd] = useState('')
  const regOf = (sid: string) => db.registrations.find((r) => r.courseId === c.id && r.studentId === sid && r.status === 'REGISTERED')
  // Any active student can be added by the office; those from an offered class are listed first.
  const offered = (u: User) => (isPan(c) ? (c.classIds ?? []).includes(u.classId ?? '') : u.classId === c.classId)
  const candidates = db.users.filter((u) => u.role === 'student' && u.status === 'ACTIVE' && !c.studentIds.includes(u.id)).sort((a, b) => Number(offered(b)) - Number(offered(a)) || a.name.localeCompare(b.name))
  const doAdd = () => {
    if (!add) return
    let err: string | null = null
    update((d) => { err = registerCourse(d, c.id, add, me.id, true) })
    if (err) return alert(err)
    notify([add], `You were registered for ${c.code} ${c.name} by the Registrar of Evaluation`, '/registration')
    audit(me.id, 'COURSE_REGISTER', `${userName(db, add)} → ${c.code}`); setAdd('')
  }
  const drop = (sid: string) => {
    if (!confirm(`Drop ${userName(db, sid)} from ${c.code}?`)) return
    update((d) => dropCourse(d, c.id, sid, me.id))
    notify([sid], `You were dropped from ${c.code} ${c.name}`, '/registration')
    audit(me.id, 'COURSE_DROP', `${userName(db, sid)} ← ${c.code}`)
  }
  const dropped = db.registrations.filter((r) => r.courseId === c.id && r.status === 'DROPPED')
  return (
    <Modal wide title={`${c.code} ${c.name}: students`} onClose={onClose}>
      <div className="row gap wrap"><KindBadge c={c} /><OfferedTo db={db} c={c} /><span className="small muted">{userName(db, c.facultyId)} · {c.credits} credits</span></div>
      <Seats c={c} />
      {manage && (
        <div className="row gap wrap">
          <select className="select" style={{ maxWidth: 320 }} aria-label="Student to register" value={add} onChange={(e) => setAdd(e.target.value)}><option value="">Register a student…</option>{candidates.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.rollNo} · {classLabel(db.classes.find((x) => x.id === u.classId))}{offered(u) ? '' : ' (not an offered class)'}</option>)}</select>
          <button className="btn btn-sm" disabled={!add} onClick={doAdd}>{seatsLeft(c) <= 0 ? 'Register (over capacity)' : 'Register'}</button>
          <span className="small muted">The office can add or drop any student at any time, including after the window closes.</span>
        </div>
      )}
      {c.studentIds.length === 0 ? <Empty text={isPan(c) ? 'No students registered yet.' : 'The roster fills when the class reaches this semester.'} /> : (
        <div className="table-wrap"><table>
          <thead><tr><th>Student</th><th>Class</th><th>Registered</th><th /></tr></thead>
          <tbody>{c.studentIds.map((sid) => { const u = db.users.find((x) => x.id === sid); const r = regOf(sid); return (
            <tr key={sid}>
              <td>{u?.name}<div className="small muted">{u?.rollNo}</div></td>
              <td className="small">{classLabel(db.classes.find((x) => x.id === u?.classId))}</td>
              <td className="small">{r ? `${fmtDate(r.at)} · ${r.by === sid ? 'by student' : `by ${userName(db, r.by)}`}` : 'With the class'}{(c.extraIds ?? []).includes(sid) && <> <Badge tone="info">Added by office</Badge></>}</td>
              <td>{manage && <button className="btn btn-ghost btn-sm" onClick={() => drop(sid)}>Drop</button>}</td>
            </tr>
          ) })}</tbody>
        </table></div>
      )}
      {dropped.length > 0 && <div className="small muted">Dropped: {dropped.map((r) => `${userName(db, r.studentId)} (${fmtDate(r.droppedAt ?? r.at)})`).join(', ')}</div>}
    </Modal>
  )
}

/** One student's registration for the registration term; the office can register or drop on their behalf. */
export function StudentRegistrationModal({ studentId, manage, onClose }: { studentId: string; manage: boolean; onClose: () => void }) {
  const db = useDB()
  const s = db.users.find((u) => u.id === studentId)!
  const me = useCurrentUser()!
  return (
    <Modal wide title={`${s.name}: registration for ${db.registration.registrationTerm}`} onClose={onClose}>
      {(() => { const x = sessionState(db, s.id); return (
        <div className="row gap wrap">
          <span className="small">Timed session: {x.state === 'none' ? 'not started' : x.state === 'active' ? `running, ${Math.ceil(x.left / 60000)} min left` : x.state === 'submitted' ? `submitted ${fmtDate(x.at!)}` : 'time ran out'}</span>
          {manage && x.state !== 'none' && <button className="btn btn-ghost btn-sm" onClick={() => { update((d) => { if (d.registration.sessions) delete d.registration.sessions[s.id] }); notify([s.id], `Your course registration was reopened: you have ${timeLimitMin(db)} minutes again when you start.`, '/registration'); audit(me.id, 'REGISTRATION_RESET', s.name) }}>Reset timer (let the student register again)</button>}
        </div>
      ) })()}
      <RegistrationChooser student={s} actor="office" canChange={manage} />
    </Modal>
  )
}

/** Baskets with Register / Drop, shared by the student page and the office. */
function RegistrationChooser({ student, actor, canChange, gate = (fn) => fn() }: { student: User; actor: 'student' | 'office'; canChange: boolean; gate?: (fn: () => void) => void }) {
  const db = useDB()
  const me = useCurrentUser()!
  const st = registrationStatus(db, student)
  const need = st.limits
  const mine = (k: 'FOUNDATION' | 'OPEN_ELECTIVE') => (k === 'FOUNDATION' ? st.foundation : st.open)
  const reg = (c: Course) => gate(() => doReg(c))
  const doReg = (c: Course) => {
    let err: string | null = null
    update((d) => { err = registerCourse(d, c.id, student.id, me.id, actor === 'office') })
    if (err) return alert(err)
    if (actor === 'office') notify([student.id], `You were registered for ${c.code} ${c.name} by the Registrar of Evaluation`, '/registration')
    audit(me.id, 'COURSE_REGISTER', `${student.name} → ${c.code}`)
  }
  const drop = (c: Course) => gate(() => doDrop(c))
  const doDrop = (c: Course) => {
    update((d) => dropCourse(d, c.id, student.id, me.id))
    if (actor === 'office') notify([student.id], `You were dropped from ${c.code} ${c.name}`, '/registration')
    audit(me.id, 'COURSE_DROP', `${student.name} ← ${c.code}`)
  }
  return (
    <div className="stack">
      <div className="row gap wrap">
        <Badge tone={st.complete ? 'success' : 'warning'}>{st.complete ? 'Registration complete' : 'Registration pending'}</Badge>
        <Badge tone={st.overMax ? 'danger' : st.creditsOk ? 'success' : 'warning'}>{st.credits} credits{st.minCredits ? ` · min ${st.minCredits}` : ''}{st.maxCredits ? ` · max ${st.maxCredits}` : ''}</Badge>
        <span className="small muted">Semester {st.nextSem}</span>
      </div>
      <Card title={`Class courses · Semester ${st.nextSem}`} action={<span className="small muted">Registered with the class</span>}>
        {st.core.length === 0 ? <Empty text="The Registrar of Evaluation has not set up this semester's class courses yet." /> : (
          <div className="list">{st.core.map((c) => <div key={c.id} className="list-item"><div className="grow"><strong>{c.code}</strong> {c.name}<div className="small muted">{userName(db, c.facultyId)} · {c.credits} credits</div></div><Badge tone="brand">{(c.extraIds ?? []).includes(student.id) ? 'Added by office' : 'Class course'}</Badge>{actor === 'office' && canChange && <button className="btn btn-ghost btn-sm" onClick={() => drop(c)}>Drop</button>}</div>)}</div>
        )}
      </Card>
      {(['FOUNDATION', 'OPEN_ELECTIVE'] as const).map((k) => {
        const list = eligibleCourses(db, student, k)
        const chosen = mine(k)
        const done = chosen.length >= need[k]
        return (
          <Card key={k} title={`${KIND_LABEL[k]} basket`} action={<Badge tone={done ? 'success' : 'warning'}>Choose {need[k]} · {chosen.length}/{need[k]} chosen</Badge>}>
            {list.length === 0 ? <Empty text="No courses offered to your class in this basket yet." /> : (
              <div className="reg-grid">{list.map((c) => {
                const on = c.studentIds.includes(student.id)
                const full = seatsLeft(c) <= 0
                return (
                  <div key={c.id} className={`reg-card ${on ? 'on' : ''}`}>
                    <div className="row between"><strong>{c.code}</strong>{on ? <Badge tone="success">Registered</Badge> : full ? <Badge tone="danger">Full</Badge> : null}</div>
                    <div>{c.name}</div>
                    <div className="small muted">{userName(db, c.facultyId)} · {c.credits} credits</div>
                    <Seats c={c} />
                    {canChange && (on
                      ? <button className="btn btn-ghost btn-sm" onClick={() => drop(c)}>Drop</button>
                      : <button className="btn btn-sm" disabled={(full && actor === 'student') || (done && actor === 'student')} title={done ? 'Drop your current choice to switch' : undefined} onClick={() => reg(c)}>{full ? (actor === 'office' ? 'Register (over capacity)' : 'Full') : 'Register'}</button>)}
                  </div>
                )
              })}</div>
            )}
            {canChange && actor === 'student' && done && list.length > chosen.length && <div className="small muted">You have chosen {need[k]} course{need[k] === 1 ? '' : 's'}, the limit for your class. To switch, drop one first.</div>}
          </Card>
        )
      })}
      {actor === 'office' && canChange && <AddAnyCourse student={student} onAdd={reg} />}
    </div>
  )
}

/** Office only: register the student in any other course (another class's course, a basket outside their class…). */
function AddAnyCourse({ student, onAdd }: { student: User; onAdd: (c: Course) => void }) {
  const db = useDB()
  const [id, setId] = useState('')
  const st = registrationStatus(db, student)
  const taken = new Set([...st.core, ...st.foundation, ...st.open].map((c) => c.id))
  const options = db.courses.filter((c) => !taken.has(c.id) && !c.studentIds.includes(student.id) && (isPan(c) ? c.term === db.registration.registrationTerm : (() => { const cl = db.classes.find((x) => x.id === c.classId); return !!cl && c.semester >= cl.semester })()))
    .sort((a, b) => kindOf(a).localeCompare(kindOf(b)) || a.code.localeCompare(b.code))
  return (
    <Card title="Add another course" action={<span className="small muted">Office override: any class or basket</span>}>
      <div className="row gap wrap">
        <select className="select" style={{ maxWidth: 420 }} aria-label="Course to add" value={id} onChange={(e) => setId(e.target.value)}><option value="">Choose a course…</option>{options.map((c) => <option key={c.id} value={c.id}>{c.code} {c.name} · {isPan(c) ? KIND_LABEL[kindOf(c)] : classLabel(db.classes.find((x) => x.id === c.classId)).replace(/Sem \d+/, `Sem ${c.semester}`)} · {c.credits} cr</option>)}</select>
        <button className="btn btn-sm" disabled={!id} onClick={() => { const c = db.courses.find((x) => x.id === id); if (c) onAdd(c); setId('') }}>Register</button>
      </div>
    </Card>
  )
}

/* ============================ Student ============================ */

function StudentRegistration() {
  const db = useDB()
  const me = useCurrentUser()!
  const settings = db.registration
  const closed = !settings.open || (settings.closesAt !== undefined && Date.now() > settings.closesAt)
  const history = db.registrations.filter((r) => r.studentId === me.id).sort((a, b) => b.at - a.at)
  const [, tick] = useState(0)
  const ss = sessionState(db, me.id)
  const st = registrationStatus(db, me)
  const [asking, setAsking] = useState<(() => void) | null>(null)
  const minutes = timeLimitMin(db)
  // Count down once a session is running.
  useEffect(() => { if (ss.state !== 'active') return; const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t) }, [ss.state])
  const start = () => {
    const next = asking
    update((d) => { d.registration.sessions = { ...d.registration.sessions, [me.id]: { startedAt: Date.now(), endsAt: Date.now() + minutes * 60_000 } } })
    audit(me.id, 'REGISTRATION_START', `${settings.registrationTerm} · ${minutes} min`)
    setAsking(null); next?.()
  }
  const submit = () => {
    if (!st.complete && !confirm(`Your registration is not complete yet (${st.foundation.length}/${st.limits.FOUNDATION} foundation, ${st.open.length}/${st.limits.OPEN_ELECTIVE} open elective${st.minCredits ? `, ${st.credits}/${st.minCredits} credits` : ''}). Submit anyway? You cannot change it afterwards.`)) return
    update((d) => { const x = d.registration.sessions?.[me.id]; if (x) x.submittedAt = Date.now() })
    notify([me.id], `Registration submitted for ${settings.registrationTerm}: ${[...st.core, ...st.foundation, ...st.open].map((c) => c.code).join(', ')} (${st.credits} credits)`, '/registration')
    audit(me.id, 'REGISTRATION_SUBMIT', [...st.foundation, ...st.open].map((c) => c.code).join(', '))
  }
  const mm = String(Math.floor(ss.left / 60000)).padStart(2, '0'), sec = String(Math.floor((ss.left % 60000) / 1000)).padStart(2, '0')
  const locked = ss.state === 'submitted' || ss.state === 'expired'
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
  return (
    <>
      <PageHeader title="Course Registration" subtitle={`Choose your courses for ${settings.registrationTerm}`} />
      <div className={`alert ${closed ? 'alert-warning' : 'alert-success'}`}><span>
        Registration for <strong>{settings.registrationTerm}</strong> is <strong>{closed ? 'closed' : 'open'}</strong>{settings.closesAt ? ` · last date ${fmtDate(settings.closesAt)}` : ''}.
        {closed ? ' Contact the Registrar of Evaluation for changes.' : ` For your class: ${plural(st.limits.FOUNDATION, 'foundation course')} and ${plural(st.limits.OPEN_ELECTIVE, 'open elective')}${settings.minCredits ? `, at least ${settings.minCredits} credits in total` : ''}${settings.maxCredits ? ` (at most ${settings.maxCredits})` : ''}. Seats are first come, first served.`}
      </span></div>
      {ss.state === 'active' && (
        <div className={`reg-timer ${ss.left < 120_000 ? 'urgent' : ''}`} role="timer" aria-label="Time left">
          <Clock size={18} /><strong className="timer">{mm}:{sec}</strong><span className="small">left to finish registration</span>
          <span className="grow" />
          <Badge tone={st.complete ? 'success' : 'warning'}>{st.complete ? 'All baskets done' : 'Not complete yet'}</Badge>
          <button className="btn btn-sm" onClick={submit}><Send size={12} /> Submit registration</button>
        </div>
      )}
      {ss.state === 'none' && !closed && <div className="alert alert-info">Look through the courses first. You will have <strong>&nbsp;{minutes} minutes&nbsp;</strong> once you click <strong>&nbsp;Register&nbsp;</strong> on a course.</div>}
      {locked && <div className="alert alert-info">{ss.state === 'submitted' ? `Registration submitted on ${fmtDate(ss.at!)} at ${new Date(ss.at!).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}.` : `Your ${minutes} minutes ran out at ${new Date(ss.at!).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}; your choices were saved.`} For any change, contact the Registrar of Evaluation.</div>}
      {/* Once registration is done the boxes give way to the courses, semester by semester. */}
      {locked ? <MySemesters student={me} /> : <RegistrationChooser student={me} actor="student" canChange={!closed} gate={(fn) => (sessionState(getDB(), me.id).state === 'active' ? fn() : setAsking(() => fn))} />}
      {asking && (
        <Modal title="Start course registration?" onClose={() => setAsking(null)} footer={<><button className="btn btn-ghost" onClick={() => setAsking(null)}>Go back</button><button className="btn" onClick={start}>OK, start the {minutes} minutes</button></>}>
          <p>You will have only <strong>{minutes} minutes</strong> to finish your registration.</p>
          <ul className="small" style={{ paddingLeft: 18, lineHeight: 1.7 }}>
            <li>Choose {plural(st.limits.FOUNDATION, 'foundation course')} and {plural(st.limits.OPEN_ELECTIVE, 'open elective')}.</li>
            <li>The timer keeps running even if you leave this page.</li>
            <li>When the time is up, your choices are saved as they are and registration locks. Submit when you are done.</li>
          </ul>
        </Modal>
      )}
      {!locked && <Card title="My registration history">
        {history.length === 0 ? <Empty text="No registrations yet." /> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Course</th><th>Type</th><th>Term</th><th>Semester</th><th>Status</th><th>Date</th></tr></thead>
            <tbody>{history.map((r) => { const c = db.courses.find((x) => x.id === r.courseId); return (
              <tr key={r.id}><td><strong>{c?.code}</strong> {c?.name}</td><td>{c && <KindBadge c={c} />}</td><td>{r.term}</td><td>{r.semester}</td><td><Badge tone={r.status === 'REGISTERED' ? 'success' : 'neutral'}>{r.status === 'REGISTERED' ? 'Registered' : 'Dropped'}</Badge></td><td className="small">{fmtDate(r.droppedAt ?? r.at)}</td></tr>
            ) })}</tbody>
          </table></div>
        )}
      </Card>}
    </>
  )
}

/** A student's registered courses, one collapsible table per semester (newest first, the coming semester open). */
function MySemesters({ student }: { student: User }) {
  const db = useDB()
  const st = registrationStatus(db, student)
  const bySem = semesterCourses(db, student.id)
  // Next semester's class courses are registered with the class before its roster fills at promotion.
  for (const c of st.core) { const l = bySem.get(st.nextSem) ?? []; if (!l.some((x) => x.id === c.id)) bySem.set(st.nextSem, [...l, c]) }
  const sems = [...bySem.keys()].sort((a, b) => b - a)
  const [open, setOpen] = useState<number[]>([st.nextSem])
  const termOf = (sem: number) => db.registrations.find((r) => r.studentId === student.id && r.semester === sem && r.status === 'REGISTERED')?.term
  const results = studentResults(db, student.id)
  return (
    <Card title="My registered courses" action={<Badge tone={st.complete ? 'success' : 'warning'}>{st.complete ? 'Registration complete' : 'Registration incomplete'}</Badge>}>
      <div className="sem-list">{sems.map((sem) => {
        const courses = bySem.get(sem)!.sort((a, b) => kindOf(a).localeCompare(kindOf(b)) || a.code.localeCompare(b.code))
        const isOpen = open.includes(sem)
        const credits = courses.reduce((t, c) => t + c.credits, 0)
        const label = sem === st.nextSem && sem !== student.semester ? 'registered' : sem === student.semester ? 'current' : 'completed'
        return (
          <div key={sem} className={`sem-item ${isOpen ? 'open' : ''}`}>
            <button className="sem-head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? open.filter((x) => x !== sem) : [...open, sem])}>
              <ChevronRight size={16} className="sem-chevron" />
              <strong>Semester {sem}</strong>{termOf(sem) && <span className="muted small">{termOf(sem)}</span>}
              <Badge tone={label === 'registered' ? 'info' : label === 'current' ? 'brand' : 'neutral'}>{label}</Badge>
              <span className="grow" /><span className="small muted">{courses.length} courses · {credits} credits</span>
            </button>
            {isOpen && (
              <div className="table-wrap"><table>
                <thead><tr><th>Code</th><th>Course</th><th>Type</th><th>Credits</th><th>Faculty</th><th>Result</th></tr></thead>
                <tbody>{courses.map((c) => { const r = results.find((x) => x.course.id === c.id); return (
                  <tr key={c.id}><td><strong>{c.code}</strong></td><td>{c.name}</td><td>{isPan(c) ? <KindBadge c={c} /> : <span className="small">Class course</span>}</td><td>{c.credits}</td><td className="small">{userName(db, c.facultyId)}</td>
                    <td>{r ? <Badge tone={r.row.pass ? 'success' : 'danger'}>{r.row.grade}</Badge> : <span className="small muted">{label === 'completed' ? '—' : label === 'current' ? 'In progress' : 'Registered'}</span>}</td></tr>
                ) })}</tbody>
                <tfoot><tr><td colSpan={3}><strong>Total</strong></td><td><strong>{credits}</strong></td><td colSpan={2} /></tr></tfoot>
              </table></div>
            )}
          </div>
        )
      })}</div>
    </Card>
  )
}
