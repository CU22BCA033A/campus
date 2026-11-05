import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, FileCheck2, GraduationCap, Plus, Upload, XCircle } from 'lucide-react'
import { audit, getDB, notify, uid, update, useCurrentUser, useDB } from '../data/store'
import { wardensFor } from '../hostels'
import { Badge, Card, Empty, Field, Modal, PageHeader, Stat, Tabs } from '../components/ui'
import { resyncRosters } from '../classes'
import { fmtDate, inr, timeAgo, matches } from '../lib'
import { officeUsers } from '../access'
import type { Application, AppStage, DB } from '../data/types'

export const PROGRAMS: Record<string, { fee: number; code: string }> = {
  BCA: { fee: 75000, code: 'BCA' },
  BBA: { fee: 70000, code: 'BBA' },
  'B.Sc Data Science': { fee: 85000, code: 'BDS' },
  'B.Com': { fee: 60000, code: 'BCM' },
}
const STAGES: { id: AppStage; label: string }[] = [
  { id: 'ENQUIRY', label: 'Enquiry' },
  { id: 'APPLIED', label: 'Applied' },
  { id: 'VERIFIED', label: 'Verified' },
  { id: 'SHORTLISTED', label: 'Shortlisted' },
  { id: 'OFFERED', label: 'Offered' },
  { id: 'FEE_PAID', label: 'Fee paid' },
  { id: 'ADMITTED', label: 'Admitted' },
  { id: 'REJECTED', label: 'Rejected' },
]
const DOCS = ['10th marksheet', '12th marksheet', 'Transfer certificate', 'Aadhaar']

/** Merit = 40% qualifying exam + 60% entrance score. */
const merit = (a: Application) => Math.round((a.qualifyingPct * 0.4 + a.entranceScore * 0.6) * 10) / 10

function bestScholarship(db: DB, score: number) {
  const fee = (s: DB['scholarships'][number], base: number) => (s.kind === 'PERCENT' ? (base * s.value) / 100 : s.value)
  return db.scholarships.filter((s) => score >= s.minMerit).sort((a, b) => fee(b, 100000) - fee(a, 100000))[0]
}
export const offerAmount = (db: DB, a: Application) => {
  const base = PROGRAMS[a.program]?.fee ?? 75000
  const s = db.scholarships.find((x) => x.id === a.scholarshipId)
  const waiver = s ? (s.kind === 'PERCENT' ? (base * s.value) / 100 : s.value) : 0
  return { base, waiver, net: Math.max(0, base - waiver) }
}

export default function Admissions() {
  const db = useDB()
  const user = useCurrentUser()!
  const [stage, setStage] = useState<AppStage>('APPLIED')
  const [open, setOpen] = useState<Application | null>(null)
  const [importing, setImporting] = useState(false)
  const [csv, setCsv] = useState('')
  const [term, setTerm] = useState('')

  const move = (a: Application, to: AppStage, patch: Partial<Application> = {}) => {
    update((d) => {
      const x = d.applications.find((y) => y.id === a.id)!
      Object.assign(x, patch)
      x.stage = to
      x.history.push({ stage: to, at: Date.now(), by: user.id })
    })
    audit(user.id, `ADMISSION_${to}`, `${a.name} → ${to}`)
  }

  const shortlistAll = () => {
    const verified = db.applications.filter((a) => a.stage === 'VERIFIED')
    const ranked = [...verified].map((a) => ({ a, m: merit(a) })).sort((x, y) => y.m - x.m)
    update((d) => {
      ranked.forEach(({ a, m }, i) => {
        const x = d.applications.find((y) => y.id === a.id)!
        x.meritScore = m
        x.rank = i + 1
        if (m >= 60) { x.stage = 'SHORTLISTED'; x.history.push({ stage: 'SHORTLISTED', at: Date.now(), by: user.id }) }
      })
    })
    audit(user.id, 'ADMISSION_MERIT', `Computed merit list for ${ranked.length} applicants`)
  }

  const sendOffer = (a: Application) => {
    const s = bestScholarship(db, a.meritScore ?? merit(a))
    const draft = { ...a, scholarshipId: s?.id }
    move(a, 'OFFERED', { scholarshipId: s?.id, offerFee: offerAmount(db, draft).net })
  }

  /** Final step of the chain: create the student account, roll number, fee plan and course enrolment. */
  const admit = (a: Application) => {
    const code = PROGRAMS[a.program]?.code ?? 'GEN'
    const yy = String(new Date().getFullYear()).slice(-2)
    const seq = db.users.filter((u) => u.rollNo?.startsWith(`${yy}${code}`)).length + 1
    const rollNo = `${yy}${code}${String(seq).padStart(3, '0')}`
    const studentId = uid('s')
    const year = new Date().getFullYear()
    const classId = db.classes.find((c) => c.program === a.program && c.batch === year && c.semester === 1)?.id ?? `cls-${a.program.toLowerCase().replace(/[^a-z]/g, '')}-${year}-a`
    const local = a.name.toLowerCase().replace(/[^a-z]+/g, '.')
    const { base, waiver } = offerAmount(db, a)
    update((d) => {
      d.users.push({
        id: studentId, name: a.name, email: `${local}@campus.edu`, password: 'welcome123', role: 'student', status: 'ACTIVE',
        department: a.program === 'BCA' ? 'Computer Applications' : a.program, rollNo, program: a.program, semester: 1, section: 'A', classId, batch: year,
        phone: a.phone, firstLogin: true, credentialsMismatchCount: 0, avatarColor: '#6b3fa0', cgpa: 0, backlogs: 0, gender: a.gender, residence: a.residence ?? 'DAY_SCHOLAR', backlogCourses: [],
      })
      d.fees.push({ id: uid('fee'), studentId, title: 'Tuition fee – Semester 1', amount: base, scholarship: waiver, paidAmount: base - waiver, paidAt: Date.now(), txnId: `ADM${Date.now().toString().slice(-6)}`, dueAt: Date.now(), head: 'Tuition' })
      // Place the new student in this year's first-semester class for the programme (created if needed).
      if (!d.classes.some((c) => c.id === classId)) d.classes.push({ id: classId, program: a.program, batch: year, section: 'A', semester: 1, maxSemesters: 6 })
      resyncRosters(d)
      const x = d.applications.find((y) => y.id === a.id)!
      x.stage = 'ADMITTED'; x.studentId = studentId; x.rollNo = rollNo
      x.history.push({ stage: 'ADMITTED', at: Date.now(), by: user.id })
    })
    audit(user.id, 'ADMISSION_ADMITTED', `${a.name} admitted as ${rollNo} (${a.residence === 'HOSTEL' ? 'hostel' : 'day scholar'})`)
    if (a.residence === 'HOSTEL') notify(wardensFor(getDB(), getDB().users.find((u) => u.id === studentId)!), `New hostel student ${a.name} (${rollNo}) is on your waiting list`, '/hostel')
    notify([user.id], `${a.name} admitted. Student ID ${rollNo} created`, '/admin/users')
    setOpen(null)
  }

  const bulkImport = () => {
    const rows = csv.trim().split('\n').map((l) => l.split(',').map((x) => x.trim())).filter((r) => r.length >= 5 && r[0] && r[0].toLowerCase() !== 'name')
    update((d) => {
      for (const [name, email, program, q, e] of rows) {
        d.applications.push({ id: uid('ap'), name, email, phone: '', program: PROGRAMS[program] ? program : 'BCA', qualifyingPct: Number(q) || 0, entranceScore: Number(e) || 0, category: 'General', stage: 'APPLIED', createdAt: Date.now(), history: [{ stage: 'APPLIED', at: Date.now(), by: user.id }], documents: DOCS.map((n) => ({ name: n, status: 'PENDING' as const })) })
      }
    })
    audit(user.id, 'ADMISSION_IMPORT', `Imported ${rows.length} applications`)
    setImporting(false); setCsv('')
  }

  const list = db.applications.filter((a) => a.stage === stage && matches(term, a.name, a.email, a.phone, a.program, a.rollNo, a.category)).sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999) || b.createdAt - a.createdAt)
  const count = (s: AppStage) => db.applications.filter((a) => a.stage === s).length
  const current = open && db.applications.find((a) => a.id === open.id)

  return (
    <>
      <PageHeader search={{ value: term, onChange: setTerm, placeholder: 'Search applicant, email, phone…' }} title="Admissions" subtitle="Enquiry → application → verification → merit → offer → fee → student ID" actions={<>
        <button className="btn btn-outline" onClick={() => setImporting(true)}><Upload size={14} /> Bulk import</button>
        <Link className="btn btn-outline" to="/apply" target="_blank">Open application form</Link>
      </>} />
      <div className="grid grid-4">
        <Stat label="Total applications" value={db.applications.length} icon={<FileCheck2 size={22} />} />
        <Stat label="Pending verification" value={count('APPLIED')} tone="warning" />
        <Stat label="Offers out" value={count('OFFERED')} tone="info" />
        <Stat label="Admitted" value={count('ADMITTED')} tone="success" icon={<GraduationCap size={22} />} />
      </div>
      <Tabs value={stage} onChange={setStage} tabs={STAGES.map((s) => ({ id: s.id, label: s.label, count: count(s.id) }))} />
      {stage === 'VERIFIED' && count('VERIFIED') > 0 && (
        <div className="alert alert-info row between wrap gap"><span>Compute the merit score (40% qualifying exam + 60% entrance) and rank all verified applicants.</span><button className="btn btn-sm" onClick={shortlistAll}>Generate merit list</button></div>
      )}
      <Card>
        {list.length === 0 ? <Empty text="No applications at this stage." /> : (
          <div className="table-wrap">
            <table>
              <thead><tr>{stage !== 'ENQUIRY' && stage !== 'APPLIED' && <th>Rank</th>}<th>Applicant</th><th>Programme</th><th>12th %</th><th>Entrance</th><th>Merit</th><th>Updated</th><th /></tr></thead>
              <tbody>
                {list.map((a) => (
                  <tr key={a.id}>
                    {stage !== 'ENQUIRY' && stage !== 'APPLIED' && <td>{a.rank ? `#${a.rank}` : '—'}</td>}
                    <td><strong>{a.name}</strong><div className="small muted">{a.email}</div></td>
                    <td>{a.program}</td><td>{a.qualifyingPct}</td><td>{a.entranceScore}</td>
                    <td>{a.meritScore ?? <span className="muted">{merit(a)}*</span>}</td>
                    <td className="small muted">{timeAgo(a.history[a.history.length - 1].at)}</td>
                    <td><button className="btn btn-outline btn-sm" onClick={() => setOpen(a)}>Open</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {current && (
        <Modal title={current.name} onClose={() => setOpen(null)} footer={<StageActions a={current} onMove={move} onOffer={sendOffer} onAdmit={admit} />}>
          <div className="row gap wrap"><Badge tone="brand">{current.program}</Badge><Badge>{current.category}</Badge><Badge tone="info">{STAGES.find((s) => s.id === current.stage)?.label}</Badge>{current.rank && <Badge tone="accent">Rank #{current.rank}</Badge>}</div>
          <table><tbody>
            <tr><td className="muted">Email / phone</td><td>{current.email} · {current.phone || '—'}</td></tr>
            <tr><td className="muted">Qualifying exam</td><td>{current.qualifyingPct}%</td></tr>
            <tr><td className="muted">Entrance score</td><td>{current.entranceScore}/100</td></tr>
            <tr><td className="muted">Merit score</td><td>{current.meritScore ?? merit(current)}</td></tr>
            <tr><td className="muted">Gender / accommodation</td><td>
              {current.stage === 'ADMITTED' ? `${current.gender ?? '—'} · ${current.residence === 'HOSTEL' ? 'Hostel' : 'Day scholar'}` : (
                <div className="row gap">
                  <select className="select" style={{ width: 'auto' }} aria-label="Gender" value={current.gender ?? ''} onChange={(e) => update((d) => { d.applications.find((x) => x.id === current.id)!.gender = (e.target.value || undefined) as Application['gender'] })}><option value="">Gender</option><option>Male</option><option>Female</option></select>
                  <select className="select" style={{ width: 'auto' }} aria-label="Accommodation" value={current.residence ?? ''} onChange={(e) => update((d) => { d.applications.find((x) => x.id === current.id)!.residence = (e.target.value || undefined) as Application['residence'] })}><option value="">Accommodation</option><option value="HOSTEL">Hostel</option><option value="DAY_SCHOLAR">Day scholar</option></select>
                </div>
              )}
            </td></tr>
            {current.studentId && <tr><td className="muted">Student ID</td><td><strong>{current.rollNo}</strong></td></tr>}
          </tbody></table>
          {current.documents.length > 0 && (
            <div className="stack" style={{ gap: 6 }}>
              <h3>Documents</h3>
              {current.documents.map((doc, i) => (
                <div key={doc.name} className="row between">
                  <span>{doc.name}</span>
                  <div className="row gap">
                    <Badge tone={doc.status === 'VERIFIED' ? 'success' : doc.status === 'REJECTED' ? 'danger' : 'warning'}>{doc.status}</Badge>
                    {current.stage === 'APPLIED' && doc.status !== 'VERIFIED' && <button className="icon-btn" title="Verify" onClick={() => update((d) => { d.applications.find((x) => x.id === current.id)!.documents[i].status = 'VERIFIED' })}><CheckCircle2 size={16} color="var(--success)" /></button>}
                    {current.stage === 'APPLIED' && doc.status !== 'REJECTED' && <button className="icon-btn" title="Reject" onClick={() => update((d) => { d.applications.find((x) => x.id === current.id)!.documents[i].status = 'REJECTED' })}><XCircle size={16} color="var(--danger)" /></button>}
                  </div>
                </div>
              ))}
            </div>
          )}
          {(current.stage === 'OFFERED' || current.stage === 'FEE_PAID' || current.stage === 'ADMITTED') && (() => {
            const o = offerAmount(db, current)
            const s = db.scholarships.find((x) => x.id === current.scholarshipId)
            return (
              <div className="alert alert-success" style={{ flexDirection: 'column' }}>
                <strong>Offer letter: {current.program}</strong>
                <span>Programme fee {inr(o.base)}{s ? ` − ${s.name} ${inr(o.waiver)}` : ''} = <strong>{inr(o.net)}</strong> payable for Semester 1.</span>
              </div>
            )
          })()}
          <div className="stack" style={{ gap: 4 }}>
            <h3>Timeline</h3>
            {current.history.map((h, i) => <div key={i} className="small"><Badge>{h.stage}</Badge> <span className="muted">{fmtDate(h.at)} · {h.by === 'web' ? 'Applicant' : db.users.find((u) => u.id === h.by)?.name}</span></div>)}
          </div>
        </Modal>
      )}

      {importing && (
        <Modal title="Bulk import applications" onClose={() => setImporting(false)} footer={<><button className="btn btn-ghost" onClick={() => setImporting(false)}>Cancel</button><button className="btn" onClick={bulkImport}>Import</button></>}>
          <Field label="CSV rows" hint="name, email, programme, 12th %, entrance score. One applicant per line.">
            <textarea className="textarea" style={{ minHeight: 160, fontFamily: 'monospace' }} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={'Name,Email,Programme,12th,Entrance\nAnjali Rao,anjali@mail.com,BCA,86,79'} />
          </Field>
          <input type="file" accept=".csv,text/csv" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setCsv(await f.text()) }} />
        </Modal>
      )}
    </>
  )
}

function StageActions({ a, onMove, onOffer, onAdmit }: { a: Application; onMove: (a: Application, to: AppStage, patch?: Partial<Application>) => void; onOffer: (a: Application) => void; onAdmit: (a: Application) => void }) {
  const allVerified = a.documents.length > 0 && a.documents.every((d) => d.status === 'VERIFIED')
  const reject = a.stage !== 'ADMITTED' && a.stage !== 'REJECTED' && <button className="btn btn-danger" onClick={() => onMove(a, 'REJECTED')}>Reject</button>
  switch (a.stage) {
    case 'ENQUIRY': return <>{reject}<button className="btn" onClick={() => onMove(a, 'APPLIED', { documents: DOCS.map((n) => ({ name: n, status: 'PENDING' })) })}>Convert to application</button></>
    case 'APPLIED': return <>{reject}<button className="btn" disabled={!allVerified} title={allVerified ? '' : 'Verify all documents first'} onClick={() => onMove(a, 'VERIFIED')}>Mark verified</button></>
    case 'VERIFIED': return <>{reject}<span className="small muted">Generate the merit list to shortlist</span></>
    case 'SHORTLISTED': return <>{reject}<button className="btn" onClick={() => onOffer(a)}>Send offer letter</button></>
    case 'OFFERED': return <>{reject}<button className="btn btn-success" onClick={() => onMove(a, 'FEE_PAID')}>Record fee payment</button></>
    case 'FEE_PAID': return <button className="btn btn-success" disabled={!a.gender || !a.residence} title={!a.gender || !a.residence ? 'Set gender and hostel / day scholar first' : ''} onClick={() => onAdmit(a)}><GraduationCap size={14} /> Admit &amp; generate student ID</button>
    default: return null
  }
}

/** Public application form (no login), the top of the admissions funnel. */
export function ApplyForm() {
  const [done, setDone] = useState<string | null>(null)
  const [f, setF] = useState({ name: '', email: '', phone: '', program: 'BCA', qualifyingPct: '', entranceScore: '', category: 'General' as Application['category'], gender: '' as '' | 'Male' | 'Female', residence: '' as '' | 'HOSTEL' | 'DAY_SCHOLAR' })
  const [files, setFiles] = useState<Record<string, string>>({})
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const id = uid('ap')
    update((d) => {
      d.applications.push({ id, name: f.name, email: f.email, phone: f.phone, program: f.program, gender: f.gender || undefined, residence: f.residence || undefined, qualifyingPct: Number(f.qualifyingPct), entranceScore: Number(f.entranceScore), category: f.category, stage: 'APPLIED', createdAt: Date.now(), history: [{ stage: 'APPLIED', at: Date.now(), by: 'web' }], documents: DOCS.map((n) => ({ name: files[n] ? `${n} (${files[n]})` : n, status: 'PENDING' as const })) })
    })
    notify(officeUsers(getDB(), 'registrar'), `New admission application from ${f.name}`, '/admissions')
    setDone(id.toUpperCase())
  }
  return (
    <div className="login-form-wrap" style={{ minHeight: '100%', background: 'var(--bg)' }}>
      <div className="card" style={{ width: '100%', maxWidth: 640 }}>
        <div className="row gap" style={{ marginBottom: 16 }}><div className="brand-logo">CP</div><div><h1>Apply for admission</h1><p className="muted">Academic year {new Date().getFullYear()}–{String(new Date().getFullYear() + 1).slice(-2)}</p></div></div>
        {done ? (
          <div className="stack">
            <div className="alert alert-success"><CheckCircle2 size={16} /> Application submitted. Your application number is <strong>&nbsp;{done}</strong>.</div>
            <p className="muted">You will receive updates by email and SMS as your application moves through verification, merit listing and offer.</p>
            <Link to="/login" className="btn btn-outline">Back to sign in</Link>
          </div>
        ) : (
          <form className="stack" onSubmit={submit}>
            <div className="grid grid-2">
              <Field label="Full name"><input className="input" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
              <Field label="Email"><input className="input" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
              <Field label="Mobile"><input className="input" required value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
              <Field label="Programme"><select className="select" value={f.program} onChange={(e) => setF({ ...f, program: e.target.value })}>{Object.keys(PROGRAMS).map((p) => <option key={p}>{p}</option>)}</select></Field>
              <Field label="12th / qualifying exam %"><input className="input" type="number" min={0} max={100} step="0.1" required value={f.qualifyingPct} onChange={(e) => setF({ ...f, qualifyingPct: e.target.value })} /></Field>
              <Field label="Entrance test score (out of 100)"><input className="input" type="number" min={0} max={100} required value={f.entranceScore} onChange={(e) => setF({ ...f, entranceScore: e.target.value })} /></Field>
              <Field label="Gender"><select className="select" required value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value as typeof f.gender })}><option value="">Select…</option><option>Male</option><option>Female</option></select></Field>
              <Field label="Hostel accommodation"><select className="select" required value={f.residence} onChange={(e) => setF({ ...f, residence: e.target.value as typeof f.residence })}><option value="">Select…</option><option value="HOSTEL">Yes, I need the hostel</option><option value="DAY_SCHOLAR">No, day scholar</option></select></Field>
              <Field label="Category"><select className="select" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as Application['category'] })}>{['General', 'OBC', 'SC', 'ST', 'EWS'].map((c) => <option key={c}>{c}</option>)}</select></Field>
            </div>
            <h3>Documents</h3>
            <div className="grid grid-2">
              {DOCS.map((n) => <Field key={n} label={n}><input type="file" onChange={(e) => setFiles({ ...files, [n]: e.target.files?.[0]?.name ?? '' })} /></Field>)}
            </div>
            <button className="btn btn-block" type="submit"><Plus size={14} /> Submit application</button>
            <Link to="/login" className="small" style={{ textAlign: 'center' }}>Already a student? Sign in</Link>
          </form>
        )}
      </div>
    </div>
  )
}
