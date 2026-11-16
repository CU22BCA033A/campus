import { useCallback, useEffect, useRef, useState } from 'react'
import { Clock, Copy, FileQuestion, Pencil, Plus, RotateCcw, ShieldAlert, Trash2, Users } from 'lucide-react'
import { audit, notify, uid, update, useCurrentUser, useDB } from '../data/store'
import { Badge, Card, Empty, Field, Modal, PageHeader } from '../components/ui'
import { courseName, coursesFor, fmtDateTime, userName, matches } from '../lib'
import type { Quiz, QuizAnswer, QuizQuestion, QuestionType } from '../data/types'
import { FilterBar, useFilters } from '../components/Filters'
import { isAnsweredQ, markQuestion, qMarks, quizMax, scoreQuiz, validAttempt, visibleTo } from '../assess'
import { ProctorIntro, useProctor } from '../components/Proctor'
import { deleteRecord } from '../components/RecordEditor'

const TYPE_LABEL: Record<QuestionType, string> = { mcq: 'One correct', msq: 'Multiple correct', tf: 'True / false', blank: 'Fill in the blank' }
const blankQ = (type: QuestionType = 'mcq'): QuizQuestion => ({ q: '', type, options: type === 'tf' ? ['True', 'False'] : type === 'blank' ? [] : ['', '', '', ''], answer: 0, answers: [], accepted: [], marks: 1 })

export default function Quizzes() {
  const db = useDB()
  const user = useCurrentUser()!
  const courses = coursesFor(db, user)
  const isStudent = user.role === 'student'
  const [term, setTerm] = useState('')
  const qf = useFilters(['course', 'status'] as const)
  const qdefs = [
    { key: 'course' as const, label: 'Courses', options: courses.map((c) => ({ value: c.id, label: `${c.code} · ${c.name}` })) },
    { key: 'status' as const, label: 'Statuses', options: [{ value: 'open', label: 'Open' }, { value: 'upcoming', label: 'Upcoming' }, { value: 'closed', label: 'Closed' }, ...(isStudent ? [{ value: 'done', label: 'Attempted' }, { value: 'todo', label: 'Not attempted' }] : [])] },
  ]
  const qStatus = (q: Quiz) => { const v = qf.values.status, now = Date.now(); if (!v) return true; if (v === 'open') return q.opensAt < now && q.closesAt > now; if (v === 'upcoming') return q.opensAt >= now; if (v === 'closed') return q.closesAt <= now; const done = !!validAttempt(db, q.id, user.id); return v === 'done' ? done : !done }
  const quizzes = db.quizzes.filter((q) => qf.ok('course', q.courseId) && qStatus(q)).filter((q) => courses.some((c) => c.id === q.courseId) && (!isStudent || visibleTo(q, user.id)) && matches(term, q.title, courseName(db, q.courseId)))
  const [taking, setTaking] = useState<Quiz | null>(null)
  const [editing, setEditing] = useState<Partial<Quiz> | null>(null)
  const [results, setResults] = useState<Quiz | null>(null)

  if (taking) return <TakeQuiz quiz={taking} onDone={() => setTaking(null)} />

  return (
    <>
      <PageHeader search={{ value: term, onChange: setTerm, placeholder: 'Search tests or courses…' }} title="Quizzes & Tests" subtitle={isStudent ? 'Timed tests: answers are marked as soon as you submit' : 'Timed tests with answer keys, proctoring and make-up tests for selected students'}
        actions={user.role === 'faculty' && <button className="btn" onClick={() => setEditing({ courseId: courses[0]?.id, durationMin: 15, proctored: true, questions: [blankQ()], publishScores: true })}><Plus size={14} /> New test</button>} />
      <FilterBar defs={qdefs} f={qf} count={quizzes.length} noun="test" />
      {quizzes.length === 0 && <Card><Empty icon={<FileQuestion />} text="No tests yet." /></Card>}
      <div className="grid grid-2">
        {quizzes.map((q) => {
          const attempt = validAttempt(db, q.id, user.id)
          const open = q.opensAt < Date.now() && q.closesAt > Date.now()
          const attempts = db.attempts.filter((a) => a.quizId === q.id && !a.voided)
          const orig = q.makeupOf ? db.quizzes.find((x) => x.id === q.makeupOf) : undefined
          const max = quizMax(q.questions)
          return (
            <Card key={q.id} title={q.title} action={<Badge tone={open ? 'success' : 'neutral'}>{open ? 'Open' : q.closesAt < Date.now() ? 'Closed' : 'Upcoming'}</Badge>}>
              <div className="stack">
                <div className="small muted">{courseName(db, q.courseId)}</div>
                <div className="row gap wrap small">
                  <Badge tone="info"><Clock size={12} /> {q.durationMin} min</Badge>
                  <Badge tone="brand">{q.questions.length} questions · {max} marks</Badge>
                  {q.proctored !== false && <Badge tone="warning"><ShieldAlert size={12} /> Proctored</Badge>}
                  {q.onlyFor?.length ? <Badge tone="accent"><Users size={12} /> {q.onlyFor.length} selected student(s)</Badge> : null}
                  {orig && <Badge tone="accent">Make-up of {orig.title}</Badge>}
                  <span className="muted">Closes {fmtDateTime(q.closesAt)}</span>
                </div>
                {isStudent && (attempt ? (
                  <div className="row between"><span>{attempt.terminated ? <Badge tone="danger">Closed after {attempt.violations} violations</Badge> : 'Your score'}</span><strong style={{ fontSize: 20 }}>{q.publishScores ? `${attempt.score}/${attempt.maxScore ?? max}` : 'Hidden'}</strong></div>
                ) : (
                  <button className="btn" disabled={!open} onClick={() => setTaking(q)}>Start test</button>
                ))}
                {!isStudent && (
                  <div className="row between wrap gap">
                    <span className="small">{attempts.length} attempts · avg {attempts.length ? (attempts.reduce((s, a) => s + a.score, 0) / attempts.length).toFixed(1) : '—'}/{max}{attempts.some((a) => a.terminated) ? ` · ${attempts.filter((a) => a.terminated).length} closed for malpractice` : ''}</span>
                    <div className="row gap">
                      <button className="btn btn-outline btn-sm" onClick={() => setResults(q)}>Results</button>
                      {user.role === 'faculty' && <button className="btn btn-ghost btn-sm" title="Make-up test for selected students" onClick={() => { const roster = db.courses.find((c) => c.id === q.courseId)?.studentIds ?? []; setEditing({ ...q, id: undefined, title: `${q.title} (make-up)`, makeupOf: q.id, onlyFor: roster.filter((s) => !validAttempt(db, q.id, s)), opensAt: undefined, closesAt: undefined }) }}><Copy size={12} /> Make-up</button>}
                      {user.role === 'faculty' && <button className="icon-btn" aria-label={`Edit ${q.title}`} onClick={() => setEditing(q)}><Pencil size={14} /></button>}
                      {user.role === 'faculty' && <button className="icon-btn" aria-label={`Delete ${q.title}`} onClick={() => { if (attempts.length && !confirm(`${attempts.length} student(s) have attempted it; their marks are removed too.`)) return; deleteRecord('quizzes', q.id, `test "${q.title}"`, user.id, (d) => { d.attempts = d.attempts.filter((x) => x.quizId !== q.id); for (const sh of d.resultSheets) sh.components = sh.components.filter((c) => !(c.kind === 'quiz' && c.id === q.id)) }) }}><Trash2 size={14} /></button>}
                    </div>
                  </div>
                )}
              </div>
            </Card>
          )
        })}
      </div>
      {editing && <QuizEditor draft={editing} onClose={() => setEditing(null)} />}
      {results && <ResultsModal quiz={results} onClose={() => setResults(null)} />}
    </>
  )
}

function ResultsModal({ quiz, onClose }: { quiz: Quiz; onClose: () => void }) {
  const db = useDB()
  const me = useCurrentUser()!
  const roster = (db.courses.find((c) => c.id === quiz.courseId)?.studentIds ?? []).filter((s) => visibleTo(quiz, s))
  const max = quizMax(quiz.questions)
  const allow = (sid: string) => {
    if (!confirm(`Allow ${userName(db, sid)} to take "${quiz.title}" again? Their current attempt is set aside (kept in the record).`)) return
    update((d) => { for (const a of d.attempts) if (a.quizId === quiz.id && a.studentId === sid && !a.voided) a.voided = true; const q = d.quizzes.find((x) => x.id === quiz.id)!; if (q.closesAt < Date.now()) q.closesAt = Date.now() + 2 * 86_400_000 })
    notify([sid], `You may take "${quiz.title}" again. It is open for you now.`, '/quizzes')
    audit(me.id, 'QUIZ_RETAKE_ALLOWED', `${quiz.title} · ${userName(db, sid)}`)
  }
  return (
    <Modal wide title={`Results: ${quiz.title}`} onClose={onClose}>
      <div className="table-wrap"><table>
        <thead><tr><th>Student</th><th>Score</th><th>Submitted</th><th>Proctoring</th><th /></tr></thead>
        <tbody>{roster.map((sid) => { const a = validAttempt(db, quiz.id, sid); const old = db.attempts.filter((x) => x.quizId === quiz.id && x.studentId === sid && x.voided); return (
          <tr key={sid}>
            <td>{userName(db, sid)}<div className="small muted">{db.users.find((u) => u.id === sid)?.rollNo}</div></td>
            <td>{a ? <strong>{a.score}/{a.maxScore ?? max}</strong> : <span className="muted">Not attempted</span>}{old.length ? <div className="small muted">earlier: {old.map((x) => `${x.score}${x.terminated ? ' (closed)' : ''}`).join(', ')}</div> : null}</td>
            <td className="small">{a ? fmtDateTime(a.submittedAt) : '—'}</td>
            <td>{a ? (a.terminated ? <Badge tone="danger">Closed: {a.violations} violations</Badge> : a.violations ? <Badge tone="warning">{a.violations} warning(s)</Badge> : <Badge tone="success">Clean</Badge>) : '—'}</td>
            <td>{a && <button className="btn btn-ghost btn-sm" onClick={() => allow(sid)}><RotateCcw size={12} /> Allow re-attempt</button>}</td>
          </tr>
        ) })}</tbody>
      </table></div>
    </Modal>
  )
}

function TakeQuiz({ quiz, onDone }: { quiz: Quiz; onDone: () => void }) {
  const db = useDB()
  const user = useCurrentUser()!
  const proctored = quiz.proctored !== false
  const [started, setStarted] = useState(!proctored)
  const [answers, setAnswers] = useState<QuizAnswer[]>(() => quiz.questions.map((q) => ((q.type ?? 'mcq') === 'msq' ? [] : (q.type ?? 'mcq') === 'blank' ? '' : -1)))
  const [left, setLeft] = useState(quiz.durationMin * 60)
  const [submitted, setSubmitted] = useState<{ score: number; terminated?: boolean } | null>(null)
  const answersRef = useRef(answers)
  useEffect(() => { answersRef.current = answers }, [answers])
  const max = quizMax(quiz.questions)
  const violationsRef = useRef(0)

  const submit = useCallback((terminated = false, violations = violationsRef.current) => {
    setSubmitted((done) => {
      if (done) return done
      const score = scoreQuiz(quiz.questions, answersRef.current)
      update((d) => { d.attempts.push({ id: uid('at'), quizId: quiz.id, studentId: user.id, answers: answersRef.current, score, maxScore: max, submittedAt: Date.now(), violations, terminated }) })
      const fac = db.courses.find((c) => c.id === quiz.courseId)?.facultyId
      if (terminated && fac) notify([fac], `Malpractice alert: ${user.name} (${user.rollNo}) left the screen ${violations} times during "${quiz.title}". The attempt was closed at ${score}/${max}. You can allow a re-attempt from Results.`, '/quizzes')
      return { score, terminated }
    })
  }, [db.courses, max, quiz, user.id, user.name, user.rollNo])
  const proctor = useProctor(proctored && started && !submitted, useCallback((v: number) => { violationsRef.current = v; submit(true, v) }, [submit]))
  useEffect(() => { violationsRef.current = proctor.violations }, [proctor.violations])

  useEffect(() => {
    if (!started || submitted) return
    if (left <= 0) { submit(); return }
    const t = setTimeout(() => setLeft((l) => l - 1), 1000)
    return () => clearTimeout(t)
  })

  if (!started) return <ProctorIntro title={quiz.title} onBegin={() => setStarted(true)} onCancel={onDone} />
  const mm = String(Math.floor(left / 60)).padStart(2, '0')
  const ss = String(left % 60).padStart(2, '0')
  const reveal = !!submitted && quiz.publishScores
  const set = (i: number, v: QuizAnswer) => setAnswers((a) => a.map((x, k) => (k === i ? v : x)))

  return (
    <div className="take-test">
      {!submitted && proctor.banner}
      {proctor.overlay}
      <PageHeader title={quiz.title} subtitle={`${quiz.questions.length} questions · ${max} marks`} actions={!submitted ? <Badge tone={left < 60 ? 'danger' : 'info'}><Clock size={12} /> <span className="timer">{mm}:{ss}</span></Badge> : <button className="btn" onClick={onDone}>Back to tests</button>} />
      {submitted && (submitted.terminated
        ? <div className="alert alert-danger">This attempt was closed because you left the test screen 3 times. Your teacher has been informed. Answers so far were marked: <strong>&nbsp;{submitted.score}/{max}</strong>.</div>
        : <div className="alert alert-success">Submitted. {quiz.publishScores ? <>You scored <strong>&nbsp;{submitted.score}/{max}</strong>.</> : 'Your teacher will publish the scores.'}</div>)}
      <div className="stack">
        {quiz.questions.map((q, i) => {
          const type = q.type ?? 'mcq'
          const a = answers[i]
          const got = markQuestion(q, a)
          return (
            <Card key={i} title={`Q${i + 1}. ${q.q}`} action={<span className="small muted">{reveal ? <Badge tone={got ? 'success' : 'danger'}>{got}/{qMarks(q)}</Badge> : `${qMarks(q)} mark${qMarks(q) === 1 ? '' : 's'}`} · {TYPE_LABEL[type]}</span>}>
              {type === 'blank' ? (
                <div className="stack" style={{ gap: 6 }}>
                  <input className="input" aria-label={`Answer ${i + 1}`} value={String(a ?? '')} disabled={!!submitted} onChange={(e) => set(i, e.target.value)} placeholder="Type your answer" />
                  {reveal && !got && <span className="small muted">Accepted: {(q.accepted ?? []).join(' / ')}</span>}
                </div>
              ) : (
                <div className="stack" style={{ gap: 8 }}>
                  {q.options.map((o, j) => {
                    const chosen = type === 'msq' ? Array.isArray(a) && a.includes(j) : a === j
                    const correct = type === 'msq' ? (q.answers ?? []).includes(j) : q.answer === j
                    let cls = 'option'
                    if (reveal) { if (correct) cls += ' correct'; else if (chosen) cls += ' wrong' } else if (chosen) cls += ' selected'
                    return (
                      <label key={j} className={cls}>
                        <input type={type === 'msq' ? 'checkbox' : 'radio'} name={`q${i}`} checked={chosen} disabled={!!submitted}
                          onChange={() => set(i, type === 'msq' ? (chosen ? (a as number[]).filter((x) => x !== j) : [...((a as number[]) ?? []), j]) : j)} />
                        {o}
                      </label>
                    )
                  })}
                  {type === 'msq' && !submitted && <span className="small muted">Select every correct option; marks need exactly the right set.</span>}
                </div>
              )}
            </Card>
          )
        })}
      </div>
      {!submitted && (
        <div className="row between">
          <span className="muted small">{answers.filter(isAnsweredQ).length}/{quiz.questions.length} answered</span>
          <button className="btn" onClick={() => confirm('Submit the test? You cannot change answers afterwards.') && submit()}>Submit test</button>
        </div>
      )}
    </div>
  )
}

/** Create or edit a test; a make-up copies the questions and goes only to the selected students. */
function QuizEditor({ draft, onClose }: { draft: Partial<Quiz>; onClose: () => void }) {
  const db = useDB()
  const user = useCurrentUser()!
  const courses = coursesFor(db, user)
  const [z, setZ] = useState<Partial<Quiz> & { days?: number }>({ days: 3, ...draft, questions: (draft.questions ?? [blankQ()]).map((q) => ({ ...blankQ(q.type), ...q })) })
  const [err, setErr] = useState('')
  const qs = z.questions!
  const setQ = (i: number, p: Partial<QuizQuestion>) => setZ({ ...z, questions: qs.map((x, k) => (k === i ? { ...x, ...p } : x)) })
  const roster = db.courses.find((c) => c.id === z.courseId)?.studentIds ?? []
  const restricted = z.onlyFor !== undefined
  const hasAttempts = !!z.id && db.attempts.some((a) => a.quizId === z.id)

  const save = () => {
    setErr('')
    if (!z.title?.trim()) return setErr('Give the test a title.')
    if (!qs.length) return setErr('Add at least one question.')
    for (const [i, q] of qs.entries()) {
      const type = q.type ?? 'mcq'
      if (!q.q.trim()) return setErr(`Q${i + 1}: write the question.`)
      if (type === 'blank') { if (!(q.accepted ?? []).some((x) => x.trim())) return setErr(`Q${i + 1}: enter at least one accepted answer.`) }
      else {
        if (q.options.filter((o) => o.trim()).length < 2) return setErr(`Q${i + 1}: needs at least two options.`)
        if (type === 'msq' && !(q.answers ?? []).length) return setErr(`Q${i + 1}: tick every correct option.`)
        if (type !== 'msq' && !q.options[q.answer]?.trim()) return setErr(`Q${i + 1}: choose the correct option.`)
      }
      if ((q.marks ?? 1) <= 0) return setErr(`Q${i + 1}: marks must be more than 0.`)
    }
    if (restricted && !z.onlyFor!.length) return setErr('Select the students who take this test.')
    const clean = qs.map((q) => ({ ...q, options: (q.type ?? 'mcq') === 'blank' ? [] : q.options.map((o) => o.trim()), accepted: (q.accepted ?? []).map((x) => x.trim()).filter(Boolean) }))
    const id = z.id ?? uid('q')
    const opensAt = z.opensAt ?? Date.now()
    const rec: Quiz = { id, courseId: z.courseId!, title: z.title.trim(), durationMin: z.durationMin ?? 15, opensAt, closesAt: z.closesAt ?? opensAt + (z.days ?? 3) * 86_400_000, questions: clean, publishScores: z.publishScores ?? true, proctored: z.proctored !== false, onlyFor: restricted ? z.onlyFor : undefined, makeupOf: z.makeupOf }
    update((d) => { const i = d.quizzes.findIndex((x) => x.id === id); if (i >= 0) d.quizzes[i] = rec; else d.quizzes.push(rec) })
    if (!z.id) notify(restricted ? z.onlyFor! : roster, `New ${z.makeupOf ? 'make-up ' : ''}test: ${rec.title}`, '/quizzes')
    audit(user.id, z.id ? 'QUIZ_EDIT' : 'QUIZ_CREATE', `${rec.title}${restricted ? ` for ${z.onlyFor!.length} student(s)` : ''}`)
    onClose()
  }

  return (
    <Modal wide title={z.id ? `Edit ${z.title}` : z.makeupOf ? 'Make-up test' : 'New test'} onClose={onClose} footer={<>{err && <span className="small" style={{ color: 'var(--danger)', marginRight: 'auto' }}>{err}</span>}<button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn" onClick={save}>{z.id ? 'Save' : 'Publish test'}</button></>}>
      {hasAttempts && <div className="alert alert-warning">Students have already attempted this test. Changing the answer key does not re-mark existing attempts.</div>}
      <div className="grid grid-3">
        <Field label="Course"><select className="select" value={z.courseId} disabled={!!z.makeupOf} onChange={(e) => setZ({ ...z, courseId: e.target.value })}>{courses.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</select></Field>
        <Field label="Time limit (min)"><input className="input" type="number" min={1} value={z.durationMin ?? 15} onChange={(e) => setZ({ ...z, durationMin: Number(e.target.value) })} /></Field>
        {!z.id && <Field label="Open for (days)"><input className="input" type="number" min={1} value={z.days ?? 3} onChange={(e) => setZ({ ...z, days: Number(e.target.value) })} /></Field>}
      </div>
      <Field label="Title"><input className="input" value={z.title ?? ''} onChange={(e) => setZ({ ...z, title: e.target.value })} /></Field>
      <div className="row gap wrap">
        <label className="row gap"><input type="checkbox" checked={z.proctored !== false} onChange={(e) => setZ({ ...z, proctored: e.target.checked })} /> Proctored (full screen, 2 warnings, closes on the 3rd)</label>
        <label className="row gap"><input type="checkbox" checked={z.publishScores ?? true} onChange={(e) => setZ({ ...z, publishScores: e.target.checked })} /> Show marks as soon as students submit</label>
        <label className="row gap"><input type="checkbox" checked={restricted} onChange={(e) => setZ({ ...z, onlyFor: e.target.checked ? [] : undefined })} /> Only for selected students</label>
      </div>
      {z.makeupOf && <div className="alert alert-info small">Make-up of “{db.quizzes.find((x) => x.id === z.makeupOf)?.title}”: these marks are recorded for that test (scaled to its total) for the students below.</div>}
      {restricted && (
        <Field label={`Students (${z.onlyFor!.length} selected)`} hint="Students who have not attempted the original are ticked">
          <div className="pick-grid">{roster.map((sid) => { const on = z.onlyFor!.includes(sid); const att = z.makeupOf ? validAttempt(db, z.makeupOf, sid) : undefined; return (
            <label key={sid} className={`pick ${on ? 'on' : ''}`}><input type="checkbox" checked={on} onChange={() => setZ({ ...z, onlyFor: on ? z.onlyFor!.filter((x) => x !== sid) : [...z.onlyFor!, sid] })} /> {userName(db, sid)} <span className="small muted">{att ? `scored ${att.score}` : z.makeupOf ? 'absent' : ''}</span></label>
          ) })}</div>
        </Field>
      )}
      {qs.map((q, i) => {
        const type = q.type ?? 'mcq'
        return (
          <div key={i} className="card stack" style={{ padding: 12 }}>
            <div className="row gap wrap">
              <strong>Q{i + 1}</strong>
              <select className="select" style={{ width: 'auto' }} aria-label={`Q${i + 1} type`} value={type} onChange={(e) => { const t = e.target.value as QuestionType; setQ(i, { ...blankQ(t), q: q.q, marks: q.marks }) }}>{(Object.keys(TYPE_LABEL) as QuestionType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</select>
              <label className="row gap small">Marks <input className="input" type="number" min={0.5} step={0.5} style={{ width: 70 }} value={q.marks ?? 1} onChange={(e) => setQ(i, { marks: Number(e.target.value) })} /></label>
              <div className="grow" />
              {qs.length > 1 && <button className="icon-btn" onClick={() => setZ({ ...z, questions: qs.filter((_, k) => k !== i) })} aria-label="Remove question"><Trash2 size={16} /></button>}
            </div>
            <input className="input" value={q.q} placeholder={type === 'blank' ? 'Question, e.g. The SQL keyword that removes duplicate rows is ____' : 'Question'} onChange={(e) => setQ(i, { q: e.target.value })} aria-label={`Q${i + 1} text`} />
            {type === 'blank' ? (
              <Field label="Accepted answers (correct answer key)" hint="One per line or separated by commas; case and extra spaces are ignored">
                <textarea className="textarea" style={{ minHeight: 60 }} aria-label={`Q${i + 1} accepted answers`} value={(q.accepted ?? []).join('\n')} onChange={(e) => setQ(i, { accepted: e.target.value.split(/[\n,]/) })} />
              </Field>
            ) : (
              <>
                {q.options.map((o, j) => (
                  <label key={j} className="row gap small">
                    <input type={type === 'msq' ? 'checkbox' : 'radio'} name={`ans${i}`} title="Correct answer" aria-label={`Q${i + 1} option ${j + 1} correct`}
                      checked={type === 'msq' ? (q.answers ?? []).includes(j) : q.answer === j}
                      onChange={() => type === 'msq' ? setQ(i, { answers: (q.answers ?? []).includes(j) ? q.answers!.filter((x) => x !== j) : [...(q.answers ?? []), j] }) : setQ(i, { answer: j })} />
                    <input className="input" value={o} disabled={type === 'tf'} placeholder={`Option ${j + 1}`} aria-label={`Q${i + 1} option ${j + 1}`} onChange={(e) => setQ(i, { options: q.options.map((y, m) => (m === j ? e.target.value : y)) })} />
                  </label>
                ))}
                <div className="row gap">
                  {type !== 'tf' && <button className="btn btn-ghost btn-sm" onClick={() => setQ(i, { options: [...q.options, ''] })}><Plus size={12} /> Option</button>}
                  <span className="small muted">{type === 'msq' ? 'Tick every correct option.' : 'Select the correct option.'}</span>
                </div>
              </>
            )}
          </div>
        )
      })}
      <div className="row gap wrap">{(Object.keys(TYPE_LABEL) as QuestionType[]).map((t) => <button key={t} className="btn btn-outline btn-sm" onClick={() => setZ({ ...z, questions: [...qs, blankQ(t)] })}><Plus size={12} /> {TYPE_LABEL[t]}</button>)}</div>
    </Modal>
  )
}
