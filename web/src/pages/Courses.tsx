import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BookOpen, FileText, Link2, Plus, Presentation, Video } from 'lucide-react'
import { update, uid, notify, useCurrentUser, useDB } from '../data/store'
import { Avatar, Badge, Card, Empty, Field, Modal, PageHeader, Progress, Tabs } from '../components/ui'
import { attendanceStats, coursesFor, fmtDate, userName } from '../lib'
import { Discussion } from './Feed'
import type { Material } from '../data/types'

export function Courses() {
  const db = useDB()
  const user = useCurrentUser()!
  const courses = coursesFor(db, user)
  return (
    <>
      <PageHeader title="Courses" subtitle={user.role === 'faculty' ? 'Courses you teach' : user.role === 'admin' ? 'All courses offered this semester' : 'Your enrolled courses this semester'} />
      <div className="grid grid-3">
        {courses.map((c, i) => {
          const att = user.role === 'student' ? attendanceStats(db, user.id, c.id) : null
          return (
            <Link key={c.id} to={`/courses/${c.id}`} className="card" style={{ color: 'inherit', textDecoration: 'none', padding: 0, overflow: 'hidden' }}>
              <div style={{ height: 76, background: `linear-gradient(120deg, var(--brand), ${['#c9a227', '#2563a8', '#1f8a4c', '#6b3fa0', '#0f766e'][i % 5]})`, padding: 14, color: '#fff' }}>
                <Badge tone="accent">{c.code}</Badge>
              </div>
              <div style={{ padding: 16 }} className="stack">
                <div>
                  <h3>{c.name}</h3>
                  <div className="small muted">{userName(db, c.facultyId)} · {c.credits} credits</div>
                </div>
                {att ? (
                  <div>
                    <div className="row between small"><span className="muted">Attendance</span><strong>{att.pct}%</strong></div>
                    <Progress value={att.pct} />
                  </div>
                ) : (
                  <div className="small muted">{c.studentIds.length} students enrolled</div>
                )}
              </div>
            </Link>
          )
        })}
      </div>
    </>
  )
}

const kindIcon = { pdf: FileText, video: Video, link: Link2, slides: Presentation }

export function CourseDetail() {
  const { id } = useParams()
  const db = useDB()
  const user = useCurrentUser()!
  const course = db.courses.find((c) => c.id === id)
  const [tab, setTab] = useState<'overview' | 'materials' | 'work' | 'discussion' | 'students'>('overview')
  const [adding, setAdding] = useState(false)
  const [m, setM] = useState<Pick<Material, 'title' | 'kind' | 'url'>>({ title: '', kind: 'pdf', url: '' })

  if (!course) return <Empty text="Course not found." />
  const canEdit = user.role !== 'student'
  const materials = db.materials.filter((x) => x.courseId === course.id).sort((a, b) => b.postedAt - a.postedAt)
  const assignments = db.assignments.filter((a) => a.courseId === course.id)
  const quizzes = db.quizzes.filter((q) => q.courseId === course.id)

  const addMaterial = () => {
    if (!m.title.trim()) return
    update((d) => { d.materials.push({ id: uid('m'), courseId: course.id, postedAt: Date.now(), ...m, url: m.url || '#' }) })
    notify(course.studentIds, `New material in ${course.name}: ${m.title}`, `/courses/${course.id}`)
    setAdding(false); setM({ title: '', kind: 'pdf', url: '' })
  }

  return (
    <>
      <PageHeader title={course.name} subtitle={`${course.code} · ${userName(db, course.facultyId)} · ${course.credits} credits`} actions={<Link to="/courses" className="btn btn-outline">All courses</Link>} />
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'overview', label: 'Overview' },
        { id: 'materials', label: 'Materials', count: materials.length },
        { id: 'work', label: 'Assignments & Quizzes', count: assignments.length + quizzes.length },
        { id: 'discussion', label: 'Discussion' },
        ...(canEdit ? [{ id: 'students' as const, label: 'Students', count: course.studentIds.length }] : []),
      ]} />

      {tab === 'overview' && (
        <div className="grid grid-2">
          <Card title="About this course"><p>{course.description}</p></Card>
          <Card title="Schedule">
            <div className="list">
              {db.timetable.filter((t) => t.courseId === course.id).map((t) => (
                <div key={t.id} className="list-item"><strong style={{ width: 40 }}>{['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][t.day]}</strong><span>{t.start}–{t.end}</span><span className="muted">{t.room}</span></div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {tab === 'materials' && (
        <Card title="Course materials" action={canEdit && <button className="btn btn-sm" onClick={() => setAdding(true)}><Plus size={14} /> Add material</button>}>
          {materials.length === 0 ? <Empty icon={<BookOpen />} text="No materials yet." /> : (
            <div className="list">
              {materials.map((x) => {
                const I = kindIcon[x.kind]
                return (
                  <div key={x.id} className="list-item">
                    <span className="stat-icon" style={{ background: 'var(--brand-light)', color: 'var(--brand)', width: 36, height: 36, display: 'grid', placeItems: 'center', borderRadius: 8 }}><I size={18} /></span>
                    <div className="grow"><div style={{ fontWeight: 600 }}>{x.title}</div><div className="small muted">{x.kind.toUpperCase()} · {fmtDate(x.postedAt)}</div></div>
                    <a className="btn btn-outline btn-sm" href={x.url} onClick={(e) => x.url === '#' && (e.preventDefault(), alert('Demo file: no download available.'))}>Open</a>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      )}

      {tab === 'work' && (
        <div className="grid grid-2">
          <Card title="Assignments" action={<Link to="/assignments" className="small">Manage</Link>}>
            {assignments.length === 0 ? <Empty text="No assignments." /> : <div className="list">{assignments.map((a) => <div key={a.id} className="list-item"><div className="grow"><strong>{a.title}</strong><div className="small muted">Due {fmtDate(a.dueAt)} · {a.maxMarks} marks</div></div></div>)}</div>}
          </Card>
          <Card title="Quizzes" action={<Link to="/quizzes" className="small">Open</Link>}>
            {quizzes.length === 0 ? <Empty text="No quizzes." /> : <div className="list">{quizzes.map((q) => <div key={q.id} className="list-item"><div className="grow"><strong>{q.title}</strong><div className="small muted">{q.questions.length} questions · {q.durationMin} min · closes {fmtDate(q.closesAt)}</div></div></div>)}</div>}
          </Card>
        </div>
      )}

      {tab === 'discussion' && <Discussion courseId={course.id} />}

      {tab === 'students' && canEdit && (
        <Card title="Enrolled students">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Student</th><th>Roll no.</th><th>Attendance</th><th>Email</th></tr></thead>
              <tbody>
                {course.studentIds.map((sid) => {
                  const s = db.users.find((u) => u.id === sid)!
                  const a = attendanceStats(db, sid, course.id)
                  return (
                    <tr key={sid}>
                      <td><div className="row gap"><Avatar name={s.name} color={s.avatarColor} size={28} />{s.name}</div></td>
                      <td>{s.rollNo}</td>
                      <td><Badge tone={a.pct >= 75 ? 'success' : a.pct >= 65 ? 'warning' : 'danger'}>{a.pct}%</Badge></td>
                      <td className="muted">{s.email}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {adding && (
        <Modal title="Add course material" onClose={() => setAdding(false)} footer={<><button className="btn btn-ghost" onClick={() => setAdding(false)}>Cancel</button><button className="btn" onClick={addMaterial}>Publish</button></>}>
          <Field label="Title"><input className="input" value={m.title} onChange={(e) => setM({ ...m, title: e.target.value })} /></Field>
          <Field label="Type">
            <select className="select" value={m.kind} onChange={(e) => setM({ ...m, kind: e.target.value as Material['kind'] })}>
              <option value="pdf">PDF</option><option value="slides">Slides</option><option value="video">Video</option><option value="link">Link</option>
            </select>
          </Field>
          <Field label="URL" hint="Link to the file or video"><input className="input" value={m.url} onChange={(e) => setM({ ...m, url: e.target.value })} placeholder="https://" /></Field>
        </Modal>
      )}
    </>
  )
}
