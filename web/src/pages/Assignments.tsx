import { useState } from 'react'
import { CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Download, Eye, FileText, Link2, ListChecks, Paperclip, Pencil, Plus, Trash2, Type, Upload, XCircle } from 'lucide-react'
import { audit, getDB, notify, uid, update, useCurrentUser, useDB } from '../data/store'
import { Avatar, Badge, Card, Empty, Field, Modal, PageHeader, Tabs } from '../components/ui'
import { courseName, coursesFor, fmtDateTime, matches, timeAgo, userName } from '../lib'
import { acceptAttr, answerOf, autoMark, FILE_KINDS, fileAllowed, formatsLabel, isAnswered, isAuto, PART_LABEL, partsOf, pendingManual, totalOf } from '../assignments'
import type { Assignment, AssignmentPart, FileKind, PartAnswer, PartType, Submission } from '../data/types'

const MAX_INLINE_BYTES = 2 * 1024 * 1024 // files up to 2 MB are kept so the teacher can open them in the demo
const MAX_FILE_BYTES = 20 * 1024 * 1024
const PART_ICON: Record<PartType, React.ElementType> = { text: Type, link: Link2, file: FileText, mcq: CheckCircle2, msq: ListChecks }

const readAsDataUrl = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(f) })
const SHORT: Record<PartType, string> = { text: 'Written', link: 'Link', file: 'File', mcq: 'MCQ', msq: 'MCQ' }
const formatSummary = (a: Assignment) => [...new Set(partsOf(a).filter((p) => p.marks > 0 || p.required).map((p) => (p.type === 'file' ? `${formatsLabel(p)} upload` : SHORT[p.type])))].join(' · ')

export default function Assignments() {
  const user = useCurrentUser()!
  return user.role === 'student' ? <StudentAssignments /> : <FacultyAssignments />
}

/* ---------------------------------------------------------------- shared views */

function FileLink({ a }: { a: PartAnswer }) {
  if (!a.fileName) return null
  return a.fileData
    ? <a className="btn btn-outline btn-sm" href={a.fileData} download={a.fileName} target="_blank" rel="noreferrer"><Download size={12} /> {a.fileName}</a>
    : <span className="small muted row gap"><Paperclip size={12} /> {a.fileName} (larger than 2 MB, not stored in the demo)</span>
}

/** One part's answer, read-only. `reveal` shows correct MCQ options. */
function AnswerView({ p, a, reveal }: { p: AssignmentPart; a?: PartAnswer; reveal: boolean }) {
  if (isAuto(p)) {
    return (
      <div className="stack" style={{ gap: 6 }}>
        {p.options!.map((o, i) => {
          const chosen = !!a?.choices?.includes(i)
          const correct = !!p.correct?.includes(i)
          const cls = reveal ? (correct ? 'option correct' : chosen ? 'option wrong' : 'option') : chosen ? 'option selected' : 'option'
          return <div key={i} className={cls} style={{ cursor: 'default' }}>{p.type === 'msq' ? (chosen ? '☑' : '☐') : chosen ? '◉' : '○'} {o}{reveal && correct && <Badge tone="success">correct</Badge>}</div>
        })}
        {!a?.choices?.length && <span className="small muted">Not answered</span>}
      </div>
    )
  }
  if (!isAnswered(p, a)) return <span className="small muted">Not answered</span>
  if (p.type === 'file') return (
    <div className="stack" style={{ gap: 6 }}>
      <FileLink a={a!} />
      {a!.fileData?.startsWith('data:image/') && <img src={a!.fileData} alt={a!.fileName} style={{ maxWidth: '100%', maxHeight: 320, objectFit: 'contain', borderRadius: 8, border: '1px solid var(--border)' }} />}
      {a!.fileData?.startsWith('data:application/pdf') && <iframe src={a!.fileData} title={a!.fileName} style={{ width: '100%', height: 320, border: '1px solid var(--border)', borderRadius: 8 }} />}
    </div>
  )
  if (p.type === 'link') return <a href={a!.text!.trim()} target="_blank" rel="noreferrer" style={{ wordBreak: 'break-all' }}>{a!.text}</a>
  return <div className="card" style={{ whiteSpace: 'pre-wrap', maxHeight: 240, overflowY: 'auto', padding: 12 }}>{a!.text}</div>
}

function PartHeader({ p, i, right }: { p: AssignmentPart; i: number; right?: React.ReactNode }) {
  const I = PART_ICON[p.type]
  return (
    <div className="row between gap" style={{ alignItems: 'flex-start' }}>
      <div className="grow"><div className="row gap small muted"><I size={14} /> Part {i + 1} · {p.type === 'file' ? `File: ${formatsLabel(p)}` : PART_LABEL[p.type]}{!p.required && ' · optional'}{isAuto(p) && ' · auto-marked'}</div><strong>{p.prompt}</strong></div>
      {right ?? <Badge tone="brand">{p.marks} marks</Badge>}
    </div>
  )
}

/* ---------------------------------------------------------------- student */

function StudentAssignments() {
  const db = useDB()
  const user = useCurrentUser()!
  const courses = coursesFor(db, user)
  const [tab, setTab] = useState<'pending' | 'submitted' | 'graded'>('pending')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<Assignment | null>(null)
  const [viewing, setViewing] = useState<{ a: Assignment; s: Submission } | null>(null)
  const [answers, setAnswers] = useState<Record<string, PartAnswer>>({})
  const [files, setFiles] = useState<Record<string, File | null>>({})
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const all = db.assignments.filter((a) => courses.some((c) => c.id === a.courseId) && matches(q, a.title, a.description, courseName(db, a.courseId))).sort((a, b) => a.dueAt - b.dueAt)
  const subOf = (a: Assignment) => db.submissions.find((s) => s.assignmentId === a.id && s.studentId === user.id)
  const lists = {
    pending: all.filter((a) => !subOf(a)),
    submitted: all.filter((a) => subOf(a) && subOf(a)!.marks === undefined),
    graded: all.filter((a) => subOf(a)?.marks !== undefined),
  }

  const start = (a: Assignment) => {
    const s = subOf(a)
    setAnswers(Object.fromEntries(partsOf(a).map((p) => [p.id, answerOf(s, p) ?? { partId: p.id }])))
    setFiles({}); setErr(''); setOpen(a)
  }
  const setAns = (id: string, patch: Partial<PartAnswer>) => setAnswers((x) => ({ ...x, [id]: { ...x[id], partId: id, ...patch } }))

  const submit = async () => {
    if (!open) return
    const parts = partsOf(open)
    // Validate before saving anything.
    for (const [i, p] of parts.entries()) {
      const f = files[p.id]
      if (f && !fileAllowed(p, f.name)) return setErr(`Part ${i + 1} accepts ${formatsLabel(p)} only.`)
      if (f && f.size > MAX_FILE_BYTES) return setErr(`Part ${i + 1}: files must be 20 MB or smaller.`)
      if (p.type === 'link' && answers[p.id]?.text?.trim() && !/^https?:\/\/\S+$/i.test(answers[p.id].text!.trim())) return setErr(`Part ${i + 1}: enter a full link starting with http:// or https://`)
      const a = f ? { ...answers[p.id], fileName: f.name } : answers[p.id]
      if (p.required && !isAnswered(p, a)) return setErr(`Part ${i + 1} is required: ${p.prompt}`)
    }
    if (!parts.some((p) => isAnswered(p, files[p.id] ? { partId: p.id, fileName: files[p.id]!.name } : answers[p.id]))) return setErr('Answer at least one part.')
    setBusy(true)
    const final: PartAnswer[] = []
    for (const p of parts) {
      const f = files[p.id]
      const base = answers[p.id] ?? { partId: p.id }
      final.push(f ? { ...base, fileName: f.name, fileSize: f.size, fileData: f.size <= MAX_INLINE_BYTES ? await readAsDataUrl(f) : undefined } : base)
    }
    const partMarks: Record<string, number> = {}
    for (const p of parts) { const m = autoMark(p, final.find((x) => x.partId === p.id)); if (m !== undefined) partMarks[p.id] = m }
    const draft: Submission = { id: '', assignmentId: open.id, studentId: user.id, text: '', answers: final, partMarks, submittedAt: Date.now() }
    const fullyAuto = pendingManual(open, draft).length === 0
    const existing = subOf(open)
    update((d) => {
      const rec = { answers: final, partMarks, submittedAt: Date.now(), text: final.find((x) => x.partId === 'legacy-text')?.text ?? '', fileName: final.find((x) => x.partId === 'legacy-file')?.fileName, fileData: final.find((x) => x.partId === 'legacy-file')?.fileData,
        ...(fullyAuto ? { marks: totalOf(open, partMarks), gradedBy: 'auto', gradedAt: Date.now() } : {}) }
      if (existing) Object.assign(d.submissions.find((x) => x.id === existing.id)!, rec)
      else d.submissions.push({ id: uid('sub'), assignmentId: open.id, studentId: user.id, ...rec })
    })
    const fac = db.courses.find((c) => c.id === open.courseId)!.facultyId
    notify([fac], `${user.name} ${existing ? 'resubmitted' : 'submitted'} "${open.title}"${fullyAuto ? ' (auto-marked)' : ''}`, '/assignments')
    setBusy(false); setOpen(null)
    if (fullyAuto) { setTab('graded'); notify([user.id], `"${open.title}" auto-marked: ${totalOf(open, partMarks)}/${open.maxMarks}`, '/assignments') }
  }

  return (
    <>
      <PageHeader title="Assignments" subtitle="Answer in the format each assignment asks for: written, link, file upload or MCQ" search={{ value: q, onChange: setQ, placeholder: 'Search assignments or courses…' }} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'pending', label: 'Pending', count: lists.pending.length }, { id: 'submitted', label: 'Submitted', count: lists.submitted.length }, { id: 'graded', label: 'Marked', count: lists.graded.length }]} />
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
                  <div className="small row gap wrap" style={{ marginTop: 8 }}>Due <strong>{fmtDateTime(a.dueAt)}</strong> · {a.maxMarks} marks · {partsOf(a).length > 1 && a.parts ? `${partsOf(a).length} parts · ` : ''}<span className="muted">{formatSummary(a)}</span></div>
                </div>
                {!s && <div className="stack" style={{ alignItems: 'flex-end', gap: 6 }}><Badge tone={late ? 'danger' : 'warning'}>{late ? 'Overdue' : `Due ${timeAgo(a.dueAt)}`}</Badge><button className="btn" onClick={() => start(a)}><Upload size={14} /> Answer</button></div>}
                {s && s.marks === undefined && <div className="stack" style={{ alignItems: 'flex-end', gap: 6 }}><Badge tone="info">Submitted {timeAgo(s.submittedAt)}</Badge><div className="row gap"><button className="btn btn-ghost btn-sm" onClick={() => setViewing({ a, s })}><Eye size={12} /> View</button><button className="btn btn-outline btn-sm" onClick={() => start(a)}>Edit &amp; resubmit</button></div></div>}
                {s && s.marks !== undefined && <div style={{ textAlign: 'right' }}><div style={{ fontSize: 22, fontWeight: 700 }}>{s.marks}/{a.maxMarks}</div><Badge tone="success">{s.gradedBy === 'auto' ? 'Auto-marked' : 'Marked'}</Badge> <button className="btn btn-ghost btn-sm" onClick={() => setViewing({ a, s })}><Eye size={12} /> Details</button></div>}
              </div>
              {s?.feedback && <div className="alert alert-info" style={{ marginTop: 12 }}><strong>Feedback from {userName(db, s.gradedBy && s.gradedBy !== 'auto' ? s.gradedBy : db.courses.find((c) => c.id === a.courseId)!.facultyId)}:</strong>&nbsp;{s.feedback}</div>}
            </Card>
          )
        })}
      </div>

      {open && (
        <Modal title={`${subOf(open) ? 'Edit answer' : 'Answer'}: ${open.title}`} onClose={() => !busy && setOpen(null)} footer={<><button className="btn btn-ghost" disabled={busy} onClick={() => setOpen(null)}>Cancel</button><button className="btn" disabled={busy} onClick={submit}>{busy ? 'Uploading…' : 'Submit'}</button></>}>
          {open.dueAt < Date.now() && <div className="alert alert-warning">This assignment is past its due date and will be marked late.</div>}
          {open.description && <p className="small muted">{open.description}</p>}
          {err && <div className="alert alert-danger" role="alert">{err}</div>}
          {partsOf(open).map((p, i) => {
            const a = answers[p.id]
            return (
              <div key={p.id} className="card stack" style={{ padding: 14, gap: 10 }}>
                <PartHeader p={p} i={i} />
                {p.type === 'text' && <textarea className="textarea" style={{ minHeight: 120 }} value={a?.text ?? ''} onChange={(e) => setAns(p.id, { text: e.target.value })} placeholder="Write your answer" />}
                {p.type === 'link' && <input className="input" type="url" value={a?.text ?? ''} onChange={(e) => setAns(p.id, { text: e.target.value })} placeholder="https://github.com/you/project" />}
                {p.type === 'file' && (
                  <Field label="" hint={`${formatsLabel(p)} · up to 20 MB${a?.fileName && !files[p.id] ? ` · current: ${a.fileName}` : ''}`}>
                    <input type="file" accept={acceptAttr(p)} onChange={(e) => { setFiles({ ...files, [p.id]: e.target.files?.[0] ?? null }); setErr('') }} />
                  </Field>
                )}
                {isAuto(p) && (
                  <div className="stack" style={{ gap: 6 }}>
                    {p.options!.map((o, k) => {
                      const sel = !!a?.choices?.includes(k)
                      return (
                        <label key={k} className={`option ${sel ? 'selected' : ''}`}>
                          <input type={p.type === 'mcq' ? 'radio' : 'checkbox'} name={`${open.id}-${p.id}`} checked={sel}
                            onChange={() => setAns(p.id, { choices: p.type === 'mcq' ? [k] : sel ? a!.choices!.filter((x) => x !== k) : [...(a?.choices ?? []), k] })} />
                          {o}
                        </label>
                      )
                    })}
                    {p.type === 'msq' && <span className="small muted">Select every correct option. Full marks need all correct options and no wrong ones.</span>}
                  </div>
                )}
              </div>
            )
          })}
          <div className="small muted">You can edit and resubmit until your teacher marks it. MCQ parts are marked automatically.</div>
        </Modal>
      )}

      {viewing && (
        <Modal title={viewing.a.title} onClose={() => setViewing(null)}>
          <div className="small muted">Submitted {fmtDateTime(viewing.s.submittedAt)}{viewing.s.marks !== undefined && <> · <strong>{viewing.s.marks}/{viewing.a.maxMarks}</strong></>}</div>
          {partsOf(viewing.a).map((p, i) => {
            const pm = viewing.s.partMarks?.[p.id]
            const marked = viewing.s.marks !== undefined
            return (
              <div key={p.id} className="stack" style={{ gap: 6 }}>
                <PartHeader p={p} i={i} right={<Badge tone={marked && pm !== undefined ? (pm === p.marks ? 'success' : pm === 0 ? 'danger' : 'warning') : 'neutral'}>{marked && pm !== undefined ? `${pm}/${p.marks}` : `${p.marks} marks`}</Badge>} />
                <AnswerView p={p} a={answerOf(viewing.s, p)} reveal={marked} />
              </div>
            )
          })}
        </Modal>
      )}
    </>
  )
}

/* ---------------------------------------------------------------- teacher */

type RowStatus = 'GRADED' | 'SUBMITTED' | 'LATE' | 'MISSING'

const newPart = (type: PartType): AssignmentPart => ({
  id: uid('p'), type, prompt: '', marks: type === 'mcq' || type === 'msq' ? 2 : 10, required: true,
  ...(type === 'mcq' || type === 'msq' ? { options: ['', '', '', ''], correct: [] } : {}),
  ...(type === 'file' ? { accept: ['pdf', 'doc'] as FileKind[] } : {}),
})

function FacultyAssignments() {
  const db = useDB()
  const user = useCurrentUser()!
  const courses = coursesFor(db, user)
  const [editing, setEditing] = useState<Partial<Assignment> & { due?: string } | null>(null)
  const [q, setQ] = useState('')
  const [courseF, setCourseF] = useState('all')
  const [openId, setOpenId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | RowStatus>('all')
  const [marking, setMarking] = useState<{ assignmentId: string; studentId: string } | null>(null)
  const [pm, setPm] = useState<Record<string, string>>({})
  const [feedback, setFeedback] = useState('')
  const [err, setErr] = useState('')

  const list = db.assignments.filter((a) => courses.some((c) => c.id === a.courseId) && (courseF === 'all' || a.courseId === courseF) && matches(q, a.title, a.description, courseName(db, a.courseId), ...db.submissions.filter((s) => s.assignmentId === a.id).map((s) => userName(db, s.studentId)))).sort((a, b) => b.dueAt - a.dueAt)

  const rowsFor = (a: Assignment, src = db) => {
    const course = src.courses.find((c) => c.id === a.courseId)!
    return course.studentIds.map((sid) => {
      const s = src.submissions.find((x) => x.assignmentId === a.id && x.studentId === sid)
      const status: RowStatus = s?.marks !== undefined ? 'GRADED' : s ? (s.submittedAt > a.dueAt ? 'LATE' : 'SUBMITTED') : 'MISSING'
      return { student: src.users.find((u) => u.id === sid)!, sub: s, status }
    })
  }

  /* ----- create / edit ----- */
  const startCreate = () => { setErr(''); setEditing({ courseId: courses[0]?.id, title: '', description: '', due: '', parts: [newPart('text')] }) }
  const parts = editing?.parts ?? []
  const setPart = (id: string, patch: Partial<AssignmentPart>) => setEditing((e) => ({ ...e!, parts: e!.parts!.map((p) => (p.id === id ? { ...p, ...patch } : p)) }))
  const movePart = (i: number, dir: -1 | 1) => setEditing((e) => { const ps = [...e!.parts!]; const j = i + dir; if (j < 0 || j >= ps.length) return e; [ps[i], ps[j]] = [ps[j], ps[i]]; return { ...e!, parts: ps } })
  const save = () => {
    const e = editing!
    if (!e.title?.trim() || !e.due || !e.courseId) return setErr('Enter a course, title and due date.')
    if (!parts.length) return setErr('Add at least one part.')
    for (const [i, p] of parts.entries()) {
      if (!p.prompt.trim()) return setErr(`Part ${i + 1}: enter the question or instruction.`)
      if (isAuto(p)) {
        const opts = p.options!.map((o) => o.trim())
        if (opts.filter(Boolean).length < 2) return setErr(`Part ${i + 1}: add at least two options.`)
        if (!p.correct?.length) return setErr(`Part ${i + 1}: mark the correct option${p.type === 'msq' ? 's' : ''}.`)
        if (p.correct.some((k) => !opts[k])) return setErr(`Part ${i + 1}: a correct option is empty.`)
      }
      if (p.type === 'file' && !p.accept?.length) return setErr(`Part ${i + 1}: choose at least one allowed file format.`)
    }
    // Drop empty MCQ options while keeping correct indexes aligned.
    const clean = parts.map((p) => {
      if (!isAuto(p)) return p
      const keep = p.options!.map((o, k) => ({ o: o.trim(), k })).filter((x) => x.o)
      return { ...p, options: keep.map((x) => x.o), correct: p.correct!.map((k) => keep.findIndex((x) => x.k === k)).filter((k) => k >= 0) }
    })
    const maxMarks = clean.reduce((t, p) => t + p.marks, 0)
    const rec = { courseId: e.courseId, title: e.title.trim(), description: e.description ?? '', dueAt: new Date(e.due).getTime(), maxMarks, parts: clean }
    update((d) => { if (e.id) Object.assign(d.assignments.find((x) => x.id === e.id)!, rec); else d.assignments.push({ id: uid('as'), ...rec }) })
    if (!e.id) notify(db.courses.find((c) => c.id === e.courseId)!.studentIds, `New assignment: ${rec.title} (due ${fmtDateTime(rec.dueAt)})`, '/assignments')
    audit(user.id, e.id ? 'ASSIGNMENT_EDIT' : 'ASSIGNMENT_CREATE', `${rec.title}: ${clean.length} part(s), ${maxMarks} marks`)
    setEditing(null)
  }

  /* ----- marking ----- */
  const openMarking = (assignmentId: string, studentId: string) => {
    const fresh = getDB()
    const a = fresh.assignments.find((x) => x.id === assignmentId)!
    const s = fresh.submissions.find((x) => x.assignmentId === assignmentId && x.studentId === studentId)
    const init: Record<string, string> = {}
    for (const p of partsOf(a)) {
      const v = s?.partMarks?.[p.id] ?? (isAuto(p) ? autoMark(p, answerOf(s, p)) : !a.parts && p.id === 'legacy-text' ? s?.marks : undefined)
      init[p.id] = v === undefined ? '' : String(v)
    }
    setMarking({ assignmentId, studentId }); setPm(init); setFeedback(s?.feedback ?? '')
  }
  const saveMark = (andNext: boolean) => {
    if (!marking) return
    const a = db.assignments.find((x) => x.id === marking.assignmentId)!
    const ps = partsOf(a)
    const missing = ps.filter((p) => p.marks > 0 && pm[p.id] === '')
    if (missing.length) return alert(`Enter marks for: ${missing.map((p) => `Part ${ps.indexOf(p) + 1}`).join(', ')}`)
    const partMarks = Object.fromEntries(ps.map((p) => [p.id, Math.max(0, Math.min(p.marks, Number(pm[p.id] || 0)))]))
    const total = totalOf(a, partMarks)
    update((d) => {
      let s = d.submissions.find((x) => x.assignmentId === a.id && x.studentId === marking.studentId)
      if (!s) { s = { id: uid('sub'), assignmentId: a.id, studentId: marking.studentId, text: '', submittedAt: 0 }; d.submissions.push(s) }
      s.partMarks = partMarks; s.marks = total; s.feedback = feedback || undefined; s.gradedBy = user.id; s.gradedAt = Date.now()
    })
    notify([marking.studentId], `"${a.title}" marked: ${total}/${a.maxMarks}`, '/assignments')
    audit(user.id, 'ASSIGNMENT_MARK', `${a.title}: ${userName(db, marking.studentId)} ${total}/${a.maxMarks}`)
    if (andNext) step(1, true); else setMarking(null)
  }
  const step = (dir: 1 | -1, unmarkedOnly = false) => {
    if (!marking) return
    const fresh = getDB()
    const a = fresh.assignments.find((x) => x.id === marking.assignmentId)!
    const rows = rowsFor(a, fresh)
    let i = rows.findIndex((r) => r.student.id === marking.studentId)
    for (let k = 1; k < rows.length; k++) {
      i = (i + dir + rows.length) % rows.length
      const r = rows[i]
      if (!unmarkedOnly || (r.status !== 'GRADED' && r.status !== 'MISSING')) return openMarking(a.id, r.student.id)
    }
    if (!unmarkedOnly) return
    setMarking(null)
  }

  const m = marking && { a: db.assignments.find((x) => x.id === marking.assignmentId)!, st: db.users.find((u) => u.id === marking.studentId)!, s: db.submissions.find((x) => x.assignmentId === marking.assignmentId && x.studentId === marking.studentId) }
  const runningTotal = m ? partsOf(m.a).reduce((t, p) => t + Math.min(p.marks, Math.max(0, Number(pm[p.id] || 0))), 0) : 0

  return (
    <>
      <PageHeader title="Assignments" subtitle="Build assignments from written, link, file and MCQ parts; view each student's work and mark it" search={{ value: q, onChange: setQ, placeholder: 'Search assignment or student…' }}
        actions={<>
          <select className="select" style={{ width: 'auto' }} value={courseF} onChange={(e) => setCourseF(e.target.value)} aria-label="Filter by course"><option value="all">All my courses</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</select>
          <button className="btn" onClick={startCreate}><Plus size={14} /> New assignment</button>
        </>} />
      {list.length === 0 && <Card><Empty icon={<ClipboardList />} text="No assignments." /></Card>}
      <div className="stack">
        {list.map((a) => {
          const course = db.courses.find((c) => c.id === a.courseId)!
          const rows = rowsFor(a)
          const count = (st: RowStatus) => rows.filter((r) => r.status === st).length
          const expanded = openId === a.id
          const shown = rows.filter((r) => (filter === 'all' || r.status === filter) && (!q || matches(q, r.student.name, r.student.rollNo) || matches(q, a.title)))
          const hasSubs = db.submissions.some((s) => s.assignmentId === a.id)
          return (
            <Card key={a.id} title={<span>{a.title} <Badge tone="brand">{course.code}</Badge></span>} action={<span className="small muted">Due {fmtDateTime(a.dueAt)} · {a.maxMarks} marks</span>}>
              <div className="small muted" style={{ marginBottom: 8 }}>{a.parts ? `${a.parts.length} part(s): ${a.parts.map((p) => (p.type === 'file' ? `file (${formatsLabel(p)})` : PART_LABEL[p.type].toLowerCase())).join(', ')}` : 'Single answer (text and/or file)'}</div>
              <div className="row gap wrap small" style={{ marginBottom: 10 }}>
                <Badge tone="info">{rows.length - count('MISSING')}/{rows.length} submitted</Badge>
                <Badge tone="warning">{count('SUBMITTED') + count('LATE')} to mark</Badge>
                <Badge tone="success">{count('GRADED')} marked</Badge>
                {count('MISSING') > 0 && <Badge tone="danger">{count('MISSING')} not submitted</Badge>}
                <div className="grow" />
                {!hasSubs && <button className="btn btn-ghost btn-sm" onClick={() => { setErr(''); setEditing({ ...a, due: new Date(a.dueAt - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16), parts: a.parts ? a.parts.map((p) => ({ ...p, options: p.options ? [...p.options] : undefined })) : [{ ...newPart('text'), marks: a.maxMarks, prompt: 'Answer / link' }] }) }}><Pencil size={12} /> Edit</button>}
                {count('SUBMITTED') + count('LATE') > 0 && <button className="btn btn-sm" onClick={() => { const r = rows.find((x) => x.status === 'SUBMITTED' || x.status === 'LATE')!; openMarking(a.id, r.student.id) }}>Start marking</button>}
                <button className="btn btn-outline btn-sm" onClick={() => { setOpenId(expanded ? null : a.id); setFilter('all') }}>{expanded ? 'Hide students' : 'View all students'}</button>
              </div>
              {expanded && (
                <>
                  <div className="row gap wrap" style={{ marginBottom: 8 }}>{(['all', 'SUBMITTED', 'LATE', 'GRADED', 'MISSING'] as const).map((f) => <button key={f} className={`chip ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>{f === 'all' ? 'All' : f === 'MISSING' ? 'Not submitted' : f === 'GRADED' ? 'Marked' : f[0] + f.slice(1).toLowerCase()}</button>)}</div>
                  <div className="table-wrap"><table>
                    <thead><tr><th>Student</th><th>Status</th><th>Submitted</th><th>Answered</th><th>Marks</th><th /></tr></thead>
                    <tbody>{shown.map(({ student, sub, status }) => {
                      const ps = partsOf(a)
                      const answered = sub ? ps.filter((p) => isAnswered(p, answerOf(sub, p))).length : 0
                      const auto = sub?.partMarks ? ps.filter(isAuto).reduce((t, p) => t + (sub.partMarks![p.id] ?? 0), 0) : 0
                      return (
                        <tr key={student.id}>
                          <td><div className="row gap"><Avatar name={student.name} color={student.avatarColor} size={26} /><div>{student.name}<div className="small muted">{student.rollNo}</div></div></div></td>
                          <td><Badge tone={status === 'GRADED' ? 'success' : status === 'MISSING' ? 'danger' : status === 'LATE' ? 'warning' : 'info'}>{status === 'MISSING' ? 'Not submitted' : status === 'GRADED' ? (sub?.gradedBy === 'auto' ? 'Auto-marked' : 'Marked') : status[0] + status.slice(1).toLowerCase()}</Badge></td>
                          <td className="small">{sub && sub.submittedAt ? fmtDateTime(sub.submittedAt) : '—'}</td>
                          <td className="small">{sub ? `${answered}/${ps.length} parts` : '—'}{sub && ps.some(isAuto) && status !== 'GRADED' && <div className="muted">MCQ auto: {auto}</div>}</td>
                          <td>{sub?.marks !== undefined ? <strong>{sub.marks}/{a.maxMarks}</strong> : '—'}</td>
                          <td><button className="btn btn-outline btn-sm" onClick={() => openMarking(a.id, student.id)}>{status === 'MISSING' ? 'Mark' : status === 'GRADED' ? 'View / edit' : 'View & mark'}</button></td>
                        </tr>
                      )
                    })}</tbody>
                  </table></div>
                </>
              )}
            </Card>
          )
        })}
      </div>

      {editing && (
        <Modal title={editing.id ? 'Edit assignment' : 'New assignment'} onClose={() => setEditing(null)} footer={<><span className="small muted grow">Total: <strong>{parts.reduce((t, p) => t + p.marks, 0)} marks</strong> · {parts.length} part(s)</span><button className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button><button className="btn" onClick={save}>{editing.id ? 'Save' : 'Publish'}</button></>}>
          {err && <div className="alert alert-danger" role="alert">{err}</div>}
          <div className="grid grid-2">
            <Field label="Course"><select className="select" value={editing.courseId} onChange={(e) => setEditing({ ...editing, courseId: e.target.value })}>{courses.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</select></Field>
            <Field label="Due"><input className="input" type="datetime-local" value={editing.due ?? ''} onChange={(e) => setEditing({ ...editing, due: e.target.value })} /></Field>
          </div>
          <Field label="Title"><input className="input" value={editing.title ?? ''} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></Field>
          <Field label="Instructions"><textarea className="textarea" style={{ minHeight: 70 }} value={editing.description ?? ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></Field>

          <h3>How students answer</h3>
          {parts.map((p, i) => {
            const I = PART_ICON[p.type]
            return (
              <div key={p.id} className="card stack" style={{ padding: 12, gap: 8 }}>
                <div className="row gap wrap">
                  <strong className="row gap"><I size={14} /> Part {i + 1}</strong>
                  <select className="select" style={{ width: 'auto' }} value={p.type} aria-label={`Part ${i + 1} type`} onChange={(e) => { const t = e.target.value as PartType; setPart(p.id, { ...newPart(t), id: p.id, prompt: p.prompt }) }}>{(Object.keys(PART_LABEL) as PartType[]).map((t) => <option key={t} value={t}>{PART_LABEL[t]}</option>)}</select>
                  <label className="row gap small">Marks <input className="input" style={{ width: 70 }} type="number" min={0} value={p.marks} onChange={(e) => setPart(p.id, { marks: Math.max(0, Number(e.target.value)) })} /></label>
                  <label className="row gap small"><input type="checkbox" checked={p.required} onChange={(e) => setPart(p.id, { required: e.target.checked })} /> Required</label>
                  <div className="grow" />
                  <button className="icon-btn" onClick={() => movePart(i, -1)} aria-label="Move up" disabled={i === 0}><ChevronLeft size={14} style={{ transform: 'rotate(90deg)' }} /></button>
                  <button className="icon-btn" onClick={() => movePart(i, 1)} aria-label="Move down" disabled={i === parts.length - 1}><ChevronRight size={14} style={{ transform: 'rotate(90deg)' }} /></button>
                  <button className="icon-btn" onClick={() => setEditing({ ...editing, parts: parts.filter((x) => x.id !== p.id) })} aria-label="Remove part"><Trash2 size={14} /></button>
                </div>
                <input className="input" value={p.prompt} placeholder={isAuto(p) ? 'Question' : p.type === 'file' ? 'What to upload, e.g. "Project report"' : p.type === 'link' ? 'e.g. "GitHub repository link"' : 'Question or instruction'} onChange={(e) => setPart(p.id, { prompt: e.target.value })} />
                {p.type === 'file' && (
                  <div className="row gap wrap small">Allowed: {(Object.keys(FILE_KINDS) as FileKind[]).map((k) => (
                    <label key={k} className={`chip ${p.accept?.includes(k) ? 'active' : ''}`} style={{ cursor: 'pointer' }}>
                      <input type="checkbox" style={{ display: 'none' }} checked={!!p.accept?.includes(k)} onChange={(e) => setPart(p.id, { accept: k === 'any' ? (e.target.checked ? ['any'] : []) : e.target.checked ? [...(p.accept ?? []).filter((x) => x !== 'any'), k] : (p.accept ?? []).filter((x) => x !== k) })} />
                      {FILE_KINDS[k].label}
                    </label>
                  ))}</div>
                )}
                {isAuto(p) && (
                  <div className="stack" style={{ gap: 6 }}>
                    {p.options!.map((o, k) => (
                      <div key={k} className="row gap">
                        <input type={p.type === 'mcq' ? 'radio' : 'checkbox'} name={`correct-${p.id}`} title="Correct answer" checked={!!p.correct?.includes(k)} onChange={(e) => setPart(p.id, { correct: p.type === 'mcq' ? [k] : e.target.checked ? [...(p.correct ?? []), k] : (p.correct ?? []).filter((x) => x !== k) })} />
                        <input className="input" value={o} placeholder={`Option ${k + 1}`} onChange={(e) => setPart(p.id, { options: p.options!.map((x, j) => (j === k ? e.target.value : x)) })} />
                        {p.options!.length > 2 && <button className="icon-btn" onClick={() => setPart(p.id, { options: p.options!.filter((_, j) => j !== k), correct: (p.correct ?? []).filter((x) => x !== k).map((x) => (x > k ? x - 1 : x)) })} aria-label="Remove option"><XCircle size={14} /></button>}
                      </div>
                    ))}
                    <div className="row gap"><button className="btn btn-ghost btn-sm" onClick={() => setPart(p.id, { options: [...p.options!, ''] })}><Plus size={12} /> Option</button><span className="small muted">Tick the correct answer{p.type === 'msq' ? 's' : ''}. Marked automatically.</span></div>
                  </div>
                )}
              </div>
            )
          })}
          <div className="row gap wrap">
            <span className="small muted">Add part:</span>
            {(Object.keys(PART_LABEL) as PartType[]).map((t) => { const I = PART_ICON[t]; return <button key={t} className="btn btn-outline btn-sm" onClick={() => setEditing({ ...editing, parts: [...parts, newPart(t)] })}><I size={12} /> {PART_LABEL[t]}</button> })}
          </div>
        </Modal>
      )}

      {m && (
        <Modal title={`${m.a.title} · ${m.st.name}`} onClose={() => setMarking(null)} footer={<>
          <button className="btn btn-ghost" onClick={() => step(-1)} aria-label="Previous student"><ChevronLeft size={14} /> Prev</button>
          <button className="btn btn-ghost" onClick={() => step(1)} aria-label="Next student">Next <ChevronRight size={14} /></button>
          <div className="grow" />
          <strong>{runningTotal}/{m.a.maxMarks}</strong>
          <button className="btn btn-outline" onClick={() => saveMark(false)}>Save</button>
          <button className="btn" onClick={() => saveMark(true)}>Save &amp; next to mark</button>
        </>}>
          <div className="row gap wrap small"><span className="muted">{m.st.rollNo}</span>
            {m.s && m.s.submittedAt ? <><span>Submitted {fmtDateTime(m.s.submittedAt)}</span>{m.s.submittedAt > m.a.dueAt && <Badge tone="danger">Late by {Math.ceil((m.s.submittedAt - m.a.dueAt) / 3_600_000)} h</Badge>}</> : <Badge tone="danger">Not submitted</Badge>}
            {m.s?.gradedAt && <span className="muted">· last marked {timeAgo(m.s.gradedAt)} by {m.s.gradedBy === 'auto' ? 'auto-marking' : userName(db, m.s.gradedBy ?? '')}</span>}
          </div>
          {partsOf(m.a).map((p, i) => (
            <div key={p.id} className="stack" style={{ gap: 6, borderTop: i ? '1px solid var(--border)' : undefined, paddingTop: i ? 12 : 0 }}>
              <PartHeader p={p} i={i} right={p.marks > 0 ? (
                <div className="row gap">
                  <input className="input" style={{ width: 70 }} type="number" min={0} max={p.marks} aria-label={`Part ${i + 1} marks`} value={pm[p.id] ?? ''} onChange={(e) => setPm({ ...pm, [p.id]: e.target.value })} />
                  <span className="small muted">/ {p.marks}</span>
                  {!isAuto(p) && <button className="chip" onClick={() => setPm({ ...pm, [p.id]: String(p.marks) })}>Full</button>}
                </div>
              ) : <Badge>No marks</Badge>} />
              {isAuto(p) && <span className="small muted">Auto-marked {autoMark(p, answerOf(m.s, p))}/{p.marks}. You can override it.</span>}
              <AnswerView p={p} a={answerOf(m.s, p)} reveal />
            </div>
          ))}
          <Field label="Feedback for the student"><textarea className="textarea" value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="What was good, and what to improve" /></Field>
        </Modal>
      )}
    </>
  )
}
