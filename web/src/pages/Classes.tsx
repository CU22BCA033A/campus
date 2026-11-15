import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowUpCircle, Download, GraduationCap, Pencil, Plus, Printer, Users } from 'lucide-react'
import { audit, notify, uid, update, useCurrentUser, useDB } from '../data/store'
import { Avatar, Badge, Card, Empty, Field, Modal, PageHeader, Stat, Tabs } from '../components/ui'
import EditUser from '../components/EditUser'
import { can } from '../access'
import { backlogCountOf, cgpaOf, fmtCgpa } from '../academics'
import { classAnalysis, classColor, classCourses, classLabel, classResults, classStudents, promoteClass, resyncRosters } from '../classes'
import { attendanceStats, matches, userName } from '../lib'
import type { ClassGroup, Course, User } from '../data/types'
import { FilterBar, opts, useFilters } from '../components/Filters'

const PROGRAMS = ['BCA', 'BBA', 'B.Sc Data Science', 'B.Com']

export default function Classes() {
  const db = useDB()
  const me = useCurrentUser()!
  const manage = can(me, 'manageClasses')
  // Other pages can open a class's tab directly: /classes?class=<id>&tab=results
  const [params] = useSearchParams()
  const [classId, setClassId] = useState(db.classes.some((c) => c.id === params.get('class')) ? params.get('class')! : db.classes[0]?.id ?? '')
  const [tab, setTab] = useState<'students' | 'courses' | 'results'>((['students', 'courses', 'results'] as const).find((t) => t === params.get('tab')) ?? 'students')
  // Follow links that change the class/tab while this page is already open.
  const qClass = params.get('class'), qTab = params.get('tab')
  const [seen, setSeen] = useState(`${qClass}|${qTab}`)
  if (seen !== `${qClass}|${qTab}`) {
    setSeen(`${qClass}|${qTab}`)
    if (qClass && db.classes.some((c) => c.id === qClass)) setClassId(qClass)
    const t = (['students', 'courses', 'results'] as const).find((x) => x === qTab); if (t) setTab(t)
  }
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<User | null>(null)
  const [newClass, setNewClass] = useState(false)
  const [cDraft, setCDraft] = useState({ program: 'BCA', batch: new Date().getFullYear(), section: 'A', semester: 1, maxSemesters: 6, mentorId: '' })
  const [courseDraft, setCourseDraft] = useState<Partial<Course> | null>(null)
  const [promoting, setPromoting] = useState(false)
  const [detained, setDetained] = useState<string[]>([])
  const faculty = db.users.filter((u) => u.role === 'faculty' && u.status === 'ACTIVE')

  const cls = db.classes.find((c) => c.id === classId)
  const cf = useFilters(['programme', 'batch', 'semester', 'mentor'] as const)
  const classDefs = [
    { key: 'programme' as const, label: 'Programmes', options: opts(db.classes.map((c) => c.program)) },
    { key: 'batch' as const, label: 'Batches', options: opts(db.classes.map((c) => c.batch), (v) => `Batch ${v}`) },
    { key: 'semester' as const, label: 'Semesters', options: opts(db.classes.map((c) => c.semester), (v) => `Semester ${v}`) },
    { key: 'mentor' as const, label: 'Mentors', options: opts(db.classes.map((c) => c.mentorId), (v) => userName(db, v)) },
  ]
  const visibleClasses = db.classes.filter((c) => cf.ok('programme', c.program) && cf.ok('batch', c.batch) && cf.ok('semester', c.semester) && cf.ok('mentor', c.mentorId)).filter((c) => matches(q, classLabel(c), userName(db, c.mentorId ?? ''), ...classStudents(db, c.id).map((s) => `${s.name} ${s.rollNo}`)))

  const createClass = () => {
    const id = `cls-${cDraft.program.toLowerCase().replace(/[^a-z]/g, '')}-${cDraft.batch}-${cDraft.section.toLowerCase()}`
    if (db.classes.some((c) => c.id === id)) return alert('That class already exists.')
    update((d) => { d.classes.push({ id, ...cDraft, mentorId: cDraft.mentorId || undefined }) })
    audit(me.id, 'CLASS_CREATE', classLabel({ id, ...cDraft }))
    setClassId(id); setNewClass(false)
  }
  const saveCourse = () => {
    if (!cls || !courseDraft?.code || !courseDraft.name || !courseDraft.facultyId) return alert('Enter a code, name and teacher.')
    if (db.courses.some((c) => c.code === courseDraft.code && c.id !== courseDraft.id && c.classId === cls.id)) return alert('This class already has a course with that code.')
    const isNew = !courseDraft.id
    const prevTeacher = db.courses.find((c) => c.id === courseDraft.id)?.facultyId
    update((d) => {
      if (isNew) d.courses.push({ id: uid('c'), code: courseDraft.code!, name: courseDraft.name!, facultyId: courseDraft.facultyId!, credits: courseDraft.credits ?? 4, semester: cls.semester, description: courseDraft.description ?? '', studentIds: [], classId: cls.id })
      else Object.assign(d.courses.find((c) => c.id === courseDraft.id)!, courseDraft)
      resyncRosters(d)
    })
    if (isNew || prevTeacher !== courseDraft.facultyId) notify([courseDraft.facultyId], `You are assigned to teach ${courseDraft.code} ${courseDraft.name} for ${classLabel(cls)}`, '/courses')
    audit(me.id, isNew ? 'COURSE_CREATE' : 'COURSE_EDIT', `${courseDraft.code} ${courseDraft.name} → ${classLabel(cls)}, teacher ${userName(db, courseDraft.facultyId)}`)
    setCourseDraft(null)
  }

  return (
    <>
      <PageHeader title="Classes" subtitle="Students grouped by programme, batch and section, with each class's courses, teachers and results"
        search={{ value: q, onChange: setQ, placeholder: 'Search class, student or roll no.' }}
        actions={manage && <button className="btn" onClick={() => setNewClass(true)}><Plus size={14} /> New class</button>} />

      <FilterBar defs={classDefs} f={cf} count={visibleClasses.length} noun="class" />
      <div className="class-grid">
        {visibleClasses.map((c) => {
          const n = classStudents(db, c.id).filter((s) => s.status === 'ACTIVE').length
          const r = classResults(db, c)
          return (
            <button key={c.id} className={`class-tile ${c.id === classId ? 'active' : ''}`} style={{ '--tile': classColor(c).fg, '--tile-bg': classColor(c).bg } as React.CSSProperties} onClick={() => setClassId(c.id)} aria-pressed={c.id === classId}>
              <span className="class-tile-title"><span>{c.program} {c.batch} · {c.section}</span><span className="class-tile-sem">Sem {c.semester}</span></span>
              <span className="class-tile-meta">{n} students · {classCourses(db, c).length} courses</span>
              <span className="class-tile-meta">Mentor: {c.mentorId ? userName(db, c.mentorId) : '—'}</span>
              {r.ready && !c.promotedAt && <span className="class-tile-flag">✓ Results published · ready to promote</span>}
            </button>
          )
        })}
        {visibleClasses.length === 0 && <Card><Empty text="No class matches your search." /></Card>}
      </div>

      {cls && (
        <>
          <Tabs value={tab} onChange={setTab} tabs={[{ id: 'students', label: 'Students', count: classStudents(db, cls.id).length }, { id: 'courses', label: 'Courses & teachers', count: classCourses(db, cls).length }, { id: 'results', label: 'Results & promotion' }]} />
          {tab === 'students' && <ClassStudents cls={cls} q={q} onEdit={setEditing} />}
          {tab === 'courses' && (
            <Card title={`${classLabel(cls)}: courses this semester`} action={manage && <button className="btn btn-sm" onClick={() => setCourseDraft({ credits: 4, facultyId: faculty[0]?.id })}><Plus size={14} /> Create course</button>}>
              {classCourses(db, cls).length === 0 ? <Empty text={`No courses for Semester ${cls.semester} yet.${manage ? ' Create them and assign teachers.' : ''}`} /> : (
                <div className="table-wrap"><table>
                  <thead><tr><th>Code</th><th>Course</th><th>Credits</th><th>Teacher</th><th>Students</th>{manage && <th />}</tr></thead>
                  <tbody>{classCourses(db, cls).filter((c) => matches(q, c.code, c.name, userName(db, c.facultyId)) || !q).map((c) => (
                    <tr key={c.id}>
                      <td><strong>{c.code}</strong></td><td><Link to={`/courses/${c.id}`}>{c.name}</Link></td><td>{c.credits}</td>
                      <td>{manage ? (
                        <select className="select" style={{ width: 'auto' }} value={c.facultyId} onChange={(e) => { const fid = e.target.value; update((d) => { d.courses.find((x) => x.id === c.id)!.facultyId = fid }); notify([fid], `You are assigned to teach ${c.code} ${c.name} for ${classLabel(cls)}`, '/courses'); audit(me.id, 'TEACHER_ASSIGN', `${c.code} → ${userName(db, fid)}`) }}>
                          {faculty.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                        </select>
                      ) : userName(db, c.facultyId)}</td>
                      <td>{c.studentIds.length}</td>
                      {manage && <td><button className="btn btn-ghost btn-sm" onClick={() => setCourseDraft({ ...c })}><Pencil size={12} /> Edit</button></td>}
                    </tr>
                  ))}</tbody>
                </table></div>
              )}
              {manage && (
                <div className="row gap wrap" style={{ marginTop: 12 }}>
                  <Field label="Class mentor">
                    <select className="select" value={cls.mentorId ?? ''} onChange={(e) => { const v = e.target.value || undefined; update((d) => { d.classes.find((x) => x.id === cls.id)!.mentorId = v }) }}>
                      <option value="">None</option>{faculty.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                  </Field>
                </div>
              )}
            </Card>
          )}
          {tab === 'results' && <ClassResultsView cls={cls} q={q} onPromote={() => { setDetained(classResults(db, cls).rows.filter((r) => r.failed >= 3).map((r) => r.student.id)); setPromoting(true) }} />}
        </>
      )}

      {editing && <EditUser user={editing} onClose={() => setEditing(null)} />}
      {newClass && (
        <Modal title="New class" onClose={() => setNewClass(false)} footer={<><button className="btn btn-ghost" onClick={() => setNewClass(false)}>Cancel</button><button className="btn" onClick={createClass}>Create class</button></>}>
          <div className="grid grid-2">
            <Field label="Programme"><select className="select" value={cDraft.program} onChange={(e) => setCDraft({ ...cDraft, program: e.target.value })}>{PROGRAMS.map((p) => <option key={p}>{p}</option>)}</select></Field>
            <Field label="Batch (admission year)"><input className="input" type="number" value={cDraft.batch} onChange={(e) => setCDraft({ ...cDraft, batch: Number(e.target.value) })} /></Field>
            <Field label="Section"><input className="input" value={cDraft.section} onChange={(e) => setCDraft({ ...cDraft, section: e.target.value.toUpperCase() })} /></Field>
            <Field label="Current semester"><input className="input" type="number" min={1} value={cDraft.semester} onChange={(e) => setCDraft({ ...cDraft, semester: Number(e.target.value) })} /></Field>
            <Field label="Total semesters"><input className="input" type="number" min={1} value={cDraft.maxSemesters} onChange={(e) => setCDraft({ ...cDraft, maxSemesters: Number(e.target.value) })} /></Field>
            <Field label="Class mentor"><select className="select" value={cDraft.mentorId} onChange={(e) => setCDraft({ ...cDraft, mentorId: e.target.value })}><option value="">None</option>{faculty.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></Field>
          </div>
        </Modal>
      )}
      {courseDraft && cls && (
        <Modal title={courseDraft.id ? `Edit ${courseDraft.code}` : `New course for ${classLabel(cls)}`} onClose={() => setCourseDraft(null)} footer={<><button className="btn btn-ghost" onClick={() => setCourseDraft(null)}>Cancel</button><button className="btn" onClick={saveCourse}>{courseDraft.id ? 'Save' : 'Create & assign'}</button></>}>
          <div className="grid grid-2">
            <Field label="Course code"><input className="input" value={courseDraft.code ?? ''} placeholder={`${cls.program}${cls.semester}01`} onChange={(e) => setCourseDraft({ ...courseDraft, code: e.target.value.toUpperCase() })} /></Field>
            <Field label="Credits"><input className="input" type="number" min={1} max={8} value={courseDraft.credits ?? 4} onChange={(e) => setCourseDraft({ ...courseDraft, credits: Number(e.target.value) })} /></Field>
          </div>
          <Field label="Course name"><input className="input" value={courseDraft.name ?? ''} onChange={(e) => setCourseDraft({ ...courseDraft, name: e.target.value })} /></Field>
          <Field label="Teacher" hint="The teacher gets this class's students for attendance, assignments, quizzes and marks"><select className="select" value={courseDraft.facultyId ?? ''} onChange={(e) => setCourseDraft({ ...courseDraft, facultyId: e.target.value })}>{faculty.map((f) => <option key={f.id} value={f.id}>{f.name} · {f.department}</option>)}</select></Field>
          <Field label="Description"><textarea className="textarea" value={courseDraft.description ?? ''} onChange={(e) => setCourseDraft({ ...courseDraft, description: e.target.value })} /></Field>
        </Modal>
      )}
      {promoting && cls && (() => {
        const r = classResults(db, cls)
        const final = cls.semester >= cls.maxSemesters
        return (
          <Modal title={final ? `Graduate ${classLabel(cls)}` : `Promote ${classLabel(cls)} to Semester ${cls.semester + 1}`} onClose={() => setPromoting(false)} footer={<><button className="btn btn-ghost" onClick={() => setPromoting(false)}>Cancel</button><button className="btn" onClick={() => { promoteAndClose(cls.id, detained) }}>{final ? 'Graduate class' : `Promote ${r.rows.length - detained.length} student(s)`}</button></>}>
            <p className="small">Failed courses were recorded as backlogs when results were published (re-register them under Results → Backlog registration). CGPA is updated with this semester's SGPA. Ticked students are <strong>detained</strong>: they stay in Semester {cls.semester} in a repeat section ({cls.section}-R).</p>
            <div className="stack" style={{ gap: 6 }}>{r.rows.map((row) => (
              <label key={row.student.id} className="row gap">
                <input type="checkbox" checked={detained.includes(row.student.id)} onChange={(e) => setDetained(e.target.checked ? [...detained, row.student.id] : detained.filter((x) => x !== row.student.id))} />
                <span className="grow">{row.student.name} <span className="muted small">{row.student.rollNo}</span></span>
                <span className="small">SGPA {row.sgpa?.toFixed(2) ?? '—'}</span>
                <Badge tone={row.failed ? 'danger' : 'success'}>{row.failed ? `${row.failed} failed` : 'Pass'}</Badge>
              </label>
            ))}</div>
          </Modal>
        )
      })()}
    </>
  )

  function promoteAndClose(id: string, det: string[]) {
    const c = db.classes.find((x) => x.id === id)!
    const ids = classStudents(db, id).map((s) => s.id)
    update((d) => promoteClass(d, id, det, me.id))
    notify(ids.filter((x) => !det.includes(x)), c.semester >= c.maxSemesters ? 'Congratulations, you have graduated!' : `You have been promoted to Semester ${c.semester + 1}`, '/home')
    notify(det, `You have been detained in Semester ${c.semester}. Contact the Registrar of Evaluation.`, '/exams')
    setPromoting(false)
  }
}

function ClassStudents({ cls, q, onEdit }: { cls: ClassGroup; q: string; onEdit: (u: User) => void }) {
  const db = useDB()
  const me = useCurrentUser()!
  const students = classStudents(db, cls.id).filter((s) => matches(q, s.name, s.rollNo, s.email, s.phone) || matches(q, classLabel(cls)))
  return (
    <Card title={<span className="row gap"><Users size={16} /> {classLabel(cls)}</span>} action={<span className="small muted">{students.length} students</span>}>
      {students.length === 0 ? <Empty text="No students in this class." /> : (
        <div className="table-wrap"><table>
          <thead><tr><th>Student</th><th>Roll no.</th><th>Attendance</th><th>CGPA</th><th>Backlogs</th><th>Status</th><th /></tr></thead>
          <tbody>{students.map((s) => { const a = attendanceStats(db, s.id); return (
            <tr key={s.id}>
              <td><div className="row gap"><Avatar name={s.name} color={s.avatarColor} size={28} /><Link to={`/people/${s.id}`}>{s.name}</Link></div></td>
              <td>{s.rollNo}</td>
              <td><Badge tone={a.pct >= 75 ? 'success' : a.pct >= 65 ? 'warning' : 'danger'}>{a.total ? `${a.pct}%` : '—'}</Badge></td>
              <td>{fmtCgpa(cgpaOf(db, s))}</td><td>{backlogCountOf(s)}</td>
              <td><Badge tone={s.status === 'ACTIVE' ? 'success' : 'danger'}>{s.status}</Badge></td>
              <td>{can(me, 'editStudentProfiles') && <button className="btn btn-outline btn-sm" onClick={() => onEdit(s)}><Pencil size={12} /> Edit</button>}</td>
            </tr>
          ) })}</tbody>
        </table></div>
      )}
    </Card>
  )
}

function ClassResultsView({ cls, q, onPromote }: { cls: ClassGroup; q: string; onPromote: () => void }) {
  const db = useDB()
  const me = useCurrentUser()!
  const [sem, setSem] = useState(cls.semester)
  const semester = Math.min(sem, cls.semester)
  const r = classResults(db, cls, semester)
  const an = classAnalysis(r)
  const current = semester === cls.semester
  const canPromote = can(me, 'promoteStudents') && current
  // Marks before publication are visible only to the Registrar of Evaluation.
  const seesDrafts = can(me, 'manageResults')
  const rank = (id: string) => an.rankOf.get(id) ?? 999
  const rows = r.rows.filter((x) => matches(q, x.student.name, x.student.rollNo) || matches(q, classLabel(cls)))
    .sort((a, b) => (r.ready ? rank(a.student.id) - rank(b.student.id) || (b.sgpa ?? 0) - (a.sgpa ?? 0) : 0) || (a.student.rollNo ?? '').localeCompare(b.student.rollNo ?? ''))
  const anyPublished = r.sheets.some((e) => e.sheet?.status === 'PUBLISHED')
  const pastSems = Array.from({ length: cls.semester }, (_, i) => i + 1).filter((s) => db.courses.some((c) => c.classId === cls.id && c.semester === s))

  const exportCsv = () => {
    const lines = [['Rank', 'Roll no', 'Name', ...r.courses.map((c) => c.code), 'SGPA', 'CGPA', 'Result'], ...r.rows.map((x) => [String(an.rankOf.get(x.student.id) ?? ''), x.student.rollNo ?? '', x.student.name, ...x.cells.map((c) => (c.published && c.final !== undefined ? `${c.final} (${c.grade ?? '-'})` : '')), x.sgpa?.toFixed(2) ?? '', fmtCgpa(cgpaOf(db, x.student)), x.failed ? `${x.failed} failed` : 'Pass'])]
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([lines.map((l) => l.join(',')).join('\n')], { type: 'text/csv' })); a.download = `${cls.id}-sem${semester}-results.csv`; a.click()
  }
  const maxGrade = Math.max(1, ...an.grades.map((g) => g.count))

  return (
    <>
      <div className="row gap wrap no-print">
        <span className="small muted">Semester</span>
        {pastSems.map((s) => <button key={s} className={`chip ${s === semester ? 'active' : ''}`} onClick={() => setSem(s)}>Sem {s}{s === cls.semester ? ' (current)' : ''}</button>)}
      </div>
      <div className="grid grid-4">
        <Stat label="Results published" value={`${r.sheets.filter((e) => e.sheet?.status === 'PUBLISHED').length}/${r.courses.length}`} tone={r.ready ? 'success' : 'warning'} />
        <Stat label="Pass percentage" value={r.ready && an.passPct !== null ? `${Math.round(an.passPct)}%` : '—'} hint={r.ready ? `${r.rows.filter((x) => x.failed === 0 && x.sgpa !== null).length} of ${r.rows.length} passed every course` : 'After all results are published'} tone="success" />
        <Stat label="Class average SGPA" value={an.avgSgpa !== null && anyPublished ? an.avgSgpa.toFixed(2) : '—'} tone="info" />
        <Stat label="With backlogs" value={r.ready ? r.rows.filter((x) => x.failed > 0).length : '—'} tone="danger" />
      </div>
      {!r.ready && (
        <div className="alert alert-warning">
          {current ? 'Promotion unlocks once every course\'s result sheet is published.' : 'Some results of this semester are not published.'}
          {r.missingExam.length > 0 && <> No result sheet yet for: <strong>&nbsp;{r.missingExam.join(', ')}</strong>.</>}
          {r.unpublished.length > 0 && <> Not yet published: <strong>&nbsp;{r.unpublished.join(', ')}</strong>.</>}
        </div>
      )}
      <Card className="print-area" title={`${classLabel(cls).replace(/Sem \d+/, `Sem ${semester}`)}: class result`} action={<div className="row gap no-print">
        <button className="btn btn-outline btn-sm" onClick={() => window.print()}><Printer size={14} /> Print</button>
        <button className="btn btn-outline btn-sm" onClick={exportCsv}><Download size={14} /> CSV</button>
        <Link to="/results" className="btn btn-outline btn-sm">Result sheets</Link>
        {canPromote && <button className="btn btn-sm" disabled={!r.ready} onClick={onPromote}>{cls.semester >= cls.maxSemesters ? <><GraduationCap size={14} /> Graduate</> : <><ArrowUpCircle size={14} /> Promote to Sem {cls.semester + 1}</>}</button>}
      </div>}>
        {r.courses.length === 0 ? <Empty text="No courses in this semester." /> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Rank</th><th>Student</th>{r.courses.map((c) => <th key={c.id} title={`${c.name} · ${c.credits} credits`}>{c.code}</th>)}<th>SGPA</th><th>CGPA</th><th>Result</th></tr></thead>
            <tbody>{rows.map((x) => (
              <tr key={x.student.id}>
                <td>{r.ready && an.rankOf.has(x.student.id) ? <strong>{an.rankOf.get(x.student.id)}</strong> : <span className="muted">—</span>}</td>
                <td>{x.student.name}<div className="small muted">{x.student.rollNo}</div></td>
                {x.cells.map((c) => <td key={c.course.id}>{c.final !== undefined && (c.published || seesDrafts) ? <span title={`Internal ${c.internal} + External ${c.external}`}>{c.final}/{c.max} {c.published ? c.grade && <Badge tone={c.grade === 'F' || c.grade === 'AB' ? 'danger' : 'success'}>{c.grade}</Badge> : <Badge>Draft</Badge>}</span> : <span className="muted">—</span>}</td>)}
                <td><strong>{x.sgpa?.toFixed(2) ?? '—'}</strong></td>
                <td>{fmtCgpa(cgpaOf(db, x.student))}</td>
                <td>{r.ready ? <Badge tone={x.failed ? 'danger' : 'success'}>{x.failed ? `${x.failed} backlog(s)` : 'Pass'}</Badge> : <Badge>Pending</Badge>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>
      {anyPublished && (
        <div className="grid grid-3">
          <Card title="Toppers">
            {an.toppers.length === 0 ? <Empty text="Ranks appear when every result is published." /> : <div className="list">{an.toppers.map((x) => (
              <div key={x.student.id} className="list-item"><span className="rank-medal">{an.rankOf.get(x.student.id)}</span><div className="grow"><strong>{x.student.name}</strong><div className="small muted">{x.student.rollNo}</div></div><strong>{x.sgpa?.toFixed(2)}</strong></div>
            ))}</div>}
          </Card>
          <Card title="Grade distribution">
            <div className="stack" style={{ gap: 6 }}>{an.grades.map((g) => (
              <div key={g.grade} className="grade-bar"><span className="grade-bar-label">{g.grade}</span><span className="grade-bar-track"><span className={`grade-bar-fill ${g.grade === 'F' || g.grade === 'AB' ? 'bad' : ''}`} style={{ width: `${(g.count / maxGrade) * 100}%` }} /></span><span className="small">{g.count}</span></div>
            ))}</div>
          </Card>
          <Card title="Course-wise analysis">
            <div className="list">{an.perCourse.map((p) => (
              <div key={p.course.id} className="list-item"><div className="grow"><strong>{p.course.code}</strong> <span className="small muted">{p.course.name}</span><div className="small muted">Average {p.avg === null ? '—' : `${p.avg.toFixed(1)}/${p.max}`} · Highest {p.high ?? '—'}</div></div>{p.passPct !== null ? <Badge tone={p.passPct === 100 ? 'success' : p.passPct >= 75 ? 'warning' : 'danger'}>{Math.round(p.passPct)}% pass</Badge> : <Badge>Not published</Badge>}</div>
            ))}</div>
          </Card>
        </div>
      )}
      {cls.promotedAt && <div className="small muted">Last promoted {new Date(cls.promotedAt).toLocaleString('en-IN')}.</div>}
    </>
  )
}
