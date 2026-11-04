import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { BedDouble, Plus, ScanLine, Utensils, Wand2 } from 'lucide-react'
import { audit, notify, uid, update, useCurrentUser, useDB } from '../data/store'
import { Badge, Card, Empty, Field, Modal, PageHeader, Stat, Tabs } from '../components/ui'
import { fmtDateTime, inr, timeAgo, userName } from '../lib'
import type { MealCoupon } from '../data/types'

const MEALS: MealCoupon['meal'][] = ['Breakfast', 'Lunch', 'Snacks', 'Dinner']
const today = () => new Date().toISOString().slice(0, 10)

function Qr({ text }: { text: string }) {
  const [src, setSrc] = useState('')
  useEffect(() => { QRCode.toDataURL(text, { margin: 1, width: 140, color: { dark: '#1f2328', light: '#ffffff' } }).then(setSrc).catch(() => setSrc('')) }, [text])
  return src ? <img src={src} width={140} height={140} alt={`QR code ${text}`} /> : <div style={{ width: 140, height: 140 }} />
}

export default function Hostel() {
  const user = useCurrentUser()!
  return user.role === 'student' ? <StudentHostel /> : <HostelAdmin />
}

function StudentHostel() {
  const db = useDB()
  const user = useCurrentUser()!
  const room = db.rooms.find((r) => r.occupants.includes(user.id))
  const [applying, setApplying] = useState(false)
  const [draft, setDraft] = useState({ reason: '', from: '', to: '' })
  const leaves = db.hostelLeaves.filter((l) => l.studentId === user.id).sort((a, b) => b.createdAt - a.createdAt)
  const coupons = db.mealCoupons.filter((c) => c.studentId === user.id && c.date === today())

  const apply = () => {
    if (!draft.reason || !draft.from || !draft.to) return
    update((d) => { d.hostelLeaves.push({ id: uid('hl'), studentId: user.id, reason: draft.reason, from: new Date(draft.from).getTime(), to: new Date(draft.to).getTime(), parentStatus: 'PENDING', wardenStatus: 'PENDING', createdAt: Date.now() }) })
    notify(db.users.filter((u) => u.role === 'parent' && u.wardIds?.includes(user.id)).map((u) => u.id), `${user.name} requested hostel leave: ${draft.reason}`, '/home')
    setApplying(false); setDraft({ reason: '', from: '', to: '' })
  }
  const issueCoupons = () => update((d) => {
    for (const meal of MEALS) if (!d.mealCoupons.some((c) => c.studentId === user.id && c.date === today() && c.meal === meal)) d.mealCoupons.push({ id: uid('mc'), studentId: user.id, date: today(), meal, code: `${meal.slice(0, 2).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}` })
  })

  if (!room) return (<><PageHeader title="Hostel" /><Card><Empty icon={<BedDouble />} text="You are not allotted a hostel room. Contact the hostel office to apply." /></Card></>)

  return (
    <>
      <PageHeader title="Hostel & mess" subtitle="From allotment to exit" actions={<button className="btn" onClick={() => setApplying(true)}><Plus size={14} /> Request leave</button>} />
      <div className="grid grid-4">
        <Stat label="Room" value={room.number} hint={`${room.block} · ${room.type}`} icon={<BedDouble size={22} />} />
        <Stat label="Room-mates" value={room.occupants.length - 1} hint={room.occupants.filter((o) => o !== user.id).map((o) => userName(db, o)).join(', ') || 'None'} tone="info" />
        <Stat label="Hostel fee / semester" value={inr(room.feePerSem)} tone="accent" />
      </div>
      <div className="grid grid-2">
        <Card title="Leave requests" action={<span className="small muted">Parent approval → warden approval → gate pass</span>}>
          {leaves.length === 0 ? <Empty text="No leave requests." /> : (
            <div className="list">{leaves.map((l) => (
              <div key={l.id} className="list-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
                <strong>{l.reason}</strong>
                <span className="small muted">{fmtDateTime(l.from)} → {fmtDateTime(l.to)}</span>
                <div className="row gap small"><Badge tone={l.parentStatus === 'APPROVED' ? 'success' : l.parentStatus === 'REJECTED' ? 'danger' : 'warning'}>Parent: {l.parentStatus}</Badge><Badge tone={l.wardenStatus === 'APPROVED' ? 'success' : l.wardenStatus === 'REJECTED' ? 'danger' : 'neutral'}>Warden: {l.wardenStatus}</Badge></div>
                {l.wardenStatus === 'APPROVED' && <div className="alert alert-success small">Gate pass issued. Show it at the hostel gate.</div>}
              </div>
            ))}</div>
          )}
        </Card>
        <Card title={<span className="row gap"><Utensils size={16} /> Today's mess coupons</span>} action={coupons.length < MEALS.length && <button className="btn btn-sm" onClick={issueCoupons}>Get today's coupons</button>}>
          {coupons.length === 0 ? <Empty text="Generate QR coupons for today's meals." /> : (
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
              {MEALS.map((m) => { const c = coupons.find((x) => x.meal === m); return c && (
                <div key={m} className="card" style={{ padding: 10, textAlign: 'center', opacity: c.redeemedAt ? 0.5 : 1 }}>
                  <strong>{m}</strong><Qr text={c.code} /><div className="small">{c.code}</div>
                  <Badge tone={c.redeemedAt ? 'neutral' : 'success'}>{c.redeemedAt ? 'Used' : 'Valid today'}</Badge>
                </div>
              ) })}
            </div>
          )}
        </Card>
      </div>
      {applying && (
        <Modal title="Hostel leave request" onClose={() => setApplying(false)} footer={<><button className="btn btn-ghost" onClick={() => setApplying(false)}>Cancel</button><button className="btn" onClick={apply}>Send to parent</button></>}>
          <Field label="Reason"><textarea className="textarea" value={draft.reason} onChange={(e) => setDraft({ ...draft, reason: e.target.value })} /></Field>
          <div className="grid grid-2">
            <Field label="Leaving"><input className="input" type="datetime-local" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} /></Field>
            <Field label="Returning"><input className="input" type="datetime-local" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} /></Field>
          </div>
          <div className="small muted">Your parent is notified first. After they approve, the warden reviews the request.</div>
        </Modal>
      )}
    </>
  )
}

function HostelAdmin() {
  const db = useDB()
  const user = useCurrentUser()!
  const [tab, setTab] = useState<'rooms' | 'leaves' | 'mess'>('rooms')
  const [code, setCode] = useState('')
  const [scan, setScan] = useState<{ ok: boolean; text: string } | null>(null)
  const [allotFor, setAllotFor] = useState<string | null>(null)
  const students = db.users.filter((u) => u.role === 'student' && u.status === 'ACTIVE')
  const unassigned = students.filter((s) => !db.rooms.some((r) => r.occupants.includes(s.id)))
  const beds = db.rooms.reduce((s, r) => s + r.capacity, 0)
  const occupied = db.rooms.reduce((s, r) => s + r.occupants.length, 0)

  const allot = (studentId: string, roomId: string) => {
    update((d) => { d.rooms.forEach((r) => { r.occupants = r.occupants.filter((o) => o !== studentId) }); d.rooms.find((r) => r.id === roomId)!.occupants.push(studentId) })
    const r = db.rooms.find((x) => x.id === roomId)!
    notify([studentId], `Hostel room ${r.number} allotted`, '/hostel')
    audit(user.id, 'HOSTEL_ALLOT', `${userName(db, studentId)} → ${r.number}`)
  }
  /** Conflict-free bulk allocation: fills free beds in order, never over capacity. */
  const autoAllocate = () => {
    let n = 0
    update((d) => {
      for (const s of unassigned) {
        const r = d.rooms.find((x) => x.occupants.length < x.capacity)
        if (!r) break
        r.occupants.push(s.id); n++
      }
    })
    audit(user.id, 'HOSTEL_BULK_ALLOT', `Auto-allocated ${n} students`)
    alert(`${n} students allotted. ${Math.max(0, unassigned.length - n)} could not be placed (no free beds).`)
  }
  const warden = (id: string, ok: boolean) => {
    const l = db.hostelLeaves.find((x) => x.id === id)!
    update((d) => { d.hostelLeaves.find((x) => x.id === id)!.wardenStatus = ok ? 'APPROVED' : 'REJECTED' })
    if (ok) update((d) => { d.gatePasses.push({ id: uid('g'), studentId: l.studentId, reason: `Hostel leave: ${l.reason}`, outAt: l.from, returnAt: l.to, status: 'APPROVED', reviewedBy: user.id }) })
    notify([l.studentId], `Warden ${ok ? 'approved' : 'rejected'} your hostel leave`, '/hostel')
    audit(user.id, 'HOSTEL_LEAVE_WARDEN', `${ok ? 'Approved' : 'Rejected'} leave for ${userName(db, l.studentId)}`)
  }
  const redeem = () => {
    const c = db.mealCoupons.find((x) => x.code === code.trim().toUpperCase())
    if (!c) return setScan({ ok: false, text: 'Invalid coupon code.' })
    if (c.date !== today()) return setScan({ ok: false, text: 'Coupon is not valid today.' })
    if (c.redeemedAt) return setScan({ ok: false, text: `Already used at ${fmtDateTime(c.redeemedAt)}.` })
    update((d) => { d.mealCoupons.find((x) => x.id === c.id)!.redeemedAt = Date.now() })
    setScan({ ok: true, text: `${c.meal} served to ${userName(db, c.studentId)}.` }); setCode('')
  }

  return (
    <>
      <PageHeader title="Hostel & mess" subtitle="Rooms, allocation, leave approvals and meal coupons" />
      <div className="grid grid-4">
        <Stat label="Occupancy" value={`${occupied}/${beds}`} hint={`${Math.round((occupied / beds) * 100)}% beds filled`} icon={<BedDouble size={22} />} />
        <Stat label="Awaiting warden" value={db.hostelLeaves.filter((l) => l.parentStatus === 'APPROVED' && l.wardenStatus === 'PENDING').length} tone="warning" />
        <Stat label="Meals served today" value={db.mealCoupons.filter((c) => c.date === today() && c.redeemedAt).length} tone="success" icon={<Utensils size={22} />} />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'rooms', label: 'Rooms' }, { id: 'leaves', label: 'Leave approvals' }, { id: 'mess', label: 'Mess counter' }]} />
      {tab === 'rooms' && (
        <>
          <div className="row between wrap gap"><span className="muted">{unassigned.length} active students without a room</span><button className="btn btn-outline" disabled={!unassigned.length} onClick={autoAllocate}><Wand2 size={14} /> Auto-allocate free beds</button></div>
          <div className="grid grid-3">
            {db.rooms.map((r) => (
              <Card key={r.id} title={`${r.number}`} action={<Badge tone={r.occupants.length >= r.capacity ? 'danger' : 'success'}>{r.occupants.length}/{r.capacity}</Badge>}>
                <div className="small muted">{r.block} · {r.type} · {inr(r.feePerSem)}/sem</div>
                <div className="list" style={{ marginTop: 8 }}>
                  {r.occupants.map((o) => <div key={o} className="list-item small"><span className="grow">{userName(db, o)}</span><button className="btn btn-ghost btn-sm" onClick={() => update((d) => { d.rooms.find((x) => x.id === r.id)!.occupants = r.occupants.filter((x) => x !== o) })}>Vacate</button></div>)}
                  {r.occupants.length < r.capacity && <button className="btn btn-outline btn-sm" onClick={() => setAllotFor(r.id)}>Allot bed</button>}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
      {tab === 'leaves' && (
        <Card>
          {db.hostelLeaves.length === 0 ? <Empty text="No leave requests." /> : (
            <div className="table-wrap"><table>
              <thead><tr><th>Student</th><th>Reason</th><th>Dates</th><th>Parent</th><th>Warden</th><th /></tr></thead>
              <tbody>{[...db.hostelLeaves].sort((a, b) => b.createdAt - a.createdAt).map((l) => (
                <tr key={l.id}>
                  <td>{userName(db, l.studentId)}</td><td>{l.reason}</td><td className="small">{fmtDateTime(l.from)} → {fmtDateTime(l.to)}</td>
                  <td><Badge tone={l.parentStatus === 'APPROVED' ? 'success' : l.parentStatus === 'REJECTED' ? 'danger' : 'warning'}>{l.parentStatus}</Badge></td>
                  <td><Badge tone={l.wardenStatus === 'APPROVED' ? 'success' : l.wardenStatus === 'REJECTED' ? 'danger' : 'neutral'}>{l.wardenStatus}</Badge></td>
                  <td>{l.wardenStatus === 'PENDING' && (l.parentStatus === 'APPROVED' ? <div className="row gap"><button className="btn btn-success btn-sm" onClick={() => warden(l.id, true)}>Approve</button><button className="btn btn-danger btn-sm" onClick={() => warden(l.id, false)}>Reject</button></div> : <span className="small muted">Waiting for parent · {timeAgo(l.createdAt)}</span>)}</td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </Card>
      )}
      {tab === 'mess' && (
        <Card title={<span className="row gap"><ScanLine size={16} /> Redeem meal coupon</span>}>
          <div className="row gap" style={{ maxWidth: 420 }}>
            <input className="input" placeholder="Scan or type coupon code" value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && redeem()} />
            <button className="btn" onClick={redeem}>Redeem</button>
          </div>
          {scan && <div className={`alert ${scan.ok ? 'alert-success' : 'alert-danger'}`} style={{ marginTop: 12 }}>{scan.text}</div>}
          <h3 style={{ marginTop: 16 }}>Today</h3>
          <div className="row gap wrap" style={{ marginTop: 8 }}>{MEALS.map((m) => <Badge key={m} tone="info">{m}: {db.mealCoupons.filter((c) => c.date === today() && c.meal === m && c.redeemedAt).length} served / {db.mealCoupons.filter((c) => c.date === today() && c.meal === m).length} issued</Badge>)}</div>
        </Card>
      )}
      {allotFor && (
        <Modal title="Allot bed" onClose={() => setAllotFor(null)}>
          {unassigned.length === 0 ? <Empty text="Every active student already has a room." /> : unassigned.map((s) => (
            <div key={s.id} className="row between"><span>{s.name} <span className="muted small">{s.rollNo}</span></span><button className="btn btn-sm" onClick={() => { allot(s.id, allotFor); setAllotFor(null) }}>Allot</button></div>
          ))}
        </Modal>
      )}
    </>
  )
}
