import { useState } from 'react'
import { Star } from 'lucide-react'
import { uid, update, useCurrentUser, useDB } from '../data/store'
import { Badge, Card, Empty, PageHeader } from '../components/ui'
import { coursesFor, fmtDate, userName } from '../lib'

function Stars({ value, onChange }: { value: number; onChange?: (n: number) => void }) {
  return (
    <span className="row" style={{ gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" disabled={!onChange} onClick={() => onChange?.(n)} style={{ background: 'none', border: 'none', padding: 0, cursor: onChange ? 'pointer' : 'default' }} aria-label={`${n} stars`}>
          <Star size={20} fill={n <= value ? 'var(--accent)' : 'none'} color={n <= value ? 'var(--accent)' : 'var(--border)'} />
        </button>
      ))}
    </span>
  )
}

export default function Feedback() {
  const db = useDB()
  const user = useCurrentUser()!
  const courses = coursesFor(db, user)
  const [drafts, setDrafts] = useState<Record<string, { rating: number; comment: string }>>({})

  if (user.role !== 'student') {
    return (
      <>
        <PageHeader title="Faculty feedback" subtitle="Anonymous feedback submitted by students" />
        <div className="grid grid-2">
          {courses.map((c) => {
            const fb = db.feedback.filter((f) => f.courseId === c.id)
            const avg = fb.length ? fb.reduce((s, f) => s + f.rating, 0) / fb.length : 0
            return (
              <Card key={c.id} title={c.name} action={<Badge tone="brand">{c.code}</Badge>}>
                <div className="row gap" style={{ marginBottom: 10 }}><Stars value={Math.round(avg)} /><strong>{avg ? avg.toFixed(1) : '—'}</strong><span className="muted small">({fb.length} responses) · {userName(db, c.facultyId)}</span></div>
                {fb.length === 0 ? <Empty text="No feedback yet." /> : <div className="list">{fb.filter((f) => f.comment).map((f) => <div key={f.id} className="list-item small">“{f.comment}” <span className="muted">· {fmtDate(f.createdAt)}</span></div>)}</div>}
              </Card>
            )
          })}
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader title="Faculty feedback" subtitle="Your feedback is anonymous and helps improve teaching" />
      <div className="grid grid-2">
        {courses.map((c) => {
          const done = db.feedback.find((f) => f.courseId === c.id && f.studentId === user.id)
          const d = drafts[c.id] ?? { rating: 0, comment: '' }
          return (
            <Card key={c.id} title={c.name} action={done ? <Badge tone="success">Submitted</Badge> : <Badge tone="warning">Pending</Badge>}>
              <div className="small muted" style={{ marginBottom: 10 }}>{userName(db, c.facultyId)}</div>
              {done ? <Stars value={done.rating} /> : (
                <div className="stack">
                  <Stars value={d.rating} onChange={(n) => setDrafts({ ...drafts, [c.id]: { ...d, rating: n } })} />
                  <textarea className="textarea" placeholder="What went well? What could be improved?" value={d.comment} onChange={(e) => setDrafts({ ...drafts, [c.id]: { ...d, comment: e.target.value } })} />
                  <button className="btn" disabled={!d.rating} onClick={() => update((x) => { x.feedback.push({ id: uid('fb'), courseId: c.id, studentId: user.id, rating: d.rating, comment: d.comment, createdAt: Date.now() }) })}>Submit feedback</button>
                </div>
              )}
            </Card>
          )
        })}
      </div>
    </>
  )
}
