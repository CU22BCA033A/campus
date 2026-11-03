import { useState } from 'react'
import { ClipboardList, Plus, Upload } from 'lucide-react'
import { notify, uid, update, useCurrentUser, useDB } from '../data/store'
import { Badge, Card, Empty, Field, Modal, PageHeader, Tabs } from '../components/ui'
import { courseName, coursesFor, fmtDateTime, timeAgo, userName } from '../lib'
import type { Assignment, Submission } from '../data/types'

export default function Assignments() {
  const user = useCurrentUser()!
  return user.role === 'student' ? <StudentAssignments /> : <FacultyAssignments />
}

function StudentAssignments() {
  const db = useDB()
  const user = useCurrentUser()!
  const courses = coursesFor(db, user)
  const [tab, setTab] = useState<'pending' | 'submitted' | 'graded'>('pending')
  const [open, setOpen] = useState<Assignment | null>(null)
  const [text, setText] = useState('')
  const [file, setFile] = useState<string>('')

  const all = db.assignments.filter((a) => courses.some((c) => c.id === a.courseId)).sort((a, b) => a.dueAt - b.dueAt)
  const subOf = (a: Assignment) => db.submissions.find((s) => s.assignmentId === a.id && s.studentId === user.id)
  const lists = {
    pending: all.filter((a) => !subOf(a)),
    submitted: all.filter((a) => subOf(a) && subOf(a)!.marks === undefined),
    graded: all.filter((a) => subOf(a)?.marks !== undefined),
  }

  const submit = () => {
    if (!open || (!text.trim() && !file)) return
    update((d) => { d.submissions.push({ id: uid('sub'), assignmentId: open.id, studentId: user.id, text, fileName: file || undefined, submittedAt: Date.now() }) })
    const fac = db.courses.find((c) => c.id === open.courseId)!.facultyId
    notify([fac], `${user.name} submitted "${open.title}"`, '/assignments')
    setOpen(null); setText(''); setFile('')
  }

  return (
    <>
      <PageHeader title="Assignments" subtitle="Submit your work and see feedback" />
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
                {!s && <div className="stack" style={{ alignItems: 'flex-end', gap: 6 }}><Badge tone={late ? 'danger' : 'warning'}>{late ? 'Overdue' : `Due ${timeAgo(a.dueAt)}`}</Badge><button className="btn" onClick={() => setOpen(a)}><Upload size={14} /> Submit</button></div>}
                {s && s.marks === undefined && <Badge tone="info">Submitted {timeAgo(s.submittedAt)}</Badge>}
                {s && s.marks !== undefined && <div style={{ textAlign: 'right' }}><div style={{ fontSize: 22, fontWeight: 700 }}>{s.marks}/{a.maxMarks}</div><Badge tone="success">Graded</Badge></div>}
              </div>
              {s?.feedback && <div className="alert alert-info" style={{ marginTop: 12 }}><strong>Feedback:</strong>&nbsp;{s.feedback}</div>}
            </Card>
          )
        })}
      </div>
      {open && (
        <Modal title={`Submit: ${open.title}`} onClose={() => setOpen(null)} footer={<><button className="btn btn-ghost" onClick={() => setOpen(null)}>Cancel</button><button className="btn" onClick={submit} disabled={!text.trim() && !file}>Submit</button></>}>
          {open.dueAt < Date.now() && <div className="alert alert-warning">This assignment is past its due date and will be marked late.</div>}
          <Field label="Answer / link"><textarea className="textarea" value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste a link or write your answer" /></Field>
          <Field label="Attach file" hint="PDF, DOCX or ZIP · max 20 MB (stored as file name in demo)"><input type="file" onChange={(e) => setFile(e.target.files?.[0]?.name ?? '')} /></Field>
          <div className="small muted">Submissions are checked for originality.</div>
        </Modal>
      )}
    </>
  )
}

function FacultyAssignments() {
  const db = useDB()
  const user = useCurrentUser()!
  const courses = coursesFor(db, user)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState({ courseId: courses[0]?.id ?? '', title: '', description: '', due: '', maxMarks: 20 })
  const [grading, setGrading] = useState<Submission | null>(null)
  const [marks, setMarks] = useState('')
  const [feedback, setFeedback] = useState('')

  const list = db.assignments.filter((a) => courses.some((c) => c.id === a.courseId)).sort((a, b) => b.dueAt - a.dueAt)

  const create = () => {
    if (!draft.title || !draft.due) return
    const a = { id: uid('as'), courseId: draft.courseId, title: draft.title, description: draft.description, dueAt: new Date(draft.due).getTime(), maxMarks: Number(draft.maxMarks) }
    update((d) => { d.assignments.push(a) })
    notify(db.courses.find((c) => c.id === draft.courseId)!.studentIds, `New assignment: ${a.title}`, '/assignments')
    setCreating(false); setDraft({ ...draft, title: '', description: '', due: '' })
  }

  const saveGrade = () => {
    if (!grading) return
    const a = db.assignments.find((x) => x.id === grading.assignmentId)!
    const n = Math.max(0, Math.min(a.maxMarks, Number(marks)))
    update((d) => { const s = d.submissions.find((x) => x.id === grading.id)!; s.marks = n; s.feedback = feedback || undefined })
    notify([grading.studentId], `"${a.title}" graded: ${n}/${a.maxMarks}`, '/assignments')
    setGrading(null)
  }

  return (
    <>
      <PageHeader title="Assignments" subtitle="Create assignments and grade submissions" actions={<button className="btn" onClick={() => setCreating(true)}><Plus size={14} /> New assignment</button>} />
      <div className="stack">
        {list.map((a) => {
          const subs = db.submissions.filter((s) => s.assignmentId === a.id)
          const course = db.courses.find((c) => c.id === a.courseId)!
          return (
            <Card key={a.id} title={<span>{a.title} <Badge tone="brand">{course.code}</Badge></span>} action={<span className="small muted">Due {fmtDateTime(a.dueAt)}</span>}>
              <div className="row gap small" style={{ marginBottom: 10 }}>
                <Badge tone="info">{subs.length}/{course.studentIds.length} submitted</Badge>
                <Badge tone="warning">{subs.filter((s) => s.marks === undefined).length} to grade</Badge>
              </div>
              {subs.length === 0 ? <div className="small muted">No submissions yet.</div> : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Student</th><th>Submitted</th><th>Answer</th><th>Marks</th><th /></tr></thead>
                    <tbody>
                      {subs.map((s) => (
                        <tr key={s.id}>
                          <td>{userName(db, s.studentId)}</td>
                          <td>{fmtDateTime(s.submittedAt)} {s.submittedAt > a.dueAt && <Badge tone="danger">Late</Badge>}</td>
                          <td className="ellipsis" style={{ maxWidth: 240 }}>{s.fileName ? `📎 ${s.fileName}` : s.text}</td>
                          <td>{s.marks !== undefined ? `${s.marks}/${a.maxMarks}` : '—'}</td>
                          <td><button className="btn btn-outline btn-sm" onClick={() => { setGrading(s); setMarks(String(s.marks ?? '')); setFeedback(s.feedback ?? '') }}>{s.marks !== undefined ? 'Edit' : 'Grade'}</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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
      {grading && (
        <Modal title={`Grade: ${userName(db, grading.studentId)}`} onClose={() => setGrading(null)} footer={<><button className="btn btn-ghost" onClick={() => setGrading(null)}>Cancel</button><button className="btn" onClick={saveGrade}>Save grade</button></>}>
          <div className="alert alert-info">{grading.fileName ? `Attachment: ${grading.fileName}` : grading.text}</div>
          <Field label={`Marks (out of ${db.assignments.find((a) => a.id === grading.assignmentId)!.maxMarks})`}><input className="input" type="number" value={marks} onChange={(e) => setMarks(e.target.value)} /></Field>
          <Field label="Feedback"><textarea className="textarea" value={feedback} onChange={(e) => setFeedback(e.target.value)} /></Field>
        </Modal>
      )}
    </>
  )
}
