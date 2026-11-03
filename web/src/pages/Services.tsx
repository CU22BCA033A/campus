import { useState } from 'react'
import { Bus, CheckCircle2, CreditCard, DoorOpen, Phone, Plus, Receipt, ShieldCheck } from 'lucide-react'
import { notify, uid, update, useCurrentUser, useDB } from '../data/store'
import { Badge, Card, Empty, Field, Modal, PageHeader, Stat, Tabs } from '../components/ui'
import { fmtDate, fmtDateTime, inr, userName } from '../lib'
import type { FeeItem } from '../data/types'

/* ---------------- Fees ---------------- */
export function Fees() {
  const db = useDB()
  const user = useCurrentUser()!
  const [paying, setPaying] = useState<FeeItem | null>(null)
  const [method, setMethod] = useState<'upi' | 'card' | 'netbanking'>('upi')
  const [processing, setProcessing] = useState(false)
  const [receipt, setReceipt] = useState<FeeItem | null>(null)

  if (user.role === 'admin') return <FeeAdmin />

  const fees = db.fees.filter((f) => f.studentId === user.id).sort((a, b) => a.dueAt - b.dueAt)
  const due = fees.filter((f) => !f.paidAt)
  const paid = fees.filter((f) => f.paidAt)

  const pay = () => {
    if (!paying) return
    setProcessing(true)
    setTimeout(() => {
      const txn = `TXN${Date.now().toString().slice(-8)}`
      update((d) => { const f = d.fees.find((x) => x.id === paying.id)!; f.paidAt = Date.now(); f.txnId = txn })
      notify([user.id], `Payment of ${inr(paying.amount)} received for ${paying.title}`, '/fees')
      setProcessing(false); setReceipt({ ...paying, paidAt: Date.now(), txnId: txn }); setPaying(null)
    }, 1200)
  }

  return (
    <>
      <PageHeader title="Fees & Payments" subtitle="Pay online and download receipts" />
      <div className="grid grid-4">
        <Stat label="Total due" value={inr(due.reduce((s, f) => s + f.amount, 0))} tone={due.length ? 'danger' : 'success'} icon={<CreditCard size={22} />} />
        <Stat label="Paid this year" value={inr(paid.reduce((s, f) => s + f.amount, 0))} tone="success" icon={<CheckCircle2 size={22} />} />
        <Stat label="Next due date" value={due[0] ? fmtDate(due[0].dueAt) : '—'} tone="warning" icon={<Receipt size={22} />} />
      </div>
      <Card title="Pending dues">
        {due.length === 0 ? <Empty icon={<CheckCircle2 />} text="No pending dues." /> : (
          <div className="list">
            {due.map((f) => (
              <div key={f.id} className="list-item">
                <div className="grow"><strong>{f.title}</strong><div className="small muted">Due {fmtDate(f.dueAt)} {f.dueAt < Date.now() && <Badge tone="danger">Overdue</Badge>}</div></div>
                <strong>{inr(f.amount)}</strong>
                <button className="btn" onClick={() => setPaying(f)}>Pay now</button>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card title="Payment history">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Description</th><th>Amount</th><th>Paid on</th><th>Transaction</th><th /></tr></thead>
            <tbody>{paid.map((f) => <tr key={f.id}><td>{f.title}</td><td>{inr(f.amount)}</td><td>{fmtDate(f.paidAt!)}</td><td className="muted">{f.txnId}</td><td><button className="btn btn-outline btn-sm" onClick={() => setReceipt(f)}>Receipt</button></td></tr>)}</tbody>
          </table>
        </div>
      </Card>

      {paying && (
        <Modal title="Secure payment" onClose={() => !processing && setPaying(null)} footer={<><button className="btn btn-ghost" disabled={processing} onClick={() => setPaying(null)}>Cancel</button><button className="btn btn-success" disabled={processing} onClick={pay}>{processing ? 'Processing…' : `Pay ${inr(paying.amount)}`}</button></>}>
          <div className="row between"><span>{paying.title}</span><strong>{inr(paying.amount)}</strong></div>
          <Tabs value={method} onChange={setMethod} tabs={[{ id: 'upi', label: 'UPI' }, { id: 'card', label: 'Card' }, { id: 'netbanking', label: 'Net banking' }]} />
          {method === 'upi' && <Field label="UPI ID"><input className="input" placeholder="name@bank" /></Field>}
          {method === 'card' && <><Field label="Card number"><input className="input" placeholder="4111 1111 1111 1111" /></Field><div className="grid grid-2"><Field label="Expiry"><input className="input" placeholder="MM/YY" /></Field><Field label="CVV"><input className="input" placeholder="•••" /></Field></div></>}
          {method === 'netbanking' && <Field label="Bank"><select className="select"><option>State Bank of India</option><option>HDFC Bank</option><option>ICICI Bank</option><option>Canara Bank</option></select></Field>}
          <div className="small muted row gap"><ShieldCheck size={14} /> Demo payment. Connect Razorpay/PayU for real transactions.</div>
        </Modal>
      )}
      {receipt && (
        <Modal title="Payment receipt" onClose={() => setReceipt(null)} footer={<button className="btn" onClick={() => window.print()}>Print</button>}>
          <div className="stack">
            <div className="row gap"><div className="brand-logo">CP</div><div><strong>Campus Portal</strong><div className="small muted">Fee receipt</div></div></div>
            <table><tbody>
              <tr><td className="muted">Student</td><td>{user.name} ({user.rollNo})</td></tr>
              <tr><td className="muted">Description</td><td>{receipt.title}</td></tr>
              <tr><td className="muted">Amount</td><td><strong>{inr(receipt.amount)}</strong></td></tr>
              <tr><td className="muted">Paid on</td><td>{fmtDateTime(receipt.paidAt!)}</td></tr>
              <tr><td className="muted">Transaction ID</td><td>{receipt.txnId}</td></tr>
            </tbody></table>
          </div>
        </Modal>
      )}
    </>
  )
}

function FeeAdmin() {
  const db = useDB()
  const students = db.users.filter((u) => u.role === 'student')
  return (
    <>
      <PageHeader title="Fee collection" subtitle="Outstanding dues by student" />
      <Card>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Student</th><th>Roll no.</th><th>Paid</th><th>Outstanding</th><th>Status</th><th /></tr></thead>
            <tbody>
              {students.map((s) => {
                const f = db.fees.filter((x) => x.studentId === s.id)
                const out = f.filter((x) => !x.paidAt).reduce((a, x) => a + x.amount, 0)
                return (
                  <tr key={s.id}>
                    <td>{s.name}</td><td>{s.rollNo}</td><td>{inr(f.filter((x) => x.paidAt).reduce((a, x) => a + x.amount, 0))}</td><td>{inr(out)}</td>
                    <td><Badge tone={out ? 'warning' : 'success'}>{out ? 'Due' : 'Clear'}</Badge></td>
                    <td>{out > 0 && <button className="btn btn-outline btn-sm" onClick={() => notify([s.id], `Reminder: ${inr(out)} fee outstanding`, '/fees')}>Send reminder</button>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}

/* ---------------- Gate pass ---------------- */
export function GatePass() {
  const db = useDB()
  const user = useCurrentUser()!
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState({ reason: '', out: '', back: '' })
  const isStudent = user.role === 'student'
  const list = db.gatePasses.filter((g) => !isStudent || g.studentId === user.id).sort((a, b) => b.outAt - a.outAt)

  const apply = () => {
    if (!draft.reason || !draft.out || !draft.back) return
    update((d) => { d.gatePasses.push({ id: uid('g'), studentId: user.id, reason: draft.reason, outAt: new Date(draft.out).getTime(), returnAt: new Date(draft.back).getTime(), status: 'PENDING' }) })
    notify(db.users.filter((u) => u.role !== 'student').map((u) => u.id), `Gate pass request from ${user.name}`, '/gate-pass')
    setCreating(false); setDraft({ reason: '', out: '', back: '' })
  }
  const review = (id: string, status: 'APPROVED' | 'REJECTED') => {
    const g = db.gatePasses.find((x) => x.id === id)!
    update((d) => { const x = d.gatePasses.find((y) => y.id === id)!; x.status = status; x.reviewedBy = user.id })
    notify([g.studentId], `Your gate pass was ${status.toLowerCase()}`, '/gate-pass')
  }

  return (
    <>
      <PageHeader title="Gate pass" subtitle={isStudent ? 'Request permission to leave campus' : 'Review student gate pass requests'} actions={isStudent && <button className="btn" onClick={() => setCreating(true)}><Plus size={14} /> Request gate pass</button>} />
      {list.length === 0 && <Card><Empty icon={<DoorOpen />} text="No gate pass requests." /></Card>}
      <div className="grid grid-2">
        {list.map((g) => (
          <Card key={g.id}>
            <div className="row between" style={{ alignItems: 'flex-start' }}>
              <div className="stack" style={{ gap: 4 }}>
                {!isStudent && <strong>{userName(db, g.studentId)} <span className="muted small">{db.users.find((u) => u.id === g.studentId)?.rollNo}</span></strong>}
                <span>{g.reason}</span>
                <span className="small muted">Out: {fmtDateTime(g.outAt)}<br />Return: {fmtDateTime(g.returnAt)}</span>
              </div>
              <Badge tone={g.status === 'APPROVED' ? 'success' : g.status === 'REJECTED' ? 'danger' : 'warning'}>{g.status}</Badge>
            </div>
            {!isStudent && g.status === 'PENDING' && (
              <div className="row gap" style={{ marginTop: 12 }}><button className="btn btn-success btn-sm" onClick={() => review(g.id, 'APPROVED')}>Approve</button><button className="btn btn-danger btn-sm" onClick={() => review(g.id, 'REJECTED')}>Reject</button></div>
            )}
            {isStudent && g.status === 'APPROVED' && g.returnAt > Date.now() && (
              <div className="alert alert-success" style={{ marginTop: 12 }}>Show this pass at the gate · Pass #{g.id.toUpperCase()}</div>
            )}
          </Card>
        ))}
      </div>
      {creating && (
        <Modal title="Request gate pass" onClose={() => setCreating(false)} footer={<><button className="btn btn-ghost" onClick={() => setCreating(false)}>Cancel</button><button className="btn" onClick={apply}>Submit request</button></>}>
          <Field label="Reason"><textarea className="textarea" value={draft.reason} onChange={(e) => setDraft({ ...draft, reason: e.target.value })} /></Field>
          <div className="grid grid-2">
            <Field label="Out time"><input className="input" type="datetime-local" value={draft.out} onChange={(e) => setDraft({ ...draft, out: e.target.value })} /></Field>
            <Field label="Return time"><input className="input" type="datetime-local" value={draft.back} onChange={(e) => setDraft({ ...draft, back: e.target.value })} /></Field>
          </div>
        </Modal>
      )}
    </>
  )
}

/* ---------------- Transport ---------------- */
export function Transport() {
  const db = useDB()
  const user = useCurrentUser()!
  const mine = db.routes.find((r) => r.subscribers.includes(user.id))
  const subscribe = (id: string) => update((d) => { d.routes.forEach((r) => { r.subscribers = r.subscribers.filter((s) => s !== user.id); if (r.id === id) r.subscribers.push(user.id) }) })
  return (
    <>
      <PageHeader title="Transport" subtitle="Campus bus routes and timings" />
      {mine && <div className="alert alert-info"><Bus size={16} /> You are registered on <strong>&nbsp;{mine.name}</strong>&nbsp;· Bus {mine.bus}</div>}
      <div className="grid grid-3">
        {db.routes.map((r) => (
          <Card key={r.id} title={r.name} action={mine?.id === r.id && <Badge tone="success">My route</Badge>}>
            <div className="stack">
              <div className="small muted">Bus {r.bus} · {r.subscribers.length} riders</div>
              <div className="list">
                {r.stops.map((s, i) => (
                  <div key={i} className="list-item small" style={{ padding: '6px 0' }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: i === r.stops.length - 1 ? 'var(--brand)' : 'var(--accent)' }} />
                    <span className="grow">{s.name}</span><strong>{s.time}</strong>
                  </div>
                ))}
              </div>
              <div className="small row gap"><Phone size={14} /> {r.driver} · <a href={`tel:${r.driverPhone}`}>{r.driverPhone}</a></div>
              {user.role === 'student' && mine?.id !== r.id && <button className="btn btn-outline" onClick={() => subscribe(r.id)}>Register for this route</button>}
            </div>
          </Card>
        ))}
      </div>
    </>
  )
}

/* ---------------- Venue booking ---------------- */
const VENUES = ['Seminar Hall A', 'Seminar Hall B', 'Auditorium', 'Conference Room', 'Lab-1', 'Lab-2', 'Lab-3']
const SLOTS = ['09:00–11:00', '11:00–13:00', '14:00–16:00', '16:00–18:00']

export function Venues() {
  const db = useDB()
  const user = useCurrentUser()!
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [booking, setBooking] = useState<{ venue: string; slot: string } | null>(null)
  const [purpose, setPurpose] = useState('')
  const book = () => {
    if (!booking || !purpose.trim()) return
    update((d) => { d.bookings.push({ id: uid('b'), venue: booking.venue, slot: booking.slot, date, purpose, bookedBy: user.id }) })
    setBooking(null); setPurpose('')
  }
  return (
    <>
      <PageHeader title="Venue booking" subtitle="Reserve halls and labs" actions={<input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 180 }} />} />
      <Card>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Venue</th>{SLOTS.map((s) => <th key={s}>{s}</th>)}</tr></thead>
            <tbody>
              {VENUES.map((v) => (
                <tr key={v}>
                  <td><strong>{v}</strong></td>
                  {SLOTS.map((s) => {
                    const b = db.bookings.find((x) => x.venue === v && x.slot === s && x.date === date)
                    return (
                      <td key={s}>
                        {b ? (
                          <div className="small"><Badge tone={b.bookedBy === user.id ? 'brand' : 'neutral'}>{b.bookedBy === user.id ? 'Your booking' : 'Booked'}</Badge><div className="muted ellipsis" style={{ maxWidth: 140 }}>{b.purpose} · {userName(db, b.bookedBy)}</div>
                            {(b.bookedBy === user.id || user.role === 'admin') && <button className="btn btn-ghost btn-sm" onClick={() => update((d) => { d.bookings = d.bookings.filter((x) => x.id !== b.id) })}>Cancel</button>}</div>
                        ) : <button className="btn btn-outline btn-sm" onClick={() => setBooking({ venue: v, slot: s })}>Book</button>}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {booking && (
        <Modal title={`Book ${booking.venue}`} onClose={() => setBooking(null)} footer={<><button className="btn btn-ghost" onClick={() => setBooking(null)}>Cancel</button><button className="btn" onClick={book}>Confirm booking</button></>}>
          <div>{fmtDate(date)} · {booking.slot}</div>
          <Field label="Purpose"><input className="input" value={purpose} onChange={(e) => setPurpose(e.target.value)} /></Field>
        </Modal>
      )}
    </>
  )
}
