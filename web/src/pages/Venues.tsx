import { useState } from 'react'
import { Building2, CalendarPlus, Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { audit, getDB, notify, uid, update, useCurrentUser, useDB } from '../data/store'
import { Badge, Card, Empty, Field, Modal, PageHeader, Stat, Tabs } from '../components/ui'
import { FilterBar, opts, useFilters } from '../components/Filters'
import { can, officeUsers, personaLabel } from '../access'
import { fmtDate, matches, userName } from '../lib'
import type { Booking, DB, Venue } from '../data/types'

const ACTIVE: Booking['status'][] = ['PENDING', 'CONFIRMED']
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0) }
const tone = (s: Booking['status']) => (s === 'CONFIRMED' ? 'success' : s === 'PENDING' ? 'warning' : s === 'REJECTED' ? 'danger' : 'neutral')
const KINDS: Venue['kind'][] = ['Auditorium', 'Seminar hall', 'Conference room', 'Lab', 'Sports', 'Other']

/** A booking that overlaps the requested time in the same venue (pending or confirmed), if any. */
export function clashFor(db: DB, venueId: string, date: string, start: string, end: string, ignoreId?: string) {
  return db.bookings.find((b) => b.id !== ignoreId && b.venueId === venueId && b.date === date && ACTIVE.includes(b.status) && toMin(b.start) < toMin(end) && toMin(start) < toMin(b.end))
}
/** Free time ranges of a venue on a day (within opening hours), so several people can use it the same day. */
export function freeRanges(db: DB, v: Venue, date: string, ignoreId?: string) {
  const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  const busy = db.bookings.filter((b) => b.id !== ignoreId && b.venueId === v.id && b.date === date && ACTIVE.includes(b.status)).map((b) => [toMin(b.start), toMin(b.end)]).sort((a, b) => a[0] - b[0])
  const out: { start: string; end: string }[] = []
  let cur = toMin(v.opens)
  for (const [s, e] of busy) { if (s > cur) out.push({ start: fmt(cur), end: fmt(s) }); cur = Math.max(cur, e) }
  if (cur < toMin(v.closes)) out.push({ start: fmt(cur), end: v.closes })
  return out.filter((r) => toMin(r.end) - toMin(r.start) >= 30)
}
/** Who receives a venue's bookings: its manager, or Estate & Facilities when none is assigned. */
const handlersOf = (db: DB, v: Venue) => (v.managerId ? [v.managerId] : officeUsers(db, 'facilities'))

export default function Venues() {
  const db = useDB()
  const me = useCurrentUser()!
  const manageAll = can(me, 'manageAllBookings')
  const manageVenues = can(me, 'manageVenues')
  const managed = db.venues.filter((v) => manageAll || v.managerId === me.id)
  const [tab, setTab] = useState<'book' | 'mine' | 'approve' | 'venues'>(managed.length && me.role !== 'student' ? 'approve' : 'book')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [term, setTerm] = useState('')
  const [draft, setDraft] = useState<Partial<Booking> | null>(null)
  const [venueDraft, setVenueDraft] = useState<Partial<Venue> | null>(null)
  const [deciding, setDeciding] = useState<{ b: Booking; status: 'CONFIRMED' | 'REJECTED' } | null>(null)
  const [note, setNote] = useState('')

  const vf = useFilters(['kind'] as const)
  const venues = db.venues.filter((v) => v.active && vf.ok('kind', v.kind) && matches(term, v.name, v.kind, v.location, v.amenities))
  const mine = db.bookings.filter((b) => b.bookedBy === me.id).sort((a, b) => b.date.localeCompare(a.date) || b.start.localeCompare(a.start))
  const af = useFilters(['status', 'venue'] as const)
  const queue = db.bookings.filter((b) => managed.some((v) => v.id === b.venueId)).filter((b) => af.ok('status', b.status) && af.ok('venue', b.venueId))
    .filter((b) => matches(term, b.purpose, userName(db, b.bookedBy), db.venues.find((v) => v.id === b.venueId)?.name))
    .sort((a, b) => Number(b.status === 'PENDING') - Number(a.status === 'PENDING') || a.date.localeCompare(b.date) || a.start.localeCompare(b.start))
  const pending = queue.filter((b) => b.status === 'PENDING').length

  const submit = () => {
    const b = draft!
    const v = db.venues.find((x) => x.id === b.venueId)
    if (!v || !b.date || !b.start || !b.end || !b.purpose?.trim()) return alert('Choose the venue, date, time and purpose.')
    if (toMin(b.end) <= toMin(b.start)) return alert('The end time must be after the start time.')
    if (toMin(b.start) < toMin(v.opens) || toMin(b.end) > toMin(v.closes)) return alert(`${v.name} is open ${v.opens}–${v.closes}.`)
    if (b.date < new Date().toISOString().slice(0, 10) && !manageAll) return alert('Choose today or a later date.')
    if (b.attendees && b.attendees > v.capacity) return alert(`${v.name} holds ${v.capacity} people.`)
    const clash = clashFor(getDB(), v.id, b.date, b.start, b.end, b.id)
    if (clash) return alert(`${v.name} is already ${clash.status === 'PENDING' ? 'requested' : 'booked'} on ${fmtDate(b.date)} ${clash.start}–${clash.end} (${clash.purpose}). Choose another time or venue.`)
    const status: Booking['status'] = v.needsApproval && !(manageAll || v.managerId === me.id) ? 'PENDING' : 'CONFIRMED'
    const id = b.id ?? uid('b')
    update((d) => {
      const ex = d.bookings.find((x) => x.id === id)
      const rec = { venueId: v.id, date: b.date!, start: b.start!, end: b.end!, purpose: b.purpose!.trim(), attendees: b.attendees, status }
      if (ex) Object.assign(ex, rec); else d.bookings.push({ id, bookedBy: me.id, createdAt: Date.now(), ...rec })
    })
    const when = `${fmtDate(b.date)} ${b.start}–${b.end}`
    notify(handlersOf(db, v).filter((x) => x !== me.id), `${status === 'PENDING' ? 'Booking request' : 'New booking'}: ${v.name}, ${when} · ${b.purpose} · by ${me.name} (${personaLabel(me)})${b.attendees ? ` · ${b.attendees} people` : ''}`, '/venues')
    audit(me.id, b.id ? 'BOOKING_EDIT' : 'BOOKING_CREATE', `${v.name} ${when}`)
    alert(status === 'PENDING' ? `Request sent to ${userName(db, v.managerId ?? '') || 'Estate & Facilities'} for approval.` : `${v.name} is booked for ${when}.`)
    setDraft(null)
  }
  const decide = () => {
    const { b, status } = deciding!
    const v = db.venues.find((x) => x.id === b.venueId)!
    if (status === 'CONFIRMED') { const clash = db.bookings.find((x) => x.id !== b.id && x.venueId === b.venueId && x.date === b.date && x.status === 'CONFIRMED' && toMin(x.start) < toMin(b.end) && toMin(b.start) < toMin(x.end)); if (clash) return alert(`Clashes with a confirmed booking: ${clash.start}–${clash.end} ${clash.purpose}.`) }
    update((d) => { const x = d.bookings.find((y) => y.id === b.id)!; x.status = status; x.decidedBy = me.id; x.note = note.trim() || undefined })
    notify([b.bookedBy], `${v.name} on ${fmtDate(b.date)} ${b.start}–${b.end}: ${status === 'CONFIRMED' ? 'confirmed' : 'not approved'}${note.trim() ? ` · ${note.trim()}` : ''}`, '/venues')
    audit(me.id, `BOOKING_${status}`, `${v.name} ${b.date} ${b.start}`)
    setDeciding(null); setNote('')
  }
  const cancel = (b: Booking) => {
    if (!confirm('Cancel this booking?')) return
    const v = db.venues.find((x) => x.id === b.venueId)!
    update((d) => { d.bookings.find((x) => x.id === b.id)!.status = 'CANCELLED' })
    notify(b.bookedBy === me.id ? handlersOf(db, v) : [b.bookedBy], `Booking cancelled: ${v.name} ${fmtDate(b.date)} ${b.start}–${b.end} (${b.purpose})`, '/venues')
    audit(me.id, 'BOOKING_CANCEL', `${v.name} ${b.date} ${b.start}`)
  }
  const saveVenue = () => {
    const v = venueDraft!
    if (!v.name?.trim()) return alert('Name the venue.')
    if (toMin(v.closes ?? '20:00') <= toMin(v.opens ?? '08:00')) return alert('Closing time must be after opening time.')
    const id = v.id ?? uid('v')
    update((d) => {
      const rec = { name: v.name!.trim(), kind: v.kind ?? 'Other', capacity: v.capacity ?? 50, location: v.location ?? '', amenities: v.amenities, managerId: v.managerId || undefined, needsApproval: v.needsApproval ?? true, opens: v.opens ?? '08:00', closes: v.closes ?? '20:00', active: v.active ?? true }
      const ex = d.venues.find((x) => x.id === id); if (ex) Object.assign(ex, rec); else d.venues.push({ id, ...rec })
    })
    if (v.managerId) notify([v.managerId], `You manage bookings for ${v.name}. Requests will reach you here.`, '/venues')
    audit(me.id, v.id ? 'VENUE_EDIT' : 'VENUE_CREATE', v.name!)
    setVenueDraft(null)
  }
  const deleteVenue = (v: Venue) => {
    const upcoming = db.bookings.filter((b) => b.venueId === v.id && ACTIVE.includes(b.status) && b.date >= new Date().toISOString().slice(0, 10))
    if (!confirm(`Delete ${v.name}?${upcoming.length ? ` ${upcoming.length} upcoming booking(s) will be cancelled and the people notified.` : ''}`)) return
    update((d) => { d.venues = d.venues.filter((x) => x.id !== v.id); for (const b of d.bookings) if (b.venueId === v.id && ACTIVE.includes(b.status)) b.status = 'CANCELLED' })
    notify(upcoming.map((b) => b.bookedBy), `${v.name} is no longer available; your booking was cancelled.`, '/venues')
    audit(me.id, 'VENUE_DELETE', v.name)
  }
  const staff = db.users.filter((u) => u.role !== 'student' && u.role !== 'parent' && u.status === 'ACTIVE')
  const startHour = 7, endHour = 22
  const pos = (t: string) => ((toMin(t) - startHour * 60) / ((endHour - startHour) * 60)) * 100

  return (
    <>
      <PageHeader title="Venue booking" subtitle="Book auditoriums, halls, labs and grounds. Each venue's manager receives and approves requests; overlapping bookings are refused."
        search={{ value: term, onChange: setTerm, placeholder: 'Search venue or booking…' }}
        actions={<button className="btn" onClick={() => setDraft({ venueId: venues[0]?.id, date, start: '10:00', end: '12:00' })}><CalendarPlus size={14} /> Book a venue</button>} />
      <div className="grid grid-4">
        <Stat label="Venues" value={db.venues.filter((v) => v.active).length} icon={<Building2 size={22} />} />
        <Stat label="Booked today" value={db.bookings.filter((b) => b.date === new Date().toISOString().slice(0, 10) && b.status === 'CONFIRMED').length} tone="info" />
        <Stat label="My upcoming bookings" value={mine.filter((b) => ACTIVE.includes(b.status) && b.date >= new Date().toISOString().slice(0, 10)).length} tone="success" />
        {managed.length > 0 && <Stat label="Requests to approve" value={pending} tone="warning" />}
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'book', label: 'Availability' },
        { id: 'mine', label: 'My bookings', count: mine.filter((b) => b.status === 'PENDING').length },
        ...(managed.length ? [{ id: 'approve' as const, label: manageAll ? 'All bookings' : 'Venues I manage', count: pending }] : []),
        ...(manageVenues ? [{ id: 'venues' as const, label: 'Manage venues' }] : []),
      ]} />

      {tab === 'book' && (
        <>
          <div className="row gap wrap"><input className="input" type="date" style={{ width: 'auto' }} value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" /><FilterBar defs={[{ key: 'kind' as const, label: 'Venue types', options: opts(db.venues.map((v) => v.kind)) }]} f={vf} count={venues.length} noun="venue" /></div>
          <Card title={`Availability on ${fmtDate(date)}`} action={<span className="small muted">Grey = booked, amber = awaiting approval</span>}>
            {venues.length === 0 ? <Empty text="No venues match." /> : (
              <div className="stack" style={{ gap: 10 }}>
                <div className="timeline-scale">{Array.from({ length: endHour - startHour + 1 }, (_, i) => <span key={i} style={{ left: `${(i / (endHour - startHour)) * 100}%` }}>{startHour + i}</span>)}</div>
                {venues.map((v) => {
                  const day = db.bookings.filter((b) => b.venueId === v.id && b.date === date && ACTIVE.includes(b.status))
                  return (
                    <div key={v.id} className="venue-row">
                      <div className="venue-info"><strong>{v.name}</strong><div className="small muted">{v.kind} · {v.capacity} seats · {v.location}</div><div className="small muted">Manager: {v.managerId ? userName(db, v.managerId) : 'Estate & Facilities'}{v.needsApproval ? ' · approval needed' : ' · instant'}</div></div>
                      <div className="timeline" title={`Open ${v.opens}–${v.closes}`}>
                        <span className="timeline-closed" style={{ left: 0, width: `${pos(v.opens)}%` }} /><span className="timeline-closed" style={{ left: `${pos(v.closes)}%`, right: 0 }} />
                        {day.map((b) => <span key={b.id} className={`timeline-block ${b.status === 'PENDING' ? 'pending' : ''} ${b.bookedBy === me.id ? 'mine' : ''}`} style={{ left: `${pos(b.start)}%`, width: `${pos(b.end) - pos(b.start)}%` }} title={`${b.start}–${b.end} · ${b.purpose} · ${userName(db, b.bookedBy)} (${b.status.toLowerCase()})`}>{b.start}–{b.end}</span>)}
                      </div>
                      <button className="btn btn-outline btn-sm" disabled={!freeRanges(db, v, date).length} onClick={() => { const f = freeRanges(db, v, date)[0]; setDraft({ venueId: v.id, date, start: f?.start ?? '10:00', end: f ? (toMin(f.end) - toMin(f.start) > 120 ? `${String(Math.floor(toMin(f.start) / 60) + 2).padStart(2, '0')}:${f.start.slice(3)}` : f.end) : '12:00' }) }}>{freeRanges(db, v, date).length ? 'Book' : 'Full'}</button>
                      <div className="venue-free small" style={{ gridColumn: '2 / 3' }}>{freeRanges(db, v, date).length ? <>Free: {freeRanges(db, v, date).map((r) => `${r.start}–${r.end}`).join(', ')}</> : <span style={{ color: 'var(--danger)' }}>Fully booked this day</span>}</div>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        </>
      )}

      {tab === 'mine' && (
        <Card>
          {mine.length === 0 ? <Empty text="You have not booked anything yet." /> : (
            <div className="table-wrap"><table>
              <thead><tr><th>Venue</th><th>When</th><th>Purpose</th><th>Status</th><th /></tr></thead>
              <tbody>{mine.map((b) => { const v = db.venues.find((x) => x.id === b.venueId); return (
                <tr key={b.id}>
                  <td><strong>{v?.name ?? 'Removed venue'}</strong><div className="small muted">Manager: {v?.managerId ? userName(db, v.managerId) : 'Estate & Facilities'}</div></td>
                  <td>{fmtDate(b.date)}<div className="small muted">{b.start}–{b.end}</div></td>
                  <td>{b.purpose}{b.note && <div className="small muted">Note: {b.note}</div>}</td>
                  <td><Badge tone={tone(b.status)}>{b.status.toLowerCase()}</Badge></td>
                  <td className="row gap">{ACTIVE.includes(b.status) && <><button className="btn btn-ghost btn-sm" onClick={() => setDraft(b)}>Edit</button><button className="btn btn-ghost btn-sm" onClick={() => cancel(b)}>Cancel</button></>}</td>
                </tr>
              ) })}</tbody>
            </table></div>
          )}
        </Card>
      )}

      {tab === 'approve' && (
        <>
          <FilterBar defs={[{ key: 'status' as const, label: 'Statuses', options: opts(db.bookings.map((b) => b.status), (v) => v[0] + v.slice(1).toLowerCase()) }, { key: 'venue' as const, label: 'Venues', options: managed.map((v) => ({ value: v.id, label: v.name })) }]} f={af} count={queue.length} noun="booking" />
          <Card>
            {queue.length === 0 ? <Empty text="No bookings for your venues." /> : (
              <div className="table-wrap"><table>
                <thead><tr><th>Venue</th><th>When</th><th>Booked by</th><th>Purpose</th><th>Status</th><th /></tr></thead>
                <tbody>{queue.map((b) => { const v = db.venues.find((x) => x.id === b.venueId)!; const who = db.users.find((u) => u.id === b.bookedBy); return (
                  <tr key={b.id}>
                    <td><strong>{v.name}</strong></td>
                    <td>{fmtDate(b.date)}<div className="small muted">{b.start}–{b.end}</div></td>
                    <td>{who?.name}<div className="small muted">{who && personaLabel(who)}{who?.phone ? ` · ${who.phone}` : ''}</div></td>
                    <td>{b.purpose}{b.attendees ? <div className="small muted">{b.attendees} people</div> : null}{b.note && <div className="small muted">Note: {b.note}</div>}</td>
                    <td><Badge tone={tone(b.status)}>{b.status.toLowerCase()}</Badge>{b.decidedBy && <div className="small muted">by {userName(db, b.decidedBy)}</div>}</td>
                    <td className="row gap">
                      {b.status === 'PENDING' && <><button className="btn btn-success btn-sm" onClick={() => setDeciding({ b, status: 'CONFIRMED' })}><Check size={12} /> Approve</button><button className="btn btn-ghost btn-sm" onClick={() => setDeciding({ b, status: 'REJECTED' })}><X size={12} /> Reject</button></>}
                      {ACTIVE.includes(b.status) && <><button className="btn btn-ghost btn-sm" onClick={() => setDraft(b)}>Edit</button><button className="btn btn-ghost btn-sm" onClick={() => cancel(b)}>Cancel</button></>}
                    </td>
                  </tr>
                ) })}</tbody>
              </table></div>
            )}
          </Card>
        </>
      )}

      {tab === 'venues' && manageVenues && (
        <Card title="Venues and their managers" action={<button className="btn btn-sm" onClick={() => setVenueDraft({ kind: 'Seminar hall', capacity: 100, needsApproval: true, opens: '08:00', closes: '19:00', active: true })}><Plus size={14} /> Add venue</button>}>
          <div className="table-wrap"><table>
            <thead><tr><th>Venue</th><th>Type</th><th>Capacity</th><th>Hours</th><th>Manager (gets bookings)</th><th>Approval</th><th /></tr></thead>
            <tbody>{db.venues.map((v) => (
              <tr key={v.id}>
                <td><strong>{v.name}</strong><div className="small muted">{v.location}{v.amenities ? ` · ${v.amenities}` : ''}</div>{!v.active && <Badge>Closed</Badge>}</td>
                <td>{v.kind}</td><td>{v.capacity}</td><td className="small">{v.opens}–{v.closes}</td>
                <td>{v.managerId ? userName(db, v.managerId) : <span className="muted">Estate & Facilities</span>}</td>
                <td>{v.needsApproval ? <Badge tone="warning">Required</Badge> : <Badge tone="success">Instant</Badge>}</td>
                <td className="row gap"><button className="icon-btn" aria-label={`Edit ${v.name}`} onClick={() => setVenueDraft(v)}><Pencil size={14} /></button><button className="icon-btn" aria-label={`Delete ${v.name}`} onClick={() => deleteVenue(v)}><Trash2 size={14} /></button></td>
              </tr>
            ))}</tbody>
          </table></div>
        </Card>
      )}

      {draft && (() => {
        const v = db.venues.find((x) => x.id === draft.venueId)
        const clash = v && draft.date && draft.start && draft.end && toMin(draft.end) > toMin(draft.start) ? clashFor(db, v.id, draft.date, draft.start, draft.end, draft.id) : undefined
        const set = (p: Partial<Booking>) => setDraft({ ...draft, ...p })
        return (
          <Modal title={draft.id ? 'Edit booking' : 'Book a venue'} onClose={() => setDraft(null)} footer={<><button className="btn btn-ghost" onClick={() => setDraft(null)}>Cancel</button><button className="btn" disabled={!!clash} onClick={submit}>{v?.needsApproval && !(manageAll || v.managerId === me.id) ? 'Send request' : 'Confirm booking'}</button></>}>
            <Field label="Venue"><select className="select" value={draft.venueId} onChange={(e) => set({ venueId: e.target.value })}>{db.venues.filter((x) => x.active).map((x) => <option key={x.id} value={x.id}>{x.name} · {x.capacity} seats</option>)}</select></Field>
            {v && <div className="small muted">{v.location} · open {v.opens}–{v.closes} · manager {v.managerId ? userName(db, v.managerId) : 'Estate & Facilities'}{v.needsApproval ? ' · needs approval' : ''}</div>}
            <div className="grid grid-3">
              <Field label="Date"><input className="input" type="date" value={draft.date ?? ''} onChange={(e) => set({ date: e.target.value })} /></Field>
              <Field label="From (time)"><input className="input" type="time" value={draft.start ?? ''} onChange={(e) => set({ start: e.target.value })} /></Field>
              <Field label="Till (time)"><input className="input" type="time" value={draft.end ?? ''} onChange={(e) => set({ end: e.target.value })} /></Field>
            </div>
            <Field label="Purpose"><input className="input" value={draft.purpose ?? ''} onChange={(e) => set({ purpose: e.target.value })} placeholder="e.g. Guest lecture, club event" /></Field>
            <Field label="Expected attendees"><input className="input" type="number" min={1} value={draft.attendees ?? ''} onChange={(e) => set({ attendees: e.target.value ? Number(e.target.value) : undefined })} /></Field>
            {v && draft.date && (() => { const free = freeRanges(db, v, draft.date, draft.id); const taken = db.bookings.filter((b) => b.id !== draft.id && b.venueId === v.id && b.date === draft.date && ACTIVE.includes(b.status)).sort((a, b) => a.start.localeCompare(b.start)); return (
              <div className="stack" style={{ gap: 6 }}>
                <div className="small"><strong>Free on {fmtDate(draft.date)}:</strong> {free.length ? free.map((r) => <button key={r.start} type="button" className="chip free-chip" onClick={() => set({ start: r.start, end: toMin(r.end) - toMin(r.start) > 120 ? `${String(Math.floor(toMin(r.start) / 60) + 2).padStart(2, '0')}:${r.start.slice(3)}` : r.end })}>{r.start}–{r.end}</button>) : <span className="muted">fully booked</span>}</div>
                {taken.length > 0 && <div className="small muted">Already taken: {taken.map((b) => `${b.start}–${b.end} (${b.status === 'PENDING' ? 'requested' : 'booked'})`).join(', ')}. Others can still book the free times.</div>}
              </div>
            ) })()}
            {clash ? <div className="alert alert-danger">Not available: {clash.start}–{clash.end} is {clash.status === 'PENDING' ? 'requested' : 'booked'} for “{clash.purpose}”.</div> : v && draft.date && <div className="alert alert-success">Available.</div>}
          </Modal>
        )
      })()}
      {deciding && (
        <Modal title={deciding.status === 'CONFIRMED' ? 'Approve booking' : 'Reject booking'} onClose={() => setDeciding(null)} footer={<><button className="btn btn-ghost" onClick={() => setDeciding(null)}>Back</button><button className={`btn ${deciding.status === 'CONFIRMED' ? 'btn-success' : ''}`} onClick={decide}>{deciding.status === 'CONFIRMED' ? 'Approve' : 'Reject'}</button></>}>
          <div>{db.venues.find((v) => v.id === deciding.b.venueId)?.name} · {fmtDate(deciding.b.date)} {deciding.b.start}–{deciding.b.end}</div>
          <div className="small muted">{deciding.b.purpose} · {userName(db, deciding.b.bookedBy)}</div>
          <Field label="Note to the person (optional)"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={deciding.status === 'CONFIRMED' ? 'e.g. Collect the keys from security' : 'e.g. Hall reserved for exams'} /></Field>
        </Modal>
      )}
      {venueDraft && (
        <Modal title={venueDraft.id ? `Edit ${venueDraft.name}` : 'Add venue'} onClose={() => setVenueDraft(null)} footer={<><button className="btn btn-ghost" onClick={() => setVenueDraft(null)}>Cancel</button><button className="btn" onClick={saveVenue}>Save</button></>}>
          <div className="grid grid-2">
            <Field label="Name"><input className="input" value={venueDraft.name ?? ''} onChange={(e) => setVenueDraft({ ...venueDraft, name: e.target.value })} /></Field>
            <Field label="Type"><select className="select" value={venueDraft.kind} onChange={(e) => setVenueDraft({ ...venueDraft, kind: e.target.value as Venue['kind'] })}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select></Field>
            <Field label="Capacity"><input className="input" type="number" min={1} value={venueDraft.capacity ?? ''} onChange={(e) => setVenueDraft({ ...venueDraft, capacity: Number(e.target.value) })} /></Field>
            <Field label="Location"><input className="input" value={venueDraft.location ?? ''} onChange={(e) => setVenueDraft({ ...venueDraft, location: e.target.value })} /></Field>
            <Field label="Opens"><input className="input" type="time" value={venueDraft.opens ?? '08:00'} onChange={(e) => setVenueDraft({ ...venueDraft, opens: e.target.value })} /></Field>
            <Field label="Closes"><input className="input" type="time" value={venueDraft.closes ?? '20:00'} onChange={(e) => setVenueDraft({ ...venueDraft, closes: e.target.value })} /></Field>
          </div>
          <Field label="Amenities"><input className="input" value={venueDraft.amenities ?? ''} onChange={(e) => setVenueDraft({ ...venueDraft, amenities: e.target.value })} /></Field>
          <Field label="Manager" hint="Receives every booking for this venue and approves requests"><select className="select" value={venueDraft.managerId ?? ''} onChange={(e) => setVenueDraft({ ...venueDraft, managerId: e.target.value })}><option value="">Estate & Facilities office</option>{staff.map((u) => <option key={u.id} value={u.id}>{u.name} · {personaLabel(u)}</option>)}</select></Field>
          <label className="row gap"><input type="checkbox" checked={venueDraft.needsApproval ?? true} onChange={(e) => setVenueDraft({ ...venueDraft, needsApproval: e.target.checked })} /> Bookings need the manager's approval</label>
          <label className="row gap"><input type="checkbox" checked={venueDraft.active ?? true} onChange={(e) => setVenueDraft({ ...venueDraft, active: e.target.checked })} /> Open for booking</label>
        </Modal>
      )}
    </>
  )
}
