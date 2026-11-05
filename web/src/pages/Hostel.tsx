import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { BedDouble, Pencil, Plus, ScanLine, Utensils, Wand2 } from 'lucide-react'
import { hostelsForGender, isChiefWarden, managedHostels, waitingList } from '../hostels'
import { audit, notify, uid, update, useCurrentUser, useDB } from '../data/store'
import { Badge, Card, Empty, Field, Modal, PageHeader, Stat, Tabs } from '../components/ui'
import { fmtDate, fmtDateTime, inr, timeAgo, userName, matches } from '../lib'
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

  if (!room) {
    const h = hostelsForGender(db, user.gender)[0]
    return (<><PageHeader title="Hostel" /><Card><Empty icon={<BedDouble />} text={user.residence === 'HOSTEL' ? `You are registered for hostel accommodation and are on the waiting list for ${h?.name ?? 'the hostel'}. The warden will allot a room.` : 'You are registered as a day scholar. Contact the Admission department or Registrar office to opt for the hostel.'} /></Card></>)
  }

  return (
    <>
      <PageHeader title="Hostel & mess" subtitle="From allotment to exit" actions={<button className="btn" onClick={() => setApplying(true)}><Plus size={14} /> Request leave</button>} />
      <div className="grid grid-4">
        <Stat label="Room" value={room.number} hint={`${room.block} · ${room.type}`} icon={<BedDouble size={22} />} />
        <Stat label="Room-mates" value={room.occupants.length - 1} hint={room.occupants.filter((o) => o !== user.id).map((o) => userName(db, o)).join(', ') || 'None'} tone="info" />
        <Stat label="Hostel fee / semester" value={inr(room.feePerSem)} tone="accent" />
        {(() => { const nights = db.nightAttendance.filter((n) => n.hostelId === room.hostelId && (n.present.includes(user.id) || n.absent.includes(user.id) || n.onLeave.includes(user.id))); const abs = nights.filter((n) => n.absent.includes(user.id)); return <Stat label="Night roll calls" value={`${nights.length - abs.length}/${nights.length}`} hint={abs.length ? `Absent: ${abs.map((n) => fmtDate(n.date)).join(', ')}` : 'Present every night'} tone={abs.length ? 'danger' : 'success'} /> })()}
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
  const hostels = managedHostels(db, user)
  const chief = isChiefWarden(user)
  const [hostelId, setHostelId] = useState(hostels[0]?.id ?? '')
  const [tab, setTab] = useState<'rooms' | 'night' | 'waiting' | 'leaves' | 'mess' | 'hostels'>('rooms')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [scan, setScan] = useState<{ ok: boolean; text: string } | null>(null)
  const [allotFor, setAllotFor] = useState<string | null>(null) // room id
  const [allotStudent, setAllotStudent] = useState<string | null>(null) // student id (from waiting list)
  const [term, setTerm] = useState('')
  const [roomDraft, setRoomDraft] = useState<{ id?: string; number: string; capacity: number; type: 'AC' | 'Non-AC'; feePerSem: number } | null>(null)
  const [hostelDraft, setHostelDraft] = useState<{ id?: string; name: string; gender: 'Boys' | 'Girls'; wardenId: string } | null>(null)
  const hostel = hostels.find((h) => h.id === hostelId) ?? hostels[0]
  if (!hostel) return <><PageHeader title="Hostel & mess" /><Card><Empty text="No hostel is assigned to you. Contact the Chief Warden." /></Card></>
  const rooms = db.rooms.filter((r) => r.hostelId === hostel.id)
  const waiting = waitingList(db, hostel.id)
  const residents = new Set(rooms.flatMap((r) => r.occupants))
  const beds = rooms.reduce((s, r) => s + r.capacity, 0)
  const occupied = rooms.reduce((s, r) => s + r.occupants.length, 0)
  const leaves = db.hostelLeaves.filter((l) => residents.has(l.studentId))
  const wardens = db.users.filter((u) => u.role === 'admin' && u.office === 'hostel')

  const allot = (studentId: string, roomId: string) => {
    const r = db.rooms.find((x) => x.id === roomId)!
    if (r.occupants.length >= r.capacity) return alert('That room is full.')
    update((d) => { d.rooms.forEach((x) => { x.occupants = x.occupants.filter((o) => o !== studentId) }); d.rooms.find((x) => x.id === roomId)!.occupants.push(studentId) })
    notify([studentId], `Hostel room ${r.number}, ${hostel.name} allotted`, '/hostel')
    audit(user.id, 'HOSTEL_ALLOT', `${userName(db, studentId)} → ${hostel.name} ${r.number}`)
  }
  /** Conflict-free bulk allocation within this hostel: waiting-list students into free beds. */
  const autoAllocate = () => {
    let n = 0
    update((d) => {
      for (const s of waiting) {
        const r = d.rooms.find((x) => x.hostelId === hostel.id && x.occupants.length < x.capacity)
        if (!r) break
        r.occupants.push(s.id); n++
      }
    })
    audit(user.id, 'HOSTEL_BULK_ALLOT', `${hostel.name}: auto-allocated ${n} students`)
    alert(`${n} student(s) allotted. ${Math.max(0, waiting.length - n)} could not be placed (no free beds).`)
  }
  const saveRoom = () => {
    const r = roomDraft!
    if (!r.number.trim() || r.capacity < 1) return alert('Enter a room number and capacity.')
    if (db.rooms.some((x) => x.hostelId === hostel.id && x.number.toLowerCase() === r.number.trim().toLowerCase() && x.id !== r.id)) return alert('That room number already exists in this hostel.')
    const existing = r.id ? db.rooms.find((x) => x.id === r.id) : undefined
    if (existing && existing.occupants.length > r.capacity) return alert(`${existing.occupants.length} students live in this room; capacity cannot be lower.`)
    update((d) => {
      if (r.id) Object.assign(d.rooms.find((x) => x.id === r.id)!, { number: r.number.trim(), capacity: r.capacity, type: r.type, feePerSem: r.feePerSem })
      else d.rooms.push({ id: uid('rm'), hostelId: hostel.id, block: hostel.name, number: r.number.trim(), capacity: r.capacity, occupants: [], type: r.type, feePerSem: r.feePerSem })
    })
    audit(user.id, r.id ? 'HOSTEL_ROOM_EDIT' : 'HOSTEL_ROOM_ADD', `${hostel.name} ${r.number} (${r.capacity} beds)`)
    setRoomDraft(null)
  }
  const saveHostel = () => {
    const h = hostelDraft!
    if (!h.name.trim()) return alert('Enter a hostel name.')
    update((d) => {
      const id = h.id ?? uid('h')
      if (h.id) Object.assign(d.hostels.find((x) => x.id === h.id)!, { name: h.name, gender: h.gender, wardenId: h.wardenId || undefined })
      else d.hostels.push({ id, name: h.name, gender: h.gender, wardenId: h.wardenId || undefined })
      // The assigned warden manages only this hostel.
      d.users.forEach((u) => { if (u.role === 'admin' && u.office === 'hostel' && u.hostelId === id && u.id !== h.wardenId) u.hostelId = undefined })
      if (h.wardenId) { const w = d.users.find((u) => u.id === h.wardenId)!; w.hostelId = id }
      d.rooms.forEach((r) => { if (r.hostelId === id) r.block = h.name })
    })
    if (h.wardenId) notify([h.wardenId], `You are the warden of ${h.name}`, '/hostel')
    audit(user.id, h.id ? 'HOSTEL_EDIT' : 'HOSTEL_ADD', `${h.name} (${h.gender})`)
    setHostelDraft(null)
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
      <PageHeader search={{ value: term, onChange: setTerm, placeholder: 'Search room or student…' }} title="Hostel & mess" subtitle={chief ? 'Chief Warden: all hostels, rooms, wardens and waiting lists' : `Warden · ${hostel.name}`}
        actions={<button className="btn btn-outline" onClick={() => setRenaming(hostel.name)}><Pencil size={14} /> Rename hostel</button>} />
      {renaming !== null && (
        <Modal title={`Rename ${hostel.name}`} onClose={() => setRenaming(null)} footer={<><button className="btn btn-ghost" onClick={() => setRenaming(null)}>Cancel</button><button className="btn" onClick={() => {
          const name = renaming.trim()
          if (!name) return alert('Enter a name.')
          if (db.hostels.some((h) => h.id !== hostel.id && h.name.toLowerCase() === name.toLowerCase())) return alert('Another hostel already has this name.')
          update((d) => { d.hostels.find((h) => h.id === hostel.id)!.name = name; d.rooms.forEach((r) => { if (r.hostelId === hostel.id) r.block = name }) })
          audit(user.id, 'HOSTEL_RENAME', `${hostel.name} → ${name}`)
          notify([...rooms.flatMap((r) => r.occupants)], `Your hostel is now called ${name}`, '/hostel')
          setRenaming(null)
        }}>Save name</button></>}>
          <Field label="Hostel name" hint={`For ${hostel.gender.toLowerCase()} · residents are notified of the new name`}><input className="input" autoFocus value={renaming} onChange={(e) => setRenaming(e.target.value)} /></Field>
        </Modal>
      )}
      {hostels.length > 1 && <div className="row gap wrap">{hostels.map((h) => <button key={h.id} className={`chip ${h.id === hostel.id ? 'active' : ''}`} onClick={() => setHostelId(h.id)}>{h.name}</button>)}</div>}
      <div className="grid grid-4">
        <Stat label="Occupancy" value={`${occupied}/${beds}`} hint={`${beds - occupied} beds free · ${rooms.length} rooms`} icon={<BedDouble size={22} />} />
        <Stat label="Waiting for a room" value={waiting.length} tone={waiting.length ? 'warning' : 'success'} hint={`${hostel.gender === 'Boys' ? 'Boys' : 'Girls'} opted for hostel`} />
        <Stat label="Awaiting warden" value={leaves.filter((l) => l.parentStatus === 'APPROVED' && l.wardenStatus === 'PENDING').length} tone="accent" />
        <Stat label="Warden" value={hostel.wardenId ? userName(db, hostel.wardenId).split(' (')[0] : 'Not assigned'} tone="info" />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'rooms', label: 'Rooms' }, { id: 'night', label: 'Night attendance' }, { id: 'waiting', label: 'Waiting list', count: waiting.length }, { id: 'leaves', label: 'Leave approvals' }, { id: 'mess', label: 'Mess counter' }, ...(chief ? [{ id: 'hostels' as const, label: 'Hostels & wardens', count: db.hostels.length }] : [])]} />
      {tab === 'rooms' && (
        <>
          <div className="row between wrap gap">
            <span className="muted">{hostel.name}: {rooms.length} rooms</span>
            <div className="row gap">
              <button className="btn btn-outline" disabled={!waiting.length} onClick={autoAllocate}><Wand2 size={14} /> Auto-allocate waiting list</button>
              <button className="btn" onClick={() => setRoomDraft({ number: '', capacity: 2, type: 'Non-AC', feePerSem: 38000 })}><Plus size={14} /> Add room</button>
            </div>
          </div>
          {rooms.length === 0 && <Card><Empty text="No rooms yet. Add the first room." /></Card>}
          <div className="grid grid-3">
            {rooms.filter((r) => matches(term, r.number, r.type, ...r.occupants.map((o) => userName(db, o)))).map((r) => (
              <Card key={r.id} title={r.number} action={<div className="row gap"><Badge tone={r.occupants.length >= r.capacity ? 'danger' : 'success'}>{r.occupants.length}/{r.capacity}</Badge><button className="icon-btn" aria-label={`Edit room ${r.number}`} onClick={() => setRoomDraft({ id: r.id, number: r.number, capacity: r.capacity, type: r.type, feePerSem: r.feePerSem })}><Pencil size={14} /></button></div>}>
                <div className="small muted">{r.type} · {inr(r.feePerSem)}/sem</div>
                <div className="list" style={{ marginTop: 8 }}>
                  {r.occupants.map((o) => <div key={o} className="list-item small"><span className="grow">{userName(db, o)} <span className="muted">{db.users.find((u) => u.id === o)?.rollNo}</span></span><button className="btn btn-ghost btn-sm" onClick={() => { update((d) => { d.rooms.find((x) => x.id === r.id)!.occupants = r.occupants.filter((x) => x !== o) }); audit(user.id, 'HOSTEL_VACATE', `${userName(db, o)} from ${r.number}`) }}>Vacate</button></div>)}
                  {r.occupants.length < r.capacity && <button className="btn btn-outline btn-sm" disabled={!waiting.length} onClick={() => setAllotFor(r.id)}>{waiting.length ? 'Allot bed' : 'No one waiting'}</button>}
                  {r.occupants.length === 0 && <button className="btn btn-ghost btn-sm" onClick={() => confirm(`Remove room ${r.number}?`) && update((d) => { d.rooms = d.rooms.filter((x) => x.id !== r.id) })}>Remove room</button>}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
      {tab === 'night' && <NightRollCallPanel hostelId={hostel.id} term={term} />}
      {tab === 'waiting' && (
        <Card title={`${hostel.name}: students who opted for the hostel`} action={<span className="small muted">Set by the Admission department / Registrar</span>}>
          {waiting.length === 0 ? <Empty text="Everyone who opted for this hostel has a room." /> : (
            <div className="table-wrap"><table>
              <thead><tr><th>Student</th><th>Class</th><th>Phone</th><th /></tr></thead>
              <tbody>{waiting.filter((s) => matches(term, s.name, s.rollNo)).map((s) => (
                <tr key={s.id}>
                  <td>{s.name}<div className="small muted">{s.rollNo} · {s.gender}</div></td>
                  <td className="small">{s.program} {s.batch} · Sem {s.semester}</td>
                  <td className="small">{s.phone ?? '—'}</td>
                  <td><button className="btn btn-outline btn-sm" onClick={() => setAllotStudent(s.id)}>Allot room</button></td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </Card>
      )}
      {tab === 'leaves' && (
        <Card>
          {leaves.length === 0 ? <Empty text="No leave requests from this hostel." /> : (
            <div className="table-wrap"><table>
              <thead><tr><th>Student</th><th>Reason</th><th>Dates</th><th>Parent</th><th>Warden</th><th /></tr></thead>
              <tbody>{leaves.filter((l) => matches(term, userName(db, l.studentId), l.reason)).sort((a, b) => b.createdAt - a.createdAt).map((l) => (
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
      {tab === 'hostels' && chief && (
        <Card title="Hostels and their wardens" action={<button className="btn btn-sm" onClick={() => setHostelDraft({ name: '', gender: 'Boys', wardenId: '' })}><Plus size={14} /> Add hostel</button>}>
          <div className="table-wrap"><table>
            <thead><tr><th>Hostel</th><th>For</th><th>Warden</th><th>Rooms</th><th>Occupancy</th><th>Waiting</th><th /></tr></thead>
            <tbody>{db.hostels.map((h) => { const rs = db.rooms.filter((r) => r.hostelId === h.id); return (
              <tr key={h.id}>
                <td><strong>{h.name}</strong></td><td><Badge tone={h.gender === 'Girls' ? 'accent' : 'info'}>{h.gender}</Badge></td>
                <td>{h.wardenId ? userName(db, h.wardenId) : <span className="muted">Not assigned</span>}</td>
                <td>{rs.length}</td><td>{rs.reduce((s, r) => s + r.occupants.length, 0)}/{rs.reduce((s, r) => s + r.capacity, 0)}</td><td>{waitingList(db, h.id).length}</td>
                <td><button className="btn btn-outline btn-sm" onClick={() => setHostelDraft({ id: h.id, name: h.name, gender: h.gender, wardenId: h.wardenId ?? '' })}>Edit</button></td>
              </tr>
            ) })}</tbody>
          </table></div>
        </Card>
      )}

      {(allotFor || allotStudent) && (
        <Modal title={allotStudent ? `Allot a room to ${userName(db, allotStudent)}` : `Allot a bed in ${db.rooms.find((r) => r.id === allotFor)?.number}`} onClose={() => { setAllotFor(null); setAllotStudent(null) }}>
          {allotStudent
            ? rooms.filter((r) => r.occupants.length < r.capacity).map((r) => <div key={r.id} className="row between"><span>{r.number} <span className="muted small">{r.type} · {r.occupants.length}/{r.capacity}</span></span><button className="btn btn-sm" onClick={() => { allot(allotStudent, r.id); setAllotStudent(null) }}>Allot</button></div>)
            : waiting.map((s) => <div key={s.id} className="row between"><span>{s.name} <span className="muted small">{s.rollNo}</span></span><button className="btn btn-sm" onClick={() => { allot(s.id, allotFor!); setAllotFor(null) }}>Allot</button></div>)}
          {allotStudent && !rooms.some((r) => r.occupants.length < r.capacity) && <Empty text="No free beds. Add a room first." />}
        </Modal>
      )}
      {roomDraft && (
        <Modal title={roomDraft.id ? `Edit room ${roomDraft.number}` : `Add room to ${hostel.name}`} onClose={() => setRoomDraft(null)} footer={<><button className="btn btn-ghost" onClick={() => setRoomDraft(null)}>Cancel</button><button className="btn" onClick={saveRoom}>Save room</button></>}>
          <div className="grid grid-2">
            <Field label="Room number"><input className="input" value={roomDraft.number} placeholder={hostel.gender === 'Boys' ? 'A-104' : 'B-204'} onChange={(e) => setRoomDraft({ ...roomDraft, number: e.target.value })} /></Field>
            <Field label="Beds (capacity)"><input className="input" type="number" min={1} max={8} value={roomDraft.capacity} onChange={(e) => setRoomDraft({ ...roomDraft, capacity: Number(e.target.value) })} /></Field>
            <Field label="Type"><select className="select" value={roomDraft.type} onChange={(e) => setRoomDraft({ ...roomDraft, type: e.target.value as 'AC' | 'Non-AC' })}><option>AC</option><option>Non-AC</option></select></Field>
            <Field label="Fee per semester (₹)"><input className="input" type="number" min={0} value={roomDraft.feePerSem} onChange={(e) => setRoomDraft({ ...roomDraft, feePerSem: Number(e.target.value) })} /></Field>
          </div>
        </Modal>
      )}
      {hostelDraft && (
        <Modal title={hostelDraft.id ? 'Edit hostel' : 'Add hostel'} onClose={() => setHostelDraft(null)} footer={<><button className="btn btn-ghost" onClick={() => setHostelDraft(null)}>Cancel</button><button className="btn" onClick={saveHostel}>Save</button></>}>
          <Field label="Hostel name"><input className="input" value={hostelDraft.name} onChange={(e) => setHostelDraft({ ...hostelDraft, name: e.target.value })} /></Field>
          <div className="grid grid-2">
            <Field label="For"><select className="select" value={hostelDraft.gender} onChange={(e) => setHostelDraft({ ...hostelDraft, gender: e.target.value as 'Boys' | 'Girls' })}><option>Boys</option><option>Girls</option></select></Field>
            <Field label="Warden" hint="Gets management access to this hostel only"><select className="select" value={hostelDraft.wardenId} onChange={(e) => setHostelDraft({ ...hostelDraft, wardenId: e.target.value })}><option value="">Not assigned</option>{wardens.filter((w) => w.hostelId || w.id === hostelDraft.wardenId || true).map((w) => <option key={w.id} value={w.id}>{w.name}{!w.hostelId ? ' (Chief Warden)' : ''}</option>)}</select></Field>
          </div>
          <div className="small muted">Create warden accounts in User Management (office: Hostel Warden).</div>
        </Modal>
      )}
    </>
  )
}

/** Night roll call: residents are present, away on approved leave (auto-excused) or absent. */
function NightRollCallPanel({ hostelId, term }: { hostelId: string; term: string }) {
  const db = useDB()
  const user = useCurrentUser()!
  const [date, setDate] = useState(today())
  const rooms = db.rooms.filter((r) => r.hostelId === hostelId)
  const residents = rooms.flatMap((r) => r.occupants.map((o) => ({ id: o, room: r.number }))).filter((x) => db.users.find((u) => u.id === x.id)?.status === 'ACTIVE')
  const record = db.nightAttendance.find((n) => n.hostelId === hostelId && n.date === date)
  // A student is on leave tonight if an approved hostel leave covers 10 PM of the chosen date.
  const night = new Date(`${date}T22:00`).getTime()
  const onLeave = new Set(db.hostelLeaves.filter((l) => l.wardenStatus === 'APPROVED' && l.from <= night && l.to >= night).map((l) => l.studentId))
  const init = () => Object.fromEntries(residents.map((r) => [r.id, onLeave.has(r.id) ? 'LEAVE' : record ? (record.absent.includes(r.id) ? 'ABSENT' : record.onLeave.includes(r.id) ? 'LEAVE' : 'PRESENT') : 'PRESENT'])) as Record<string, 'PRESENT' | 'ABSENT' | 'LEAVE'>
  const [marks, setMarks] = useState(init)
  const [remarks, setRemarks] = useState<Record<string, string>>(record?.remarks ?? {})
  const [loadedFor, setLoadedFor] = useState(`${hostelId}|${date}|${record?.at ?? 0}`)
  const key = `${hostelId}|${date}|${record?.at ?? 0}`
  if (key !== loadedFor) { setLoadedFor(key); setMarks(init()); setRemarks(record?.remarks ?? {}) }

  const counts = { PRESENT: 0, ABSENT: 0, LEAVE: 0 }
  residents.forEach((r) => { counts[marks[r.id] ?? 'PRESENT']++ })
  const save = () => {
    const by = (st: string) => residents.filter((r) => (marks[r.id] ?? 'PRESENT') === st).map((r) => r.id)
    const absent = by('ABSENT')
    update((d) => {
      const rec = { hostelId, date, present: by('PRESENT'), onLeave: by('LEAVE'), absent, remarks: Object.fromEntries(Object.entries(remarks).filter(([, v]) => v.trim())), markedBy: user.id, at: Date.now() }
      const i = d.nightAttendance.findIndex((n) => n.hostelId === hostelId && n.date === date)
      if (i >= 0) d.nightAttendance[i] = { ...d.nightAttendance[i], ...rec }
      else d.nightAttendance.push({ id: uid('na'), ...rec })
    })
    for (const sid of absent) {
      const st = db.users.find((u) => u.id === sid)!
      const parents = db.users.filter((u) => u.role === 'parent' && u.wardIds?.includes(sid)).map((u) => u.id)
      notify([sid, ...parents], `${st.name} was absent from the hostel at night roll call on ${fmtDate(date)}${remarks[sid] ? ` (${remarks[sid]})` : ''}`, '/hostel')
    }
    audit(user.id, 'HOSTEL_NIGHT_ROLL', `${db.hostels.find((h) => h.id === hostelId)?.name} ${date}: ${counts.PRESENT} in, ${counts.LEAVE} on leave, ${counts.ABSENT} absent`)
  }
  const last30 = db.nightAttendance.filter((n) => n.hostelId === hostelId && n.date > new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10))
  const absences = (sid: string) => last30.filter((n) => n.absent.includes(sid)).length

  return (
    <div className="stack">
      <Card title="Night roll call" action={<input className="input" type="date" style={{ width: 170 }} max={today()} value={date} onChange={(e) => setDate(e.target.value)} aria-label="Night of" />}>
        <div className="row gap wrap small" style={{ marginBottom: 10 }}>
          <Badge tone="success">{counts.PRESENT} in hostel</Badge><Badge tone="info">{counts.LEAVE} on leave</Badge><Badge tone="danger">{counts.ABSENT} absent</Badge>
          {record ? <span className="muted">Saved {fmtDateTime(record.at)} by {userName(db, record.markedBy)}</span> : <Badge tone="warning">Not taken yet</Badge>}
          <div className="grow" />
          <button className="btn btn-ghost btn-sm" onClick={() => setMarks(Object.fromEntries(residents.map((r) => [r.id, onLeave.has(r.id) ? 'LEAVE' : 'PRESENT'])))}>All present</button>
        </div>
        {residents.length === 0 ? <Empty text="No residents in this hostel." /> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Room</th><th>Student</th><th>Status</th><th>Remark</th><th>Absences (30 nights)</th></tr></thead>
            <tbody>{residents.filter((r) => matches(term, r.room, userName(db, r.id), db.users.find((u) => u.id === r.id)?.rollNo)).sort((a, b) => a.room.localeCompare(b.room)).map((r) => {
              const st = marks[r.id] ?? 'PRESENT'
              return (
                <tr key={r.id}>
                  <td>{r.room}</td>
                  <td>{userName(db, r.id)}<div className="small muted">{db.users.find((u) => u.id === r.id)?.rollNo}</div></td>
                  <td>
                    <div className="row gap">
                      {(['PRESENT', 'ABSENT', 'LEAVE'] as const).map((v) => (
                        <button key={v} className={`chip ${st === v ? 'active' : ''}`} disabled={v === 'LEAVE' && !onLeave.has(r.id) && st !== 'LEAVE'} title={v === 'LEAVE' && !onLeave.has(r.id) ? 'No approved leave for this night' : ''}
                          aria-label={`${userName(db, r.id)} ${v.toLowerCase()}`} onClick={() => setMarks({ ...marks, [r.id]: v })}>
                          {v === 'PRESENT' ? 'In' : v === 'ABSENT' ? 'Absent' : 'On leave'}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td><input className="input" style={{ minWidth: 150 }} placeholder={st === 'ABSENT' ? 'e.g. returned late' : ''} value={remarks[r.id] ?? ''} onChange={(e) => setRemarks({ ...remarks, [r.id]: e.target.value })} /></td>
                  <td>{absences(r.id) ? <Badge tone={absences(r.id) >= 3 ? 'danger' : 'warning'}>{absences(r.id)}</Badge> : <span className="muted small">0</span>}</td>
                </tr>
              )
            })}</tbody>
          </table></div>
        )}
        <div className="row between" style={{ marginTop: 12 }}>
          <span className="small muted">Students with approved leave for the night are marked "On leave" automatically. Parents of absent students are notified.</span>
          <button className="btn" disabled={!residents.length} onClick={save}>{record ? 'Update roll call' : 'Save roll call'}</button>
        </div>
      </Card>
      <Card title="Recent nights">
        {db.nightAttendance.filter((n) => n.hostelId === hostelId).length === 0 ? <Empty text="No roll calls yet." /> : (
          <div className="list">{[...db.nightAttendance].filter((n) => n.hostelId === hostelId).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 14).map((n) => (
            <button key={n.id} className="list-item" style={{ background: n.date === date ? 'var(--brand-light)' : 'none', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', borderRadius: 8, padding: 10 }} onClick={() => setDate(n.date)}>
              <div className="grow"><strong>{fmtDate(n.date)}</strong><div className="small muted">by {userName(db, n.markedBy)}</div></div>
              <Badge tone="success">{n.present.length} in</Badge>{n.onLeave.length > 0 && <Badge tone="info">{n.onLeave.length} leave</Badge>}{n.absent.length > 0 && <Badge tone="danger">{n.absent.length} absent</Badge>}
            </button>
          ))}</div>
        )}
      </Card>
    </div>
  )
}
