import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Printer } from 'lucide-react'
import { audit, notify, update, useCurrentUser, useDB } from '../data/store'
import { Badge, Field, Modal } from './ui'
import { classColor, classLabel } from '../classes'
import { examEligibility, fmtDate } from '../lib'
import { isPan, KIND_LABEL, kindOf } from '../registration'
import { sessionDates } from '../exams'
import type { DB, User } from '../data/types'

const DAY = 86_400_000

/**
 * The papers on one student's hall ticket for an exam period: their class papers (only courses they are still
 * registered in, including courses the office added them to), their foundation / open-elective papers, and
 * supplementary papers for backlogs they re-registered for, each with eligibility.
 */
export function ticketPapers(db: DB, s: User, sessionIds: string[]) {
  const papers = db.exams.filter((e) => e.sessionId && sessionIds.includes(e.sessionId) && !e.resultsPublished)
  const mine = papers.filter((e) => {
    if (e.kind === 'Supplementary') return db.resultSheets.some((sh) => sh.examId === e.id && sh.extraStudentIds.includes(s.id))
    return !!db.courses.find((c) => c.id === e.courseId)?.studentIds.includes(s.id)
  })
  return mine.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start)).map((e) => {
    const c = db.courses.find((x) => x.id === e.courseId)!
    const el = examEligibility(db, s.id, e)
    const tag = e.kind === 'Supplementary' ? 'Backlog (supplementary)' : isPan(c) ? KIND_LABEL[kindOf(c)] : (c.extraIds ?? []).includes(s.id) ? 'Added by Registrar of Evaluation' : c.classId !== s.classId ? 'Other class' : ''
    return { e, c, tag, ...el, seat: e.seating?.find((x) => x.studentId === s.id) }
  })
}

/** Upcoming sessions near a session (same exam period): its own, university-course and supplementary exams. */
function periodSessions(db: DB, sessionId: string) {
  const base = sessionDates(db, sessionId)
  if (!base) return [sessionId]
  const from = new Date(base.from).getTime() - 21 * DAY, to = new Date(base.to).getTime() + 21 * DAY
  return db.examSessions.filter((s) => {
    const d = sessionDates(db, s.id)
    if (!d || db.exams.filter((e) => e.sessionId === s.id).every((e) => e.resultsPublished)) return false
    const sf = new Date(d.from).getTime(), st = new Date(d.to).getTime()
    return s.id === sessionId || (!s.classId && st >= from && sf <= to)
  }).map((s) => s.id)
}

/** Registrar of Evaluation: print the hall tickets of a whole class, one student per page. */
export default function HallTicketsModal({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const db = useDB()
  const me = useCurrentUser()!
  const session = db.examSessions.find((x) => x.id === sessionId)!
  const [included, setIncluded] = useState<string[]>(() => periodSessions(db, sessionId))
  // Classes with students sitting any included paper.
  const takers = db.users.filter((u) => u.role === 'student' && u.status === 'ACTIVE' && ticketPapers(db, u, included).length > 0)
  const classIds = [...new Set(takers.map((u) => u.classId ?? ''))]
  const [classId, setClassId] = useState(session.classId ?? classIds[0] ?? '')
  const students = takers.filter((u) => (u.classId ?? '') === classId).sort((a, b) => (a.rollNo ?? '').localeCompare(b.rollNo ?? ''))
  const [printing, setPrinting] = useState(false)
  const candidates = db.examSessions.filter((s) => db.exams.some((e) => e.sessionId === s.id && !e.resultsPublished))

  useEffect(() => {
    if (!printing) return
    document.body.classList.add('printing-tickets')
    const done = () => { document.body.classList.remove('printing-tickets'); setPrinting(false) }
    window.addEventListener('afterprint', done)
    const t = setTimeout(() => window.print(), 80)
    return () => { clearTimeout(t); window.removeEventListener('afterprint', done); document.body.classList.remove('printing-tickets') }
  }, [printing])

  const printAll = () => {
    update((d) => { d.examSessions.find((x) => x.id === sessionId)!.ticketsIssuedAt = Date.now() })
    notify(students.map((s) => s.id), `Hall ticket for ${session.title} is ready. Collect it from the Registrar of Evaluation office.`, '/exams')
    audit(me.id, 'HALL_TICKETS_PRINT', `${session.title} · ${classLabel(db.classes.find((c) => c.id === classId))} · ${students.length} student(s)`)
    setPrinting(true)
  }
  return (
    <>
      <Modal wide title={`Hall tickets · ${session.title}`} onClose={onClose} footer={<><button className="btn btn-ghost" onClick={onClose}>Close</button><button className="btn" disabled={!students.length} onClick={printAll}><Printer size={14} /> Print {students.length} hall ticket(s)</button></>}>
        <p className="small muted">Each student's ticket lists only their own papers: class courses they are registered in (drops removed, office additions included), foundation / open-elective papers and backlog (supplementary) papers in this exam period. Papers they are not eligible for are printed as withheld.</p>
        <Field label="Exams on the ticket">
          <div className="stack" style={{ gap: 4 }}>{candidates.map((s) => (
            <label key={s.id} className="row gap small"><input type="checkbox" checked={included.includes(s.id)} onChange={(e) => setIncluded(e.target.checked ? [...included, s.id] : included.filter((x) => x !== s.id))} /> {s.title} <span className="muted">{s.classId ? classLabel(db.classes.find((c) => c.id === s.classId)) : s.kind === 'Supplementary' ? 'backlog students' : 'university courses'}</span></label>
          ))}</div>
        </Field>
        <Field label="Class">
          <div className="row gap wrap">{classIds.map((id) => { const cl = db.classes.find((c) => c.id === id); const col = classColor(cl); const on = id === classId; return <button key={id} className="chip class-chip" aria-pressed={on} onClick={() => setClassId(id)} style={{ borderColor: col.fg, color: on ? '#fff' : col.fg, background: on ? col.fg : col.bg }}>{classLabel(cl)} · {takers.filter((u) => (u.classId ?? '') === id).length}</button> })}</div>
        </Field>
        <div className="table-wrap"><table>
          <thead><tr><th>Student</th><th>Papers</th><th>Changes</th><th>Withheld</th></tr></thead>
          <tbody>{students.map((s) => { const p = ticketPapers(db, s, included); const special = p.filter((x) => x.tag); const withheld = p.filter((x) => !x.eligible); return (
            <tr key={s.id}>
              <td>{s.name}<div className="small muted">{s.rollNo}</div></td>
              <td>{p.length}</td>
              <td className="small">{special.length ? special.map((x) => `${x.c.code} (${x.tag})`).join(', ') : <span className="muted">Class papers only</span>}</td>
              <td>{withheld.length ? <Badge tone="danger">{withheld.map((x) => x.c.code).join(', ')}</Badge> : <Badge tone="success">None</Badge>}</td>
            </tr>
          ) })}</tbody>
        </table></div>
      </Modal>
      {printing && createPortal(<div className="hall-ticket-sheet">{students.map((s) => <HallTicket key={s.id} student={s} sessionIds={included} title={session.title} />)}</div>, document.body)}
    </>
  )
}

function HallTicket({ student, sessionIds, title }: { student: User; sessionIds: string[]; title: string }) {
  const db = useDB()
  const papers = ticketPapers(db, student, sessionIds)
  const cls = db.classes.find((c) => c.id === student.classId)
  const ok = papers.filter((p) => p.eligible)
  const held = papers.filter((p) => !p.eligible)
  return (
    <section className="hall-ticket">
      <header className="row between"><div className="row gap"><div className="brand-logo">CP</div><div><strong style={{ fontSize: 18 }}>Campus Portal University</strong><div>Office of the Registrar of Evaluation · Hall ticket</div></div></div><div style={{ textAlign: 'right' }}><strong>{title}</strong><div className="small">Issued {new Date().toLocaleDateString('en-IN')}</div></div></header>
      <table className="ticket-id"><tbody>
        <tr><td>Name</td><td><strong>{student.name}</strong></td><td>Roll number</td><td><strong>{student.rollNo}</strong></td><td rowSpan={3} className="photo-box">Photo</td></tr>
        <tr><td>Programme</td><td>{student.program} · Batch {student.batch}</td><td>Class</td><td>{classLabel(cls)}</td></tr>
        <tr><td>Semester</td><td>{student.semester}</td><td>Status</td><td>{student.backlogCourses?.length ? `${student.backlogCourses.length} backlog course(s)` : 'Regular'}</td></tr>
      </tbody></table>
      <table className="ticket-papers">
        <thead><tr><th>#</th><th>Date</th><th>Time</th><th>Course</th><th>Type</th><th>Room / seat</th><th>Invigilator's sign</th></tr></thead>
        <tbody>{ok.map((p, i) => (
          <tr key={p.e.id}><td>{i + 1}</td><td>{fmtDate(p.e.date)}</td><td>{p.e.start}–{p.e.end}</td><td><strong>{p.c.code}</strong> {p.c.name}</td><td>{p.tag || 'Regular'}</td><td>{p.seat ? `${p.seat.room} / ${p.seat.seat}` : p.e.venue}</td><td /></tr>
        ))}{ok.length === 0 && <tr><td colSpan={7}>No papers this student may sit.</td></tr>}</tbody>
      </table>
      {held.length > 0 && <div className="ticket-held"><strong>Withheld:</strong> {[...new Set(held.map((p) => p.reasons.join('; ')))].map((r) => `${held.filter((p) => p.reasons.join('; ') === r).map((p) => p.c.code).join(', ')} (${r})`).join(' · ')}</div>}
      <ol className="ticket-rules"><li>Carry this hall ticket and your university ID card to every paper.</li><li>Be seated 15 minutes before the start; no entry after 30 minutes.</li><li>Mobile phones, smart watches and notes are not permitted in the hall.</li></ol>
      <footer className="row between"><span>Student's signature</span><span>Controller / Registrar of Evaluation</span></footer>
    </section>
  )
}

