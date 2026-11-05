import { useState } from 'react'
import { LifeBuoy, Plus, Printer } from 'lucide-react'
import { audit, notify, uid, update, useCurrentUser, useDB } from '../data/store'
import { Badge, Card, Empty, Field, Modal, PageHeader, Stat, Tabs } from '../components/ui'
import { fmtDate, fmtDateTime, inr, studentDues, timeAgo, userName } from '../lib'
import { OFFICES, persona, TICKET_OFFICE, officeUsers } from '../access'
import type { DB, Ticket } from '../data/types'
import AppointmentsPanel from './Appointments'
import { matches } from '../lib'

const CATS: { id: Ticket['category']; sla: number }[] = [
  { id: 'Grievance', sla: 72 }, { id: 'IT Support', sla: 24 }, { id: 'Maintenance', sla: 48 },
  { id: 'Facility Booking', sla: 24 }, { id: 'Bonafide Certificate', sla: 48 }, { id: 'No-Dues Certificate', sla: 72 },
]
const isOverdue = (t: Ticket) => !['RESOLVED', 'CLOSED'].includes(t.status) && Date.now() > t.createdAt + t.slaHours * 3_600_000

/** No-dues check across modules: fees, library loans/fines and hostel occupancy. */
export function noDuesCheck(db: DB, userId: string) {
  const items = [
    { dept: 'Accounts', ok: studentDues(db, userId) === 0, note: studentDues(db, userId) ? `${inr(studentDues(db, userId))} outstanding` : 'Clear' },
    { dept: 'Library', ok: !db.loans.some((l) => l.userId === userId && !l.returnedAt), note: db.loans.filter((l) => l.userId === userId && !l.returnedAt).length ? `${db.loans.filter((l) => l.userId === userId && !l.returnedAt).length} book(s) not returned` : 'Clear' },
    { dept: 'Hostel', ok: !db.rooms.some((r) => r.occupants.includes(userId)), note: db.rooms.some((r) => r.occupants.includes(userId)) ? 'Room not vacated' : 'Clear' },
  ]
  return { ok: items.every((i) => i.ok), items }
}

export default function HelpCenter() {
  const db = useDB()
  const user = useCurrentUser()!
  const isStaff = user.role === 'admin'
  const handles = (t: Ticket) => isStaff && (persona(user) === 'super' || TICKET_OFFICE[t.category] === persona(user))
  const [area, setArea] = useState<'services' | 'tickets'>(user.role === 'parent' ? 'tickets' : 'services')
  const [q, setQ] = useState('')
  const [tab, setTab] = useState<'open' | 'resolved'>('open')
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState({ category: 'IT Support' as Ticket['category'], subject: '', description: '', priority: 'Medium' as Ticket['priority'], anonymous: false })
  const [view, setView] = useState<string | null>(null)
  const [comment, setComment] = useState('')
  const [cert, setCert] = useState<Ticket | null>(null)

  const visible = db.tickets.filter((t) => handles(t) || t.raisedBy === user.id || t.assignedTo === user.id)
  const list = visible.filter((t) => matches(q, t.number, t.subject, t.description, t.category, t.anonymous && t.raisedBy !== user.id ? '' : userName(db, t.raisedBy))).filter((t) => (tab === 'open' ? !['RESOLVED', 'CLOSED'].includes(t.status) : ['RESOLVED', 'CLOSED'].includes(t.status))).sort((a, b) => b.createdAt - a.createdAt)
  const t = view ? db.tickets.find((x) => x.id === view) : null

  const create = () => {
    if (!draft.subject.trim()) return
    const number = `HC-${1000 + db.tickets.length + 1}`
    update((d) => { d.tickets.push({ id: uid('tk'), number, ...draft, raisedBy: user.id, status: 'OPEN', createdAt: Date.now(), slaHours: CATS.find((c) => c.id === draft.category)!.sla, comments: [] }) })
    notify(officeUsers(db, TICKET_OFFICE[draft.category]), `New ticket ${number}: ${draft.subject}`, '/help')
    setCreating(false); setDraft({ category: 'IT Support', subject: '', description: '', priority: 'Medium', anonymous: false })
  }
  const setStatus = (tk: Ticket, status: Ticket['status']) => {
    update((d) => { const x = d.tickets.find((y) => y.id === tk.id)!; x.status = status; if (!x.assignedTo) x.assignedTo = user.id })
    notify([tk.raisedBy], `Ticket ${tk.number} is now ${status.replace('_', ' ').toLowerCase()}`, '/help')
    audit(user.id, 'TICKET_STATUS', `${tk.number} → ${status}`)
  }
  const addComment = () => {
    if (!t || !comment.trim()) return
    update((d) => { d.tickets.find((y) => y.id === t.id)!.comments.push({ by: user.id, text: comment, at: Date.now() }) })
    if (t.raisedBy !== user.id) notify([t.raisedBy], `Reply on ${t.number}`, '/help')
    setComment('')
  }

  return (
    <>
      <PageHeader title="Help Center" subtitle="Book counselling, office and department appointments, or raise a request or grievance"
        search={area === 'tickets' ? { value: q, onChange: setQ, placeholder: 'Search tickets, people…' } : undefined}
        actions={area === 'tickets' && persona(user) !== 'super' && <button className="btn" onClick={() => setCreating(true)}><Plus size={14} /> Raise a request</button>} />
      {user.role !== 'parent' && (
        <div className="row gap">
          <button className={`chip ${area === 'services' ? 'active' : ''}`} onClick={() => setArea('services')}>Services &amp; appointments</button>
          <button className={`chip ${area === 'tickets' ? 'active' : ''}`} onClick={() => setArea('tickets')}>Requests &amp; tickets</button>
        </div>
      )}
      {area === 'services' ? <AppointmentsPanel /> : <>
      <div className="grid grid-4">
        <Stat label="Open" value={visible.filter((x) => x.status === 'OPEN').length} tone="warning" icon={<LifeBuoy size={22} />} />
        <Stat label="In progress" value={visible.filter((x) => x.status === 'IN_PROGRESS').length} tone="info" />
        <Stat label="SLA breached" value={visible.filter(isOverdue).length} tone="danger" />
        <Stat label="Resolved" value={visible.filter((x) => x.status === 'RESOLVED' || x.status === 'CLOSED').length} tone="success" />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'open', label: 'Active' }, { id: 'resolved', label: 'Resolved' }]} />
      <Card>
        {list.length === 0 ? <Empty text="No tickets." /> : (
          <div className="table-wrap"><table>
            <thead><tr><th>#</th><th>Subject</th><th>Category</th><th>Raised by</th><th>Priority</th><th>SLA</th><th>Status</th><th /></tr></thead>
            <tbody>{list.map((x) => (
              <tr key={x.id}>
                <td>{x.number}</td><td>{x.subject}</td><td>{x.category}</td>
                <td>{x.anonymous && x.raisedBy !== user.id ? <span className="muted">Anonymous</span> : userName(db, x.raisedBy)}</td>
                <td><Badge tone={x.priority === 'High' ? 'danger' : x.priority === 'Medium' ? 'warning' : 'neutral'}>{x.priority}</Badge></td>
                <td>{isOverdue(x) ? <Badge tone="danger">Breached</Badge> : <span className="small muted">{x.slaHours}h · {timeAgo(x.createdAt)}</span>}</td>
                <td><Badge tone={x.status === 'RESOLVED' || x.status === 'CLOSED' ? 'success' : x.status === 'IN_PROGRESS' ? 'info' : 'warning'}>{x.status.replace('_', ' ')}</Badge></td>
                <td><button className="btn btn-outline btn-sm" onClick={() => setView(x.id)}>Open</button></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>
      </>}

      {t && (
        <Modal title={`${t.number} · ${t.subject}`} onClose={() => setView(null)} footer={<>
          {(t.category === 'Bonafide Certificate' || t.category === 'No-Dues Certificate') && t.status === 'RESOLVED' && <button className="btn btn-outline" onClick={() => setCert(t)}><Printer size={14} /> Certificate</button>}
          {handles(t) && t.status === 'OPEN' && <button className="btn btn-outline" onClick={() => setStatus(t, 'IN_PROGRESS')}>Start work</button>}
          {handles(t) && !['RESOLVED', 'CLOSED'].includes(t.status) && <button className="btn btn-success" disabled={t.category === 'No-Dues Certificate' && !noDuesCheck(db, t.raisedBy).ok} onClick={() => setStatus(t, 'RESOLVED')}>Resolve</button>}
          {t.raisedBy === user.id && t.status === 'RESOLVED' && <button className="btn" onClick={() => setStatus(t, 'CLOSED')}>Close</button>}
        </>}>
          <div className="row gap wrap"><Badge tone="brand">{t.category}</Badge><Badge>{t.status}</Badge>{isOverdue(t) && <Badge tone="danger">SLA breached</Badge>}{t.anonymous && <Badge tone="accent">Anonymous</Badge>}</div>
          <p>{t.description}</p>
          <div className="small muted">Handled by {OFFICES[TICKET_OFFICE[t.category]].label} · raised {fmtDateTime(t.createdAt)}{t.assignedTo ? ` · assigned to ${userName(db, t.assignedTo)}` : ''}</div>
          {t.category === 'No-Dues Certificate' && (
            <div className="stack" style={{ gap: 4 }}>
              <h3>Department clearance (automatic)</h3>
              {noDuesCheck(db, t.raisedBy).items.map((i) => <div key={i.dept} className="row between"><span>{i.dept}</span><Badge tone={i.ok ? 'success' : 'danger'}>{i.note}</Badge></div>)}
            </div>
          )}
          <div className="stack" style={{ gap: 8 }}>
            {t.comments.map((c, i) => <div key={i} className="card" style={{ padding: 10 }}><strong>{userName(db, c.by)}</strong> <span className="small muted">{timeAgo(c.at)}</span><div>{c.text}</div></div>)}
            <div className="row gap"><input className="input" placeholder="Add a comment…" value={comment} onChange={(e) => setComment(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addComment()} /><button className="btn btn-outline btn-sm" onClick={addComment}>Send</button></div>
          </div>
        </Modal>
      )}
      {creating && (
        <Modal title="Raise a request" onClose={() => setCreating(false)} footer={<><button className="btn btn-ghost" onClick={() => setCreating(false)}>Cancel</button><button className="btn" onClick={create}>Submit</button></>}>
          <Field label="Category"><select className="select" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as Ticket['category'] })}>{CATS.map((c) => <option key={c.id} value={c.id}>{c.id} · {OFFICES[TICKET_OFFICE[c.id]].label} (SLA {c.sla}h)</option>)}</select></Field>
          <Field label="Subject"><input className="input" value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} /></Field>
          <Field label="Details"><textarea className="textarea" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></Field>
          <Field label="Priority"><select className="select" value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value as Ticket['priority'] })}><option>Low</option><option>Medium</option><option>High</option></select></Field>
          {draft.category === 'Grievance' && <label className="row gap"><input type="checkbox" checked={draft.anonymous} onChange={(e) => setDraft({ ...draft, anonymous: e.target.checked })} /> Submit anonymously (per UGC grievance redressal regulations)</label>}
          {draft.category === 'No-Dues Certificate' && <div className="small muted">Accounts, library and hostel clearances are checked automatically.</div>}
        </Modal>
      )}
      {cert && (() => { const s = db.users.find((u) => u.id === cert.raisedBy)!; return (
        <Modal title={cert.category} onClose={() => setCert(null)} footer={<button className="btn" onClick={() => window.print()}><Printer size={14} /> Print</button>}>
          <div className="stack" style={{ textAlign: 'center' }}>
            <div className="brand-logo" style={{ margin: '0 auto' }}>CP</div>
            <h2 style={{ fontFamily: 'var(--font-display)' }}>Campus Portal University</h2>
            <h3>{cert.category.toUpperCase()}</h3>
            <p style={{ textAlign: 'left' }}>{cert.category === 'Bonafide Certificate'
              ? `This is to certify that ${s.name} (Roll No. ${s.rollNo}) is a bonafide student of ${s.program}, Semester ${s.semester}, for the academic year ${new Date().getFullYear()}–${String(new Date().getFullYear() + 1).slice(-2)}. This certificate is issued for the purpose stated in the request.`
              : `This is to certify that ${s.name} (Roll No. ${s.rollNo}) has no outstanding dues with the Accounts, Library or Hostel departments as of ${fmtDate(Date.now())}.`}</p>
            <div className="row between small"><span>Ref: {cert.number}</span><span>Registrar</span></div>
          </div>
        </Modal>
      ) })()}
    </>
  )
}
