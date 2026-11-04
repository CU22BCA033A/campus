import { useState } from 'react'
import { Briefcase, Plus } from 'lucide-react'
import { audit, notify, uid, update, useCurrentUser, useDB } from '../data/store'
import { Badge, Card, Empty, Field, Modal, PageHeader, Stat } from '../components/ui'
import { fmtDate, fmtDateTime, userName } from '../lib'
import type { PlacementDrive, User } from '../data/types'

type AppStatus = PlacementDrive['applications'][number]['status']
const tone = (s: AppStatus) => (s === 'SELECTED' ? 'success' : s === 'REJECTED' ? 'danger' : s === 'INTERVIEW' ? 'accent' : s === 'SHORTLISTED' ? 'info' : 'warning')

export function driveEligibility(d: PlacementDrive, s: User) {
  const reasons: string[] = []
  if ((s.cgpa ?? 0) < d.minCgpa) reasons.push(`CGPA ${s.cgpa ?? 0} < ${d.minCgpa}`)
  if ((s.backlogs ?? 0) > d.maxBacklogs) reasons.push(`${s.backlogs} backlog(s) > ${d.maxBacklogs} allowed`)
  return { ok: reasons.length === 0, reasons }
}

export default function Placements() {
  const db = useDB()
  const user = useCurrentUser()!
  const isStudent = user.role === 'student'
  const [creating, setCreating] = useState(false)
  const [manage, setManage] = useState<string | null>(null)
  const [draft, setDraft] = useState({ company: '', role: '', kind: 'Full-time' as PlacementDrive['kind'], ctc: '', minCgpa: 6, maxBacklogs: 0, deadline: '', description: '' })
  const drives = [...db.drives].sort((a, b) => b.deadline - a.deadline)
  const placed = new Set(db.drives.flatMap((d) => d.applications.filter((a) => a.status === 'SELECTED').map((a) => a.studentId)))
  const students = db.users.filter((u) => u.role === 'student')

  const apply = (d: PlacementDrive) => {
    update((x) => { x.drives.find((y) => y.id === d.id)!.applications.push({ studentId: user.id, status: 'APPLIED' }) })
    notify(['a1'], `${user.name} applied to ${d.company}`, '/placements')
  }
  const setStatus = (d: PlacementDrive, sid: string, status: AppStatus, slot?: number) => {
    update((x) => { const a = x.drives.find((y) => y.id === d.id)!.applications.find((y) => y.studentId === sid)!; a.status = status; if (slot) a.slot = slot })
    notify([sid], `${d.company}: ${status === 'INTERVIEW' && slot ? `interview scheduled ${fmtDateTime(slot)}` : `you are ${status.toLowerCase()}`}`, '/placements')
    audit(user.id, 'PLACEMENT_STATUS', `${userName(db, sid)} @ ${d.company} → ${status}`)
  }
  const create = () => {
    if (!draft.company || !draft.deadline) return
    const d: PlacementDrive = { id: uid('dr'), ...draft, deadline: new Date(draft.deadline).getTime(), applications: [] }
    update((x) => { x.drives.push(d) })
    notify(students.filter((s) => driveEligibility(d, s).ok).map((s) => s.id), `New ${d.kind} opening: ${d.company} (${d.role})`, '/placements')
    setCreating(false)
  }
  const m = manage ? db.drives.find((x) => x.id === manage) : null

  return (
    <>
      <PageHeader title="Placements & internships" subtitle={isStudent ? 'Openings you are eligible for, and your applications' : 'Drives, eligibility, shortlists and interview scheduling'} actions={!isStudent && <button className="btn" onClick={() => setCreating(true)}><Plus size={14} /> New drive</button>} />
      <div className="grid grid-4">
        <Stat label="Active drives" value={db.drives.filter((d) => d.deadline > Date.now()).length} icon={<Briefcase size={22} />} />
        <Stat label="Students placed" value={`${placed.size}/${students.length}`} tone="success" />
        {isStudent && <Stat label="My CGPA" value={user.cgpa?.toFixed(2) ?? '—'} tone="brand" hint={`${user.backlogs ?? 0} backlogs`} />}
        {isStudent && <Stat label="My applications" value={db.drives.filter((d) => d.applications.some((a) => a.studentId === user.id)).length} tone="info" />}
      </div>
      <div className="grid grid-2">
        {drives.map((d) => {
          const el = isStudent ? driveEligibility(d, user) : null
          const mine = d.applications.find((a) => a.studentId === user.id)
          const open = d.deadline > Date.now()
          return (
            <Card key={d.id} title={<span>{d.company} · {d.role}</span>} action={<Badge tone={d.kind === 'Top-tier' ? 'accent' : d.kind === 'Internship' ? 'info' : 'brand'}>{d.kind}</Badge>}>
              <div className="stack">
                <p className="small">{d.description}</p>
                <div className="row gap wrap small"><strong>{d.ctc}</strong><span className="muted">CGPA ≥ {d.minCgpa} · backlogs ≤ {d.maxBacklogs}</span><Badge tone={open ? 'success' : 'neutral'}>{open ? `Apply by ${fmtDate(d.deadline)}` : 'Closed'}</Badge></div>
                {isStudent && (mine ? <div className="row gap"><Badge tone={tone(mine.status)}>{mine.status}</Badge>{mine.slot && <span className="small">Interview: {fmtDateTime(mine.slot)}</span>}</div>
                  : el!.ok ? <button className="btn" disabled={!open} onClick={() => apply(d)}>Apply</button>
                  : <div className="small" style={{ color: 'var(--danger)' }}>Not eligible: {el!.reasons.join(', ')}</div>)}
                {!isStudent && <div className="row between"><span className="small">{d.applications.length} applicants · {students.filter((s) => driveEligibility(d, s).ok).length} eligible</span><button className="btn btn-outline btn-sm" onClick={() => setManage(d.id)}>Manage</button></div>}
              </div>
            </Card>
          )
        })}
      </div>
      {m && (
        <Modal title={`${m.company}: applicants`} onClose={() => setManage(null)}>
          {m.applications.length === 0 ? <Empty text="No applications yet." /> : m.applications.map((a, i) => {
            const s = db.users.find((u) => u.id === a.studentId)!
            const slot = m.deadline + (i + 1) * 3_600_000 + 86_400_000
            return (
              <div key={a.studentId} className="card stack" style={{ padding: 10, gap: 6 }}>
                <div className="row between"><strong>{s.name}</strong><Badge tone={tone(a.status)}>{a.status}</Badge></div>
                <span className="small muted">{s.rollNo} · CGPA {s.cgpa} · {s.backlogs} backlogs{a.slot ? ` · interview ${fmtDateTime(a.slot)}` : ''}</span>
                <div className="row gap wrap">
                  {a.status === 'APPLIED' && <button className="btn btn-outline btn-sm" onClick={() => setStatus(m, s.id, 'SHORTLISTED')}>Shortlist</button>}
                  {a.status === 'SHORTLISTED' && <button className="btn btn-outline btn-sm" onClick={() => setStatus(m, s.id, 'INTERVIEW', slot)}>Schedule interview ({fmtDateTime(slot)})</button>}
                  {(a.status === 'INTERVIEW' || a.status === 'SHORTLISTED') && <button className="btn btn-success btn-sm" onClick={() => setStatus(m, s.id, 'SELECTED')}>Select</button>}
                  {a.status !== 'SELECTED' && a.status !== 'REJECTED' && <button className="btn btn-ghost btn-sm" onClick={() => setStatus(m, s.id, 'REJECTED')}>Reject</button>}
                </div>
              </div>
            )
          })}
        </Modal>
      )}
      {creating && (
        <Modal title="New placement drive" onClose={() => setCreating(false)} footer={<><button className="btn btn-ghost" onClick={() => setCreating(false)}>Cancel</button><button className="btn" onClick={create}>Publish to eligible students</button></>}>
          <div className="grid grid-2">
            <Field label="Company"><input className="input" value={draft.company} onChange={(e) => setDraft({ ...draft, company: e.target.value })} /></Field>
            <Field label="Role"><input className="input" value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} /></Field>
            <Field label="Type"><select className="select" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as PlacementDrive['kind'] })}>{['Full-time', 'Internship', 'Project', 'Top-tier'].map((k) => <option key={k}>{k}</option>)}</select></Field>
            <Field label="CTC / stipend"><input className="input" value={draft.ctc} onChange={(e) => setDraft({ ...draft, ctc: e.target.value })} /></Field>
            <Field label="Minimum CGPA"><input className="input" type="number" step="0.1" value={draft.minCgpa} onChange={(e) => setDraft({ ...draft, minCgpa: Number(e.target.value) })} /></Field>
            <Field label="Max backlogs"><input className="input" type="number" value={draft.maxBacklogs} onChange={(e) => setDraft({ ...draft, maxBacklogs: Number(e.target.value) })} /></Field>
          </div>
          <Field label="Apply by"><input className="input" type="date" value={draft.deadline} onChange={(e) => setDraft({ ...draft, deadline: e.target.value })} /></Field>
          <Field label="Description"><textarea className="textarea" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></Field>
        </Modal>
      )}
    </>
  )
}
