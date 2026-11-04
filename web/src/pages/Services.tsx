import { useState } from 'react'
import { Bus, CheckCircle2, CreditCard, DoorOpen, Phone, Plus, Receipt, ShieldCheck, Undo2 } from 'lucide-react'
import { audit, notify, uid, update, useCurrentUser, useDB } from '../data/store'
import { Badge, Card, Empty, Field, Modal, PageHeader, Stat, Tabs } from '../components/ui'
import { feeOutstanding, fmtDate, fmtDateTime, inr, userName } from '../lib'
import type { FeeItem } from '../data/types'

/* ---------------- Fees ---------------- */
// Gateways are selectable by the payer; each shows its convenience charge.
const GATEWAYS = [
  { id: 'Razorpay', charge: 0.018 },
  { id: 'PayU', charge: 0.016 },
  { id: 'CCAvenue', charge: 0.02 },
  { id: 'Bank transfer (NEFT)', charge: 0 },
]
/** Next payable amount: the next unpaid instalment, or the full outstanding balance. */
const nextPayable = (f: FeeItem) => {
  const inst = f.installments?.find((i) => !i.paidAt)
  return inst ? inst.amount : feeOutstanding(f)
}

export function Fees() {
  const db = useDB()
  const user = useCurrentUser()!
  const [paying, setPaying] = useState<FeeItem | null>(null)
  const [gateway, setGateway] = useState(GATEWAYS[0].id)
  const [method, setMethod] = useState<'upi' | 'card' | 'netbanking'>('upi')
  const [processing, setProcessing] = useState(false)
  const [receipt, setReceipt] = useState<(FeeItem & { paidNow?: number }) | null>(null)
  const [refundFor, setRefundFor] = useState<FeeItem | null>(null)
  const [refundReason, setRefundReason] = useState('')

  if (user.role === 'admin') return <FeeAdmin />

  const fees = db.fees.filter((f) => f.studentId === user.id).sort((a, b) => a.dueAt - b.dueAt)
  const due = fees.filter((f) => feeOutstanding(f) > 0)
  const paid = fees.filter((f) => f.paidAt || (f.paidAmount ?? 0) > 0)
  const gw = GATEWAYS.find((g) => g.id === gateway)!

  const splitInstallments = (f: FeeItem) => {
    const total = feeOutstanding(f)
    const half = Math.round(total / 2)
    update((d) => { d.fees.find((x) => x.id === f.id)!.installments = [{ amount: half, dueAt: f.dueAt }, { amount: total - half, dueAt: f.dueAt + 60 * 86_400_000 }] })
    audit(user.id, 'FEE_INSTALMENT', `${f.title} split into 2 instalments`)
  }

  const pay = () => {
    if (!paying) return
    setProcessing(true)
    setTimeout(() => {
      const txn = `TXN${Date.now().toString().slice(-8)}`
      const amount = nextPayable(paying)
      update((d) => {
        const f = d.fees.find((x) => x.id === paying.id)!
        f.paidAmount = (f.paidAmount ?? 0) + amount
        f.gateway = gateway
        f.txnId = txn
        const inst = f.installments?.find((i) => !i.paidAt)
        if (inst) { inst.paidAt = Date.now(); inst.txnId = txn }
        if (feeOutstanding(f) <= 0) f.paidAt = Date.now()
      })
      notify([user.id, ...db.users.filter((u) => u.role === 'parent' && u.wardIds?.includes(user.id)).map((u) => u.id)], `Payment of ${inr(amount)} received for ${paying.title}`, '/fees')
      audit(user.id, 'FEE_PAYMENT', `${paying.title}: ${inr(amount)} via ${gateway} (${txn})`)
      setProcessing(false); setReceipt({ ...paying, paidAt: Date.now(), txnId: txn, gateway, paidNow: amount }); setPaying(null)
    }, 1000)
  }
  const requestRefund = () => {
    if (!refundFor || !refundReason.trim()) return
    update((d) => { d.refunds.push({ id: uid('rf'), feeId: refundFor.id, studentId: user.id, amount: refundFor.paidAmount ?? refundFor.amount, reason: refundReason, status: 'REQUESTED', createdAt: Date.now() }) })
    notify(db.users.filter((u) => u.role === 'admin').map((u) => u.id), `Refund request from ${user.name}: ${refundFor.title}`, '/fees')
    setRefundFor(null); setRefundReason('')
  }

  return (
    <>
      <PageHeader title="Fees & Payments" subtitle="Pay online in full or in instalments, download receipts, request refunds" />
      <div className="grid grid-4">
        <Stat label="Total due" value={inr(due.reduce((s, f) => s + feeOutstanding(f), 0))} tone={due.length ? 'danger' : 'success'} icon={<CreditCard size={22} />} />
        <Stat label="Paid" value={inr(fees.reduce((s, f) => s + (f.paidAmount ?? (f.paidAt ? f.amount : 0)), 0))} tone="success" icon={<CheckCircle2 size={22} />} />
        <Stat label="Scholarships" value={inr(fees.reduce((s, f) => s + (f.scholarship ?? 0), 0))} tone="accent" />
        <Stat label="Next due date" value={due[0] ? fmtDate(due[0].installments?.find((i) => !i.paidAt)?.dueAt ?? due[0].dueAt) : '—'} tone="warning" icon={<Receipt size={22} />} />
      </div>
      <Card title="Pending dues">
        {due.length === 0 ? <Empty icon={<CheckCircle2 />} text="No pending dues." /> : (
          <div className="list">
            {due.map((f) => (
              <div key={f.id} className="list-item" style={{ flexWrap: 'wrap' }}>
                <div className="grow">
                  <strong>{f.title}</strong>
                  <div className="small muted">Due {fmtDate(f.dueAt)} {f.dueAt < Date.now() && <Badge tone="danger">Overdue</Badge>} {f.scholarship ? <Badge tone="accent">Scholarship −{inr(f.scholarship)}</Badge> : null}</div>
                  {f.installments && <div className="row gap wrap small" style={{ marginTop: 4 }}>{f.installments.map((i, k) => <Badge key={k} tone={i.paidAt ? 'success' : 'warning'}>Instalment {k + 1}: {inr(i.amount)} · {i.paidAt ? 'paid' : `due ${fmtDate(i.dueAt)}`}</Badge>)}</div>}
                </div>
                <strong>{inr(feeOutstanding(f))}</strong>
                {!f.installments && feeOutstanding(f) >= 10000 && <button className="btn btn-outline btn-sm" onClick={() => splitInstallments(f)}>Pay in 2 instalments</button>}
                <button className="btn" onClick={() => setPaying(f)}>Pay {inr(nextPayable(f))}</button>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card title="Payment history">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Description</th><th>Paid</th><th>Paid on</th><th>Gateway / transaction</th><th /></tr></thead>
            <tbody>{paid.map((f) => {
              const rf = db.refunds.find((r) => r.feeId === f.id)
              return (
                <tr key={f.id}>
                  <td>{f.title}</td><td>{inr(f.paidAmount ?? f.amount)}</td><td>{f.paidAt ? fmtDate(f.paidAt) : <Badge tone="warning">Part-paid</Badge>}</td>
                  <td className="muted">{f.gateway ?? '—'} · {f.txnId}</td>
                  <td className="row gap">
                    <button className="btn btn-outline btn-sm" onClick={() => setReceipt(f)}>Receipt</button>
                    {rf ? <Badge tone={rf.status === 'PROCESSED' ? 'success' : rf.status === 'REJECTED' ? 'danger' : 'warning'}>Refund {rf.status.toLowerCase()}</Badge> : f.paidAt && f.paidAt > Date.now() - 90 * 86_400_000 && <button className="btn btn-ghost btn-sm" onClick={() => setRefundFor(f)}><Undo2 size={14} /> Refund</button>}
                  </td>
                </tr>
              )
            })}</tbody>
          </table>
        </div>
      </Card>

      {paying && (
        <Modal title="Secure payment" onClose={() => !processing && setPaying(null)} footer={<><button className="btn btn-ghost" disabled={processing} onClick={() => setPaying(null)}>Cancel</button><button className="btn btn-success" disabled={processing} onClick={pay}>{processing ? 'Processing…' : `Pay ${inr(Math.round(nextPayable(paying) * (1 + gw.charge)))}`}</button></>}>
          <div className="row between"><span>{paying.title}{paying.installments ? ' (next instalment)' : ''}</span><strong>{inr(nextPayable(paying))}</strong></div>
          <Field label="Payment gateway">
            <div className="stack" style={{ gap: 6 }}>{GATEWAYS.map((g) => (
              <label key={g.id} className={`option ${gateway === g.id ? 'selected' : ''}`}>
                <input type="radio" name="gw" checked={gateway === g.id} onChange={() => setGateway(g.id)} />
                <span className="grow">{g.id}</span><span className="small muted">{g.charge ? `+${(g.charge * 100).toFixed(1)}% · ${inr(Math.round(nextPayable(paying) * g.charge))}` : 'No charge'}</span>
              </label>
            ))}</div>
          </Field>
          {gateway !== 'Bank transfer (NEFT)' && <Tabs value={method} onChange={setMethod} tabs={[{ id: 'upi', label: 'UPI' }, { id: 'card', label: 'Card' }, { id: 'netbanking', label: 'Net banking' }]} />}
          {gateway !== 'Bank transfer (NEFT)' && method === 'upi' && <Field label="UPI ID"><input className="input" placeholder="name@bank" /></Field>}
          {gateway !== 'Bank transfer (NEFT)' && method === 'card' && <><Field label="Card number"><input className="input" placeholder="4111 1111 1111 1111" /></Field><div className="grid grid-2"><Field label="Expiry"><input className="input" placeholder="MM/YY" /></Field><Field label="CVV"><input className="input" placeholder="•••" /></Field></div></>}
          {gateway !== 'Bank transfer (NEFT)' && method === 'netbanking' && <Field label="Bank"><select className="select"><option>State Bank of India</option><option>HDFC Bank</option><option>ICICI Bank</option><option>Canara Bank</option></select></Field>}
          {gateway === 'Bank transfer (NEFT)' && <div className="alert alert-info">Account: Campus Portal University · A/c 0123456789 · IFSC SBIN0000123</div>}
          <div className="small muted row gap"><ShieldCheck size={14} /> Demo payment. Connect the gateway's live keys for real transactions.</div>
        </Modal>
      )}
      {receipt && (
        <Modal title="Payment receipt" onClose={() => setReceipt(null)} footer={<button className="btn" onClick={() => window.print()}>Print</button>}>
          <div className="stack">
            <div className="row gap"><div className="brand-logo">CP</div><div><strong>Campus Portal</strong><div className="small muted">Fee receipt</div></div></div>
            <table><tbody>
              <tr><td className="muted">Student</td><td>{user.name} ({user.rollNo})</td></tr>
              <tr><td className="muted">Description</td><td>{receipt.title}</td></tr>
              {receipt.scholarship ? <tr><td className="muted">Scholarship</td><td>−{inr(receipt.scholarship)}</td></tr> : null}
              <tr><td className="muted">Amount paid</td><td><strong>{inr(receipt.paidNow ?? receipt.paidAmount ?? receipt.amount)}</strong></td></tr>
              <tr><td className="muted">Paid on</td><td>{receipt.paidAt ? fmtDateTime(receipt.paidAt) : '—'}</td></tr>
              <tr><td className="muted">Gateway</td><td>{receipt.gateway ?? '—'}</td></tr>
              <tr><td className="muted">Transaction ID</td><td>{receipt.txnId}</td></tr>
            </tbody></table>
          </div>
        </Modal>
      )}
      {refundFor && (
        <Modal title={`Request refund: ${refundFor.title}`} onClose={() => setRefundFor(null)} footer={<><button className="btn btn-ghost" onClick={() => setRefundFor(null)}>Cancel</button><button className="btn" onClick={requestRefund} disabled={!refundReason.trim()}>Submit request</button></>}>
          <div>Amount: <strong>{inr(refundFor.paidAmount ?? refundFor.amount)}</strong></div>
          <Field label="Reason"><textarea className="textarea" value={refundReason} onChange={(e) => setRefundReason(e.target.value)} placeholder="e.g. duplicate payment, withdrawal from hostel" /></Field>
        </Modal>
      )}
    </>
  )
}

function FeeAdmin() {
  const db = useDB()
  const me = useCurrentUser()!
  const [tab, setTab] = useState<'dues' | 'refunds' | 'scholarships'>('dues')
  const students = db.users.filter((u) => u.role === 'student')
  const [sch, setSch] = useState({ name: '', kind: 'PERCENT' as 'PERCENT' | 'FIXED', value: 10, minMerit: 80 })
  const [grant, setGrant] = useState({ studentId: '', scholarshipId: '' })

  const decideRefund = (id: string, status: 'APPROVED' | 'REJECTED' | 'PROCESSED') => {
    const r = db.refunds.find((x) => x.id === id)!
    update((d) => { d.refunds.find((x) => x.id === id)!.status = status })
    notify([r.studentId], `Refund ${status.toLowerCase()}: ${inr(r.amount)}`, '/fees')
    audit(me.id, `REFUND_${status}`, `${userName(db, r.studentId)}: ${inr(r.amount)}`)
  }
  const grantScholarship = () => {
    const s = db.scholarships.find((x) => x.id === grant.scholarshipId)
    const fee = db.fees.find((f) => f.studentId === grant.studentId && !f.paidAt && (f.head === 'Tuition' || f.title.toLowerCase().includes('tuition')))
    if (!s || !fee) return alert('Select a student who has an unpaid tuition fee, and a scholarship.')
    const waiver = s.kind === 'PERCENT' ? Math.round((fee.amount * s.value) / 100) : Math.min(fee.amount, s.value)
    update((d) => { d.fees.find((f) => f.id === fee.id)!.scholarship = waiver })
    notify([grant.studentId], `${s.name} applied: ${inr(waiver)} waived on ${fee.title}`, '/fees')
    audit(me.id, 'SCHOLARSHIP_GRANT', `${s.name} → ${userName(db, grant.studentId)} (${inr(waiver)})`)
  }

  return (
    <>
      <PageHeader title="Fee collection" subtitle="Dues, reminders, scholarships and refunds" />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'dues', label: 'Outstanding dues' }, { id: 'refunds', label: 'Refunds', count: db.refunds.filter((r) => r.status === 'REQUESTED' || r.status === 'APPROVED').length }, { id: 'scholarships', label: 'Scholarships', count: db.scholarships.length }]} />
      {tab === 'dues' && (
        <Card>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Student</th><th>Roll no.</th><th>Paid</th><th>Scholarship</th><th>Outstanding</th><th>Status</th><th /></tr></thead>
              <tbody>
                {students.map((s) => {
                  const f = db.fees.filter((x) => x.studentId === s.id)
                  const out = f.reduce((a, x) => a + feeOutstanding(x), 0)
                  return (
                    <tr key={s.id}>
                      <td>{s.name}</td><td>{s.rollNo}</td><td>{inr(f.reduce((a, x) => a + (x.paidAmount ?? (x.paidAt ? x.amount : 0)), 0))}</td><td>{inr(f.reduce((a, x) => a + (x.scholarship ?? 0), 0))}</td><td>{inr(out)}</td>
                      <td><Badge tone={out ? 'warning' : 'success'}>{out ? 'Due' : 'Clear'}</Badge></td>
                      <td>{out > 0 && <button className="btn btn-outline btn-sm" onClick={() => notify([s.id, ...db.users.filter((u) => u.role === 'parent' && u.wardIds?.includes(s.id)).map((u) => u.id)], `Reminder: ${inr(out)} fee outstanding`, '/fees')}>Send reminder</button>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {tab === 'refunds' && (
        <Card>
          {db.refunds.length === 0 ? <Empty text="No refund requests." /> : (
            <table><thead><tr><th>Student</th><th>Fee</th><th>Amount</th><th>Reason</th><th>Status</th><th /></tr></thead><tbody>
              {db.refunds.map((r) => (
                <tr key={r.id}>
                  <td>{userName(db, r.studentId)}</td><td>{db.fees.find((f) => f.id === r.feeId)?.title}</td><td>{inr(r.amount)}</td><td>{r.reason}</td>
                  <td><Badge tone={r.status === 'PROCESSED' ? 'success' : r.status === 'REJECTED' ? 'danger' : 'warning'}>{r.status}</Badge></td>
                  <td className="row gap">
                    {r.status === 'REQUESTED' && <><button className="btn btn-success btn-sm" onClick={() => decideRefund(r.id, 'APPROVED')}>Approve</button><button className="btn btn-danger btn-sm" onClick={() => decideRefund(r.id, 'REJECTED')}>Reject</button></>}
                    {r.status === 'APPROVED' && <button className="btn btn-sm" onClick={() => decideRefund(r.id, 'PROCESSED')}>Mark processed</button>}
                  </td>
                </tr>
              ))}
            </tbody></table>
          )}
        </Card>
      )}
      {tab === 'scholarships' && (
        <div className="grid grid-2">
          <Card title="Scholarship plans">
            <div className="list">{db.scholarships.map((s) => <div key={s.id} className="list-item"><div className="grow"><strong>{s.name}</strong><div className="small muted">{s.kind === 'PERCENT' ? `${s.value}% of tuition` : inr(s.value)} · merit ≥ {s.minMerit}</div></div></div>)}</div>
            <div className="stack" style={{ marginTop: 12 }}>
              <div className="grid grid-2">
                <Field label="Name"><input className="input" value={sch.name} onChange={(e) => setSch({ ...sch, name: e.target.value })} /></Field>
                <Field label="Type"><select className="select" value={sch.kind} onChange={(e) => setSch({ ...sch, kind: e.target.value as 'PERCENT' | 'FIXED' })}><option value="PERCENT">Percentage</option><option value="FIXED">Fixed amount</option></select></Field>
                <Field label={sch.kind === 'PERCENT' ? 'Percent' : 'Amount (₹)'}><input className="input" type="number" value={sch.value} onChange={(e) => setSch({ ...sch, value: Number(e.target.value) })} /></Field>
                <Field label="Min merit score"><input className="input" type="number" value={sch.minMerit} onChange={(e) => setSch({ ...sch, minMerit: Number(e.target.value) })} /></Field>
              </div>
              <button className="btn btn-outline" onClick={() => { if (!sch.name) return; update((d) => { d.scholarships.push({ id: uid('sc'), ...sch }) }); setSch({ ...sch, name: '' }) }}><Plus size={14} /> Add plan</button>
            </div>
          </Card>
          <Card title="Grant to a student">
            <div className="stack">
              <Field label="Student"><select className="select" value={grant.studentId} onChange={(e) => setGrant({ ...grant, studentId: e.target.value })}><option value="">Select…</option>{students.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.rollNo})</option>)}</select></Field>
              <Field label="Scholarship"><select className="select" value={grant.scholarshipId} onChange={(e) => setGrant({ ...grant, scholarshipId: e.target.value })}><option value="">Select…</option>{db.scholarships.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
              <button className="btn" onClick={grantScholarship}>Apply to unpaid tuition fee</button>
            </div>
          </Card>
        </div>
      )}
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
