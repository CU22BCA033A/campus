import { useState } from 'react'
import { MessageSquare, Send } from 'lucide-react'
import { uid, update, useCurrentUser, useDB } from '../data/store'
import { Avatar, Badge, Card, Empty, PageHeader } from '../components/ui'
import { courseName, coursesFor, timeAgo } from '../lib'

/** courseId: a course id shows that course's thread; undefined shows everything (campus feed). */
export function Discussion({ courseId }: { courseId?: string }) {
  const db = useDB()
  const user = useCurrentUser()!
  const [text, setText] = useState('')
  const [reply, setReply] = useState<Record<string, string>>({})
  const allowed = new Set(coursesFor(db, user).map((c) => c.id))
  const posts = db.posts
    .filter((p) => (courseId === undefined ? true : p.courseId === courseId) && (p.courseId === null || allowed.has(p.courseId) || user.role === 'admin'))
    .sort((a, b) => b.createdAt - a.createdAt)
  const author = (id: string) => db.users.find((u) => u.id === id)!

  const post = () => {
    if (!text.trim()) return
    update((d) => { d.posts.push({ id: uid('p'), courseId: courseId ?? null, authorId: user.id, text, createdAt: Date.now(), replies: [] }) })
    setText('')
  }
  const sendReply = (pid: string) => {
    const t = reply[pid]?.trim()
    if (!t) return
    update((d) => { d.posts.find((p) => p.id === pid)!.replies.push({ id: uid('r'), authorId: user.id, text: t, createdAt: Date.now() }) })
    setReply({ ...reply, [pid]: '' })
  }

  return (
    <div className="stack">
      <Card>
        <div className="row gap" style={{ alignItems: 'flex-start' }}>
          <Avatar name={user.name} color={user.avatarColor} />
          <div className="grow stack" style={{ gap: 8 }}>
            <textarea className="textarea" style={{ minHeight: 60 }} placeholder={courseId ? 'Ask a question or start a discussion…' : 'Share something with the campus…'} value={text} onChange={(e) => setText(e.target.value)} />
            <div className="row between"><span className="small muted">Be respectful. Posts are visible to {courseId ? 'everyone in this course' : 'the whole campus'}.</span><button className="btn btn-sm" onClick={post} disabled={!text.trim()}><Send size={14} /> Post</button></div>
          </div>
        </div>
      </Card>
      {posts.length === 0 && <Card><Empty icon={<MessageSquare />} text="No discussions yet. Start one!" /></Card>}
      {posts.map((p) => {
        const a = author(p.authorId)
        return (
          <Card key={p.id}>
            <div className="row gap" style={{ alignItems: 'flex-start' }}>
              <Avatar name={a.name} color={a.avatarColor} />
              <div className="grow">
                <div className="row gap wrap"><strong>{a.name}</strong>{a.role !== 'student' && <Badge tone="brand">{a.role}</Badge>}<span className="small muted">{timeAgo(p.createdAt)}</span>{courseId === undefined && <Badge tone="neutral">{p.courseId ? courseName(db, p.courseId) : 'Campus'}</Badge>}</div>
                <p style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{p.text}</p>
                <div className="stack" style={{ marginTop: 10, gap: 8, borderLeft: '2px solid var(--border)', paddingLeft: 12 }}>
                  {p.replies.map((r) => {
                    const ra = author(r.authorId)
                    return (
                      <div key={r.id} className="row gap" style={{ alignItems: 'flex-start' }}>
                        <Avatar name={ra.name} color={ra.avatarColor} size={26} />
                        <div><span style={{ fontWeight: 600 }}>{ra.name}</span> <span className="small muted">{timeAgo(r.createdAt)}</span><div>{r.text}</div></div>
                      </div>
                    )
                  })}
                  <div className="row gap">
                    <input className="input" placeholder="Write a reply…" value={reply[p.id] ?? ''} onChange={(e) => setReply({ ...reply, [p.id]: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && sendReply(p.id)} />
                    <button className="btn btn-outline btn-sm" onClick={() => sendReply(p.id)}>Reply</button>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        )
      })}
    </div>
  )
}

export default function Feed() {
  return (
    <>
      <PageHeader title="Discussions" subtitle="Campus feed and course discussion threads" />
      <Discussion />
    </>
  )
}
