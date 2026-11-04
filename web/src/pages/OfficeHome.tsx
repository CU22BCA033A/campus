import { Link } from 'react-router-dom'
import { ArrowRight, Megaphone } from 'lucide-react'
import { useCurrentUser, useDB } from '../data/store'
import { Badge, Card, Empty, Stat } from '../components/ui'
import { OFFICES, persona, TICKET_OFFICE } from '../access'
import { attendanceStats, feeOutstanding, fmtDate, inr, timeAgo, userName } from '../lib'
import type { DB, Office } from '../data/types'

interface Task { text: string; sub?: string; to: string; tone?: 'warning' | 'danger' | 'info' }
interface OfficeView {
  stats: { label: string; value: string | number; tone?: 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'accent'; hint?: string; to: string }[]
  tasks: Task[]
  shortcuts: { to: string; label: string }[]
}

const now = () => Date.now()

function view(db: DB, office: Office): OfficeView {
  const tickets = db.tickets.filter((t) => !['RESOLVED', 'CLOSED'].includes(t.status) && (office === 'super' || TICKET_OFFICE[t.category] === office))
  const ticketTasks: Task[] = tickets.map((t) => ({ text: `${t.number}: ${t.subject}`, sub: `${t.category} · ${timeAgo(t.createdAt)}`, to: '/help', tone: t.priority === 'High' ? 'danger' : 'info' }))
  const students = db.users.filter((u) => u.role === 'student')

  switch (office) {
    case 'registrar': {
      const pendingDocs = db.applications.filter((a) => a.stage === 'APPLIED')
      const toShortlist = db.applications.filter((a) => a.stage === 'VERIFIED')
      const toAdmit = db.applications.filter((a) => a.stage === 'FEE_PAID')
      const prs = db.purchaseRequests.filter((p) => p.status === 'PENDING_REGISTRAR')
      return {
        stats: [
          { label: 'Applications to verify', value: pendingDocs.length, tone: 'warning', to: '/admissions' },
          { label: 'Offers out', value: db.applications.filter((a) => a.stage === 'OFFERED').length, tone: 'info', to: '/admissions' },
          { label: 'Active students', value: students.filter((s) => s.status === 'ACTIVE').length, to: '/admin/users' },
          { label: 'Open grievances & certificates', value: tickets.length, tone: 'danger', to: '/help' },
        ],
        tasks: [
          ...pendingDocs.map((a) => ({ text: `Verify documents: ${a.name}`, sub: `${a.program} · applied ${timeAgo(a.createdAt)}`, to: '/admissions', tone: 'warning' as const })),
          ...(toShortlist.length ? [{ text: `Generate merit list for ${toShortlist.length} verified applicant(s)`, to: '/admissions' }] : []),
          ...toAdmit.map((a) => ({ text: `Admit & issue student ID: ${a.name}`, to: '/admissions', tone: 'info' as const })),
          ...prs.map((p) => ({ text: `Registrar approval: ${p.title}`, sub: inr(p.quantity * p.unitCost), to: '/procurement', tone: 'warning' as const })),
          ...ticketTasks,
        ],
        shortcuts: [{ to: '/admissions', label: 'Admissions' }, { to: '/admin/users', label: 'Student records' }, { to: '/courses', label: 'Courses' }, { to: '/timetable', label: 'Timetable' }, { to: '/venues', label: 'Venue booking' }, { to: '/admin/reports', label: 'Reports' }],
      }
    }
    case 'finance': {
      const collected = db.fees.reduce((s, f) => s + (f.paidAmount ?? (f.paidAt ? f.amount : 0)), 0)
      const outstanding = db.fees.reduce((s, f) => s + feeOutstanding(f), 0)
      const overdue = db.fees.filter((f) => feeOutstanding(f) > 0 && f.dueAt < now())
      const refunds = db.refunds.filter((r) => r.status === 'REQUESTED' || r.status === 'APPROVED')
      const prs = db.purchaseRequests.filter((p) => p.status === 'PENDING_FINANCE' || p.status === 'APPROVED' || p.status === 'PO_ISSUED')
      return {
        stats: [
          { label: 'Collected', value: inr(collected), tone: 'success', to: '/fees' },
          { label: 'Outstanding', value: inr(outstanding), tone: 'danger', hint: `${overdue.length} overdue`, to: '/fees' },
          { label: 'Refunds pending', value: refunds.length, tone: 'warning', to: '/fees' },
          { label: 'Purchase actions', value: prs.length, tone: 'info', to: '/procurement' },
        ],
        tasks: [
          ...refunds.map((r) => ({ text: `Refund ${r.status === 'REQUESTED' ? 'request' : 'to process'}: ${userName(db, r.studentId)}`, sub: inr(r.amount), to: '/fees', tone: 'warning' as const })),
          ...prs.map((p) => ({ text: `${p.status === 'PENDING_FINANCE' ? 'Finance approval' : p.status === 'APPROVED' ? 'Issue PO' : 'Receive consignment'}: ${p.title}`, sub: inr(p.quantity * p.unitCost), to: '/procurement', tone: 'info' as const })),
          ...(overdue.length ? [{ text: `${overdue.length} overdue fee item(s): send reminders`, to: '/fees', tone: 'danger' as const }] : []),
          ...ticketTasks,
        ],
        shortcuts: [{ to: '/fees', label: 'Fee collection' }, { to: '/procurement', label: 'Procurement & assets' }, { to: '/hr', label: 'Payroll' }, { to: '/admin/reports', label: 'Reports' }],
      }
    }
    case 'hostel': {
      const beds = db.rooms.reduce((s, r) => s + r.capacity, 0)
      const occupied = db.rooms.reduce((s, r) => s + r.occupants.length, 0)
      const leaves = db.hostelLeaves.filter((l) => l.parentStatus === 'APPROVED' && l.wardenStatus === 'PENDING')
      const passes = db.gatePasses.filter((g) => g.status === 'PENDING')
      const today = new Date().toISOString().slice(0, 10)
      return {
        stats: [
          { label: 'Occupancy', value: `${occupied}/${beds}`, hint: `${beds - occupied} beds free`, to: '/hostel' },
          { label: 'Leave awaiting warden', value: leaves.length, tone: 'warning', to: '/hostel' },
          { label: 'Gate passes pending', value: passes.length, tone: 'accent', to: '/gate-pass' },
          { label: 'Meals served today', value: db.mealCoupons.filter((c) => c.date === today && c.redeemedAt).length, tone: 'success', to: '/hostel' },
        ],
        tasks: [
          ...leaves.map((l) => ({ text: `Hostel leave: ${userName(db, l.studentId)}`, sub: `${l.reason} · parent approved`, to: '/hostel', tone: 'warning' as const })),
          ...passes.map((g) => ({ text: `Gate pass: ${userName(db, g.studentId)}`, sub: g.reason, to: '/gate-pass', tone: 'info' as const })),
          ...ticketTasks,
        ],
        shortcuts: [{ to: '/hostel', label: 'Rooms & allocation' }, { to: '/gate-pass', label: 'Gate passes' }, { to: '/help', label: 'Maintenance requests' }],
      }
    }
    case 'hr': {
      const staff = db.users.filter((u) => u.basicSalary)
      const pending = db.leaves.filter((l) => l.status === 'PENDING')
      const month = new Date().toISOString().slice(0, 7)
      const ran = db.payrollRuns.some((r) => r.month === month)
      return {
        stats: [
          { label: 'Employees', value: staff.length, to: '/admin/users' },
          { label: 'Leave requests', value: pending.length, tone: 'warning', to: '/hr' },
          { label: `Payroll ${month}`, value: ran ? 'Done' : 'Pending', tone: ran ? 'success' : 'danger', to: '/hr' },
          { label: 'On leave today', value: db.leaves.filter((l) => l.status === 'APPROVED' && l.from <= new Date().toISOString().slice(0, 10) && l.to >= new Date().toISOString().slice(0, 10)).length, tone: 'info', to: '/hr' },
        ],
        tasks: [
          ...pending.map((l) => ({ text: `${l.type} leave: ${userName(db, l.staffId)}`, sub: `${fmtDate(l.from)} – ${fmtDate(l.to)} · ${l.days} day(s)`, to: '/hr', tone: 'warning' as const })),
          ...(!ran ? [{ text: `Run payroll for ${month}`, to: '/hr', tone: 'danger' as const }] : []),
          ...ticketTasks,
        ],
        shortcuts: [{ to: '/hr', label: 'Leave & payroll' }, { to: '/admin/users', label: 'Staff records' }],
      }
    }
    case 'exam': {
      const upcoming = db.exams.filter((e) => !e.resultsPublished)
      const noSeating = upcoming.filter((e) => !e.seating)
      const toPublish = upcoming.filter((e) => db.results.some((r) => r.examId === e.id))
      const reval = db.revaluations.filter((r) => r.status === 'REQUESTED')
      const short = students.filter((s) => attendanceStats(db, s.id).pct < 75)
      return {
        stats: [
          { label: 'Upcoming exams', value: upcoming.length, to: '/exams' },
          { label: 'Seating not generated', value: noSeating.length, tone: 'warning', to: '/exams' },
          { label: 'Re-evaluation requests', value: reval.length, tone: 'accent', to: '/exams' },
          { label: 'Attendance shortage', value: short.length, tone: 'danger', hint: 'students below 75%', to: '/attendance' },
        ],
        tasks: [
          ...noSeating.map((e) => ({ text: `Generate seating: ${db.courses.find((c) => c.id === e.courseId)?.code} ${e.title}`, sub: fmtDate(e.date), to: '/exams', tone: 'warning' as const })),
          ...toPublish.map((e) => ({ text: `Publish results: ${db.courses.find((c) => c.id === e.courseId)?.code} ${e.title}`, to: '/exams', tone: 'info' as const })),
          ...reval.map((r) => ({ text: `Re-evaluation: ${userName(db, r.studentId)}`, sub: r.reason, to: '/exams' })),
        ],
        shortcuts: [{ to: '/exams', label: 'Examinations' }, { to: '/attendance', label: 'Attendance' }, { to: '/grades', label: 'Gradebook' }, { to: '/timetable', label: 'Timetable' }],
      }
    }
    case 'library': {
      const active = db.loans.filter((l) => !l.returnedAt)
      const overdue = active.filter((l) => l.dueAt < now())
      return {
        stats: [
          { label: 'Titles', value: db.books.length, hint: `${db.books.reduce((s, b) => s + b.copies, 0)} copies`, to: '/library' },
          { label: 'On loan', value: active.length, tone: 'info', to: '/library' },
          { label: 'Overdue', value: overdue.length, tone: 'danger', to: '/library' },
          { label: 'Reservations', value: db.books.reduce((s, b) => s + b.reservations.length, 0), tone: 'accent', to: '/library' },
        ],
        tasks: overdue.map((l) => ({ text: `Overdue: ${db.books.find((b) => b.id === l.bookId)?.title}`, sub: `${userName(db, l.userId)} · due ${fmtDate(l.dueAt)}`, to: '/library', tone: 'danger' as const })),
        shortcuts: [{ to: '/library', label: 'Catalogue & issue desk' }],
      }
    }
    case 'placement': {
      const open = db.drives.filter((d) => d.deadline > now())
      const applied = db.drives.flatMap((d) => d.applications.filter((a) => a.status === 'APPLIED').map((a) => ({ d, a })))
      const placed = new Set(db.drives.flatMap((d) => d.applications.filter((a) => a.status === 'SELECTED').map((a) => a.studentId)))
      return {
        stats: [
          { label: 'Active drives', value: open.length, to: '/placements' },
          { label: 'Applications to screen', value: applied.length, tone: 'warning', to: '/placements' },
          { label: 'Students placed', value: `${placed.size}/${students.length}`, tone: 'success', to: '/placements' },
          { label: 'Alumni mentors', value: db.alumni.filter((a) => a.mentor).length, tone: 'info', to: '/alumni' },
        ],
        tasks: applied.map(({ d, a }) => ({ text: `Screen ${userName(db, a.studentId)} for ${d.company}`, sub: d.role, to: '/placements', tone: 'warning' as const })),
        shortcuts: [{ to: '/placements', label: 'Drives' }, { to: '/alumni', label: 'Alumni network' }],
      }
    }
    default: {
      return {
        stats: [
          { label: 'Users', value: db.users.length, hint: `${db.users.filter((u) => u.status !== 'ACTIVE').length} inactive or locked`, to: '/admin/users' },
          { label: 'Open tickets', value: tickets.length, tone: 'warning', to: '/help' },
          { label: 'Audit events (24 h)', value: db.audit.filter((a) => a.at > now() - 86_400_000).length, tone: 'info', to: '/admin/audit' },
          { label: 'Fees outstanding', value: inr(db.fees.reduce((s, f) => s + feeOutstanding(f), 0)), tone: 'danger', to: '/fees' },
        ],
        tasks: [
          ...db.users.filter((u) => u.status === 'LOCKED').map((u) => ({ text: `Locked account: ${u.name}`, to: '/admin/users', tone: 'danger' as const })),
          ...ticketTasks,
        ],
        shortcuts: [{ to: '/admin/users', label: 'User management' }, { to: '/admin/audit', label: 'Audit log' }, { to: '/admin/reports', label: 'Reports' }, { to: '/help', label: 'IT support tickets' }],
      }
    }
  }
}

export default function OfficeHome() {
  const db = useDB()
  const user = useCurrentUser()!
  const office = persona(user) as Office
  const v = view(db, office)
  const notices = db.notices.filter((n) => n.audience === 'all' || n.audience === 'faculty').sort((a, b) => b.createdAt - a.createdAt).slice(0, 3)
  return (
    <>
      <div className="hero">
        <div>
          <p className="small">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
          <h1>{OFFICES[office].label}</h1>
          <p>{user.name} · {OFFICES[office].description}</p>
        </div>
      </div>
      <div className="grid grid-4">
        {v.stats.map((s) => <Link key={s.label} to={s.to} style={{ textDecoration: 'none', color: 'inherit' }}><Stat label={s.label} value={s.value} tone={s.tone ?? 'brand'} hint={s.hint} /></Link>)}
      </div>
      <div className="grid grid-2">
        <Card title={<span>Needs your action <Badge tone={v.tasks.length ? 'warning' : 'success'}>{v.tasks.length}</Badge></span>}>
          {v.tasks.length === 0 ? <Empty text="All caught up. Nothing is waiting on your office." /> : (
            <div className="list">{v.tasks.slice(0, 10).map((t, i) => (
              <Link key={i} to={t.to} className="list-item" style={{ color: 'inherit', textDecoration: 'none' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: `var(--${t.tone ?? 'info'})`, flexShrink: 0 }} />
                <div className="grow"><div style={{ fontWeight: 600 }}>{t.text}</div>{t.sub && <div className="small muted">{t.sub}</div>}</div>
                <ArrowRight size={16} className="muted" />
              </Link>
            ))}</div>
          )}
        </Card>
        <div className="stack">
          <Card title="Your modules">
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 8 }}>
              {v.shortcuts.map((s) => <Link key={s.to} to={s.to} className="btn btn-outline" style={{ justifyContent: 'space-between', whiteSpace: 'normal', textAlign: 'left' }}>{s.label} <ArrowRight size={14} /></Link>)}
            </div>
          </Card>
          <Card title="Latest notices" action={<Link to="/notices" className="small">Notice board</Link>}>
            <div className="list">{notices.map((n) => <div key={n.id} className="list-item"><Megaphone size={16} className="muted" /><div className="grow"><strong className="ellipsis">{n.title}</strong><div className="small muted">{timeAgo(n.createdAt)}</div></div></div>)}</div>
          </Card>
        </div>
      </div>
    </>
  )
}
