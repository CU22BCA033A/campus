import { useState } from 'react'
import { HandHeart, Plus, Search, Users } from 'lucide-react'
import { audit, notify, uid, update, useCurrentUser, useDB } from '../data/store'
import { Avatar, Badge, Card, Field, Modal, PageHeader, Stat } from '../components/ui'
import { inr } from '../lib'
import { can } from '../access'
import type { Alumnus } from '../data/types'

export default function Alumni() {
  const db = useDB()
  const user = useCurrentUser()!
  const [q, setQ] = useState('')
  const [mentorsOnly, setMentorsOnly] = useState(false)
  const [donate, setDonate] = useState<Alumnus | null>(null)
  const [amount, setAmount] = useState(5000)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ name: '', batch: new Date().getFullYear() - 1, program: 'BCA', company: '', role: '', city: '', email: '', mentor: false })
  const list = db.alumni.filter((a) => (!mentorsOnly || a.mentor) && (a.name + a.company + a.city + a.program + a.batch).toLowerCase().includes(q.toLowerCase()))
  const total = db.alumni.reduce((s, a) => s + a.donations, 0)

  const requestMentor = (a: Alumnus) => {
    update((d) => { const x = d.alumni.find((y) => y.id === a.id)!; if (!x.mentees.includes(user.id)) x.mentees.push(user.id) })
    audit(user.id, 'ALUMNI_MENTOR_REQUEST', `${user.name} → ${a.name}`)
    notify([user.id], `Mentorship request sent to ${a.name}. They will reach out by email.`, '/alumni')
  }

  return (
    <>
      <PageHeader title="Alumni network" subtitle="Directory, mentorship and giving" actions={can(user, 'manageAlumni') && <button className="btn" onClick={() => setAdding(true)}><Plus size={14} /> Add alumnus</button>} />
      <div className="grid grid-4">
        <Stat label="Alumni" value={db.alumni.length} icon={<Users size={22} />} />
        <Stat label="Mentors" value={db.alumni.filter((a) => a.mentor).length} tone="info" />
        <Stat label="Raised (giving campaign)" value={inr(total)} tone="success" icon={<HandHeart size={22} />} />
      </div>
      <div className="row gap wrap">
        <div className="search" style={{ maxWidth: 360 }}><Search size={16} className="muted" /><input placeholder="Search name, company, city, batch" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <button className={`chip ${mentorsOnly ? 'active' : ''}`} onClick={() => setMentorsOnly((v) => !v)}>Mentors only</button>
      </div>
      <div className="grid grid-3">
        {list.map((a) => (
          <Card key={a.id}>
            <div className="stack">
              <div className="row gap"><Avatar name={a.name} color="#2563a8" size={44} /><div><strong>{a.name}</strong><div className="small muted">{a.program} · Class of {a.batch}</div></div></div>
              <div>{a.role} at <strong>{a.company}</strong></div>
              <div className="small muted">{a.city} · {a.email}</div>
              <div className="row gap wrap">{a.mentor && <Badge tone="info">Mentor</Badge>}{a.donations > 0 && <Badge tone="success">Donor · {inr(a.donations)}</Badge>}</div>
              <div className="row gap">
                {user.role === 'student' && a.mentor && (a.mentees.includes(user.id) ? <Badge tone="accent">Mentorship requested</Badge> : <button className="btn btn-outline btn-sm" onClick={() => requestMentor(a)}>Request mentorship</button>)}
                {can(user, 'manageAlumni') && <button className="btn btn-outline btn-sm" onClick={() => setDonate(a)}>Record donation</button>}
              </div>
            </div>
          </Card>
        ))}
      </div>
      {donate && (
        <Modal title={`Donation from ${donate.name}`} onClose={() => setDonate(null)} footer={<button className="btn" onClick={() => { update((d) => { d.alumni.find((x) => x.id === donate.id)!.donations += amount }); audit(user.id, 'ALUMNI_DONATION', `${donate.name}: ${inr(amount)}`); setDonate(null) }}>Record {inr(amount)}</button>}>
          <Field label="Amount (₹)"><input className="input" type="number" min={1} value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></Field>
        </Modal>
      )}
      {adding && (
        <Modal title="Add alumnus" onClose={() => setAdding(false)} footer={<button className="btn" onClick={() => { if (!draft.name) return; update((d) => { d.alumni.push({ id: uid('al'), ...draft, mentees: [], donations: 0 }) }); setAdding(false) }}>Add</button>}>
          <div className="grid grid-2">
            <Field label="Name"><input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
            <Field label="Email"><input className="input" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></Field>
            <Field label="Batch"><input className="input" type="number" value={draft.batch} onChange={(e) => setDraft({ ...draft, batch: Number(e.target.value) })} /></Field>
            <Field label="Programme"><input className="input" value={draft.program} onChange={(e) => setDraft({ ...draft, program: e.target.value })} /></Field>
            <Field label="Company"><input className="input" value={draft.company} onChange={(e) => setDraft({ ...draft, company: e.target.value })} /></Field>
            <Field label="Role"><input className="input" value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} /></Field>
            <Field label="City"><input className="input" value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} /></Field>
          </div>
          <label className="row gap"><input type="checkbox" checked={draft.mentor} onChange={(e) => setDraft({ ...draft, mentor: e.target.checked })} /> Willing to mentor students</label>
        </Modal>
      )}
    </>
  )
}
