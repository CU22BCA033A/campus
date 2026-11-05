import { useState } from 'react'
import { CalendarClock, Lock, MapPin, Plus, Video } from 'lucide-react'
import { audit, notify, uid, update, useCurrentUser, useDB } from '../data/store'
import { Badge, Card, Empty, Field, Modal, SearchBox, Stat, Tabs } from '../components/ui'
import { OFFICES, officeUsers, persona } from '../access'
import { DAYS, fmtDateTime, matches, timeAgo, userName } from '../lib'
import type { Appointment, DB, Office, ServiceOffering, User } from '../data/types'

const CATEGORIES: ServiceOffering['category'][] = ['Wellbeing', 'Academic', 'Administrative', 'Career', 'Financial', 'Leadership']
const tone = (s: Appointment['status']) => (s === 'CONFIRMED' ? 'success' : s === 'COMPLETED' ? 'info' : s === 'REQUESTED' ? 'warning' : 'neutral')

export const providerName = (db: DB, s: ServiceOffering) => (s.office ? OFFICES[s.office].label : userName(db, s.ownerFacultyId ?? ''))
/** Staff who handle a service's bookings. */
const handlers = (db: DB, s: ServiceOffering) => (s.office ? officeUsers(db, s.office) : s.ownerFacultyId ? [s.ownerFacultyId] : [])
export const handlesService = (u: User, s: ServiceOffering) => persona(u) === 'super' || (u.role === 'admin' && u.office === s.office) || (u.role === 'faculty' && s.ownerFacultyId === u.id)
const canPublish = (u: User) => u.role === 'admin' || u.role === 'faculty'

/** Upcoming bookable times for a service over the next two weeks. */
function upcomingSlots(db: DB, s: ServiceOffering) {
  const out: { at: number; booked: number }[] = []
  const start = new Date(); start.setHours(0, 0, 0, 0)
  for (let i = 0; i < 14; i++) {
    const day = new Date(start.getTime() + i * 86_400_000)
    for (const sl of s.slots.filter((x) => x.day === day.getDay())) {
      const [h, m] = sl.start.split(':').map(Number)
      const at = new Date(day); at.setHours(h, m, 0, 0)
      if (at.getTime() < Date.now() + 3_600_000) continue // at least an hour's notice
      const booked = db.appointments.filter((a) => a.serviceId === s.id && a.at === at.getTime() && (a.status === 'REQUESTED' || a.status === 'CONFIRMED')).length
      out.push({ at: at.getTime(), booked })
    }
  }
  return out
}

export default function AppointmentsPanel() {
  const db = useDB()
  const me = useCurrentUser()!
  const isStudent = me.role === 'student'
  const mine = db.services.filter((s) => handlesService(me, s))
  const [tab, setTab] = useState<'browse' | 'mine' | 'manage'>(isStudent ? 'browse' : mine.length || canPublish(me) ? 'manage' : 'browse')
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<'All' | ServiceOffering['category']>('All')
  const [booking, setBooking] = useState<ServiceOffering | null>(null)
  const [slot, setSlot] = useState<number | null>(null)
  const [reason, setReason] = useState('')
  const [editing, setEditing] = useState<Partial<ServiceOffering> | null>(null)
  const [deciding, setDeciding] = useState<{ a: Appointment; action: 'CONFIRMED' | 'DECLINED' | 'COMPLETED' } | null>(null)
  const [note, setNote] = useState('')

  const services = db.services.filter((s) => s.active && (cat === 'All' || s.category === cat) && matches(q, s.title, s.description, providerName(db, s), s.category, s.location))
  const myAppts = db.appointments.filter((a) => a.studentId === me.id).sort((a, b) => b.at - a.at)
  const queue = db.appointments.filter((a) => mine.some((s) => s.id === a.serviceId)).filter((a) => matches(q, userName(db, a.studentId), db.users.find((u) => u.id === a.studentId)?.rollNo, a.reason, db.services.find((s) => s.id === a.serviceId)?.title)).sort((a, b) => Number(b.status === 'REQUESTED') - Number(a.status === 'REQUESTED') || a.at - b.at)

  const book = () => {
    if (!booking || !slot || !reason.trim()) return
    update((d) => { d.appointments.push({ id: uid('apt'), serviceId: booking.id, studentId: me.id, at: slot, reason, status: 'REQUESTED', createdAt: Date.now() }) })
    notify(handlers(db, booking), `New appointment request: ${booking.title}, ${fmtDateTime(slot)}${booking.confidential ? '' : ` (${me.name})`}`, '/help')
    setBooking(null); setSlot(null); setReason(''); setTab('mine')
  }
  const decide = () => {
    if (!deciding) return
    const { a, action } = deciding
    const s = db.services.find((x) => x.id === a.serviceId)!
    update((d) => { const x = d.appointments.find((y) => y.id === a.id)!; x.status = action; if (note.trim()) x.note = note.trim() })
    notify([a.studentId], `${s.title} on ${fmtDateTime(a.at)}: ${action.toLowerCase()}${note.trim() ? `. ${note.trim()}` : ''}`, '/help')
    audit(me.id, `APPOINTMENT_${action}`, `${s.title} for ${s.confidential ? 'a student (confidential)' : userName(db, a.studentId)}`)
    setDeciding(null); setNote('')
  }
  const saveService = () => {
    const e = editing!
    if (!e.title?.trim() || !e.slots?.length) return alert('Add a title and at least one weekly slot.')
    const owner: Pick<ServiceOffering, 'office' | 'ownerFacultyId'> = me.role === 'faculty' ? { ownerFacultyId: me.id } : { office: (e.office ?? me.office ?? 'studentAffairs') as Office }
    update((d) => {
      if (e.id) Object.assign(d.services.find((s) => s.id === e.id)!, e)
      else d.services.push({ id: uid('sv'), description: '', category: 'Academic', mode: 'In person', location: '', durationMin: 20, maxPerSlot: 1, confidential: false, active: true, createdBy: me.id, ...e, ...owner, slots: e.slots!, title: e.title! })
    })
    audit(me.id, e.id ? 'SERVICE_EDIT' : 'SERVICE_CREATE', e.title!)
    setEditing(null)
  }

  return (
    <div className="stack">
      <div className="row between wrap gap">
        <Tabs value={tab} onChange={setTab} tabs={[
          { id: 'browse', label: 'Book a service', count: services.length },
          ...(isStudent ? [{ id: 'mine' as const, label: 'My appointments', count: myAppts.filter((a) => a.status === 'REQUESTED' || a.status === 'CONFIRMED').length }] : []),
          ...(mine.length || canPublish(me) ? [{ id: 'manage' as const, label: 'Manage bookings', count: queue.filter((a) => a.status === 'REQUESTED').length }] : []),
        ]} />
        <SearchBox value={q} onChange={setQ} placeholder={tab === 'manage' ? 'Search student, roll no., service…' : 'Search services…'} />
      </div>

      {tab === 'browse' && (
        <>
          <div className="row gap wrap">{(['All', ...CATEGORIES] as const).map((c) => <button key={c} className={`chip ${cat === c ? 'active' : ''}`} onClick={() => setCat(c)}>{c}</button>)}</div>
          {services.length === 0 && <Card><Empty text="No services match." /></Card>}
          <div className="grid grid-3">
            {services.map((s) => (
              <Card key={s.id} title={s.title} action={<Badge tone="brand">{s.category}</Badge>}>
                <div className="stack" style={{ gap: 8 }}>
                  <p className="small">{s.description}</p>
                  <div className="small muted">{providerName(db, s)}</div>
                  <div className="small row gap wrap"><span className="row gap"><MapPin size={12} /> {s.location}</span>{s.mode !== 'In person' && <span className="row gap"><Video size={12} /> {s.mode}</span>}<span>{s.durationMin} min</span></div>
                  <div className="small muted">Available: {[...new Set(s.slots.map((x) => x.day))].sort().map((d) => DAYS[d]).join(', ')}</div>
                  {s.confidential && <div className="small row gap" style={{ color: 'var(--success)' }}><Lock size={12} /> Confidential: only the {providerName(db, s)} sees your details</div>}
                  {isStudent && <button className="btn" onClick={() => { setBooking(s); setSlot(null) }}><CalendarClock size={14} /> Book appointment</button>}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {tab === 'mine' && isStudent && (
        <Card>
          {myAppts.length === 0 ? <Empty text="You have no appointments yet." /> : (
            <div className="list">{myAppts.map((a) => { const s = db.services.find((x) => x.id === a.serviceId)!; return (
              <div key={a.id} className="list-item" style={{ alignItems: 'flex-start' }}>
                <div className="grow">
                  <strong>{s.title}</strong> <Badge tone={tone(a.status)}>{a.status}</Badge>
                  <div className="small muted">{fmtDateTime(a.at)} · {s.location} · {providerName(db, s)}</div>
                  <div className="small">{a.reason}</div>
                  {a.note && <div className="alert alert-info small" style={{ marginTop: 6 }}>{a.note}</div>}
                </div>
                {(a.status === 'REQUESTED' || a.status === 'CONFIRMED') && a.at > Date.now() && <button className="btn btn-ghost btn-sm" onClick={() => { update((d) => { d.appointments.find((x) => x.id === a.id)!.status = 'CANCELLED' }); notify(handlers(db, s), `Appointment cancelled: ${s.title}, ${fmtDateTime(a.at)}`, '/help') }}>Cancel</button>}
              </div>
            ) })}</div>
          )}
        </Card>
      )}

      {tab === 'manage' && (
        <>
          <div className="grid grid-4">
            <Stat label="Requests to confirm" value={queue.filter((a) => a.status === 'REQUESTED').length} tone="warning" />
            <Stat label="Upcoming confirmed" value={queue.filter((a) => a.status === 'CONFIRMED' && a.at > Date.now()).length} tone="success" />
            <Stat label="Completed" value={queue.filter((a) => a.status === 'COMPLETED').length} tone="info" />
            <Stat label="Services offered" value={mine.length} tone="brand" />
          </div>
          <Card title="Booking queue">
            {queue.length === 0 ? <Empty text="No bookings yet." /> : (
              <div className="table-wrap"><table>
                <thead><tr><th>When</th><th>Service</th><th>Student</th><th>Reason</th><th>Status</th><th /></tr></thead>
                <tbody>{queue.map((a) => { const s = db.services.find((x) => x.id === a.serviceId)!; const st = db.users.find((u) => u.id === a.studentId); return (
                  <tr key={a.id}>
                    <td>{fmtDateTime(a.at)}<div className="small muted">requested {timeAgo(a.createdAt)}</div></td>
                    <td>{s.title}</td>
                    <td>{st?.name}<div className="small muted">{st?.rollNo}</div></td>
                    <td style={{ whiteSpace: 'normal', minWidth: 180 }}>{a.reason}</td>
                    <td><Badge tone={tone(a.status)}>{a.status}</Badge></td>
                    <td><div className="row gap">
                      {a.status === 'REQUESTED' && <><button className="btn btn-success btn-sm" onClick={() => { setDeciding({ a, action: 'CONFIRMED' }); setNote(s.mode !== 'In person' ? '' : `Please come to ${s.location}.`) }}>Confirm</button><button className="btn btn-danger btn-sm" onClick={() => { setDeciding({ a, action: 'DECLINED' }); setNote('') }}>Decline</button></>}
                      {a.status === 'CONFIRMED' && <button className="btn btn-outline btn-sm" onClick={() => { setDeciding({ a, action: 'COMPLETED' }); setNote('') }}>Mark completed</button>}
                    </div></td>
                  </tr>
                ) })}</tbody>
              </table></div>
            )}
          </Card>
          <Card title="Services you offer" action={canPublish(me) && <button className="btn btn-sm" onClick={() => setEditing({ slots: [], category: 'Academic', mode: 'In person', durationMin: 20, maxPerSlot: 1, active: true, office: me.office })}><Plus size={14} /> New service</button>}>
            {mine.length === 0 ? <Empty text="Publish a service (e.g. office hours or counselling) so students can book time with you." /> : (
              <div className="list">{mine.map((s) => (
                <div key={s.id} className="list-item">
                  <div className="grow"><strong>{s.title}</strong> {!s.active && <Badge>Paused</Badge>}<div className="small muted">{s.slots.length} weekly slots · {s.durationMin} min · {db.appointments.filter((a) => a.serviceId === s.id).length} bookings</div></div>
                  <button className="btn btn-ghost btn-sm" onClick={() => update((d) => { const x = d.services.find((y) => y.id === s.id)!; x.active = !x.active })}>{s.active ? 'Pause' : 'Resume'}</button>
                  <button className="btn btn-outline btn-sm" onClick={() => setEditing({ ...s })}>Edit</button>
                </div>
              ))}</div>
            )}
          </Card>
        </>
      )}

      {booking && (() => { const slots = upcomingSlots(db, booking); return (
        <Modal title={`Book: ${booking.title}`} onClose={() => setBooking(null)} footer={<><button className="btn btn-ghost" onClick={() => setBooking(null)}>Cancel</button><button className="btn" disabled={!slot || !reason.trim()} onClick={book}>Request appointment</button></>}>
          <div className="small muted">{providerName(db, booking)} · {booking.location} · {booking.durationMin} min</div>
          <Field label="Choose a time">
            {slots.length === 0 ? <span className="muted small">No slots in the next two weeks.</span> : (
              <div className="row gap wrap">{slots.map((x) => { const full = x.booked >= booking.maxPerSlot; return (
                <button key={x.at} type="button" disabled={full} className={`chip ${slot === x.at ? 'active' : ''}`} style={{ opacity: full ? 0.45 : 1 }} onClick={() => setSlot(x.at)} title={full ? 'Fully booked' : ''}>{fmtDateTime(x.at)}</button>
              ) })}</div>
            )}
          </Field>
          <Field label={booking.confidential ? 'What would you like to talk about? (confidential)' : 'Purpose of the meeting'}><textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        </Modal>
      ) })()}

      {deciding && (
        <Modal title={deciding.action === 'CONFIRMED' ? 'Confirm appointment' : deciding.action === 'DECLINED' ? 'Decline appointment' : 'Mark as completed'} onClose={() => setDeciding(null)} footer={<><button className="btn btn-ghost" onClick={() => setDeciding(null)}>Cancel</button><button className={`btn ${deciding.action === 'DECLINED' ? 'btn-danger' : 'btn-success'}`} onClick={decide}>{deciding.action === 'CONFIRMED' ? 'Confirm' : deciding.action === 'DECLINED' ? 'Decline' : 'Complete'}</button></>}>
          <div>{userName(db, deciding.a.studentId)} · {fmtDateTime(deciding.a.at)}</div>
          <Field label="Message to the student (optional)" hint={deciding.action === 'CONFIRMED' ? 'e.g. room number or meeting link' : deciding.action === 'DECLINED' ? 'e.g. suggest another time' : 'e.g. follow-up advice'}><textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </Modal>
      )}

      {editing && (
        <Modal title={editing.id ? 'Edit service' : 'New service'} onClose={() => setEditing(null)} footer={<><button className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button><button className="btn" onClick={saveService}>Save</button></>}>
          <Field label="Title"><input className="input" value={editing.title ?? ''} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="e.g. Counselling Centre appointment" /></Field>
          <Field label="Description"><textarea className="textarea" value={editing.description ?? ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></Field>
          <div className="grid grid-2">
            <Field label="Category"><select className="select" value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value as ServiceOffering['category'] })}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Mode"><select className="select" value={editing.mode} onChange={(e) => setEditing({ ...editing, mode: e.target.value as ServiceOffering['mode'] })}>{['In person', 'Online', 'In person or online'].map((m) => <option key={m}>{m}</option>)}</select></Field>
            <Field label="Location / meeting link"><input className="input" value={editing.location ?? ''} onChange={(e) => setEditing({ ...editing, location: e.target.value })} /></Field>
            <Field label="Duration (min)"><input className="input" type="number" min={5} value={editing.durationMin ?? 20} onChange={(e) => setEditing({ ...editing, durationMin: Number(e.target.value) })} /></Field>
            <Field label="Bookings per slot"><input className="input" type="number" min={1} value={editing.maxPerSlot ?? 1} onChange={(e) => setEditing({ ...editing, maxPerSlot: Number(e.target.value) })} /></Field>
            {persona(me) === 'super' && <Field label="Office"><select className="select" value={editing.office ?? 'studentAffairs'} onChange={(e) => setEditing({ ...editing, office: e.target.value as Office })}>{(Object.keys(OFFICES) as Office[]).map((o) => <option key={o} value={o}>{OFFICES[o].label}</option>)}</select></Field>}
          </div>
          <label className="row gap"><input type="checkbox" checked={!!editing.confidential} onChange={(e) => setEditing({ ...editing, confidential: e.target.checked })} /> Confidential (hide the student's name in notifications and the audit log)</label>
          <Field label="Weekly slots" hint="Students can book these times for the next two weeks">
            <div className="stack" style={{ gap: 6 }}>
              {(editing.slots ?? []).map((sl, i) => (
                <div key={i} className="row gap">
                  <select className="select" style={{ width: 110 }} value={sl.day} onChange={(e) => setEditing({ ...editing, slots: editing.slots!.map((x, k) => (k === i ? { ...x, day: Number(e.target.value) } : x)) })}>{[1, 2, 3, 4, 5, 6].map((d) => <option key={d} value={d}>{DAYS[d]}</option>)}</select>
                  <input className="input" style={{ width: 130 }} type="time" value={sl.start} onChange={(e) => setEditing({ ...editing, slots: editing.slots!.map((x, k) => (k === i ? { ...x, start: e.target.value } : x)) })} />
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditing({ ...editing, slots: editing.slots!.filter((_, k) => k !== i) })}>Remove</button>
                </div>
              ))}
              <button className="btn btn-outline btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setEditing({ ...editing, slots: [...(editing.slots ?? []), { day: 1, start: '10:00' }] })}><Plus size={12} /> Add slot</button>
            </div>
          </Field>
        </Modal>
      )}
    </div>
  )
}
