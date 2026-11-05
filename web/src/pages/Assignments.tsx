import { useState } from 'react'
import { ChevronLeft, ChevronRight, ClipboardList, Download, Eye, Paperclip, Plus, Upload } from 'lucide-react'
import { audit, getDB, notify, uid, update, useCurrentUser, useDB } from '../data/store'
import { Avatar, Badge, Card, Empty, Field, Modal, PageHeader, Tabs } from '../components/ui'
import { courseName, coursesFor, fmtDateTime, matches, timeAgo, userName } from '../lib'
import type { Assignment, Submission } from '../data/types'

const MAX_INLINE_BYTES = 2 * 1024 * 1024 // attachments up to 2 MB are kept so the teacher can open them

const readAsDataUrl = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(f) })

export default function Assignments() {
  const user = useCurrentUser()!
  return user.role === 'student' ? <StudentAssignments /> : <FacultyAssignments />
}

function Attachment({ s }: { s: Submission }) {
  if (!s.fileName) return null
  return s.fileData
    ? <a className="btn btn-outline btn-sm" href={s.fileData} download={s.fileName} target="_blank" rel="noreferrer"><Download size={12} /> {s.fileName}</a>
    : <span className="small muted row gap"><Paperclip size={12} /> {s.fileName} (file not stored in demo)</span>
}

function StudentAssignments() {
  const db = useDB()
  const user = useCurrentUser()!
  const courses = coursesFor(db, user)
  const [tab, setTab] = useState<'pending' | 'submitted' | 'graded'>('pending')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<Assignment | null>(null)
  const [viewing, setViewing] = useState<Submission | null>(null)
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [err, setErr] = useState('')

  const all = db.assignments.filter((a) => courses.some((c) => c.id === a.courseId) && matches(q, a.title, a.description, courseName(db, a.courseId))).sort((a, b) => a.dueAt - b.dueAt)
  const subOf = (a: Assignment) => db.submissions.find((s) => s.assignmentId === a.id && s.studentId === user.id)
  const lists = {
    pending: all.filter((a) => !subOf(a)),
    submitted: all.filter((a) => subOf(a) && subOf(a)!.marks === undefined),
    graded: all.filter((a) => subOf(a)?.marks !== undefined),
  }

  const startSubmit = (a: Assignment) => { const s = subOf(a); setOpen(a); setText(s?.text ?? ''); setFile(null); setErr('') }
  const submit = async () => {
    if (!open || (!text.trim() && !file && !subOf(open)?.fileName)) return
    let fileData: string | undefined
    if (file) {
      if (file.size > 20 * 1024 * 1024) return setErr('Files must be 20 MB or smaller.')
      if (file.size <= MAX_INLINE_BYTES) fileData = await readAsDataUrl(file)
    }
    const existing = subOf(open)
    update((d) => {
      if (existing) Object.assign(d.submissions.find((x) => x.id === existing.id)!, { text, submittedAt: Date.now(), ...(file ? { fileName: file.name, fileData } : {}) })
      else d.submissions.push({ id: uid('sub'), assignmentId: open.id, studentId: user.id, text, fileName: file?.name, fileData, submittedAt: Date.now() })
    })
    const fac = db.courses.find((c) => c.id === open.courseId)!.facultyId
    notify([fac], `${user.name} ${existing ? 'resubmitted' : 'submitted'} "${open.title}"`, '/assignments')
    setOpen(null)
  }

  return (
    <>
      <PageHeader title="Assignments" subtitle="Submit your work and see marks and feedback" search={{ value: q, onChange: setQ, placeholder: 'Search assignments or courses…' }} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'pending', label: 'Pending', count: lists.pending.length }, { id: 'submitted', label: 'Submitted', count: lists.submitted.length }, { id: 'graded', label: 'Graded', count: lists.graded.length }]} />
      <div className="stack">
        {lists[tab].length === 0 && <Card><Empty icon={<ClipboardList />} text="Nothing here." /></Card>}
        {lists[tab].map((a) => {
          const s = subOf(a)
          const late = a.dueAt < Date.now()
          return (
            <Card key={a.id}>
              <div className="row between wrap gap">
                <div className="grow">
                  <div className="row gap wrap"><h3>{a.title}</h3><Badge tone="brand">{courseName(db, a.courseId)}</Badge></div>
                  <p className="muted small" style={{ marginTop: 4 }}>{a.description}</p>
                  <div className="small" style={{ marginTop: 8 }}>Due <strong>{fmtDateTime(a.dueAt)}</strong> · {a.maxMarks} marks</div>
                </div>
                {!s && <div className="stack" style={{ alignItems: 'flex-end', gap: 6 }}><Badge tone={late ? 'danger' : 'warning'}>{late ? 'Overdue' : `Due ${timeAgo(a.dueAt)}`}</Badge><button className="btn" onClick={() => startSubmit(a)}><Upload size={14} /> Submit</button></div>}
                {s && s.marks === undefined && <div className="stack" style={{ alignItems: 'flex-end', gap: 6 }}><Badge tone="info">Submitted {timeAgo(s.submittedAt)}</Badge><div className="row gap"><button className="btn btn-ghost btn-sm" onClick={() => setViewing(s)}><Eye size={12} /> View</button><button className="btn btn-outline btn-sm" onClick={() => startSubmit(a)}>Resubmit</button></div></div>}
                {s && s.marks !== undefined && <div style={{ textAlign: 'right' }}><div style={{ fontSize: 22, fontWeight: 700 }}>{s.marks}/{a.maxMarks}</div><Badge tone="success">Graded</Badge> <button className="btn btn-ghost btn-sm" onClick={() => setViewing(s)}><Eye size={12} /> View</button></div>}
              </div>
              {s?.feedback && <div className="alert alert-info" style={{ marginTop: 12 }}><strong>Feedback from {userName(db, s.gradedBy ?? db.courses.find((c) => c.id === a.courseId)!.facultyId)}:</strong>&nbsp;{s.feedback}</div>}
            </Card>
          )
        })}
      </div>
      {open && (
        <Modal title={`${subOf(open) ? 'Resubmit' : 'Submit'}: ${open.title}`} onClose={() => setOpen(null)} footer={<><button className="btn btn-ghost" onClick={() => setOpen(null)}>Cancel</button><button className="btn" onClick={submit} disabled={!text.trim() && !file && !subOf(open)?.fileName}>Submit</button></>}>
          {open.dueAt < Date.now() && <div className="alert alert-warning">This assignment is past its due date and will be marked late.</div>}
          {err && <div className="alert alert-danger">{err}</div>}
          <Field label="Answer / link"><textarea className="textarea" style={{ minHeight: 140 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write your answer or paste a link (e.g. GitHub, Google Drive)" /></Field>
          <Field label="Attach file" hint={subOf(open)?.fileName ? `Current: ${subOf(open)!.fileName}. Choose a file to replace it.` : 'PDF, DOCX, images or ZIP up to 20 MB'}><input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field>
          <div className="small muted">You can resubmit until your teacher marks it. Submissions are checked for originality.</div>
        </Modal>
      )}
      {viewing && (
        <Modal title="My submission" onClose={() => setViewing(null)}>
          <div className="small muted">Submitted {fmtDateTime(viewing.submittedAt)}</div>
          {viewing.text && <div className="card" style={{ whiteSpace: 'pre-wrap' }}>{viewing.text}</div>}
          <Attachment s={viewing} />
        </Modal>
      )}
    </>
  )
}

type RowStatus = 'GRADED' | 'SUBMITTED' | 'LATE' | 'MISSING'

function FacultyAssignments() {
  const db = useDB()
  const user = useCurrentUser()!
  const courses = coursesFor(db, user)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState({ courseId: courses[0]?.id ?? '', title: '', description: '', due: '', maxMarks: 20 })
  const [q, setQ] = useState('')
  const [courseF, setCourseF] = useState('all')
  const [openId, setOpenId] = useState<string | null>(null) // expanded assignment
  const [filter, setFilter] = useState<'all' | RowStatus>('all')
  const [marking, setMarking] = useState<{ assignmentId: string; studentId: string } | null>(null)
  const [marks, setMarks] = useState('')
  const [feedback, setFeedback] = useState('')

  const list = db.assignments.filter((a) => courses.some((c) => c.id === a.courseId) && (courseF === 'all' || a.courseId === courseF) && matches(q, a.title, a.description, courseName(db, a.courseId), ...db.submissions.filter((s) => s.assignmentId === a.id).map((s) => userName(db, s.studentId)))).sort((a, b) => b.dueAt - a.dueAt)

  const rowsFor = (a: Assignment, src = db) => {
    const course = src.courses.find((c) => c.id === a.courseId)!
    return course.studentIds.map((sid) => {
      const s = src.submissions.find((x) => x.assignmentId === a.id && x.studentId === sid)
      const status: RowStatus = s?.marks !== undefined ? 'GRADED' : s ? (s.submittedAt > a.dueAt ? 'LATE' : 'SUBMITTED') : 'MISSING'
      return { student: src.users.find((u) => u.id === sid)!, sub: s, status }
    })
  }

  const create = () => {
    if (!draft.title || !draft.due) return
    const a = { id: uid('as'), courseId: draft.courseId, title: draft.title, description: draft.description, dueAt: new Date(draft.due).getTime(), maxMarks: Number(draft.maxMarks) }
    update((d) => { d.assignments.push(a) })
    notify(db.courses.find((c) => c.id === draft.courseId)!.studentIds, `New assignment: ${a.title}`, '/assignments')
    setCreating(false); setDraft({ ...draft, title: '', description: '', due: '' })
  }

  const openMarking = (assignmentId: string, studentId: string) => {
    const s = getDB().submissions.find((x) => x.assignmentId === assignmentId && x.studentId === studentId)
    setMarking({ assignmentId, studentId }); setMarks(s?.marks !== undefined ? String(s.marks) : ''); setFeedback(s?.feedback ?? '')
  }
  const saveMark = (andNext: boolean) => {
    if (!marking) return
    const a = db.assignments.find((x) => x.id === marking.assignmentId)!
    if (marks === '' || isNaN(Number(marks))) return alert('Enter marks.')
    const n = Math.max(0, Math.min(a.maxMarks, Number(marks)))
    update((d) => {
      let s = d.submissions.find((x) => x.assignmentId === a.id && x.studentId === marking.studentId)
      if (!s) { s = { id: uid('sub'), assignmentId: a.id, studentId: marking.studentId, text: '', submittedAt: 0 }; d.submissions.push(s) } // marking a non-submission
      s.marks = n; s.feedback = feedback || undefined; s.gradedBy = user.id; s.gradedAt = Date.now()
    })
    notify([marking.studentId], `"${a.title}" marked: ${n}/${a.maxMarks}`, '/assignments')
    audit(user.id, 'ASSIGNMENT_MARK', `${a.title}: ${userName(db, marking.studentId)} ${n}/${a.maxMarks}`)
    if (andNext) step(1, true); else setMarking(null)
  }
  /** Move to the previous/next student (optionally only those still to mark). */
  const step = (dir: 1 | -1, unmarkedOnly = false) => {
    if (!marking) return
    const fresh = getDB() // read after any save made just before stepping
    const a = fresh.assignments.find((x) => x.id === marking.assignmentId)!
    const rows = rowsFor(a, fresh)
    let i = rows.findIndex((r) => r.student.id === marking.studentId)
    for (let k = 1; k < rows.length; k++) {
      i = (i + dir + rows.length) % rows.length
      const r = rows[i]
      if (!unmarkedOnly || (r.status !== 'GRADED' && r.status !== 'MISSING')) return openMarking(a.id, r.student.id)
    }
    if (!unmarkedOnly) return
    setMarking(null) // nothing left to mark
  }

  const m = marking && { a: db.assignments.find((x) => x.id === marking.assignmentId)!, st: db.users.find((u) => u.id === marking.studentId)!, s: db.submissions.find((x) => x.assignmentId === marking.assignmentId && x.studentId === marking.studentId) }

  return (
    <>
      <PageHeader title="Assignments" subtitle="Create assignments, view each student's work and mark it" search={{ value: q, onChange: setQ, placeholder: 'Search assignment or student…' }}
        actions={<>
          <select className="select" style={{ width: 'auto' }} value={courseF} onChange={(e) => setCourseF(e.target.value)} aria-label="Filter by course"><option value="all">All my courses</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</select>
          <button className="btn" onClick={() => setCreating(true)}><Plus size={14} /> New assignment</button>
        </>} />
      {list.length === 0 && <Card><Empty icon={<ClipboardList />} text="No assignments." /></Card>}
      <div className="stack">
        {list.map((a) => {
          const course = db.courses.find((c) => c.id === a.courseId)!
          const rows = rowsFor(a)
          const count = (st: RowStatus) => rows.filter((r) => r.status === st).length
          const expanded = openId === a.id
          const shown = rows.filter((r) => (filter === 'all' || r.status === filter) && (!q || matches(q, r.student.name, r.student.rollNo) || matches(q, a.title)))
          return (
            <Card key={a.id} title={<span>{a.title} <Badge tone="brand">{course.code}</Badge></span>} action={<span className="small muted">Due {fmtDateTime(a.dueAt)} · {a.maxMarks} marks</span>}>
              <div className="row gap wrap small" style={{ marginBottom: 10 }}>
                <Badge tone="info">{rows.length - count('MISSING')}/{rows.length} submitted</Badge>
                <Badge tone="warning">{count('SUBMITTED') + count('LATE')} to mark</Badge>
                <Badge tone="success">{count('GRADED')} marked</Badge>
                {count('MISSING') > 0 && <Badge tone="danger">{count('MISSING')} not submitted</Badge>}
                <div className="grow" />
                {count('SUBMITTED') + count('LATE') > 0 && <button className="btn btn-sm" onClick={() => { const r = rows.find((x) => x.status === 'SUBMITTED' || x.status === 'LATE')!; openMarking(a.id, r.student.id) }}>Start marking</button>}
                <button className="btn btn-outline btn-sm" onClick={() => { setOpenId(expanded ? null : a.id); setFilter('all') }}>{expanded ? 'Hide students' : 'View all students'}</button>
              </div>
              {expanded && (
                <>
                  <div className="row gap wrap" style={{ marginBottom: 8 }}>{(['all', 'SUBMITTED', 'LATE', 'GRADED', 'MISSING'] as const).map((f) => <button key={f} className={`chip ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>{f === 'all' ? 'All' : f === 'MISSING' ? 'Not submitted' : f[0] + f.slice(1).toLowerCase()}</button>)}</div>
                  <div className="table-wrap"><table>
                    <thead><tr><th>Student</th><th>Status</th><th>Submitted</th><th>Answer</th><th>Marks</th><th /></tr></thead>
                    <tbody>{shown.map(({ student, sub, status }) => (
                      <tr key={student.id}>
                        <td><div className="row gap"><Avatar name={student.name} color={student.avatarColor} size={26} /><div>{student.name}<div className="small muted">{student.rollNo}</div></div></div></td>
                        <td><Badge tone={status === 'GRADED' ? 'success' : status === 'MISSING' ? 'danger' : status === 'LATE' ? 'warning' : 'info'}>{status === 'MISSING' ? 'Not submitted' : status[0] + status.slice(1).toLowerCase()}</Badge></td>
                        <td className="small">{sub && sub.submittedAt ? fmtDateTime(sub.submittedAt) : '—'}</td>
                        <td className="ellipsis" style={{ maxWidth: 220 }}>{sub?.fileName && <Paperclip size={12} />} {sub?.text || sub?.fileName || <span className="muted">—</span>}</td>
                        <td>{sub?.marks !== undefined ? <strong>{sub.marks}/{a.maxMarks}</strong> : '—'}</td>
                        <td><button className="btn btn-outline btn-sm" onClick={() => openMarking(a.id, student.id)}>{status === 'MISSING' ? 'Mark' : status === 'GRADED' ? 'View / edit' : 'View & mark'}</button></td>
                      </tr>
                    ))}</tbody>
                  </table></div>
                </>
              )}
            </Card>
          )
        })}
      </div>
      {creating && (
        <Modal title="New assignment" onClose={() => setCreating(false)} footer={<><button className="btn btn-ghost" onClick={() => setCreating(false)}>Cancel</button><button className="btn" onClick={create}>Publish</button></>}>
          <Field label="Course"><select className="select" value={draft.courseId} onChange={(e) => setDraft({ ...draft, courseId: e.target.value })}>{courses.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</select></Field>
          <Field label="Title"><input className="input" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></Field>
          <Field label="Instructions"><textarea className="textarea" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></Field>
          <div className="grid grid-2">
            <Field label="Due"><input className="input" type="datetime-local" value={draft.due} onChange={(e) => setDraft({ ...draft, due: e.target.value })} /></Field>
            <Field label="Max marks"><input className="input" type="number" min={1} value={draft.maxMarks} onChange={(e) => setDraft({ ...draft, maxMarks: Number(e.target.value) })} /></Field>
          </div>
        </Modal>
      )}
      {m && (
        <Modal title={`${m.a.title} · ${m.st.name}`} onClose={() => setMarking(null)} footer={<>
          <button className="btn btn-ghost" onClick={() => step(-1)} aria-label="Previous student"><ChevronLeft size={14} /> Prev</button>
          <button className="btn btn-ghost" onClick={() => step(1)} aria-label="Next student">Next <ChevronRight size={14} /></button>
          <div className="grow" />
          <button className="btn btn-outline" onClick={() => saveMark(false)}>Save</button>
          <button className="btn" onClick={() => saveMark(true)}>Save &amp; next to mark</button>
        </>}>
          <div className="row gap wrap small"><span className="muted">{m.st.rollNo}</span>
            {m.s && m.s.submittedAt ? <><span>Submitted {fmtDateTime(m.s.submittedAt)}</span>{m.s.submittedAt > m.a.dueAt && <Badge tone="danger">Late by {Math.ceil((m.s.submittedAt - m.a.dueAt) / 3_600_000)} h</Badge>}</> : <Badge tone="danger">Not submitted</Badge>}
            {m.s?.gradedAt && <span className="muted">· last marked {timeAgo(m.s.gradedAt)} by {userName(db, m.s.gradedBy ?? '')}</span>}
          </div>
          <div className="stack" style={{ gap: 6 }}>
            <h3>Student's answer</h3>
            {m.s?.text ? <div className="card" style={{ whiteSpace: 'pre-wrap', maxHeight: 260, overflowY: 'auto' }}>{/^https?:\/\//.test(m.s.text.trim()) ? <a href={m.s.text.trim()} target="_blank" rel="noreferrer">{m.s.text}</a> : m.s.text}</div> : <span className="muted small">No written answer.</span>}
            {m.s && <Attachment s={m.s} />}
            {m.s?.fileData?.startsWith('data:image/') && <img src={m.s.fileData} alt={m.s.fileName} style={{ maxWidth: '100%', borderRadius: 8, border: '1px solid var(--border)' }} />}
          </div>
          <div className="grid grid-2">
            <Field label={`Marks (out of ${m.a.maxMarks})`}><input className="input" type="number" min={0} max={m.a.maxMarks} autoFocus value={marks} onChange={(e) => setMarks(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveMark(true)} /></Field>
            <Field label="Quick fill"><div className="row gap wrap">{[1, 0.75, 0.5, 0].map((f) => <button key={f} className="chip" onClick={() => setMarks(String(Math.round(m.a.maxMarks * f)))}>{Math.round(m.a.maxMarks * f)}</button>)}</div></Field>
          </div>
          <Field label="Feedback for the student"><textarea className="textarea" value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="What was good, and what to improve" /></Field>
        </Modal>
      )}
    </>
  )
}
