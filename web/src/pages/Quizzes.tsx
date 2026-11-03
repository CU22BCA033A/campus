import { useEffect, useState } from 'react'
import { Clock, FileQuestion, Plus, Trash2 } from 'lucide-react'
import { notify, uid, update, useCurrentUser, useDB } from '../data/store'
import { Badge, Card, Empty, Field, Modal, PageHeader } from '../components/ui'
import { courseName, coursesFor, fmtDateTime, userName } from '../lib'
import type { Quiz, QuizQuestion } from '../data/types'

export default function Quizzes() {
  const db = useDB()
  const user = useCurrentUser()!
  const courses = coursesFor(db, user)
  const quizzes = db.quizzes.filter((q) => courses.some((c) => c.id === q.courseId))
  const [taking, setTaking] = useState<Quiz | null>(null)
  const [creating, setCreating] = useState(false)
  const [results, setResults] = useState<Quiz | null>(null)

  if (taking) return <TakeQuiz quiz={taking} onDone={() => setTaking(null)} />

  return (
    <>
      <PageHeader title="Quizzes & Tests" subtitle="Timed online assessments" actions={user.role === 'faculty' && <button className="btn" onClick={() => setCreating(true)}><Plus size={14} /> New quiz</button>} />
      {quizzes.length === 0 && <Card><Empty icon={<FileQuestion />} text="No quizzes yet." /></Card>}
      <div className="grid grid-2">
        {quizzes.map((q) => {
          const attempt = db.attempts.find((a) => a.quizId === q.id && a.studentId === user.id)
          const open = q.opensAt < Date.now() && q.closesAt > Date.now()
          const attempts = db.attempts.filter((a) => a.quizId === q.id)
          return (
            <Card key={q.id} title={q.title} action={<Badge tone={open ? 'success' : 'neutral'}>{open ? 'Open' : q.closesAt < Date.now() ? 'Closed' : 'Upcoming'}</Badge>}>
              <div className="stack">
                <div className="small muted">{courseName(db, q.courseId)}</div>
                <div className="row gap wrap small">
                  <Badge tone="info"><Clock size={12} /> {q.durationMin} min</Badge>
                  <Badge tone="brand">{q.questions.length} questions</Badge>
                  <span className="muted">Closes {fmtDateTime(q.closesAt)}</span>
                </div>
                {user.role === 'student' && (attempt ? (
                  <div className="row between"><span>Your score</span><strong style={{ fontSize: 20 }}>{q.publishScores ? `${attempt.score}/${q.questions.length}` : 'Hidden'}</strong></div>
                ) : (
                  <button className="btn" disabled={!open} onClick={() => setTaking(q)}>Start quiz</button>
                ))}
                {user.role !== 'student' && (
                  <div className="row between">
                    <span className="small">{attempts.length} attempts · avg {attempts.length ? (attempts.reduce((s, a) => s + a.score, 0) / attempts.length).toFixed(1) : '—'}</span>
                    <div className="row gap">
                      <button className="btn btn-outline btn-sm" onClick={() => setResults(q)}>Results</button>
                      <button className="btn btn-outline btn-sm" onClick={() => update((d) => { const x = d.quizzes.find((y) => y.id === q.id)!; x.publishScores = !x.publishScores })}>{q.publishScores ? 'Hide scores' : 'Publish scores'}</button>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          )
        })}
      </div>
      {creating && <CreateQuiz onClose={() => setCreating(false)} />}
      {results && (
        <Modal title={`Results: ${results.title}`} onClose={() => setResults(null)}>
          {db.attempts.filter((a) => a.quizId === results.id).length === 0 ? <Empty text="No attempts yet." /> : (
            <table><thead><tr><th>Student</th><th>Score</th><th>Submitted</th></tr></thead><tbody>
              {db.attempts.filter((a) => a.quizId === results.id).map((a) => <tr key={a.id}><td>{userName(db, a.studentId)}</td><td>{a.score}/{results.questions.length}</td><td>{fmtDateTime(a.submittedAt)}</td></tr>)}
            </tbody></table>
          )}
        </Modal>
      )}
    </>
  )
}

function TakeQuiz({ quiz, onDone }: { quiz: Quiz; onDone: () => void }) {
  const user = useCurrentUser()!
  const [answers, setAnswers] = useState<number[]>(() => quiz.questions.map(() => -1))
  const [left, setLeft] = useState(quiz.durationMin * 60)
  const [submitted, setSubmitted] = useState<number | null>(null)

  const submit = () => {
    if (submitted !== null) return
    const score = quiz.questions.reduce((s, q, i) => s + (answers[i] === q.answer ? 1 : 0), 0)
    update((d) => { d.attempts.push({ id: uid('at'), quizId: quiz.id, studentId: user.id, answers, score, submittedAt: Date.now() }) })
    setSubmitted(score)
  }

  useEffect(() => {
    if (submitted !== null) return
    if (left <= 0) { submit(); return }
    const t = setTimeout(() => setLeft((l) => l - 1), 1000)
    return () => clearTimeout(t)
  })

  const mm = String(Math.floor(left / 60)).padStart(2, '0')
  const ss = String(left % 60).padStart(2, '0')

  return (
    <>
      <PageHeader title={quiz.title} subtitle={`${quiz.questions.length} questions`} actions={submitted === null ? <Badge tone={left < 60 ? 'danger' : 'info'}><Clock size={12} /> <span className="timer">{mm}:{ss}</span></Badge> : <button className="btn" onClick={onDone}>Back to quizzes</button>} />
      {submitted !== null && <div className="alert alert-success">Submitted! You scored <strong>&nbsp;{submitted}/{quiz.questions.length}</strong>.</div>}
      <div className="stack">
        {quiz.questions.map((q, i) => (
          <Card key={i} title={`Q${i + 1}. ${q.q}`}>
            <div className="stack" style={{ gap: 8 }}>
              {q.options.map((o, j) => {
                let cls = 'option'
                if (submitted !== null && quiz.publishScores) { if (j === q.answer) cls += ' correct'; else if (answers[i] === j) cls += ' wrong' }
                else if (answers[i] === j) cls += ' selected'
                return (
                  <label key={j} className={cls}>
                    <input type="radio" name={`q${i}`} checked={answers[i] === j} disabled={submitted !== null} onChange={() => setAnswers((a) => a.map((x, k) => (k === i ? j : x)))} />
                    {o}
                  </label>
                )
              })}
            </div>
          </Card>
        ))}
      </div>
      {submitted === null && (
        <div className="row between">
          <span className="muted small">{answers.filter((a) => a >= 0).length}/{quiz.questions.length} answered</span>
          <button className="btn" onClick={() => confirm('Submit the quiz? You cannot change answers afterwards.') && submit()}>Submit quiz</button>
        </div>
      )}
    </>
  )
}

function CreateQuiz({ onClose }: { onClose: () => void }) {
  const db = useDB()
  const user = useCurrentUser()!
  const courses = coursesFor(db, user)
  const [courseId, setCourseId] = useState(courses[0]?.id ?? '')
  const [title, setTitle] = useState('')
  const [duration, setDuration] = useState(10)
  const [days, setDays] = useState(3)
  const [qs, setQs] = useState<QuizQuestion[]>([{ q: '', options: ['', '', '', ''], answer: 0 }])

  const save = () => {
    const clean = qs.filter((q) => q.q.trim() && q.options.filter((o) => o.trim()).length >= 2).map((q) => ({ ...q, options: q.options.filter((o) => o.trim()) }))
    if (!title.trim() || !clean.length) return alert('Add a title and at least one complete question.')
    update((d) => { d.quizzes.push({ id: uid('q'), courseId, title, durationMin: duration, opensAt: Date.now(), closesAt: Date.now() + days * 86_400_000, questions: clean, publishScores: true }) })
    notify(db.courses.find((c) => c.id === courseId)!.studentIds, `New quiz: ${title}`, '/quizzes')
    onClose()
  }

  return (
    <Modal title="New quiz" onClose={onClose} footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn" onClick={save}>Publish quiz</button></>}>
      <Field label="Course"><select className="select" value={courseId} onChange={(e) => setCourseId(e.target.value)}>{courses.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</select></Field>
      <Field label="Title"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      <div className="grid grid-2">
        <Field label="Time limit (min)"><input className="input" type="number" min={1} value={duration} onChange={(e) => setDuration(Number(e.target.value))} /></Field>
        <Field label="Open for (days)"><input className="input" type="number" min={1} value={days} onChange={(e) => setDays(Number(e.target.value))} /></Field>
      </div>
      {qs.map((q, i) => (
        <div key={i} className="card stack" style={{ padding: 12 }}>
          <div className="row gap"><strong>Q{i + 1}</strong><input className="input" value={q.q} placeholder="Question" onChange={(e) => setQs(qs.map((x, k) => (k === i ? { ...x, q: e.target.value } : x)))} />
            {qs.length > 1 && <button className="icon-btn" onClick={() => setQs(qs.filter((_, k) => k !== i))} aria-label="Remove question"><Trash2 size={16} /></button>}</div>
          {q.options.map((o, j) => (
            <label key={j} className="row gap small">
              <input type="radio" name={`ans${i}`} checked={q.answer === j} onChange={() => setQs(qs.map((x, k) => (k === i ? { ...x, answer: j } : x)))} title="Correct answer" />
              <input className="input" value={o} placeholder={`Option ${j + 1}`} onChange={(e) => setQs(qs.map((x, k) => (k === i ? { ...x, options: x.options.map((y, m) => (m === j ? e.target.value : y)) } : x)))} />
            </label>
          ))}
          <span className="small muted">Select the radio button next to the correct answer.</span>
        </div>
      ))}
      <button className="btn btn-outline" onClick={() => setQs([...qs, { q: '', options: ['', '', '', ''], answer: 0 }])}><Plus size={14} /> Add question</button>
    </Modal>
  )
}
