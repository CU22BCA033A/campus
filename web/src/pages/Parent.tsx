import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BedDouble, CalendarCheck, CreditCard, GraduationCap, Megaphone } from 'lucide-react'
import { audit, notify, update, useCurrentUser, useDB } from '../data/store'
import { Avatar, Badge, Card, Empty, PageHeader, Progress, Stat } from '../components/ui'
import { attendanceStats, coursesFor, feeOutstanding, fmtDate, fmtDateTime, inr, timeAgo } from '../lib'
import { bedOf, wardensFor } from '../hostels'
import { StudentExams } from './Exams'

/** Parent portal: one login, several wards (children). */
export default function ParentHome() {
  const db = useDB()
  const user = useCurrentUser()!
  const wards = (user.wardIds ?? []).map((id) => db.users.find((u) => u.id === id)).filter(Boolean) as NonNullable<ReturnType<typeof db.users.find>>[]
  const [wardId, setWardId] = useState(wards[0]?.id)
  const ward = wards.find((w) => w.id === wardId)
  if (!ward) return <Empty text="No wards are linked to this account. Contact the institution." />

  const att = attendanceStats(db, ward.id)
  const fees = db.fees.filter((f) => f.studentId === ward.id)
  const due = fees.filter((f) => feeOutstanding(f) > 0)
  const leaves = db.hostelLeaves.filter((l) => l.studentId === ward.id).sort((a, b) => b.createdAt - a.createdAt)
  const room = db.rooms.find((r) => r.occupants.includes(ward.id))
  const notices = db.notices.filter((n) => n.audience === 'all' || n.audience === 'student').sort((a, b) => b.createdAt - a.createdAt).slice(0, 3)

  const pay = (id: string) => {
    const f = db.fees.find((x) => x.id === id)!
    update((d) => { const x = d.fees.find((y) => y.id === id)!; x.paidAt = Date.now(); x.txnId = `TXN${Date.now().toString().slice(-8)}`; x.gateway = 'UPI' })
    notify([ward.id, user.id], `Fee paid: ${f.title} (${inr(feeOutstanding(f))})`, '/fees')
    audit(user.id, 'FEE_PAYMENT', `Parent paid ${f.title} for ${ward.name}`)
  }
  const decide = (id: string, ok: boolean) => {
    update((d) => { d.hostelLeaves.find((x) => x.id === id)!.parentStatus = ok ? 'APPROVED' : 'REJECTED' })
    notify([ward.id], `Your parent ${ok ? 'approved' : 'declined'} your hostel leave request`, '/hostel')
    if (ok) notify(wardensFor(db, ward), `Hostel leave for ${ward.name} awaits warden approval`, '/hostel')
    audit(user.id, 'HOSTEL_LEAVE_PARENT', `${ok ? 'Approved' : 'Rejected'} leave for ${ward.name}`)
  }

  return (
    <>
      <PageHeader title="Parent portal" subtitle="Your ward's attendance, results, fees and hostel" />
      <div className="row gap wrap">
        {wards.map((w) => (
          <button key={w.id} className={`chip ${w.id === wardId ? 'active' : ''}`} onClick={() => setWardId(w.id)} style={{ gap: 8, alignItems: 'center' }}>
            <Avatar name={w.name} color={w.avatarColor} size={22} /> {w.name} · {w.rollNo}
          </button>
        ))}
      </div>
      <div className="grid grid-4">
        <Stat label="Attendance" value={`${att.pct}%`} tone={att.pct >= 75 ? 'success' : 'danger'} hint={att.pct < 75 ? 'Below 75%: at risk for exams' : `${att.attended}/${att.total} classes`} icon={<CalendarCheck size={22} />} />
        <Stat label="CGPA" value={ward.cgpa?.toFixed(2) ?? '—'} tone="brand" icon={<GraduationCap size={22} />} />
        <Stat label="Fees due" value={inr(due.reduce((s, f) => s + feeOutstanding(f), 0))} tone={due.length ? 'danger' : 'success'} icon={<CreditCard size={22} />} />
        <Stat label="Hostel" value={room ? `${room.number} · Bed ${bedOf(room, ward.id)}` : 'Day scholar'} hint={room ? `${db.hostels.find((h) => h.id === room.hostelId)?.name ?? ''}${(() => { const abs = db.nightAttendance.filter((n) => n.absent.includes(ward.id) && n.date > new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)).length; return abs ? ` · ${abs} night absence(s) in 30 days` : ' · present at night roll calls' })()}` : undefined} tone="accent" icon={<BedDouble size={22} />} />
      </div>
      <div className="grid grid-2">
        <Card title="Course-wise attendance">
          <div className="list">
            {coursesFor(db, ward).map((c) => { const a = attendanceStats(db, ward.id, c.id); return (
              <div key={c.id} className="list-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
                <div className="row between"><span>{c.name}</span><strong>{a.pct}%</strong></div><Progress value={a.pct} />
              </div>
            ) })}
          </div>
        </Card>
        <div className="stack">
          <Card title="Fee payments">
            {due.length === 0 ? <div className="alert alert-success">All fees are paid.</div> : (
              <div className="list">{due.map((f) => <div key={f.id} className="list-item"><div className="grow"><strong>{f.title}</strong><div className="small muted">Due {fmtDate(f.dueAt)}</div></div><strong>{inr(feeOutstanding(f))}</strong><button className="btn btn-sm" onClick={() => confirm(`Pay ${inr(feeOutstanding(f))} by UPI? (simulated)`) && pay(f.id)}>Pay</button></div>)}</div>
            )}
            <div className="small muted" style={{ marginTop: 8 }}>{fees.filter((f) => f.paidAt).length} payments made · receipts are available in the student portal</div>
          </Card>
          <Card title="Hostel leave requests">
            {leaves.length === 0 ? <Empty text="No leave requests." /> : (
              <div className="list">{leaves.map((l) => (
                <div key={l.id} className="list-item" style={{ alignItems: 'flex-start' }}>
                  <div className="grow"><strong>{l.reason}</strong><div className="small muted">{fmtDateTime(l.from)} → {fmtDateTime(l.to)} · requested {timeAgo(l.createdAt)}</div><div className="row gap small" style={{ marginTop: 4 }}><Badge tone={l.parentStatus === 'APPROVED' ? 'success' : l.parentStatus === 'REJECTED' ? 'danger' : 'warning'}>You: {l.parentStatus}</Badge><Badge tone={l.wardenStatus === 'APPROVED' ? 'success' : l.wardenStatus === 'REJECTED' ? 'danger' : 'neutral'}>Warden: {l.wardenStatus}</Badge></div></div>
                  {l.parentStatus === 'PENDING' && <div className="row gap"><button className="btn btn-success btn-sm" onClick={() => decide(l.id, true)}>Approve</button><button className="btn btn-danger btn-sm" onClick={() => decide(l.id, false)}>Decline</button></div>}
                </div>
              ))}</div>
            )}
          </Card>
        </div>
      </div>
      <Card title="Examination results"><StudentExams studentId={ward.id} readOnly /></Card>
      <Card title="Latest notices" action={<Link to="/notices" className="small">All notices</Link>}>
        <div className="list">{notices.map((n) => <div key={n.id} className="list-item"><Megaphone size={16} className="muted" /><div className="grow"><strong>{n.title}</strong><div className="small muted">{timeAgo(n.createdAt)}</div></div></div>)}</div>
      </Card>
    </>
  )
}
