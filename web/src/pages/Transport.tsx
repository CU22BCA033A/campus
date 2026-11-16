import { useState } from 'react'
import { Bus, Megaphone, Pencil, Phone, Plus, Trash2 } from 'lucide-react'
import { audit, notify, uid, update, useCurrentUser, useDB } from '../data/store'
import { Badge, Card, Empty, Field, Modal, PageHeader, Stat, Tabs } from '../components/ui'
import { FilterBar, useFilters } from '../components/Filters'
import { can, personaLabel } from '../access'
import { classLabel } from '../classes'
import { fmtDate, inr, matches, userName } from '../lib'
import type { TransportRequest, TransportRoute } from '../data/types'

const DAY = 86_400_000
const seatsUsed = (r: TransportRoute) => r.subscribers.length

export default function Transport() {
  const me = useCurrentUser()!
  return can(me, 'manageTransport') ? <TransportOffice /> : <TransportRider />
}

/* ============================ Transport Department ============================ */

function TransportOffice() {
  const db = useDB()
  const me = useCurrentUser()!
  const [tab, setTab] = useState<'routes' | 'requests' | 'riders'>('requests')
  const [q, setQ] = useState('')
  const [draft, setDraft] = useState<Partial<TransportRoute> | null>(null)
  const [announce, setAnnounce] = useState<TransportRoute | null>(null)
  const [message, setMessage] = useState('')
  const [deciding, setDeciding] = useState<{ r: TransportRequest; status: 'APPROVED' | 'REJECTED' } | null>(null)
  const [note, setNote] = useState('')
  const pending = db.transportRequests.filter((r) => r.status === 'PENDING')
  const riders = db.routes.flatMap((r) => r.subscribers.map((uid2) => ({ route: r, user: db.users.find((u) => u.id === uid2)! }))).filter((x) => x.user)
  const rf = useFilters(['route', 'who'] as const)
  const shownRiders = riders.filter((x) => rf.ok('route', x.route.id) && rf.ok('who', x.user.role === 'student' ? 'student' : 'staff') && matches(q, x.user.name, x.user.rollNo, x.route.name, x.route.stopOf?.[x.user.id]))

  const decide = () => {
    const { r, status } = deciding!
    const route = db.routes.find((x) => x.id === r.routeId)!
    const u = db.users.find((x) => x.id === r.userId)!
    if (status === 'APPROVED' && route.capacity && seatsUsed(route) >= route.capacity && !confirm(`${route.name} is full (${route.capacity} seats). Approve anyway?`)) return
    update((d) => {
      const x = d.transportRequests.find((y) => y.id === r.id)!; x.status = status; x.decidedBy = me.id; x.note = note.trim() || undefined
      if (status === 'APPROVED') {
        for (const rt of d.routes) { rt.subscribers = rt.subscribers.filter((s) => s !== r.userId); if (rt.stopOf) delete rt.stopOf[r.userId] }
        const rt = d.routes.find((y) => y.id === r.routeId)!; rt.subscribers.push(r.userId); rt.stopOf = { ...rt.stopOf, [r.userId]: r.stop }
        // Students pay the route's fee through Fees & Payments.
        if (u.role === 'student' && rt.feePerSem) d.fees.push({ id: uid('fee'), studentId: u.id, title: `Transport fee – ${rt.name} – Semester ${u.semester ?? ''}`, amount: rt.feePerSem, dueAt: Date.now() + 15 * DAY, head: 'Transport' })
      }
    })
    const pickup = route.stops.find((s) => s.name === r.stop)?.time
    notify([r.userId], status === 'APPROVED' ? `Bus pass approved: ${route.name}, board at ${r.stop}${pickup ? ` (${pickup})` : ''}, bus ${route.bus}.${u.role === 'student' && route.feePerSem ? ` Transport fee ${inr(route.feePerSem)} added to your fees.` : ''}` : `Bus pass request for ${route.name} was not approved${note.trim() ? `: ${note.trim()}` : ''}.`, '/transport')
    audit(me.id, `TRANSPORT_${status}`, `${u.name} → ${route.name} (${r.stop})`)
    setDeciding(null); setNote('')
  }
  const removeRider = (route: TransportRoute, userId: string) => {
    if (!confirm(`Remove ${userName(db, userId)} from ${route.name}? Their pass is cancelled (fees already raised are not changed).`)) return
    update((d) => { const rt = d.routes.find((x) => x.id === route.id)!; rt.subscribers = rt.subscribers.filter((s) => s !== userId); if (rt.stopOf) delete rt.stopOf[userId]; for (const r of d.transportRequests) if (r.userId === userId && r.routeId === route.id && r.status === 'APPROVED') r.status = 'CANCELLED' })
    notify([userId], `Your bus pass for ${route.name} was cancelled by the Transport Department.`, '/transport')
    audit(me.id, 'TRANSPORT_REMOVE', `${userName(db, userId)} from ${route.name}`)
  }
  const saveRoute = () => {
    const r = draft!
    const stops = (r.stops ?? []).filter((s) => s.name.trim())
    if (!r.name?.trim() || !r.bus?.trim() || stops.length < 2) return alert('Enter the route name, bus number and at least two stops (the last is the campus).')
    const id = r.id ?? uid('r')
    update((d) => {
      const rec = { name: r.name!.trim(), bus: r.bus!.trim(), driver: r.driver ?? '', driverPhone: r.driverPhone ?? '', capacity: r.capacity, feePerSem: r.feePerSem, returnTime: r.returnTime, active: r.active ?? true, stops }
      const ex = d.routes.find((x) => x.id === id); if (ex) Object.assign(ex, rec); else d.routes.push({ id, subscribers: [], stopOf: {}, ...rec })
    })
    if (r.id) notify(db.routes.find((x) => x.id === r.id)?.subscribers ?? [], `${r.name} timings or details were updated. Check your pick-up time.`, '/transport')
    audit(me.id, r.id ? 'ROUTE_EDIT' : 'ROUTE_CREATE', r.name!)
    setDraft(null)
  }
  const deleteRoute = (r: TransportRoute) => {
    if (!confirm(`Delete ${r.name}? ${r.subscribers.length} rider(s) lose their pass and will be notified.`)) return
    update((d) => { d.routes = d.routes.filter((x) => x.id !== r.id); for (const x of d.transportRequests) if (x.routeId === r.id && (x.status === 'PENDING' || x.status === 'APPROVED')) x.status = 'CANCELLED' })
    notify(r.subscribers, `${r.name} has been discontinued. Contact the Transport Department for another route.`, '/transport')
    audit(me.id, 'ROUTE_DELETE', r.name)
  }
  const send = () => {
    if (!announce || !message.trim()) return
    notify(announce.subscribers, `${announce.name}: ${message.trim()}`, '/transport')
    audit(me.id, 'TRANSPORT_ANNOUNCE', `${announce.name}: ${message.trim()}`)
    alert(`Sent to ${announce.subscribers.length} rider(s).`); setAnnounce(null); setMessage('')
  }

  return (
    <>
      <PageHeader title="Transport Department" subtitle="Routes, buses and drivers, bus-pass requests, riders and announcements" search={{ value: q, onChange: setQ, placeholder: 'Search route, stop, rider…' }}
        actions={<button className="btn" onClick={() => setDraft({ stops: [{ name: '', time: '07:30' }, { name: 'Campus', time: '08:30' }], capacity: 40, feePerSem: 18000, returnTime: '16:45', active: true })}><Plus size={14} /> New route</button>} />
      <div className="grid grid-4">
        <Stat label="Routes" value={db.routes.filter((r) => r.active !== false).length} icon={<Bus size={22} />} />
        <Stat label="Riders" value={riders.length} tone="info" hint={`${db.routes.reduce((t, r) => t + (r.capacity ?? 0), 0)} seats`} />
        <Stat label="Pass requests" value={pending.length} tone="warning" />
        <Stat label="Full routes" value={db.routes.filter((r) => r.capacity && seatsUsed(r) >= r.capacity).length} tone="danger" />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'requests', label: 'Pass requests', count: pending.length }, { id: 'routes', label: 'Routes & buses', count: db.routes.length }, { id: 'riders', label: 'Riders', count: riders.length }]} />
      {tab === 'requests' && (
        <Card>
          {db.transportRequests.length === 0 ? <Empty text="No requests." /> : (
            <div className="table-wrap"><table>
              <thead><tr><th>Person</th><th>Route · stop</th><th>Requested</th><th>Status</th><th /></tr></thead>
              <tbody>{[...db.transportRequests].sort((a, b) => Number(b.status === 'PENDING') - Number(a.status === 'PENDING') || b.at - a.at).filter((r) => matches(q, userName(db, r.userId), db.routes.find((x) => x.id === r.routeId)?.name, r.stop)).map((r) => { const u = db.users.find((x) => x.id === r.userId); const route = db.routes.find((x) => x.id === r.routeId); return (
                <tr key={r.id}>
                  <td>{u?.name}<div className="small muted">{u?.rollNo ?? (u && personaLabel(u))}{u?.residence === 'HOSTEL' ? ' · hosteller' : ''}</div></td>
                  <td>{route?.name ?? 'Removed route'}<div className="small muted">{r.stop} · {route?.stops.find((s) => s.name === r.stop)?.time}</div></td>
                  <td className="small">{fmtDate(r.at)}</td>
                  <td><Badge tone={r.status === 'APPROVED' ? 'success' : r.status === 'PENDING' ? 'warning' : 'neutral'}>{r.status.toLowerCase()}</Badge>{r.note && <div className="small muted">{r.note}</div>}</td>
                  <td>{r.status === 'PENDING' && <div className="row gap"><button className="btn btn-success btn-sm" onClick={() => setDeciding({ r, status: 'APPROVED' })}>Approve</button><button className="btn btn-ghost btn-sm" onClick={() => setDeciding({ r, status: 'REJECTED' })}>Reject</button></div>}</td>
                </tr>
              ) })}</tbody>
            </table></div>
          )}
        </Card>
      )}
      {tab === 'routes' && (
        <div className="grid grid-3">
          {db.routes.filter((r) => matches(q, r.name, r.bus, r.driver, ...r.stops.map((s) => s.name))).map((r) => (
            <Card key={r.id} title={r.name} action={<div className="row gap"><button className="icon-btn" aria-label={`Announce on ${r.name}`} onClick={() => setAnnounce(r)}><Megaphone size={14} /></button><button className="icon-btn" aria-label={`Edit ${r.name}`} onClick={() => setDraft(r)}><Pencil size={14} /></button><button className="icon-btn" aria-label={`Delete ${r.name}`} onClick={() => deleteRoute(r)}><Trash2 size={14} /></button></div>}>
              <div className="row gap wrap"><Badge tone={r.capacity && seatsUsed(r) >= r.capacity ? 'danger' : 'info'}>{seatsUsed(r)}/{r.capacity ?? '—'} seats</Badge>{r.feePerSem ? <Badge>{inr(r.feePerSem)}/sem</Badge> : null}{r.active === false && <Badge tone="warning">Suspended</Badge>}</div>
              <div className="small muted" style={{ marginTop: 6 }}>Bus {r.bus} · {r.driver} · <a href={`tel:${r.driverPhone}`}>{r.driverPhone}</a>{r.returnTime ? ` · leaves campus ${r.returnTime}` : ''}</div>
              <div className="list" style={{ marginTop: 6 }}>{r.stops.map((s, i) => <div key={i} className="list-item small" style={{ padding: '4px 0' }}><span className="grow">{s.name}</span><span className="muted">{Object.values(r.stopOf ?? {}).filter((x) => x === s.name).length || ''}</span><strong>{s.time}</strong></div>)}</div>
            </Card>
          ))}
        </div>
      )}
      {tab === 'riders' && (
        <>
          <FilterBar defs={[{ key: 'route' as const, label: 'Routes', options: db.routes.map((r) => ({ value: r.id, label: r.name })) }, { key: 'who' as const, label: 'Riders', options: [{ value: 'student', label: 'Students' }, { value: 'staff', label: 'Faculty & staff' }] }]} f={rf} count={shownRiders.length} noun="rider" />
          <Card>
            {shownRiders.length === 0 ? <Empty text="No riders." /> : (
              <div className="table-wrap"><table>
                <thead><tr><th>Rider</th><th>Class / office</th><th>Route</th><th>Stop · pick-up</th><th>Transport fee</th><th /></tr></thead>
                <tbody>{shownRiders.map(({ route, user: u }) => { const stop = route.stopOf?.[u.id]; const fee = db.fees.filter((f) => f.studentId === u.id && f.head === 'Transport').sort((a, b) => b.dueAt - a.dueAt)[0]; return (
                  <tr key={`${route.id}-${u.id}`}>
                    <td>{u.name}<div className="small muted">{u.rollNo ?? u.email}{u.phone ? ` · ${u.phone}` : ''}</div></td>
                    <td className="small">{u.classId ? classLabel(db.classes.find((c) => c.id === u.classId)) : personaLabel(u)}</td>
                    <td>{route.name}</td>
                    <td className="small">{stop ?? '—'} · {route.stops.find((s) => s.name === stop)?.time ?? ''}</td>
                    <td>{u.role !== 'student' ? <span className="muted small">Staff</span> : fee ? <Badge tone={fee.paidAt || (fee.paidAmount ?? 0) >= fee.amount ? 'success' : 'warning'}>{fee.paidAt || (fee.paidAmount ?? 0) >= fee.amount ? 'Paid' : `${inr(fee.amount)} due`}</Badge> : <span className="muted small">—</span>}</td>
                    <td><button className="btn btn-ghost btn-sm" onClick={() => removeRider(route, u.id)}>Remove</button></td>
                  </tr>
                ) })}</tbody>
              </table></div>
            )}
          </Card>
        </>
      )}
      {deciding && (
        <Modal title={deciding.status === 'APPROVED' ? 'Approve bus pass' : 'Reject request'} onClose={() => setDeciding(null)} footer={<><button className="btn btn-ghost" onClick={() => setDeciding(null)}>Back</button><button className={`btn ${deciding.status === 'APPROVED' ? 'btn-success' : ''}`} onClick={decide}>{deciding.status === 'APPROVED' ? 'Approve' : 'Reject'}</button></>}>
          <div>{userName(db, deciding.r.userId)} · {db.routes.find((x) => x.id === deciding.r.routeId)?.name} · {deciding.r.stop}</div>
          {deciding.status === 'APPROVED' && db.users.find((u) => u.id === deciding.r.userId)?.role === 'student' && <div className="small muted">The route's semester fee is added to the student's fees.</div>}
          <Field label="Note (optional)"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </Modal>
      )}
      {announce && (
        <Modal title={`Announcement: ${announce.name}`} onClose={() => setAnnounce(null)} footer={<><button className="btn btn-ghost" onClick={() => setAnnounce(null)}>Cancel</button><button className="btn" onClick={send}>Send to {announce.subscribers.length} rider(s)</button></>}>
          <Field label="Message"><textarea className="textarea" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="e.g. Bus delayed by 20 minutes due to traffic at Hebbal" /></Field>
        </Modal>
      )}
      {draft && (
        <Modal wide title={draft.id ? `Edit ${draft.name}` : 'New route'} onClose={() => setDraft(null)} footer={<><button className="btn btn-ghost" onClick={() => setDraft(null)}>Cancel</button><button className="btn" onClick={saveRoute}>Save</button></>}>
          <div className="grid grid-3">
            <Field label="Route name"><input className="input" value={draft.name ?? ''} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Route 4 – Jayanagar" /></Field>
            <Field label="Bus number"><input className="input" value={draft.bus ?? ''} onChange={(e) => setDraft({ ...draft, bus: e.target.value })} /></Field>
            <Field label="Seats"><input className="input" type="number" min={1} value={draft.capacity ?? ''} onChange={(e) => setDraft({ ...draft, capacity: Number(e.target.value) })} /></Field>
            <Field label="Driver"><input className="input" value={draft.driver ?? ''} onChange={(e) => setDraft({ ...draft, driver: e.target.value })} /></Field>
            <Field label="Driver phone"><input className="input" value={draft.driverPhone ?? ''} onChange={(e) => setDraft({ ...draft, driverPhone: e.target.value })} /></Field>
            <Field label="Fee per semester (₹)"><input className="input" type="number" min={0} value={draft.feePerSem ?? ''} onChange={(e) => setDraft({ ...draft, feePerSem: Number(e.target.value) })} /></Field>
            <Field label="Leaves campus at"><input className="input" type="time" value={draft.returnTime ?? ''} onChange={(e) => setDraft({ ...draft, returnTime: e.target.value })} /></Field>
            <Field label="Status"><label className="row gap"><input type="checkbox" checked={draft.active ?? true} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} /> Running</label></Field>
          </div>
          <Field label="Stops and morning pick-up times (last stop = campus)">
            <div className="stack" style={{ gap: 6 }}>
              {(draft.stops ?? []).map((s, i) => (
                <div key={i} className="row gap">
                  <input className="input" aria-label={`Stop ${i + 1}`} value={s.name} onChange={(e) => setDraft({ ...draft, stops: draft.stops!.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} placeholder={`Stop ${i + 1}`} />
                  <input className="input" type="time" style={{ width: 130 }} value={s.time} onChange={(e) => setDraft({ ...draft, stops: draft.stops!.map((x, j) => (j === i ? { ...x, time: e.target.value } : x)) })} />
                  <button className="icon-btn" aria-label="Remove stop" onClick={() => setDraft({ ...draft, stops: draft.stops!.filter((_, j) => j !== i) })}><Trash2 size={14} /></button>
                </div>
              ))}
              <button className="btn btn-ghost btn-sm" onClick={() => setDraft({ ...draft, stops: [...(draft.stops ?? []).slice(0, -1), { name: '', time: '07:30' }, ...(draft.stops ?? []).slice(-1)] })}><Plus size={12} /> Add stop</button>
            </div>
          </Field>
        </Modal>
      )}
    </>
  )
}

/* ============================ Riders ============================ */

function TransportRider() {
  const db = useDB()
  const me = useCurrentUser()!
  const [q, setQ] = useState('')
  const [req, setReq] = useState<{ route: TransportRoute; stop: string } | null>(null)
  // Parents see their wards' passes.
  const people = me.role === 'parent' ? (me.wardIds ?? []) : [me.id]
  const mine = db.routes.filter((r) => people.some((p) => r.subscribers.includes(p)))
  const myReq = db.transportRequests.filter((r) => r.userId === me.id && r.status === 'PENDING')
  const send = () => {
    if (!req) return
    update((d) => { for (const r of d.transportRequests) if (r.userId === me.id && r.status === 'PENDING') r.status = 'CANCELLED'; d.transportRequests.push({ id: uid('tr'), userId: me.id, routeId: req.route.id, stop: req.stop, status: 'PENDING', at: Date.now() }) })
    notify(db.users.filter((u) => u.role === 'admin' && u.office === 'transport').map((u) => u.id), `Bus pass request: ${me.name} (${personaLabel(me)}) for ${req.route.name}, ${req.stop}`, '/transport')
    setReq(null)
  }
  const cancelPass = (r: TransportRoute) => {
    if (!confirm(`Give up your seat on ${r.name}?`)) return
    update((d) => { const rt = d.routes.find((x) => x.id === r.id)!; rt.subscribers = rt.subscribers.filter((s) => s !== me.id); if (rt.stopOf) delete rt.stopOf[me.id]; for (const x of d.transportRequests) if (x.userId === me.id && x.routeId === r.id && x.status === 'APPROVED') x.status = 'CANCELLED' })
    notify(db.users.filter((u) => u.role === 'admin' && u.office === 'transport').map((u) => u.id), `${me.name} gave up their seat on ${r.name}`, '/transport')
  }
  return (
    <>
      <PageHeader search={{ value: q, onChange: setQ, placeholder: 'Search route, stop or bus…' }} title="Transport" subtitle="Campus bus routes, timings and your bus pass" />
      {mine.map((r) => people.filter((p) => r.subscribers.includes(p)).map((p) => { const stop = r.stopOf?.[p]; return (
        <div key={`${r.id}${p}`} className="alert alert-info row between wrap"><span><Bus size={16} /> {me.role === 'parent' ? `${userName(db, p)}: ` : 'Your pass: '}<strong>{r.name}</strong> · board at {stop ?? '—'} ({r.stops.find((s) => s.name === stop)?.time ?? '—'}) · bus {r.bus} · return {r.returnTime ?? '—'} · {r.driver} {r.driverPhone}</span>{p === me.id && <button className="btn btn-ghost btn-sm" onClick={() => cancelPass(r)}>Give up seat</button>}</div>
      ) }))}
      {myReq.map((r) => <div key={r.id} className="alert alert-warning">Pass request pending: {db.routes.find((x) => x.id === r.routeId)?.name}, {r.stop}. The Transport Department will approve it.</div>)}
      <div className="grid grid-3">
        {db.routes.filter((r) => r.active !== false && matches(q, r.name, r.bus, r.driver, ...r.stops.map((x) => x.name))).map((r) => { const full = !!r.capacity && seatsUsed(r) >= r.capacity; const onIt = r.subscribers.includes(me.id); return (
          <Card key={r.id} title={r.name} action={onIt ? <Badge tone="success">My route</Badge> : full ? <Badge tone="danger">Full</Badge> : <Badge>{(r.capacity ?? 0) - seatsUsed(r)} seats left</Badge>}>
            <div className="small muted">Bus {r.bus}{r.feePerSem ? ` · ${inr(r.feePerSem)}/semester` : ''}{r.returnTime ? ` · leaves campus ${r.returnTime}` : ''}</div>
            <div className="list">{r.stops.map((s, i) => (
              <div key={i} className="list-item small" style={{ padding: '6px 0' }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: i === r.stops.length - 1 ? 'var(--brand)' : 'var(--accent)' }} />
                <span className="grow">{s.name}</span><strong>{s.time}</strong>
                {me.role !== 'parent' && !onIt && i < r.stops.length - 1 && <button className="btn btn-ghost btn-sm" disabled={full} onClick={() => setReq({ route: r, stop: s.name })}>Board here</button>}
              </div>
            ))}</div>
            <div className="small row gap"><Phone size={14} /> {r.driver} · <a href={`tel:${r.driverPhone}`}>{r.driverPhone}</a></div>
          </Card>
        ) })}
      </div>
      {req && (
        <Modal title="Request a bus pass" onClose={() => setReq(null)} footer={<><button className="btn btn-ghost" onClick={() => setReq(null)}>Cancel</button><button className="btn" onClick={send}>Send request</button></>}>
          <div><strong>{req.route.name}</strong> · board at {req.stop} ({req.route.stops.find((s) => s.name === req.stop)?.time})</div>
          {me.role === 'student' && req.route.feePerSem ? <div className="small muted">Once approved, {inr(req.route.feePerSem)} is added to your fees for this semester.</div> : null}
          {me.residence === 'HOSTEL' && <div className="alert alert-warning">You are a hosteller; the Transport Department may ask why you need a pass.</div>}
        </Modal>
      )}
    </>
  )
}
