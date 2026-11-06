import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Download, FileSpreadsheet, RotateCcw, Send, Settings2, UserPlus } from 'lucide-react'
import { audit, getDB, notify, uid, update, useCurrentUser, useDB } from '../data/store'
import { Badge, Card, Empty, Field, Modal, PageHeader, SearchBox, Stat, Tabs } from '../components/ui'
import { can, officeUsers } from '../access'
import { classCourses, classLabel, classStudents } from '../classes'
import { fmtDate, fmtDateTime, matches, userName } from '../lib'
import { availableComponents, compKey, componentInfo, DEFAULT_EXTERNAL, DEFAULT_INTERNAL, newSheet, publishSheet, sheetFor, sheetProgress, sheetRows } from '../results'
import type { ResultSheet } from '../data/types'

const statusTone = (s: ResultSheet['status']) => (s === 'PUBLISHED' ? 'success' : s === 'SUBMITTED' ? 'info' : 'warning')
const statusLabel = (s: ResultSheet['status']) => (s === 'PUBLISHED' ? 'Published' : s === 'SUBMITTED' ? 'Submitted to Evaluation' : 'Draft (with professor)')

export default function Results() {
  const db = useDB()
  const me = useCurrentUser()!
  const office = can(me, 'manageResults')
  // Professors see the classes they teach or evaluate for; the Registrar of Evaluation sees all.
  const mineSheet = (sh: ResultSheet) => sh.evaluatorId === me.id || db.courses.find((c) => c.id === sh.courseId)?.facultyId === me.id
  const classes = db.classes.filter((c) => office || classCourses(db, c).some((co) => co.facultyId === me.id || db.resultSheets.some((sh) => sh.courseId === co.id && sh.evaluatorId === me.id)))
  const [classId, setClassId] = useState(classes[0]?.id ?? '')
  const [tab, setTab] = useState<'class' | 'supplementary' | 'backlogs'>('class')
  const [q, setQ] = useState('')
  const [openSheet, setOpenSheet] = useState<string | null>(null)
  const cls = db.classes.find((c) => c.id === classId)

  const ensureSheet = (courseId: string) => {
    const c = db.courses.find((x) => x.id === courseId)!
    const exam = db.exams.find((e) => e.courseId === courseId && /end sem/i.test(e.title))
    const sh = newSheet(courseId, c.semester, exam?.evaluatorId ?? c.facultyId, exam?.id)
    sh.components = availableComponents(db, courseId, exam?.id).filter((x) => x.kind !== 'quiz')
    update((d) => { d.resultSheets.push(sh) })
    audit(me.id, 'RESULT_SHEET_CREATE', `${c.code} Sem ${c.semester}`)
    return sh.id
  }
  const publishClass = () => {
    if (!cls) return
    const sheets = classCourses(db, cls).map((c) => sheetFor(db, c.id, cls.semester)).filter(Boolean) as ResultSheet[]
    const incomplete = sheets.filter((s) => !sheetProgress(db, s).complete)
    const notSubmitted = sheets.filter((s) => s.status === 'DRAFT')
    if (sheets.length < classCourses(db, cls).length) return alert('Every course needs a result sheet before the class can be published.')
    if (incomplete.length) return alert(`External marks are missing in: ${incomplete.map((s) => db.courses.find((c) => c.id === s.courseId)?.code).join(', ')}`)
    if (notSubmitted.length && !confirm(`${notSubmitted.length} sheet(s) have not been submitted by the professor. Publish anyway?`)) return
    update((d) => { for (const s of sheets) if (s.status !== 'PUBLISHED') publishSheet(d, s.id, me.id) })
    notify(classStudents(db, cls.id).map((s) => s.id), `Semester ${cls.semester} results are published`, '/exams')
    notify(db.users.filter((u) => u.role === 'parent' && u.wardIds?.some((w) => classStudents(db, cls.id).some((s) => s.id === w))).map((u) => u.id), `Semester ${cls.semester} results published for your ward`, '/home')
    audit(me.id, 'RESULTS_PUBLISH_CLASS', classLabel(cls))
  }

  const supplementary = db.resultSheets.filter((s) => s.term === 'Supplementary' && (office || mineSheet(s)))

  return (
    <>
      <PageHeader title="Results" subtitle={office ? 'Internal + external = final. Collect marks from professors, review, publish by class, and register backlogs' : 'Fill internals and external marks for your courses, then submit to the Registrar of Evaluation'}
        search={{ value: q, onChange: setQ, placeholder: 'Search course, professor or student…' }} />
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'class', label: 'Class results' },
        { id: 'supplementary', label: 'Supplementary / backlog exams', count: supplementary.length },
        ...(office ? [{ id: 'backlogs' as const, label: 'Backlog registration', count: db.users.filter((u) => u.backlogCourses?.length).length }] : []),
      ]} />

      {tab === 'class' && !office && (() => {
        // Professors: every sheet they teach or evaluate, across classes.
        const mine = db.resultSheets.filter((sh) => sh.term === 'Regular' && mineSheet(sh) && matches(q, db.courses.find((c) => c.id === sh.courseId)?.code, db.courses.find((c) => c.id === sh.courseId)?.name))
          .sort((a, b) => Number(a.status === 'PUBLISHED') - Number(b.status === 'PUBLISHED'))
        return (
          <Card title="My result sheets">
            {mine.length === 0 ? <Empty text="No result sheets are assigned to you yet." /> : (
              <div className="table-wrap"><table>
                <thead><tr><th>Course</th><th>Class</th><th>Your role</th><th>Marks</th><th>Status</th><th /></tr></thead>
                <tbody>{mine.map((sh) => { const c = db.courses.find((x) => x.id === sh.courseId)!; const prog = sheetProgress(db, sh); return (
                  <tr key={sh.id}>
                    <td><strong>{c.code}</strong> {c.name}</td>
                    <td className="small">{classLabel(db.classes.find((x) => x.id === c.classId))}</td>
                    <td className="small">{[c.facultyId === me.id && 'Teacher (internals)', sh.evaluatorId === me.id && 'Evaluator (external)'].filter(Boolean).join(' · ')}</td>
                    <td className="small">{prog.withExternal}/{prog.total} external</td>
                    <td><Badge tone={statusTone(sh.status)}>{statusLabel(sh.status)}</Badge></td>
                    <td><button className="btn btn-outline btn-sm" onClick={() => setOpenSheet(sh.id)}>Open sheet</button></td>
                  </tr>
                ) })}</tbody>
              </table></div>
            )}
          </Card>
        )
      })()}

      {tab === 'class' && office && (
        <>
          <div className="row gap wrap">{classes.map((c) => <button key={c.id} className={`chip ${c.id === classId ? 'active' : ''}`} onClick={() => setClassId(c.id)}>{classLabel(c)}</button>)}</div>
          {!cls ? <Card><Empty text="No classes to show." /></Card> : (() => {
            const courses = classCourses(db, cls).filter((c) => office || c.facultyId === me.id || db.resultSheets.some((s) => s.courseId === c.id && s.evaluatorId === me.id))
            const sheets = courses.map((c) => ({ c, sh: sheetFor(db, c.id, cls.semester) }))
            const published = sheets.filter((x) => x.sh?.status === 'PUBLISHED').length
            return (
              <>
                <div className="grid grid-4">
                  <Stat label="Courses" value={courses.length} icon={<FileSpreadsheet size={22} />} />
                  <Stat label="Submitted by professors" value={sheets.filter((x) => x.sh && x.sh.status !== 'DRAFT').length} tone="info" />
                  <Stat label="Marks complete" value={sheets.filter((x) => x.sh && sheetProgress(db, x.sh).complete).length} tone="warning" />
                  <Stat label="Published" value={`${published}/${courses.length}`} tone="success" />
                </div>
                <Card title={`${classLabel(cls)}: result sheets`} action={office && <div className="row gap"><Link className="btn btn-outline btn-sm" to="/classes">Promotion</Link><button className="btn btn-sm" disabled={published === courses.length || !courses.length} onClick={publishClass}><CheckCircle2 size={14} /> Publish class results</button></div>}>
                  {courses.length === 0 ? <Empty text="No courses for this semester." /> : (
                    <div className="table-wrap"><table>
                      <thead><tr><th>Course</th><th>Evaluator</th><th>External exam</th><th>Internals counted</th><th>Marks</th><th>Status</th><th /></tr></thead>
                      <tbody>{sheets.filter(({ c, sh }) => matches(q, c.code, c.name, userName(db, sh?.evaluatorId ?? c.facultyId))).map(({ c, sh }) => {
                        const exam = sh && db.exams.find((e) => e.id === sh.examId)
                        const prog = sh && sheetProgress(db, sh)
                        return (
                          <tr key={c.id}>
                            <td><strong>{c.code}</strong> {c.name}<div className="small muted">Teacher: {userName(db, c.facultyId)}</div></td>
                            <td>{sh ? userName(db, sh.evaluatorId) : '—'}</td>
                            <td className="small">{exam ? `${exam.title} · ${fmtDate(exam.date)}` : <span className="muted">Not linked</span>}</td>
                            <td className="small">{sh ? (sh.components.length ? sh.components.map((x) => componentInfo(db, x).label).join(', ') : <span className="muted">None selected</span>) : '—'}</td>
                            <td className="small">{prog ? `${prog.withExternal}/${prog.total} external` : '—'}</td>
                            <td>{sh ? <Badge tone={statusTone(sh.status)}>{statusLabel(sh.status)}</Badge> : <Badge>No sheet</Badge>}</td>
                            <td>{sh ? <button className="btn btn-outline btn-sm" onClick={() => setOpenSheet(sh.id)}>Open sheet</button> : (office || c.facultyId === me.id) && <button className="btn btn-outline btn-sm" onClick={() => setOpenSheet(ensureSheet(c.id))}>Create sheet</button>}</td>
                          </tr>
                        )
                      })}</tbody>
                    </table></div>
                  )}
                </Card>
              </>
            )
          })()}
        </>
      )}

      {tab === 'supplementary' && (
        <Card title="Supplementary / backlog exam sheets">
          {supplementary.length === 0 ? <Empty text="No supplementary sheets. Register a backlog student to create one." /> : (
            <div className="table-wrap"><table>
              <thead><tr><th>Course</th><th>Students</th><th>Evaluator</th><th>Exam</th><th>Status</th><th /></tr></thead>
              <tbody>{supplementary.filter((sh) => matches(q, db.courses.find((c) => c.id === sh.courseId)?.name, db.courses.find((c) => c.id === sh.courseId)?.code, ...sh.extraStudentIds.map((s) => userName(db, s)))).map((sh) => {
                const c = db.courses.find((x) => x.id === sh.courseId)!
                const exam = db.exams.find((e) => e.id === sh.examId)
                return (
                  <tr key={sh.id}>
                    <td><strong>{c.code}</strong> {c.name}<div className="small muted">Sem {sh.semester} course · {classLabel(db.classes.find((x) => x.id === c.classId))}</div></td>
                    <td className="small">{sh.extraStudentIds.map((s) => userName(db, s)).join(', ')}</td>
                    <td>{userName(db, sh.evaluatorId)}</td>
                    <td className="small">{exam ? fmtDate(exam.date) : '—'}</td>
                    <td><Badge tone={statusTone(sh.status)}>{statusLabel(sh.status)}</Badge></td>
                    <td><button className="btn btn-outline btn-sm" onClick={() => setOpenSheet(sh.id)}>Open sheet</button></td>
                  </tr>
                )
              })}</tbody>
            </table></div>
          )}
        </Card>
      )}

      {tab === 'backlogs' && office && <BacklogRegistration q={q} onOpen={setOpenSheet} />}

      {openSheet && <SheetEditor sheetId={openSheet} onClose={() => setOpenSheet(null)} />}
    </>
  )
}

/* ------------------------------------------------------------------ backlog registration */

function BacklogRegistration({ q, onOpen }: { q: string; onOpen: (id: string) => void }) {
  const db = useDB()
  const me = useCurrentUser()!
  const [local, setLocal] = useState('')
  const term = q || local
  const students = db.users.filter((u) => u.role === 'student' && (u.backlogCourses?.length || (term && matches(term, u.name, u.rollNo))))
    .filter((u) => matches(term, u.name, u.rollNo, ...(u.backlogCourses ?? []).map((c) => db.courses.find((x) => x.id === c)?.code)))

  /** Register a student for the next attempt of a course: an open supplementary sheet, created with its exam if needed. */
  const register = (studentId: string, courseId: string) => {
    const c = db.courses.find((x) => x.id === courseId)!
    let target = db.resultSheets.find((s) => s.courseId === courseId && s.term === 'Supplementary' && s.status !== 'PUBLISHED')
    const already = target?.extraStudentIds.includes(studentId)
    if (already) return onOpen(target!.id)
    update((d) => {
      let sh = d.resultSheets.find((s) => s.id === target?.id)
      if (!sh) {
        const examId = uid('ex')
        const regular = d.resultSheets.find((s) => s.courseId === courseId && s.term === 'Regular')
        const date = new Date(Date.now() + 21 * 86_400_000).toISOString().slice(0, 10)
        d.exams.push({ id: examId, courseId, title: 'Supplementary Examination', date, start: '14:00', end: '17:00', venue: 'Exam Block', maxMarks: 100, minAttendance: 0, requireFeesCleared: false, minInternal: 0, resultsPublished: false, grading: 'ABSOLUTE', evaluatorId: regular?.evaluatorId ?? c.facultyId, kind: 'Supplementary' })
        sh = { ...newSheet(courseId, c.semester, regular?.evaluatorId ?? c.facultyId, examId, 'Supplementary'), components: regular?.components ?? [], internalMax: regular?.internalMax ?? DEFAULT_INTERNAL, externalMax: regular?.externalMax ?? DEFAULT_EXTERNAL }
        // Internals carry over from the regular attempt unless the office edits them.
        const prev = regular ? sheetRows(d, regular).find((r) => r.student.id === studentId) : undefined
        if (prev) sh.overrides[studentId] = { internal: prev.internal }
        d.resultSheets.push(sh)
        target = sh
      } else {
        const regular = d.resultSheets.find((s) => s.courseId === courseId && s.term === 'Regular')
        const prev = regular ? sheetRows(d, regular).find((r) => r.student.id === studentId) : undefined
        if (prev) sh.overrides[studentId] = { internal: prev.internal }
      }
      sh.extraStudentIds.push(studentId)
    })
    notify([studentId], `Registered for the supplementary exam in ${c.code} ${c.name}`, '/exams')
    notify([target!.evaluatorId], `Backlog student added to ${c.code} supplementary sheet`, '/results')
    audit(me.id, 'BACKLOG_REGISTER', `${userName(db, studentId)} → ${c.code} supplementary`)
  }

  return (
    <Card title="Re-register students for backlog courses" action={!q && <SearchBox value={local} onChange={setLocal} placeholder="Find any student…" />}>
      <p className="small muted" style={{ marginBottom: 10 }}>Students with failed courses are listed. Registering adds them to that course's supplementary sheet and exam. The course then appears in their results as a backlog attempt, even though it belongs to an earlier semester. Passing it clears the backlog.</p>
      {students.length === 0 ? <Empty text="No students with backlogs match." /> : (
        <div className="table-wrap"><table>
          <thead><tr><th>Student</th><th>Class</th><th>Backlog courses</th></tr></thead>
          <tbody>{students.map((s) => (
            <tr key={s.id}>
              <td>{s.name}<div className="small muted">{s.rollNo}</div></td>
              <td className="small">{classLabel(db.classes.find((c) => c.id === s.classId))}</td>
              <td>
                {(s.backlogCourses ?? []).length === 0 ? <span className="muted small">None recorded</span> : (s.backlogCourses ?? []).map((cid) => {
                  const c = db.courses.find((x) => x.id === cid)
                  const reg = db.resultSheets.find((sh) => sh.courseId === cid && sh.term === 'Supplementary' && sh.status !== 'PUBLISHED' && sh.extraStudentIds.includes(s.id))
                  return (
                    <div key={cid} className="row gap" style={{ marginBottom: 4 }}>
                      <span><strong>{c?.code}</strong> {c?.name} <span className="muted small">(Sem {c?.semester})</span></span>
                      {reg ? <><Badge tone="info">Registered</Badge><button className="btn btn-ghost btn-sm" onClick={() => onOpen(reg.id)}>Open sheet</button></> : <button className="btn btn-outline btn-sm" onClick={() => register(s.id, cid)}><UserPlus size={12} /> Register for re-exam</button>}
                    </div>
                  )
                })}
              </td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </Card>
  )
}

/* ------------------------------------------------------------------ sheet editor */

function SheetEditor({ sheetId, onClose }: { sheetId: string; onClose: () => void }) {
  const db = useDB()
  const me = useCurrentUser()!
  const sh = db.resultSheets.find((s) => s.id === sheetId)!
  const course = db.courses.find((c) => c.id === sh.courseId)!
  const exam = db.exams.find((e) => e.id === sh.examId)
  const office = can(me, 'manageResults')
  const isProf = sh.evaluatorId === me.id || course.facultyId === me.id
  const canEdit = office || (isProf && sh.status === 'DRAFT')
  const canExternal = office || (sh.evaluatorId === me.id && sh.status === 'DRAFT')
  const [showSettings, setShowSettings] = useState(sh.components.length === 0 && canEdit)
  const [q, setQ] = useState('')
  const rows = sheetRows(db, sh).filter((r) => matches(q, r.student.name, r.student.rollNo))
  const all = availableComponents(db, sh.courseId, sh.examId)
  const faculty = db.users.filter((u) => u.role === 'faculty' && u.status === 'ACTIVE')
  const examOptions = db.exams.filter((e) => e.courseId === sh.courseId && (/end sem|supplementary/i.test(e.title) || e.id === sh.examId))

  const patch = (fn: (s: ResultSheet) => void) => update((d) => fn(d.resultSheets.find((x) => x.id === sh.id)!))
  const setOverride = (sid: string, f: (o: ResultSheet['overrides'][string]) => void) => patch((s) => { s.overrides[sid] = s.overrides[sid] ?? {}; f(s.overrides[sid]); if (!Object.values(s.overrides[sid]).some((v) => v !== undefined && !(typeof v === 'object' && !Object.keys(v).length))) delete s.overrides[sid] })
  const num = (v: string) => (v.trim() === '' ? undefined : Math.max(0, Number(v)))
  const setExternal = (sid: string, v: string) => {
    if (!exam) return
    const n = num(v)
    update((d) => {
      const i = d.results.findIndex((r) => r.examId === exam.id && r.studentId === sid)
      if (n === undefined) { if (i >= 0) d.results.splice(i, 1) }
      else if (i >= 0) d.results[i].marks = Math.min(exam.maxMarks, n)
      else d.results.push({ id: uid('res'), examId: exam.id, studentId: sid, marks: Math.min(exam.maxMarks, n) })
    })
  }
  const toggleComponent = (k: string, on: boolean) => patch((s) => { const c = all.find((x) => compKey(x) === k)!; s.components = on ? [...s.components, c] : s.components.filter((x) => compKey(x) !== k) })

  const submit = () => {
    const prog = sheetProgress(getDB(), sh)
    if (!prog.complete && !confirm(`${prog.total - prog.withExternal} student(s) have no external marks. Submit anyway?`)) return
    patch((s) => { s.status = 'SUBMITTED'; s.submittedAt = Date.now() })
    notify(officeUsers(db, 'exam'), `${userName(db, me.id)} submitted the ${course.code} result sheet`, '/results')
    audit(me.id, 'RESULT_SHEET_SUBMIT', `${course.code} ${sh.term}`)
  }
  const publish = () => {
    const prog = sheetProgress(getDB(), sh)
    if (!prog.complete) return alert(`External marks are missing for ${prog.total - prog.withExternal} student(s). Mark absentees as absent.`)
    update((d) => publishSheet(d, sh.id, me.id))
    notify(sheetRows(db, sh).map((r) => r.student.id), `${course.code} ${course.name}: ${sh.term === 'Supplementary' ? 'supplementary ' : ''}result published`, '/exams')
    audit(me.id, 'RESULT_SHEET_PUBLISH', `${course.code} ${sh.term}`)
  }
  const exportCsv = () => {
    const head = ['Roll no', 'Name', ...sh.components.map((c) => `${componentInfo(db, c).label} (/${componentInfo(db, c).max})`), `Internal (/${sh.internalMax})`, `External (/${sh.externalMax})`, `Final (/${sh.internalMax + sh.externalMax})`, 'Grade', 'Result']
    const lines = [head, ...sheetRows(db, sh).map((r) => [r.student.rollNo ?? '', r.student.name, ...r.components.map((c) => String(c.value ?? '')), String(r.internal), String(r.external ?? ''), String(r.final ?? ''), r.grade ?? '', r.pass === undefined ? '' : r.pass ? 'Pass' : 'Fail'])]
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([lines.map((l) => l.map((v) => `"${v}"`).join(',')).join('\n')], { type: 'text/csv' })); a.download = `${course.code}-${sh.term}-results.csv`; a.click()
  }

  return (
    <Modal wide title={`${course.code} ${course.name} · ${sh.term === 'Supplementary' ? 'Supplementary' : `Semester ${sh.semester}`} result sheet`} onClose={onClose} footer={<>
      <Badge tone={statusTone(sh.status)}>{statusLabel(sh.status)}</Badge>
      {sh.publishedAt && <span className="small muted">Published {fmtDateTime(sh.publishedAt)}</span>}
      <div className="grow" />
      <button className="btn btn-ghost" onClick={exportCsv}><Download size={14} /> CSV</button>
      {isProf && !office && sh.status === 'DRAFT' && <button className="btn" onClick={submit}><Send size={14} /> Submit to Registrar of Evaluation</button>}
      {office && sh.status === 'SUBMITTED' && <button className="btn btn-ghost" onClick={() => { patch((s) => { s.status = 'DRAFT' }); notify([sh.evaluatorId], `${course.code} result sheet returned for corrections`, '/results') }}><RotateCcw size={14} /> Return to professor</button>}
      {office && <button className="btn btn-success" onClick={publish}><CheckCircle2 size={14} /> {sh.status === 'PUBLISHED' ? 'Republish' : 'Publish'}</button>}
    </>}>
      <div className="row gap wrap small">
        <span>Evaluator: <strong>{userName(db, sh.evaluatorId)}</strong></span>
        <span>External exam: <strong>{exam ? `${exam.title} (${exam.maxMarks} marks, ${fmtDate(exam.date)})` : 'not linked'}</strong></span>
        <span>Internal {sh.internalMax} + External {sh.externalMax} = {sh.internalMax + sh.externalMax}</span>
        <span>Pass: external ≥ {sh.minExternalPct}% and total ≥ {sh.minTotalPct}%</span>
        <div className="grow" />
        {canEdit && <button className="btn btn-outline btn-sm" onClick={() => setShowSettings((v) => !v)}><Settings2 size={14} /> {showSettings ? 'Hide settings' : 'Internals & settings'}</button>}
      </div>

      {showSettings && canEdit && (
        <div className="card stack" style={{ padding: 14 }}>
          <div className="grid grid-4">
            <Field label="Internal max"><input className="input" type="number" min={0} value={sh.internalMax} onChange={(e) => patch((s) => { s.internalMax = Number(e.target.value) })} /></Field>
            <Field label="External max"><input className="input" type="number" min={0} value={sh.externalMax} onChange={(e) => patch((s) => { s.externalMax = Number(e.target.value) })} /></Field>
            <Field label="Min external %"><input className="input" type="number" min={0} max={100} value={sh.minExternalPct} onChange={(e) => patch((s) => { s.minExternalPct = Number(e.target.value) })} /></Field>
            <Field label="Min total %"><input className="input" type="number" min={0} max={100} value={sh.minTotalPct} onChange={(e) => patch((s) => { s.minTotalPct = Number(e.target.value) })} /></Field>
          </div>
          {office && (
            <div className="grid grid-2">
              <Field label="Evaluator (enters external marks)"><select className="select" value={sh.evaluatorId} onChange={(e) => { const v = e.target.value; patch((s) => { s.evaluatorId = v }); if (exam) update((d) => { d.exams.find((x) => x.id === exam.id)!.evaluatorId = v }); notify([v], `You are the evaluator for ${course.code} ${course.name}`, '/results') }}>{faculty.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></Field>
              <Field label="External exam"><select className="select" value={sh.examId ?? ''} onChange={(e) => { const v = e.target.value || undefined; patch((s) => { s.examId = v }) }}><option value="">Not linked</option>{examOptions.map((e) => <option key={e.id} value={e.id}>{e.title} · {fmtDate(e.date)}</option>)}</select></Field>
            </div>
          )}
          <Field label="Internal marks are made of" hint="Tick the assignments, quizzes and tests that count. Each becomes a column; together they make the internal mark.">
            {all.length === 0 ? <span className="small muted">This course has no assignments, quizzes or tests yet. Type internal marks directly in the Internal column.</span> : (
              <div className="row gap wrap">{all.map((c) => { const k = compKey(c); const on = sh.components.some((x) => compKey(x) === k); const info = componentInfo(db, c); return (
                <label key={k} className={`chip ${on ? 'active' : ''}`} style={{ cursor: 'pointer' }}><input type="checkbox" style={{ display: 'none' }} checked={on} onChange={(e) => toggleComponent(k, e.target.checked)} />{info.short}: {info.label} (/{info.max})</label>
              ) })}</div>
            )}
          </Field>
          <label className="row gap small"><input type="checkbox" checked={sh.scaleInternals} onChange={(e) => patch((s) => { s.scaleInternals = e.target.checked })} /> Scale the selected components to {sh.internalMax} (otherwise add them up, capped at {sh.internalMax})</label>
        </div>
      )}

      <div className="row between wrap gap">
        <SearchBox value={q} onChange={setQ} placeholder="Search student…" />
        <span className="small muted">Type in a cell to change a mark. Highlighted cells are manual edits; clear a cell to go back to the recorded mark.</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Student</th>
              {sh.components.map((c) => { const i = componentInfo(db, c); return <th key={compKey(c)} title={i.label} style={{ textAlign: 'right' }}>{i.short}: {i.label.length > 16 ? `${i.label.slice(0, 15)}…` : i.label}<div className="muted" style={{ textTransform: 'none' }}>/{i.max}</div></th> })}
              <th style={{ textAlign: 'right' }}>Internal<div className="muted" style={{ textTransform: 'none' }}>/{sh.internalMax}</div></th>
              <th style={{ textAlign: 'right' }}>External exam<div className="muted" style={{ textTransform: 'none' }}>/{exam?.maxMarks ?? '—'} → /{sh.externalMax}</div></th>
              <th>Absent</th>
              <th style={{ textAlign: 'right' }}>Final<div className="muted" style={{ textTransform: 'none' }}>/{sh.internalMax + sh.externalMax}</div></th>
              <th>Grade</th><th>Result</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.student.id}>
                <td>{r.student.name}<div className="small muted">{r.student.rollNo}{r.backlogAttempt && <> · <Badge tone="warning">Backlog</Badge></>}</div></td>
                {r.components.map((c) => (
                  <td key={c.key} style={{ textAlign: 'right' }}>
                    <input className={`sheet-input ${c.overridden ? 'overridden' : ''}`} type="number" min={0} max={c.max} disabled={!canEdit} aria-label={`${r.student.name} ${c.key}`}
                      value={c.value ?? ''} placeholder="—"
                      onChange={(e) => { const n = num(e.target.value); setOverride(r.student.id, (o) => { o.components = { ...(o.components ?? {}) }; if (n === undefined) delete o.components[c.key]; else o.components[c.key] = Math.min(c.max, n); if (!Object.keys(o.components).length) delete o.components }) }} />
                  </td>
                ))}
                <td style={{ textAlign: 'right' }}>
                  <input className={`sheet-input ${r.internalOverridden ? 'overridden' : ''}`} type="number" min={0} max={sh.internalMax} step="0.5" disabled={!canEdit} aria-label={`${r.student.name} internal`}
                    value={r.internal} title={r.internalRawMax ? `${r.internalRaw}/${r.internalRawMax} from components` : 'Type the internal mark'}
                    onChange={(e) => { const n = num(e.target.value); setOverride(r.student.id, (o) => { o.internal = n === undefined ? undefined : Math.min(sh.internalMax, n) }) }} />
                  {r.internalOverridden && canEdit && <button className="icon-btn" style={{ width: 22, height: 22 }} title="Use the components' total" onClick={() => setOverride(r.student.id, (o) => { o.internal = undefined })}><RotateCcw size={12} /></button>}
                </td>
                <td style={{ textAlign: 'right' }}>
                  <input className="sheet-input" type="number" min={0} max={exam?.maxMarks} disabled={!canExternal || !exam || r.absent} aria-label={`${r.student.name} external`}
                    value={r.externalRaw ?? ''} placeholder={exam ? '—' : 'n/a'} onChange={(e) => setExternal(r.student.id, e.target.value)} />
                  <div className="small muted">{r.external !== undefined ? `= ${r.external}` : ''}</div>
                </td>
                <td><input type="checkbox" disabled={!canExternal} checked={r.absent} onChange={(e) => setOverride(r.student.id, (o) => { o.absent = e.target.checked || undefined })} aria-label={`${r.student.name} absent`} /></td>
                <td style={{ textAlign: 'right' }}><strong>{r.final ?? '—'}</strong></td>
                <td>{r.grade ? <Badge tone={r.pass ? 'success' : 'danger'}>{r.grade}</Badge> : '—'}</td>
                <td>{r.pass === undefined ? <span className="muted small">Pending</span> : <Badge tone={r.pass ? 'success' : 'danger'}>{r.pass ? 'Pass' : 'Fail'}</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <Empty text="No students on this sheet." />}
      </div>
    </Modal>
  )
}
