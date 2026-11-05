import { useState } from 'react'
import { Download, Pencil, Plus, Search } from 'lucide-react'
import { audit, switchUser, uid, update, useCurrentUser, useDB } from '../data/store'
import { Avatar, Badge, Card, Field, Modal, PageHeader, Progress, Stat } from '../components/ui'
import { attendanceStats, feeOutstanding, inr, matches } from '../lib'
import { classLabel, resyncRosters } from '../classes'
import EditUser, { canEditProfile } from '../components/EditUser'
import type { Office, Role, User } from '../data/types'
import { can, OFFICES, persona, personaLabel } from '../access'
import { Link, useNavigate } from 'react-router-dom'

export function AdminUsers() {
  const db = useDB()
  const me = useCurrentUser()!
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [role, setRole] = useState<'all' | Role>('all')
  const [classF, setClassF] = useState('all')
  const [resF, setResF] = useState<'all' | 'HOSTEL' | 'DAY_SCHOLAR'>('all')
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<User | null>(null)
  const [draft, setDraft] = useState({ name: '', email: '', role: (can(me, 'editStudentProfiles') ? 'student' : 'faculty') as Role, office: 'registrar' as Office, department: 'Computer Applications', rollNo: '', classId: db.classes[0]?.id ?? '' })
  // Student/parent records: Registrar, Admission Department, Registrar of Evaluation. Staff: HR. Everyone: system administrator.
  const visibleRole = (r: Role) => (r === 'student' ? can(me, 'editStudentProfiles') : r === 'parent' ? can(me, 'manageStudents') : can(me, 'manageStaff'))
  const canCreate = (r: Role) => (r === 'student' || r === 'parent' ? can(me, 'manageStudents') : can(me, 'manageStaff'))
  const roles = (['student', 'parent', 'faculty', 'admin'] as Role[]).filter(visibleRole)
  const users = db.users
    .filter((u) => visibleRole(u.role) && (role === 'all' || u.role === role) && (classF === 'all' || u.classId === classF) && (resF === 'all' || u.residence === resF))
    .filter((u) => matches(q, u.name, u.email, u.rollNo, u.phone, u.department, classLabel(db.classes.find((c) => c.id === u.classId))))
  const statusAllowed = (u: User) => canCreate(u.role) && u.id !== me.id

  const setStatus = (u: User, status: User['status']) => { update((d) => { const x = d.users.find((y) => y.id === u.id)!; x.status = status; x.credentialsMismatchCount = 0; x.lockedAtTime = undefined }); audit(me.id, `USER_${status}`, `${u.name} → ${status}`) }
  const create = () => {
    if (!draft.name || !draft.email) return
    const cls = db.classes.find((c) => c.id === draft.classId)
    update((d) => {
      const id = uid('u')
      d.users.push({ id, name: draft.name, email: draft.email, password: 'welcome123', role: draft.role, office: draft.role === 'admin' ? draft.office : undefined, status: 'ACTIVE', department: draft.department, rollNo: draft.rollNo || undefined, classId: draft.role === 'student' ? cls?.id : undefined, firstLogin: true, credentialsMismatchCount: 0, avatarColor: '#2563a8', cgpa: draft.role === 'student' ? 0 : undefined, backlogs: draft.role === 'student' ? 0 : undefined })
      resyncRosters(d)
    })
    audit(me.id, 'USER_CREATE', `${draft.name} (${draft.role})`)
    setCreating(false)
  }

  return (
    <>
      <PageHeader title="User management" subtitle={persona(me) === 'super' ? 'All accounts' : persona(me) === 'hr' ? 'Staff accounts' : 'Student records'} search={{ value: q, onChange: setQ, placeholder: 'Search name, roll no., email, class…' }}
        actions={roles.some(canCreate) && <button className="btn" onClick={() => { setDraft({ ...draft, role: roles.find(canCreate)! }); setCreating(true) }}><Plus size={14} /> Add user</button>} />
      <Card>
        <div className="row gap wrap" style={{ marginBottom: 12 }}>
          {(['all', ...roles] as const).map((r) => <button key={r} className={`chip ${role === r ? 'active' : ''}`} onClick={() => setRole(r)} style={{ textTransform: 'capitalize' }}>{r === 'admin' ? 'office staff' : r}</button>)}
          {roles.includes('student') && (
            <select className="select" style={{ width: 'auto' }} value={classF} onChange={(e) => setClassF(e.target.value)} aria-label="Filter by class">
              <option value="all">All classes</option>
              {db.classes.map((c) => <option key={c.id} value={c.id}>{classLabel(c)}</option>)}
            </select>
          )}
          {roles.includes('student') && <select className="select" style={{ width: 'auto' }} value={resF} onChange={(e) => setResF(e.target.value as typeof resF)} aria-label="Accommodation"><option value="all">Hostel &amp; day scholars</option><option value="HOSTEL">Hostel</option><option value="DAY_SCHOLAR">Day scholars</option></select>}
          <span className="small muted">{users.length} result(s)</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>User</th><th>Role</th><th>ID / class</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td><div className="row gap"><Avatar name={u.name} color={u.avatarColor} size={30} /><div><Link to={`/people/${u.id}`} style={{ fontWeight: 600 }}>{u.name}</Link><div className="small muted">{u.email}</div></div></div></td>
                  <td><Badge tone={u.role === 'admin' ? 'danger' : u.role === 'faculty' ? 'brand' : u.role === 'parent' ? 'accent' : 'info'}>{personaLabel(u)}</Badge></td>
                  <td>{u.rollNo ?? '—'}<div className="small muted">{u.role === 'parent' ? `Wards: ${(u.wardIds ?? []).map((w) => db.users.find((x) => x.id === w)?.name).join(', ')}` : u.role === 'student' ? classLabel(db.classes.find((c) => c.id === u.classId)) : u.department}</div>{u.role === 'student' && <div className="row gap" style={{ marginTop: 2 }}>{u.gender && <Badge>{u.gender}</Badge>}<Badge tone={u.residence === 'HOSTEL' ? 'accent' : 'neutral'}>{u.residence === 'HOSTEL' ? 'Hostel' : u.residence === 'DAY_SCHOLAR' ? 'Day scholar' : 'Accommodation not set'}</Badge></div>}</td>
                  <td><Badge tone={u.status === 'ACTIVE' ? 'success' : u.status === 'LOCKED' ? 'warning' : 'danger'}>{u.status}</Badge>{u.firstLogin && <> <Badge tone="accent">First login</Badge></>}</td>
                  <td>
                    <div className="row gap">
                      {canEditProfile(me, u) && <button className="btn btn-outline btn-sm" onClick={() => setEditing(u)}><Pencil size={12} /> Edit</button>}
                      {statusAllowed(u) && u.status === 'ACTIVE' && <button className="btn btn-ghost btn-sm" onClick={() => setStatus(u, 'DEACTIVATED')}>Deactivate</button>}
                      {statusAllowed(u) && u.status === 'DEACTIVATED' && <button className="btn btn-success btn-sm" onClick={() => setStatus(u, 'ACTIVE')}>Activate</button>}
                      {statusAllowed(u) && u.status === 'LOCKED' && <button className="btn btn-sm" onClick={() => setStatus(u, 'ACTIVE')}>Unlock</button>}
                      {statusAllowed(u) && <button className="btn btn-ghost btn-sm" onClick={() => { update((d) => { const x = d.users.find((y) => y.id === u.id)!; x.password = 'welcome123'; x.firstLogin = true }); audit(me.id, 'PASSWORD_RESET', u.name); alert(`Password reset. ${u.name} must set a new password at next login (temporary: welcome123).`) }}>Reset password</button>}
                      {persona(me) === 'super' && u.id !== me.id && u.status === 'ACTIVE' && !u.firstLogin && <button className="btn btn-ghost btn-sm" title="View the portal as this user" onClick={() => { switchUser(u.id); navigate('/home') }}>View as</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {editing && <EditUser user={editing} onClose={() => setEditing(null)} />}
      {creating && (
        <Modal title="Add user" onClose={() => setCreating(false)} footer={<><button className="btn btn-ghost" onClick={() => setCreating(false)}>Cancel</button><button className="btn" onClick={create}>Create account</button></>}>
          <Field label="Full name"><input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
          <Field label="Email"><input className="input" type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></Field>
          <div className="grid grid-2">
            <Field label="Role"><select className="select" value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value as Role })}>{roles.filter(canCreate).map((r) => <option key={r} value={r}>{r === 'admin' ? 'Office staff' : r[0].toUpperCase() + r.slice(1)}</option>)}</select></Field>
            {draft.role === 'admin' && <Field label="Office"><select className="select" value={draft.office} onChange={(e) => setDraft({ ...draft, office: e.target.value as Office })}>{(Object.keys(OFFICES) as Office[]).filter((o) => o !== 'super' || persona(me) === 'super').map((o) => <option key={o} value={o}>{OFFICES[o].label}</option>)}</select></Field>}
            <Field label={draft.role === 'student' ? 'Roll number' : 'Employee ID'}><input className="input" value={draft.rollNo} onChange={(e) => setDraft({ ...draft, rollNo: e.target.value })} /></Field>
          </div>
          {draft.role === 'student'
            ? <Field label="Class"><select className="select" value={draft.classId} onChange={(e) => setDraft({ ...draft, classId: e.target.value })}>{db.classes.map((c) => <option key={c.id} value={c.id}>{classLabel(c)}</option>)}</select></Field>
            : <Field label="Department"><input className="input" value={draft.department} onChange={(e) => setDraft({ ...draft, department: e.target.value })} /></Field>}
          <div className="small muted">The temporary password is <code>welcome123</code>. The user must change it at first login.</div>
        </Modal>
      )}
    </>
  )
}

export function AdminReports() {
  const db = useDB()
  const students = db.users.filter((u) => u.role === 'student')
  const lowAtt = students.map((s) => ({ s, a: attendanceStats(db, s.id) })).filter((x) => x.a.pct < 75).sort((a, b) => a.a.pct - b.a.pct)
  const collected = db.fees.reduce((s, f) => s + (f.paidAmount ?? (f.paidAt ? f.amount : 0)), 0)
  const total = collected + db.fees.reduce((s, f) => s + feeOutstanding(f), 0)

  const exportCsv = () => {
    const rows = [['Roll no', 'Name', 'Attendance %', 'Fees outstanding']]
    for (const s of students) rows.push([s.rollNo ?? '', s.name, String(attendanceStats(db, s.id).pct), String(db.fees.filter((f) => f.studentId === s.id).reduce((a, f) => a + feeOutstanding(f), 0))])
    const el = document.createElement('a')
    el.href = URL.createObjectURL(new Blob([rows.map((r) => r.join(',')).join('\n')], { type: 'text/csv' }))
    el.download = 'student-report.csv'
    el.click()
  }

  return (
    <>
      <PageHeader title="Reports" subtitle="Institution-wide analytics" actions={<button className="btn btn-outline" onClick={exportCsv}><Download size={14} /> Export CSV</button>} />
      <div className="grid grid-4">
        <Stat label="Fee collection" value={`${Math.round((collected / total) * 100)}%`} hint={`${inr(collected)} of ${inr(total)}`} tone="success" />
        <Stat label="Students below 75%" value={lowAtt.length} tone="danger" />
        <Stat label="Active clubs" value={db.clubs.length} tone="accent" />
        <Stat label="Assignments submitted" value={db.submissions.length} tone="info" />
      </div>
      <div className="grid grid-2">
        <Card title="Attendance shortage">
          <div className="list">
            {lowAtt.length === 0 && <span className="muted">All students are above 75%.</span>}
            {lowAtt.map(({ s, a }) => (
              <div key={s.id} className="list-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
                <div className="row between"><span>{s.name} <span className="muted small">{s.rollNo}</span></span><strong>{a.pct}%</strong></div>
                <Progress value={a.pct} />
              </div>
            ))}
          </div>
        </Card>
        <Card title="Course-wise average attendance">
          <div className="list">
            {db.courses.map((c) => {
              const avg = Math.round(c.studentIds.reduce((s, id) => s + attendanceStats(db, id, c.id).pct, 0) / c.studentIds.length)
              return (
                <div key={c.id} className="list-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
                  <div className="row between"><span>{c.code} · {c.name}</span><strong>{avg}%</strong></div>
                  <Progress value={avg} />
                </div>
              )
            })}
          </div>
        </Card>
      </div>
    </>
  )
}

export function AuditLog() {
  const db = useDB()
  const [q, setQ] = useState('')
  const rows = db.audit.filter((a) => (a.action + a.detail + (db.users.find((u) => u.id === a.actorId)?.name ?? '')).toLowerCase().includes(q.toLowerCase()))
  const exportCsv = () => {
    const lines = [['Time', 'User', 'Action', 'Detail'], ...rows.map((a) => [new Date(a.at).toISOString(), db.users.find((u) => u.id === a.actorId)?.name ?? a.actorId, a.action, `"${a.detail.replace(/"/g, '""')}"`])]
    const el = document.createElement('a'); el.href = URL.createObjectURL(new Blob([lines.map((r) => r.join(',')).join('\n')], { type: 'text/csv' })); el.download = 'audit-log.csv'; el.click()
  }
  return (
    <>
      <PageHeader title="Audit log" subtitle="Who did what, and when, across every module" actions={<button className="btn btn-outline" onClick={exportCsv}><Download size={14} /> Export CSV</button>} />
      <Card>
        <div className="search" style={{ maxWidth: 360, marginBottom: 12 }}><Search size={16} className="muted" /><input placeholder="Filter by user, action or detail" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="table-wrap"><table>
          <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Detail</th></tr></thead>
          <tbody>{rows.slice(0, 300).map((a) => <tr key={a.id}><td className="small">{new Date(a.at).toLocaleString('en-IN')}</td><td>{db.users.find((u) => u.id === a.actorId)?.name ?? a.actorId}</td><td><Badge tone="info">{a.action}</Badge></td><td style={{ whiteSpace: 'normal' }}>{a.detail}</td></tr>)}</tbody>
        </table></div>
      </Card>
    </>
  )
}
