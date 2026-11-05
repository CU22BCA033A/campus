import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Bell, BookOpen, Bus, CalendarDays, CalendarCheck, ClipboardList, CreditCard, DoorOpen, FileQuestion, GraduationCap,
  Home, LogOut, Megaphone, Menu, MessageSquare, PartyPopper, Search, Star, Users, Vote, Building2, UserCog, BarChart3, RotateCcw,
  ScrollText, School, FileSpreadsheet, Library, Briefcase, HandHeart, BedDouble, LifeBuoy, BadgeIndianRupee, Package, UserPlus, History,
} from 'lucide-react'
import { logout, resetDemoData, update, useCurrentUser, useDB } from '../data/store'
import { Avatar } from './ui'
import { can, canAccess, personaLabel } from '../access'
import { classLabel } from '../classes'
import { timeAgo } from '../lib'

interface NavItem { to: string; label: string; icon: React.ElementType }
// Visibility of every item comes from ROUTE_ACCESS in access.ts (role + office).
const NAV: { section: string; items: NavItem[] }[] = [
  { section: 'Overview', items: [
    { to: '/home', label: 'Home', icon: Home },
    { to: '/timetable', label: 'Timetable', icon: CalendarDays },
    { to: '/notices', label: 'Notice Board', icon: Megaphone },
  ] },
  { section: 'Academics', items: [
    { to: '/classes', label: 'Classes & Promotion', icon: School },
    { to: '/courses', label: 'Courses', icon: BookOpen },
    { to: '/assignments', label: 'Assignments', icon: ClipboardList },
    { to: '/quizzes', label: 'Quizzes & Tests', icon: FileQuestion },
    { to: '/attendance', label: 'Attendance', icon: CalendarCheck },
    { to: '/exams', label: 'Examinations', icon: ScrollText },
    { to: '/results', label: 'Result Sheets', icon: FileSpreadsheet },
    { to: '/grades', label: 'Grades', icon: GraduationCap },
    { to: '/feedback', label: 'Faculty Feedback', icon: Star },
    { to: '/library', label: 'Library', icon: Library },
  ] },
  { section: 'Campus Life', items: [
    { to: '/feed', label: 'Discussions', icon: MessageSquare },
    { to: '/events', label: 'Events', icon: PartyPopper },
    { to: '/clubs', label: 'Clubs & Chapters', icon: Users },
    { to: '/polls', label: 'Polls & Surveys', icon: Vote },
    { to: '/placements', label: 'Placements', icon: Briefcase },
    { to: '/alumni', label: 'Alumni', icon: HandHeart },
  ] },
  { section: 'Services', items: [
    { to: '/fees', label: 'Fees & Payments', icon: CreditCard },
    { to: '/hostel', label: 'Hostel & Mess', icon: BedDouble },
    { to: '/gate-pass', label: 'Gate Pass', icon: DoorOpen },
    { to: '/transport', label: 'Transport', icon: Bus },
    { to: '/help', label: 'Help Center', icon: LifeBuoy },
    { to: '/venues', label: 'Venue Booking', icon: Building2 },
  ] },
  { section: 'Office', items: [
    { to: '/hr', label: 'HR & Payroll', icon: BadgeIndianRupee },
    { to: '/procurement', label: 'Procurement & Assets', icon: Package },
  ] },
  { section: 'Administration', items: [
    { to: '/admissions', label: 'Admissions', icon: UserPlus },
    { to: '/admin/users', label: 'User Management', icon: UserCog },
    { to: '/admin/reports', label: 'Reports', icon: BarChart3 },
    { to: '/admin/audit', label: 'Audit Log', icon: History },
  ] },
]

export default function Layout() {
  const user = useCurrentUser()!
  const db = useDB()
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [bellOpen, setBellOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [q, setQ] = useState('')
  const bellRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => setOpen(false), [location.pathname])
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false)
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const notes = db.notifications.filter((n) => n.userId === user.id).slice(0, 12)
  const unread = notes.filter((n) => !n.read).length

  const results = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (s.length < 2) return []
    const items: { label: string; sub: string; to: string }[] = []
    if (canAccess(user, '/courses')) db.courses.forEach((c) => (c.name + c.code).toLowerCase().includes(s) && items.push({ label: c.name, sub: `Course · ${c.code}`, to: `/courses/${c.id}` }))
    db.notices.forEach((n) => n.title.toLowerCase().includes(s) && items.push({ label: n.title, sub: 'Notice', to: '/notices' }))
    db.events.forEach((e) => e.title.toLowerCase().includes(s) && items.push({ label: e.title, sub: 'Event', to: '/events' }))
    if (canAccess(user, '/clubs')) db.clubs.forEach((c) => c.name.toLowerCase().includes(s) && items.push({ label: c.name, sub: 'Club', to: '/clubs' }))
    if (can(user, 'viewPeople')) db.users.forEach((u) => u.role !== 'admin' && (u.name + ' ' + (u.rollNo ?? '') + ' ' + u.email).toLowerCase().includes(s) && items.push({ label: u.name, sub: `${u.role === 'student' ? classLabel(db.classes.find((c) => c.id === u.classId)) : u.role} · ${u.rollNo ?? u.email}`, to: `/people/${u.id}` }))
    if (canAccess(user, '/classes')) db.classes.forEach((c) => classLabel(c).toLowerCase().includes(s) && items.push({ label: classLabel(c), sub: 'Class', to: '/classes' }))
    return items.slice(0, 8)
  }, [q, db, user])

  const markAllRead = () => update((d) => d.notifications.forEach((n) => n.userId === user.id && (n.read = true)))

  return (
    <div className="shell">
      <div className={`sidebar-overlay ${open ? 'open' : ''}`} onClick={() => setOpen(false)} />
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-logo">CP</div>
          <div>
            <div className="brand-name">Campus Portal</div>
            <div className="brand-sub">Learn · Manage · Engage</div>
          </div>
        </div>
        <nav className="nav">
          {NAV.map((sec) => {
            const items = sec.items.filter((i) => canAccess(user, i.to))
            if (!items.length) return null
            return (
              <div key={sec.section}>
                <div className="nav-section">{sec.section}</div>
                {items.map((i) => (
                  <NavLink key={i.to} to={i.to} className={({ isActive }) => (isActive ? 'active' : '')}>
                    <i.icon size={18} /> {i.to === '/hr' && !can(user, 'approveStaffLeave') && !can(user, 'runPayroll') ? 'My Leave & Payslips' : i.label}
                  </NavLink>
                ))}
              </div>
            )
          })}
        </nav>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={20} /></button>
          <div className="search" style={{ position: 'relative' }}>
            <Search size={16} className="muted" />
            <input placeholder={user.role === 'student' || user.role === 'parent' ? 'Search courses, notices, events…' : 'Search students, teachers, courses, notices…'} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
            {results.length > 0 && (
              <div className="dropdown" style={{ left: 0, right: 'auto', width: '100%' }}>
                {results.map((r, i) => (
                  <button key={i} className="dropdown-item" onClick={() => { navigate(r.to); setQ('') }}>
                    <div><div style={{ fontWeight: 600 }}>{r.label}</div><div className="small muted">{r.sub}</div></div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="grow" />
          <div ref={bellRef} style={{ position: 'relative' }}>
            <button className="icon-btn" onClick={() => setBellOpen((v) => !v)} aria-label="Notifications">
              <Bell size={20} />
              {unread > 0 && <span className="dot">{unread}</span>}
            </button>
            {bellOpen && (
              <div className="dropdown">
                <div className="row between" style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                  <h3>Notifications</h3>
                  <button className="btn btn-ghost btn-sm" onClick={markAllRead}>Mark all read</button>
                </div>
                {notes.length === 0 && <div className="empty"><p>You're all caught up.</p></div>}
                {notes.map((n) => (
                  <button key={n.id} className={`dropdown-item ${n.read ? '' : 'unread'}`} onClick={() => {
                    update((d) => { const x = d.notifications.find((y) => y.id === n.id); if (x) x.read = true })
                    setBellOpen(false); navigate(n.link)
                  }}>
                    <div><div>{n.text}</div><div className="small muted">{timeAgo(n.createdAt)}</div></div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div ref={menuRef} style={{ position: 'relative' }}>
            <button className="row gap" style={{ background: 'none', border: 'none', padding: 4 }} onClick={() => setMenuOpen((v) => !v)} aria-label="Account menu">
              <Avatar name={user.name} color={user.avatarColor} size={34} />
              <div className="hide-sm" style={{ textAlign: 'left', lineHeight: 1.2 }}>
                <div style={{ fontWeight: 600 }}>{user.name}</div>
                <div className="small muted">{personaLabel(user)}{user.rollNo ? ` · ${user.rollNo}` : ''}</div>
              </div>
            </button>
            {menuOpen && (
              <div className="dropdown" style={{ width: 220 }}>
                <button className="dropdown-item" onClick={() => { setMenuOpen(false); navigate('/profile') }}><UserCog size={16} /> My profile</button>
                <button className="dropdown-item" onClick={() => { if (confirm('Reset all demo data to the initial state?')) resetDemoData() }}><RotateCcw size={16} /> Reset demo data</button>
                <button className="dropdown-item" onClick={() => { logout(); navigate('/login') }}><LogOut size={16} /> Sign out</button>
              </div>
            )}
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
