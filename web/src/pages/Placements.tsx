import { useState } from 'react'
import { Award, Briefcase, Building, Download, Pencil, Plus, Trash2, TrendingUp, Users } from 'lucide-react'
import { audit, notify, uid, update, useCurrentUser, useDB } from '../data/store'
import { Badge, Card, Empty, Field, Modal, PageHeader, Stat, Tabs } from '../components/ui'
import { FilterBar, opts, useFilters } from '../components/Filters'
import { fmtDate, fmtDateTime, matches, userName } from '../lib'
import { can, officeUsers } from '../access'
import { backlogCountOf, cgpaOf, fmtCgpa } from '../academics'
import { classLabel } from '../classes'
import type { AppStatus, Company, DB, DriveApplication, PlacementDrive, User } from '../data/types'

const tone = (s: AppStatus) => (s === 'SELECTED' ? 'success' : s === 'REJECTED' || s === 'WITHDRAWN' ? 'danger' : s === 'INTERVIEW' ? 'accent' : s === 'SHORTLISTED' ? 'info' : 'warning')
const KINDS: PlacementDrive['kind'][] = ['Full-time', 'Internship', 'Project', 'Top-tier']
const roundsOf = (d: PlacementDrive) => (d.rounds?.length ? d.rounds : ['Interview'])
const lpa = (n?: number) => (n === undefined ? '—' : `₹ ${n % 1 ? n.toFixed(1) : n} LPA`)

/** A student's accepted full-time offer, if any. */
export const acceptedOffer = (db: DB, sid: string) => db.drives.flatMap((d) => d.applications.filter((a) => a.studentId === sid && a.offer === 'ACCEPTED' && d.kind !== 'Internship').map((a) => ({ d, a })))[0]
export const isPlaced = (db: DB, sid: string) => !!acceptedOffer(db, sid)

/** Eligibility: CGPA, backlogs, programme, batch and the one-offer policy (placed students may only try dream offers). */
export function driveEligibility(db: DB, d: PlacementDrive, s: User) {
  const reasons: string[] = []
  const cgpa = cgpaOf(db, s) ?? 0, bl = backlogCountOf(s)
  if (cgpa < d.minCgpa) reasons.push(`CGPA ${fmtCgpa(cgpa)} < ${d.minCgpa}`)
  if (bl > d.maxBacklogs) reasons.push(`${bl} backlog(s) > ${d.maxBacklogs} allowed`)
  if (d.programs?.length && !d.programs.includes(s.program ?? '')) reasons.push(`open to ${d.programs.join(', ')} only`)
  if (d.batches?.length && !d.batches.includes(s.batch ?? 0)) reasons.push(`open to batch ${d.batches.join(', ')}`)
  const offer = acceptedOffer(db, s.id)
  if (db.placementPolicy?.oneOffer && offer && d.kind !== 'Internship' && (d.ctcLpa ?? 0) < db.placementPolicy.dreamLpa) reasons.push(`already placed at ${offer.d.company}; only offers ≥ ${db.placementPolicy.dreamLpa} LPA`)
  return { ok: reasons.length === 0, reasons }
}

export default function Placements() {
  const me = useCurrentUser()!
  return can(me, 'managePlacements') ? <PlacementOffice /> : me.role === 'student' ? <StudentPlacements /> : <PlacementOverview />
}

/** Final-year (and internship-eligible) students the cell works with. */
const studentsOf = (db: DB) => db.users.filter((u) => u.role === 'student' && u.status === 'ACTIVE')

function stats(db: DB) {
  const finalYear = studentsOf(db).filter((s) => (s.semester ?? 0) >= 5)
  const offers = db.drives.flatMap((d) => d.applications.filter((a) => a.status === 'SELECTED' && d.kind !== 'Internship').map((a) => ({ d, a })))
  const accepted = offers.filter((x) => x.a.offer === 'ACCEPTED')
  const ctcs = accepted.map((x) => x.a.offerCtc ?? x.d.ctcLpa ?? 0).sort((a, b) => a - b)
  const placed = new Set(accepted.map((x) => x.a.studentId))
  return {
    finalYear, offers, accepted, placed,
    highest: ctcs.length ? ctcs[ctcs.length - 1] : undefined,
    average: ctcs.length ? ctcs.reduce((t, v) => t + v, 0) / ctcs.length : undefined,
    median: ctcs.length ? ctcs[Math.floor(ctcs.length / 2)] : undefined,
    byProgram: [...new Set(finalYear.map((s) => s.program ?? ''))].map((p) => { const ss = finalYear.filter((s) => s.program === p); const pl = ss.filter((s) => placed.has(s.id)).length; return { program: p, total: ss.length, placed: pl } }),
  }
}

/* ============================ Placement Cell ============================ */

function PlacementOffice() {
  const db = useDB()
  const me = useCurrentUser()!
  const [tab, setTab] = useState<'dashboard' | 'drives' | 'students' | 'companies' | 'policy'>('dashboard')
  const [q, setQ] = useState('')
  const [driveDraft, setDriveDraft] = useState<Partial<PlacementDrive> | null>(null)
  const [pipeline, setPipeline] = useState<string | null>(null)
  const [coDraft, setCoDraft] = useState<Partial<Company> | null>(null)
  const st = stats(db)
  const df = useFilters(['kind', 'state', 'company'] as const)
  const stateOf = (d: PlacementDrive) => (d.deadline > Date.now() ? 'open' : d.applications.some((a) => ['APPLIED', 'SHORTLISTED', 'INTERVIEW'].includes(a.status)) ? 'progress' : 'done')
  const drives = db.drives.filter((d) => df.ok('kind', d.kind) && df.ok('state', stateOf(d)) && df.ok('company', d.company) && matches(q, d.company, d.role, d.kind)).sort((a, b) => b.deadline - a.deadline)
  const sf = useFilters(['program', 'batch', 'status'] as const)
  const statusOf = (s: User) => (isPlaced(db, s.id) ? 'placed' : db.drives.some((d) => d.applications.some((a) => a.studentId === s.id && a.status === 'SELECTED' && a.offer === 'OFFERED')) ? 'offer' : db.drives.some((d) => d.applications.some((a) => a.studentId === s.id && ['APPLIED', 'SHORTLISTED', 'INTERVIEW'].includes(a.status))) ? 'process' : 'none')
  const STATUS = { placed: 'Placed', offer: 'Offer pending', process: 'In process', none: 'Not applied' }
  const students = studentsOf(db).filter((s) => sf.ok('program', s.program) && sf.ok('batch', s.batch) && sf.ok('status', statusOf(s)) && matches(q, s.name, s.rollNo, s.skills))

  const deleteDrive = (d: PlacementDrive) => {
    if (!confirm(`Delete the ${d.company} drive? ${d.applications.length} application(s) are removed.`)) return
    update((x) => { x.drives = x.drives.filter((y) => y.id !== d.id) })
    notify(d.applications.map((a) => a.studentId), `${d.company} (${d.role}) drive was cancelled by the Placement Cell`, '/placements')
    audit(me.id, 'DRIVE_DELETE', `${d.company} ${d.role}`)
  }
  const exportStudents = () => {
    const lines = [['Roll no', 'Name', 'Programme', 'Batch', 'CGPA', 'Backlogs', 'Status', 'Company', 'CTC (LPA)'], ...students.map((s) => { const o = acceptedOffer(db, s.id); return [s.rollNo ?? '', s.name, s.program ?? '', String(s.batch ?? ''), fmtCgpa(cgpaOf(db, s)), String(backlogCountOf(s)), STATUS[statusOf(s)], o?.d.company ?? '', String(o?.a.offerCtc ?? '')] })]
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([lines.map((l) => l.map((v) => `"${v}"`).join(',')).join('\n')], { type: 'text/csv' })); a.download = 'placement-status.csv'; a.click()
  }

  return (
    <>
      <PageHeader title="Placement Cell" subtitle="Companies, drives, eligibility, round-by-round selection, offers and placement statistics" search={{ value: q, onChange: setQ, placeholder: 'Search company, role, student…' }}
        actions={<button className="btn" onClick={() => setDriveDraft({ kind: 'Full-time', minCgpa: 6, maxBacklogs: 0, rounds: ['Aptitude test', 'Technical interview', 'HR interview'], programs: [], batches: [] })}><Plus size={14} /> New drive</button>} />
      <div className="grid grid-4">
        <Stat label="Placed (final year)" value={`${st.placed.size}/${st.finalYear.length}`} tone="success" hint={st.finalYear.length ? `${Math.round((st.placed.size / st.finalYear.length) * 100)}% placed` : undefined} icon={<Award size={22} />} />
        <Stat label="Highest / average CTC" value={lpa(st.highest)} tone="brand" hint={st.average ? `average ${lpa(st.average)} · median ${lpa(st.median)}` : undefined} icon={<TrendingUp size={22} />} />
        <Stat label="Open drives" value={db.drives.filter((d) => d.deadline > Date.now()).length} tone="info" icon={<Briefcase size={22} />} />
        <Stat label="Offers made" value={st.offers.length} tone="accent" hint={`${st.accepted.length} accepted`} />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'dashboard', label: 'Dashboard' }, { id: 'drives', label: 'Drives', count: db.drives.length }, { id: 'students', label: 'Students', count: studentsOf(db).length }, { id: 'companies', label: 'Companies', count: db.companies.length }, { id: 'policy', label: 'Policy' }]} />

      {tab === 'dashboard' && (
        <div className="grid grid-2">
          <Card title="Placement by programme (final year)">
            <div className="stack" style={{ gap: 8 }}>{st.byProgram.map((p) => (
              <div key={p.program} className="grade-bar" style={{ gridTemplateColumns: '60px 1fr 70px' }}><span className="grade-bar-label">{p.program}</span><span className="grade-bar-track"><span className="grade-bar-fill" style={{ width: `${p.total ? (p.placed / p.total) * 100 : 0}%` }} /></span><span className="small">{p.placed}/{p.total}</span></div>
            ))}</div>
          </Card>
          <Card title="Offers by company">
            <div className="list">{[...new Set(st.offers.map((x) => x.d.company))].map((c) => { const o = st.offers.filter((x) => x.d.company === c); return (
              <div key={c} className="list-item"><strong className="grow">{c}</strong><Badge tone="success">{o.filter((x) => x.a.offer === 'ACCEPTED').length} accepted</Badge><Badge>{o.length} offers</Badge><span className="small">{lpa(o[0].a.offerCtc ?? o[0].d.ctcLpa)}</span></div>
            ) })}{st.offers.length === 0 && <Empty text="No offers yet." />}</div>
          </Card>
          <Card title="Upcoming">
            <div className="list">{db.drives.filter((d) => (d.driveDate ?? d.deadline) > Date.now()).sort((a, b) => (a.driveDate ?? a.deadline) - (b.driveDate ?? b.deadline)).map((d) => (
              <div key={d.id} className="list-item"><div className="grow"><strong>{d.company}</strong> · {d.role}<div className="small muted">Apply by {fmtDate(d.deadline)}{d.driveDate ? ` · drive ${fmtDate(d.driveDate)}` : ''}{d.venue ? ` · ${d.venue}` : ''}</div></div><Badge>{d.applications.length} applied</Badge><button className="btn btn-outline btn-sm" onClick={() => setPipeline(d.id)}>Manage</button></div>
            ))}</div>
          </Card>
          <Card title="Interviews scheduled">
            <div className="list">{db.drives.flatMap((d) => d.applications.filter((a) => a.status === 'INTERVIEW' && a.slot && a.slot > Date.now()).map((a) => ({ d, a }))).sort((x, y) => x.a.slot! - y.a.slot!).map(({ d, a }) => (
              <div key={d.id + a.studentId} className="list-item"><div className="grow"><strong>{userName(db, a.studentId)}</strong> · {d.company}<div className="small muted">{roundsOf(d)[a.round ?? 0]} · {fmtDateTime(a.slot!)}</div></div></div>
            ))}{!db.drives.some((d) => d.applications.some((a) => a.status === 'INTERVIEW' && a.slot && a.slot > Date.now())) && <Empty text="None scheduled." />}</div>
          </Card>
        </div>
      )}

      {tab === 'drives' && (
        <>
          <FilterBar defs={[{ key: 'kind' as const, label: 'Types', options: KINDS.map((k) => ({ value: k, label: k })) }, { key: 'state' as const, label: 'Stages', options: [{ value: 'open', label: 'Accepting applications' }, { value: 'progress', label: 'Selection in progress' }, { value: 'done', label: 'Completed' }] }, { key: 'company' as const, label: 'Companies', options: opts(db.drives.map((d) => d.company)) }]} f={df} count={drives.length} noun="drive" />
          <Card>
            <div className="table-wrap"><table>
              <thead><tr><th>Company · role</th><th>Type</th><th>CTC</th><th>Eligibility</th><th>Dates</th><th>Pipeline</th><th /></tr></thead>
              <tbody>{drives.map((d) => { const count = (s: AppStatus) => d.applications.filter((a) => a.status === s).length; const eligible = studentsOf(db).filter((s) => driveEligibility(db, d, s).ok).length; return (
                <tr key={d.id}>
                  <td><strong>{d.company}</strong> · {d.role}<div className="small muted">{roundsOf(d).join(' → ')}</div></td>
                  <td><Badge tone={d.kind === 'Top-tier' ? 'accent' : d.kind === 'Internship' ? 'info' : 'brand'}>{d.kind}</Badge></td>
                  <td className="small">{d.ctc}</td>
                  <td className="small">CGPA ≥ {d.minCgpa} · ≤ {d.maxBacklogs} backlog{d.programs?.length ? ` · ${d.programs.join('/')}` : ''}{d.batches?.length ? ` · ${d.batches.join('/')}` : ''}<div className="muted">{eligible} eligible</div></td>
                  <td className="small">Apply by {fmtDate(d.deadline)}{d.driveDate ? <div className="muted">Drive {fmtDate(d.driveDate)}</div> : null}</td>
                  <td className="small">{d.applications.length} applied · {count('SHORTLISTED') + count('INTERVIEW')} in rounds · <strong>{count('SELECTED')} selected</strong></td>
                  <td className="row gap"><button className="btn btn-outline btn-sm" onClick={() => setPipeline(d.id)}>Manage</button><button className="icon-btn" aria-label={`Edit ${d.company}`} onClick={() => setDriveDraft(d)}><Pencil size={14} /></button><button className="icon-btn" aria-label={`Delete ${d.company}`} onClick={() => deleteDrive(d)}><Trash2 size={14} /></button></td>
                </tr>
              ) })}</tbody>
            </table></div>
          </Card>
        </>
      )}

      {tab === 'students' && (
        <>
          <div className="row between wrap gap"><FilterBar defs={[{ key: 'program' as const, label: 'Programmes', options: opts(studentsOf(db).map((s) => s.program)) }, { key: 'batch' as const, label: 'Batches', options: opts(studentsOf(db).map((s) => s.batch)) }, { key: 'status' as const, label: 'Statuses', options: (Object.keys(STATUS) as (keyof typeof STATUS)[]).map((k) => ({ value: k, label: STATUS[k] })) }]} f={sf} count={students.length} noun="student" /><button className="btn btn-ghost btn-sm" onClick={exportStudents}><Download size={12} /> CSV</button></div>
          <Card>
            <div className="table-wrap"><table>
              <thead><tr><th>Student</th><th>Class</th><th>CGPA</th><th>Backlogs</th><th>Applications</th><th>Status</th><th>Resume / skills</th></tr></thead>
              <tbody>{students.map((s) => { const o = acceptedOffer(db, s.id); const apps = db.drives.filter((d) => d.applications.some((a) => a.studentId === s.id)); return (
                <tr key={s.id}>
                  <td>{s.name}<div className="small muted">{s.rollNo}</div></td>
                  <td className="small">{classLabel(db.classes.find((c) => c.id === s.classId))}</td>
                  <td>{fmtCgpa(cgpaOf(db, s))}</td><td>{backlogCountOf(s)}</td>
                  <td className="small">{apps.map((d) => d.company).join(', ') || '—'}</td>
                  <td><Badge tone={statusOf(s) === 'placed' ? 'success' : statusOf(s) === 'offer' ? 'accent' : statusOf(s) === 'process' ? 'info' : 'neutral'}>{STATUS[statusOf(s)]}</Badge>{o && <div className="small muted">{o.d.company} · {lpa(o.a.offerCtc)}</div>}</td>
                  <td className="small">{s.resumeUrl ? <a href={s.resumeUrl} target="_blank" rel="noreferrer">Resume</a> : <span className="muted">No resume</span>}{s.skills ? <div className="muted">{s.skills}</div> : null}</td>
                </tr>
              ) })}</tbody>
            </table></div>
          </Card>
        </>
      )}

      {tab === 'companies' && (
        <Card title="Recruiters" action={<button className="btn btn-sm" onClick={() => setCoDraft({ industry: '' })}><Plus size={14} /> Add company</button>}>
          <div className="table-wrap"><table>
            <thead><tr><th>Company</th><th>Industry</th><th>Contact</th><th>Drives</th><th>Hired</th><th /></tr></thead>
            <tbody>{db.companies.filter((c) => matches(q, c.name, c.industry, c.contactName)).map((c) => { const ds = db.drives.filter((d) => d.companyId === c.id || d.company === c.name); return (
              <tr key={c.id}>
                <td><strong>{c.name}</strong><div className="small muted">{c.location}{c.website ? <> · <a href={c.website} target="_blank" rel="noreferrer">website</a></> : null}</div></td>
                <td>{c.industry}</td>
                <td className="small">{c.contactName}<div className="muted">{c.contactEmail}{c.contactPhone ? ` · ${c.contactPhone}` : ''}</div></td>
                <td>{ds.length}</td>
                <td>{ds.reduce((t, d) => t + d.applications.filter((a) => a.offer === 'ACCEPTED').length, 0)}</td>
                <td className="row gap"><button className="icon-btn" aria-label={`Edit ${c.name}`} onClick={() => setCoDraft(c)}><Pencil size={14} /></button><button className="icon-btn" aria-label={`Delete ${c.name}`} onClick={() => { if (confirm(`Delete ${c.name}? Its drives stay.`)) { update((d) => { d.companies = d.companies.filter((x) => x.id !== c.id) }); audit(me.id, 'COMPANY_DELETE', c.name) } }}><Trash2 size={14} /></button></td>
              </tr>
            ) })}</tbody>
          </table></div>
        </Card>
      )}

      {tab === 'policy' && <PolicyPanel />}
      {driveDraft && <DriveEditor draft={driveDraft} onClose={() => setDriveDraft(null)} />}
      {pipeline && <Pipeline driveId={pipeline} onClose={() => setPipeline(null)} />}
      {coDraft && (
        <Modal title={coDraft.id ? `Edit ${coDraft.name}` : 'Add company'} onClose={() => setCoDraft(null)} footer={<><button className="btn btn-ghost" onClick={() => setCoDraft(null)}>Cancel</button><button className="btn" onClick={() => {
          if (!coDraft.name?.trim()) return alert('Name the company.')
          const id = coDraft.id ?? uid('co')
          update((d) => { const ex = d.companies.find((x) => x.id === id); const rec = { name: coDraft.name!.trim(), industry: coDraft.industry ?? '', website: coDraft.website, location: coDraft.location, contactName: coDraft.contactName, contactEmail: coDraft.contactEmail, contactPhone: coDraft.contactPhone, notes: coDraft.notes }; if (ex) Object.assign(ex, rec); else d.companies.push({ id, ...rec }) })
          audit(me.id, coDraft.id ? 'COMPANY_EDIT' : 'COMPANY_ADD', coDraft.name!); setCoDraft(null)
        }}>Save</button></>}>
          <div className="grid grid-2">
            {(['name', 'industry', 'location', 'website', 'contactName', 'contactEmail', 'contactPhone'] as const).map((k) => <Field key={k} label={{ name: 'Name', industry: 'Industry', location: 'Location', website: 'Website', contactName: 'HR contact', contactEmail: 'Contact email', contactPhone: 'Contact phone' }[k]}><input className="input" value={coDraft[k] ?? ''} onChange={(e) => setCoDraft({ ...coDraft, [k]: e.target.value })} /></Field>)}
          </div>
          <Field label="Notes"><textarea className="textarea" value={coDraft.notes ?? ''} onChange={(e) => setCoDraft({ ...coDraft, notes: e.target.value })} /></Field>
        </Modal>
      )}
    </>
  )
}

function PolicyPanel() {
  const db = useDB()
  const me = useCurrentUser()!
  const [p, setP] = useState({ ...db.placementPolicy })
  return (
    <Card title="Placement policy">
      <label className="row gap"><input type="checkbox" checked={p.oneOffer} onChange={(e) => setP({ ...p, oneOffer: e.target.checked })} /> One offer per student: once a student accepts a full-time offer, they may only apply to dream offers</label>
      <Field label="Dream offer from (LPA)"><input className="input" type="number" min={0} step="0.5" style={{ maxWidth: 160 }} value={p.dreamLpa} onChange={(e) => setP({ ...p, dreamLpa: Number(e.target.value) })} /></Field>
      <button className="btn" onClick={() => { update((d) => { d.placementPolicy = p }); audit(me.id, 'PLACEMENT_POLICY', JSON.stringify(p)); alert('Saved.') }}>Save policy</button>
    </Card>
  )
}

function DriveEditor({ draft, onClose }: { draft: Partial<PlacementDrive>; onClose: () => void }) {
  const db = useDB()
  const me = useCurrentUser()!
  const [d, setD] = useState<Partial<PlacementDrive> & { deadlineStr?: string; driveStr?: string; roundsStr?: string }>({ ...draft, deadlineStr: draft.deadline ? new Date(draft.deadline).toISOString().slice(0, 10) : '', driveStr: draft.driveDate ? new Date(draft.driveDate).toISOString().slice(0, 10) : '', roundsStr: (draft.rounds ?? []).join(', ') })
  const set = (p: Partial<typeof d>) => setD({ ...d, ...p })
  const programs = [...new Set(db.classes.map((c) => c.program))]
  const batches = [...new Set(db.classes.map((c) => c.batch))].sort()
  const toggle = <T,>(list: T[] | undefined, v: T) => ((list ?? []).includes(v) ? (list ?? []).filter((x) => x !== v) : [...(list ?? []), v])
  const save = () => {
    const company = db.companies.find((c) => c.id === d.companyId)?.name ?? d.company
    if (!company?.trim() || !d.role?.trim() || !d.deadlineStr) return alert('Company, role and the last date to apply are needed.')
    const rec: PlacementDrive = {
      id: d.id ?? uid('dr'), company: company.trim(), companyId: d.companyId, role: d.role.trim(), kind: d.kind ?? 'Full-time', ctc: d.ctc ?? '', ctcLpa: d.ctcLpa, minCgpa: d.minCgpa ?? 0, maxBacklogs: d.maxBacklogs ?? 0,
      programs: d.programs, batches: d.batches, rounds: (d.roundsStr ?? '').split(',').map((x) => x.trim()).filter(Boolean), driveDate: d.driveStr ? new Date(`${d.driveStr}T10:00`).getTime() : undefined, venue: d.venue, openings: d.openings,
      deadline: new Date(`${d.deadlineStr}T23:59`).getTime(), description: d.description ?? '', applications: d.applications ?? [],
    }
    update((x) => { const ex = x.drives.findIndex((y) => y.id === rec.id); if (ex >= 0) x.drives[ex] = rec; else x.drives.push(rec) })
    if (!d.id) notify(studentsOf(db).filter((s) => driveEligibility(db, rec, s).ok).map((s) => s.id), `New ${rec.kind} opening: ${rec.company} (${rec.role}), ${rec.ctc}. Apply by ${fmtDate(rec.deadline)}.`, '/placements')
    audit(me.id, d.id ? 'DRIVE_EDIT' : 'DRIVE_CREATE', `${rec.company} ${rec.role}`)
    onClose()
  }
  return (
    <Modal wide title={d.id ? `Edit ${d.company} drive` : 'New placement drive'} onClose={onClose} footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn" onClick={save}>{d.id ? 'Save' : 'Publish to eligible students'}</button></>}>
      <div className="grid grid-3">
        <Field label="Company"><select className="select" value={d.companyId ?? ''} onChange={(e) => set({ companyId: e.target.value, company: db.companies.find((c) => c.id === e.target.value)?.name })}><option value="">Choose…</option>{db.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Role"><input className="input" value={d.role ?? ''} onChange={(e) => set({ role: e.target.value })} /></Field>
        <Field label="Type"><select className="select" value={d.kind} onChange={(e) => set({ kind: e.target.value as PlacementDrive['kind'] })}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select></Field>
        <Field label="CTC / stipend (as advertised)"><input className="input" value={d.ctc ?? ''} onChange={(e) => set({ ctc: e.target.value })} placeholder="₹ 6 LPA" /></Field>
        <Field label="CTC in LPA (for statistics)"><input className="input" type="number" step="0.1" value={d.ctcLpa ?? ''} onChange={(e) => set({ ctcLpa: e.target.value ? Number(e.target.value) : undefined })} /></Field>
        <Field label="Openings"><input className="input" type="number" min={1} value={d.openings ?? ''} onChange={(e) => set({ openings: e.target.value ? Number(e.target.value) : undefined })} /></Field>
        <Field label="Minimum CGPA"><input className="input" type="number" step="0.1" value={d.minCgpa ?? 0} onChange={(e) => set({ minCgpa: Number(e.target.value) })} /></Field>
        <Field label="Max backlogs"><input className="input" type="number" min={0} value={d.maxBacklogs ?? 0} onChange={(e) => set({ maxBacklogs: Number(e.target.value) })} /></Field>
        <Field label="Apply by"><input className="input" type="date" value={d.deadlineStr} onChange={(e) => set({ deadlineStr: e.target.value })} /></Field>
        <Field label="Drive date"><input className="input" type="date" value={d.driveStr} onChange={(e) => set({ driveStr: e.target.value })} /></Field>
        <Field label="Venue / mode"><input className="input" value={d.venue ?? ''} onChange={(e) => set({ venue: e.target.value })} /></Field>
      </div>
      <Field label="Programmes" hint="None ticked = all"><div className="row gap wrap">{programs.map((p) => <button key={p} type="button" className={`chip ${(d.programs ?? []).includes(p) ? 'active' : ''}`} onClick={() => set({ programs: toggle(d.programs, p) })}>{p}</button>)}</div></Field>
      <Field label="Batches" hint="None ticked = all"><div className="row gap wrap">{batches.map((b) => <button key={b} type="button" className={`chip ${(d.batches ?? []).includes(b) ? 'active' : ''}`} onClick={() => set({ batches: toggle(d.batches, b) })}>{b}</button>)}</div></Field>
      <Field label="Selection rounds, in order (comma-separated)"><input className="input" value={d.roundsStr} onChange={(e) => set({ roundsStr: e.target.value })} /></Field>
      <Field label="Description"><textarea className="textarea" value={d.description ?? ''} onChange={(e) => set({ description: e.target.value })} /></Field>
    </Modal>
  )
}

/** Round-by-round pipeline: shortlist, schedule, advance, select with an offer, reject. */
function Pipeline({ driveId, onClose }: { driveId: string; onClose: () => void }) {
  const db = useDB()
  const me = useCurrentUser()!
  const d = db.drives.find((x) => x.id === driveId)!
  const rounds = roundsOf(d)
  const [slots, setSlots] = useState<Record<string, string>>({})
  const [offerCtc, setOfferCtc] = useState<Record<string, number>>({})
  const [add, setAdd] = useState('')
  const patch = (sid: string, p: Partial<DriveApplication>, msg?: string) => {
    update((x) => { const a = x.drives.find((y) => y.id === d.id)!.applications.find((y) => y.studentId === sid)!; Object.assign(a, p) })
    if (msg) notify([sid], `${d.company} (${d.role}): ${msg}`, '/placements')
    audit(me.id, 'PLACEMENT_UPDATE', `${userName(db, sid)} @ ${d.company}: ${p.status ?? ''} ${p.round !== undefined ? rounds[p.round] ?? 'final' : ''}`)
  }
  const advance = (a: DriveApplication) => {
    const next = (a.round ?? 0) + 1
    if (next >= rounds.length) return patch(a.studentId, { status: 'SELECTED', round: rounds.length, offerCtc: offerCtc[a.studentId] ?? d.ctcLpa, offer: 'OFFERED' }, `you are selected! Offer: ${lpa(offerCtc[a.studentId] ?? d.ctcLpa)}. Accept or decline it in Placements.`)
    patch(a.studentId, { status: 'SHORTLISTED', round: next, slot: undefined }, `cleared ${rounds[next - 1]}; next: ${rounds[next]}`)
  }
  const eligibleNotApplied = studentsOf(db).filter((s) => !d.applications.some((a) => a.studentId === s.id) && driveEligibility(db, d, s).ok)
  const exportCsv = () => {
    const lines = [['Roll no', 'Name', 'CGPA', 'Backlogs', 'Status', 'Round', 'Offer (LPA)', 'Offer status'], ...d.applications.map((a) => { const s = db.users.find((u) => u.id === a.studentId)!; return [s.rollNo ?? '', s.name, fmtCgpa(cgpaOf(db, s)), String(backlogCountOf(s)), a.status, rounds[a.round ?? 0] ?? 'Final', String(a.offerCtc ?? ''), a.offer ?? ''] })]
    const el = document.createElement('a'); el.href = URL.createObjectURL(new Blob([lines.map((l) => l.map((v) => `"${v}"`).join(',')).join('\n')], { type: 'text/csv' })); el.download = `${d.company}-${d.role}.csv`; el.click()
  }
  return (
    <Modal wide title={`${d.company} · ${d.role}`} onClose={onClose} footer={<button className="btn btn-ghost" onClick={exportCsv}><Download size={12} /> CSV</button>}>
      <div className="row gap wrap">{rounds.map((r, i) => <Badge key={r} tone="info">{i + 1}. {r} · {d.applications.filter((a) => (a.round ?? 0) === i && !['REJECTED', 'WITHDRAWN', 'SELECTED'].includes(a.status)).length}</Badge>)}<Badge tone="success">Selected · {d.applications.filter((a) => a.status === 'SELECTED').length}{d.openings ? `/${d.openings}` : ''}</Badge></div>
      <div className="row gap wrap">
        <select className="select" style={{ maxWidth: 320 }} aria-label="Add eligible student" value={add} onChange={(e) => setAdd(e.target.value)}><option value="">Add an eligible student ({eligibleNotApplied.length})…</option>{eligibleNotApplied.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.rollNo} · CGPA {fmtCgpa(cgpaOf(db, s))}</option>)}</select>
        <button className="btn btn-sm" disabled={!add} onClick={() => { update((x) => { x.drives.find((y) => y.id === d.id)!.applications.push({ studentId: add, status: 'APPLIED', round: 0, appliedAt: Date.now() }) }); notify([add], `The Placement Cell registered you for ${d.company} (${d.role})`, '/placements'); setAdd('') }}>Add</button>
        <button className="btn btn-outline btn-sm" disabled={!d.applications.some((a) => a.status === 'APPLIED')} onClick={() => { for (const a of d.applications.filter((x) => x.status === 'APPLIED')) patch(a.studentId, { status: 'SHORTLISTED', round: 0 }, `shortlisted for ${rounds[0]}`) }}>Shortlist all applied</button>
      </div>
      {d.applications.length === 0 ? <Empty text="No applications yet." /> : (
        <div className="table-wrap"><table>
          <thead><tr><th>Student</th><th>CGPA</th><th>Stage</th><th>Interview</th><th>Actions</th></tr></thead>
          <tbody>{d.applications.map((a) => { const s = db.users.find((u) => u.id === a.studentId)!; const active = ['APPLIED', 'SHORTLISTED', 'INTERVIEW'].includes(a.status); return (
            <tr key={a.studentId}>
              <td>{s.name}<div className="small muted">{s.rollNo}{s.resumeUrl ? <> · <a href={s.resumeUrl} target="_blank" rel="noreferrer">resume</a></> : ''}</div></td>
              <td>{fmtCgpa(cgpaOf(db, s))}<div className="small muted">{backlogCountOf(s)} backlog(s)</div></td>
              <td><Badge tone={tone(a.status)}>{a.status.toLowerCase()}</Badge><div className="small muted">{a.status === 'SELECTED' ? `${lpa(a.offerCtc)} · offer ${a.offer?.toLowerCase() ?? ''}` : rounds[a.round ?? 0]}</div>{a.note && <div className="small muted">{a.note}</div>}</td>
              <td className="small">{a.slot ? fmtDateTime(a.slot) : active ? <div className="row gap"><input className="input" type="datetime-local" style={{ width: 190 }} aria-label={`Interview time for ${s.name}`} value={slots[s.id] ?? ''} onChange={(e) => setSlots({ ...slots, [s.id]: e.target.value })} /><button className="btn btn-ghost btn-sm" disabled={!slots[s.id]} onClick={() => patch(s.id, { status: 'INTERVIEW', slot: new Date(slots[s.id]).getTime() }, `${rounds[a.round ?? 0]} scheduled ${fmtDateTime(new Date(slots[s.id]).getTime())}${d.venue ? ` · ${d.venue}` : ''}`)}>Schedule</button></div> : '—'}</td>
              <td>{active ? (
                <div className="row gap wrap">
                  {(a.round ?? 0) + 1 >= rounds.length && <input className="input" type="number" step="0.1" style={{ width: 80 }} aria-label={`Offer CTC for ${s.name}`} placeholder={String(d.ctcLpa ?? '')} value={offerCtc[s.id] ?? ''} onChange={(e) => setOfferCtc({ ...offerCtc, [s.id]: Number(e.target.value) })} />}
                  <button className="btn btn-success btn-sm" onClick={() => advance(a)}>{(a.round ?? 0) + 1 >= rounds.length ? 'Select (offer)' : `Pass → ${rounds[(a.round ?? 0) + 1]}`}</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => patch(s.id, { status: 'REJECTED' }, `not selected after ${rounds[a.round ?? 0]}`)}>Reject</button>
                </div>
              ) : a.status === 'REJECTED' || a.status === 'WITHDRAWN' ? <button className="btn btn-ghost btn-sm" onClick={() => patch(s.id, { status: 'SHORTLISTED' }, 'your application was reopened')}>Reopen</button>
                : a.offer === 'OFFERED' ? <button className="btn btn-ghost btn-sm" onClick={() => patch(s.id, { offer: 'ACCEPTED' }, 'offer recorded as accepted')}>Mark accepted</button> : null}</td>
            </tr>
          ) })}</tbody>
        </table></div>
      )}
    </Modal>
  )
}

/* ============================ Students ============================ */

function StudentPlacements() {
  const db = useDB()
  const me = useCurrentUser()!
  const [tab, setTab] = useState<'openings' | 'mine' | 'profile'>('openings')
  const [q, setQ] = useState('')
  const [profile, setProfile] = useState({ resumeUrl: me.resumeUrl ?? '', skills: me.skills ?? '' })
  const f = useFilters(['kind', 'elig'] as const)
  const open = db.drives.filter((d) => d.deadline > Date.now())
  const drives = open.filter((d) => f.ok('kind', d.kind) && (!f.values.elig || (driveEligibility(db, d, me).ok ? 'yes' : 'no') === f.values.elig) && matches(q, d.company, d.role))
  const mine = db.drives.filter((d) => d.applications.some((a) => a.studentId === me.id))
  const offer = acceptedOffer(db, me.id)
  const apply = (d: PlacementDrive) => {
    if (!me.resumeUrl && !confirm('You have not added a resume link to your placement profile. Apply anyway?')) return
    update((x) => { x.drives.find((y) => y.id === d.id)!.applications.push({ studentId: me.id, status: 'APPLIED', round: 0, appliedAt: Date.now() }) })
    notify(officeUsers(db, 'placement'), `${me.name} applied to ${d.company} (${d.role})`, '/placements')
  }
  const respond = (d: PlacementDrive, accept: boolean) => {
    if (!confirm(accept ? `Accept the ${d.company} offer?${db.placementPolicy.oneOffer ? ` After this you can only apply to offers of ${db.placementPolicy.dreamLpa} LPA or more.` : ''}` : `Decline the ${d.company} offer? This cannot be undone.`)) return
    update((x) => { const a = x.drives.find((y) => y.id === d.id)!.applications.find((y) => y.studentId === me.id)!; a.offer = accept ? 'ACCEPTED' : 'DECLINED' })
    notify(officeUsers(db, 'placement'), `${me.name} ${accept ? 'accepted' : 'declined'} the ${d.company} offer`, '/placements')
  }
  const withdraw = (d: PlacementDrive) => {
    if (!confirm(`Withdraw from ${d.company}?`)) return
    update((x) => { x.drives.find((y) => y.id === d.id)!.applications.find((y) => y.studentId === me.id)!.status = 'WITHDRAWN' })
  }
  return (
    <>
      <PageHeader title="Placements & internships" subtitle="Openings you are eligible for, your applications and offers" search={{ value: q, onChange: setQ, placeholder: 'Search company or role…' }} />
      <div className="grid grid-4">
        <Stat label="My CGPA" value={fmtCgpa(cgpaOf(db, me))} tone="brand" hint={`${backlogCountOf(me)} backlog(s)`} />
        <Stat label="Open drives" value={open.length} tone="info" hint={`${open.filter((d) => driveEligibility(db, d, me).ok).length} eligible`} />
        <Stat label="My applications" value={mine.length} icon={<Briefcase size={22} />} />
        <Stat label="Status" value={offer ? 'Placed' : mine.some((d) => d.applications.some((a) => a.studentId === me.id && a.offer === 'OFFERED')) ? 'Offer received' : '—'} tone="success" hint={offer ? `${offer.d.company} · ${lpa(offer.a.offerCtc)}` : undefined} />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'openings', label: 'Openings', count: drives.length }, { id: 'mine', label: 'My applications', count: mine.length }, { id: 'profile', label: 'Placement profile' }]} />
      {tab === 'openings' && (
        <>
          <FilterBar defs={[{ key: 'kind' as const, label: 'Types', options: KINDS.map((k) => ({ value: k, label: k })) }, { key: 'elig' as const, label: 'Eligibility', options: [{ value: 'yes', label: 'Eligible for me' }, { value: 'no', label: 'Not eligible' }] }]} f={f} count={drives.length} noun="drive" />
          <div className="grid grid-2">{drives.map((d) => { const el = driveEligibility(db, d, me); const a = d.applications.find((x) => x.studentId === me.id); return (
            <Card key={d.id} title={<span>{d.company} · {d.role}</span>} action={<Badge tone={d.kind === 'Top-tier' ? 'accent' : d.kind === 'Internship' ? 'info' : 'brand'}>{d.kind}</Badge>}>
              <p className="small">{d.description}</p>
              <div className="row gap wrap small"><strong>{d.ctc}</strong><span className="muted">CGPA ≥ {d.minCgpa} · backlogs ≤ {d.maxBacklogs}</span><Badge tone="success">Apply by {fmtDate(d.deadline)}</Badge></div>
              <div className="small muted">Rounds: {roundsOf(d).join(' → ')}{d.driveDate ? ` · drive on ${fmtDate(d.driveDate)}` : ''}</div>
              {a ? <Badge tone={tone(a.status)}>{a.status.toLowerCase()}</Badge> : el.ok ? <button className="btn" onClick={() => apply(d)}>Apply</button> : <div className="small" style={{ color: 'var(--danger)' }}>Not eligible: {el.reasons.join('; ')}</div>}
            </Card>
          ) })}{drives.length === 0 && <Card><Empty text="No open drives." /></Card>}</div>
        </>
      )}
      {tab === 'mine' && (
        <Card>
          {mine.length === 0 ? <Empty text="You have not applied anywhere yet." /> : (
            <div className="table-wrap"><table>
              <thead><tr><th>Company · role</th><th>Progress</th><th>Status</th><th /></tr></thead>
              <tbody>{mine.map((d) => { const a = d.applications.find((x) => x.studentId === me.id)!; const rounds = roundsOf(d); return (
                <tr key={d.id}>
                  <td><strong>{d.company}</strong> · {d.role}<div className="small muted">{d.ctc}</div></td>
                  <td><div className="round-steps">{rounds.map((r, i) => <span key={r} className={`round-step ${a.status === 'SELECTED' || i < (a.round ?? 0) ? 'done' : i === (a.round ?? 0) && !['REJECTED', 'WITHDRAWN'].includes(a.status) ? 'now' : ''}`}>{r}</span>)}</div>{a.slot && a.status === 'INTERVIEW' && <div className="small">Scheduled {fmtDateTime(a.slot)}{d.venue ? ` · ${d.venue}` : ''}</div>}</td>
                  <td><Badge tone={tone(a.status)}>{a.status.toLowerCase()}</Badge>{a.status === 'SELECTED' && <div className="small">{lpa(a.offerCtc)} · offer {a.offer?.toLowerCase()}</div>}</td>
                  <td>{a.offer === 'OFFERED' ? <div className="row gap"><button className="btn btn-success btn-sm" onClick={() => respond(d, true)}>Accept</button><button className="btn btn-ghost btn-sm" onClick={() => respond(d, false)}>Decline</button></div> : ['APPLIED', 'SHORTLISTED'].includes(a.status) && <button className="btn btn-ghost btn-sm" onClick={() => withdraw(d)}>Withdraw</button>}</td>
                </tr>
              ) })}</tbody>
            </table></div>
          )}
        </Card>
      )}
      {tab === 'profile' && (
        <Card title="Placement profile" action={<span className="small muted">Shared with the Placement Cell and recruiters</span>}>
          <Field label="Resume link (Drive / PDF URL)"><input className="input" value={profile.resumeUrl} onChange={(e) => setProfile({ ...profile, resumeUrl: e.target.value })} placeholder="https://…" /></Field>
          <Field label="Skills"><input className="input" value={profile.skills} onChange={(e) => setProfile({ ...profile, skills: e.target.value })} placeholder="e.g. React, SQL, Python, communication" /></Field>
          <button className="btn" onClick={() => { update((d) => { const u = d.users.find((x) => x.id === me.id)!; u.resumeUrl = profile.resumeUrl.trim() || undefined; u.skills = profile.skills.trim() || undefined }); alert('Profile saved.') }}>Save</button>
        </Card>
      )}
    </>
  )
}

/** Faculty / other offices: read-only placement figures. */
function PlacementOverview() {
  const db = useDB()
  const st = stats(db)
  return (
    <>
      <PageHeader title="Placements" subtitle="Placement figures for the current final year" />
      <div className="grid grid-4">
        <Stat label="Placed" value={`${st.placed.size}/${st.finalYear.length}`} tone="success" icon={<Users size={22} />} />
        <Stat label="Highest CTC" value={lpa(st.highest)} tone="brand" />
        <Stat label="Average CTC" value={lpa(st.average)} tone="info" />
        <Stat label="Recruiters" value={db.companies.length} icon={<Building size={22} />} />
      </div>
    </>
  )
}
