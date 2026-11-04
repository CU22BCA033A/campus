import { useState } from 'react'
import { CalendarPlus, MapPin, Megaphone, Pin, Plus, Trash2, Users, Vote } from 'lucide-react'
import { notify, uid, update, useCurrentUser, useDB } from '../data/store'
import { Badge, Card, Empty, Field, Modal, PageHeader, Progress, Tabs } from '../components/ui'
import { fmtDateTime, timeAgo, userName } from '../lib'
import { can } from '../access'
import type { Notice } from '../data/types'

/* ---------------- Notice board ---------------- */
export function Notices() {
  const db = useDB()
  const user = useCurrentUser()!
  const [cat, setCat] = useState<string>('All')
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState<Pick<Notice, 'title' | 'body' | 'category' | 'audience' | 'pinned'>>({ title: '', body: '', category: 'General', audience: 'all', pinned: false })
  const canPost = can(user, 'postNotices')
  const cats = ['All', 'Academic', 'Exam', 'Event', 'Placement', 'General']
  const list = db.notices
    .filter((n) => (n.audience === 'all' || n.audience === user.role || user.role === 'admin') && (cat === 'All' || n.category === cat))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt)

  const post = () => {
    if (!draft.title.trim()) return
    update((d) => { d.notices.push({ id: uid('n'), postedBy: user.id, createdAt: Date.now(), ...draft }) })
    const targets = db.users.filter((u) => u.id !== user.id && (draft.audience === 'all' || u.role === draft.audience)).map((u) => u.id)
    notify(targets, `New notice: ${draft.title}`, '/notices')
    setCreating(false); setDraft({ title: '', body: '', category: 'General', audience: 'all', pinned: false })
  }

  return (
    <>
      <PageHeader title="Notice board" subtitle="Official announcements from the university" actions={canPost && <button className="btn" onClick={() => setCreating(true)}><Plus size={14} /> Post notice</button>} />
      <div className="row gap wrap">{cats.map((c) => <button key={c} className={`chip ${cat === c ? 'active' : ''}`} onClick={() => setCat(c)}>{c}</button>)}</div>
      <div className="stack">
        {list.length === 0 && <Card><Empty icon={<Megaphone />} text="No notices in this category." /></Card>}
        {list.map((n) => (
          <Card key={n.id}>
            <div className="row between gap" style={{ alignItems: 'flex-start' }}>
              <div className="grow">
                <div className="row gap wrap">{n.pinned && <Pin size={14} color="var(--accent)" />}<h3>{n.title}</h3><Badge tone={n.category === 'Exam' ? 'danger' : n.category === 'Placement' ? 'success' : n.category === 'Event' ? 'accent' : 'info'}>{n.category}</Badge>{n.audience !== 'all' && <Badge>{n.audience}s only</Badge>}</div>
                <p style={{ marginTop: 6 }}>{n.body}</p>
                <div className="small muted" style={{ marginTop: 8 }}>{userName(db, n.postedBy)} · {fmtDateTime(n.createdAt)}</div>
              </div>
              {(can(user, 'moderateNotices') || n.postedBy === user.id) && (
                <div className="row">
                  <button className="icon-btn" title={n.pinned ? 'Unpin' : 'Pin'} onClick={() => update((d) => { const x = d.notices.find((y) => y.id === n.id)!; x.pinned = !x.pinned })}><Pin size={16} /></button>
                  <button className="icon-btn" title="Delete" onClick={() => confirm('Delete this notice?') && update((d) => { d.notices = d.notices.filter((y) => y.id !== n.id) })}><Trash2 size={16} /></button>
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>
      {creating && (
        <Modal title="Post a notice" onClose={() => setCreating(false)} footer={<><button className="btn btn-ghost" onClick={() => setCreating(false)}>Cancel</button><button className="btn" onClick={post}>Publish</button></>}>
          <Field label="Title"><input className="input" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></Field>
          <Field label="Message"><textarea className="textarea" value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} /></Field>
          <div className="grid grid-2">
            <Field label="Category"><select className="select" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as Notice['category'] })}>{cats.slice(1).map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Audience"><select className="select" value={draft.audience} onChange={(e) => setDraft({ ...draft, audience: e.target.value as Notice['audience'] })}><option value="all">Everyone</option><option value="student">Students</option><option value="faculty">Faculty</option></select></Field>
          </div>
          <label className="row gap"><input type="checkbox" checked={draft.pinned} onChange={(e) => setDraft({ ...draft, pinned: e.target.checked })} /> Pin to top</label>
        </Modal>
      )}
    </>
  )
}

/* ---------------- Events ---------------- */
export function Events() {
  const db = useDB()
  const user = useCurrentUser()!
  const [tab, setTab] = useState<'upcoming' | 'mine' | 'past'>('upcoming')
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState({ title: '', description: '', venue: '', when: '', capacity: 100 })
  const now = Date.now()
  const lists = {
    upcoming: db.events.filter((e) => e.startsAt > now),
    mine: db.events.filter((e) => e.rsvps.includes(user.id)),
    past: db.events.filter((e) => e.startsAt <= now),
  }
  const toggle = (id: string) => update((d) => { const e = d.events.find((x) => x.id === id)!; e.rsvps = e.rsvps.includes(user.id) ? e.rsvps.filter((x) => x !== user.id) : [...e.rsvps, user.id] })
  const create = () => {
    if (!draft.title || !draft.when) return
    update((d) => { d.events.push({ id: uid('e'), title: draft.title, description: draft.description, venue: draft.venue, startsAt: new Date(draft.when).getTime(), capacity: draft.capacity, rsvps: [] }) })
    notify(db.users.filter((u) => u.role === 'student').map((u) => u.id), `New event: ${draft.title}`, '/events')
    setCreating(false)
  }

  return (
    <>
      <PageHeader title="Events" subtitle="What's happening on campus" actions={can(user, 'createEvents') && <button className="btn" onClick={() => setCreating(true)}><CalendarPlus size={14} /> Create event</button>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'upcoming', label: 'Upcoming', count: lists.upcoming.length }, { id: 'mine', label: 'My RSVPs', count: lists.mine.length }, { id: 'past', label: 'Past' }]} />
      {lists[tab].length === 0 && <Card><Empty text="No events here." /></Card>}
      <div className="grid grid-3">
        {lists[tab].sort((a, b) => a.startsAt - b.startsAt).map((e) => {
          const going = e.rsvps.includes(user.id)
          const full = e.rsvps.length >= e.capacity
          return (
            <Card key={e.id}>
              <div className="stack">
                <div className="row gap">
                  <div style={{ textAlign: 'center', width: 52, background: 'var(--brand)', color: '#fff', borderRadius: 8, padding: '6px 0' }}>
                    <div style={{ fontWeight: 700, fontSize: 20, lineHeight: 1 }}>{new Date(e.startsAt).getDate()}</div>
                    <div className="small">{new Date(e.startsAt).toLocaleString('en-IN', { month: 'short' })}</div>
                  </div>
                  <div className="grow"><h3>{e.title}</h3>{e.clubId && <span className="small muted">{db.clubs.find((c) => c.id === e.clubId)?.name}</span>}</div>
                </div>
                <p className="small">{e.description}</p>
                <div className="small muted row gap"><MapPin size={14} /> {e.venue} · {fmtDateTime(e.startsAt)}</div>
                <div><div className="row between small"><span>{e.rsvps.length} going</span><span className="muted">{e.capacity} seats</span></div><Progress value={(e.rsvps.length / e.capacity) * 100} tone="brand" /></div>
                {e.startsAt > now && <button className={`btn ${going ? 'btn-outline' : ''}`} disabled={!going && full} onClick={() => toggle(e.id)}>{going ? 'Cancel RSVP' : full ? 'Full' : 'RSVP'}</button>}
              </div>
            </Card>
          )
        })}
      </div>
      {creating && (
        <Modal title="Create event" onClose={() => setCreating(false)} footer={<><button className="btn btn-ghost" onClick={() => setCreating(false)}>Cancel</button><button className="btn" onClick={create}>Create</button></>}>
          <Field label="Title"><input className="input" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></Field>
          <Field label="Description"><textarea className="textarea" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></Field>
          <div className="grid grid-2">
            <Field label="Venue"><input className="input" value={draft.venue} onChange={(e) => setDraft({ ...draft, venue: e.target.value })} /></Field>
            <Field label="Capacity"><input className="input" type="number" value={draft.capacity} onChange={(e) => setDraft({ ...draft, capacity: Number(e.target.value) })} /></Field>
          </div>
          <Field label="Date & time"><input className="input" type="datetime-local" value={draft.when} onChange={(e) => setDraft({ ...draft, when: e.target.value })} /></Field>
        </Modal>
      )}
    </>
  )
}

/* ---------------- Clubs ---------------- */
export function Clubs() {
  const db = useDB()
  const user = useCurrentUser()!
  const toggle = (id: string) => update((d) => { const c = d.clubs.find((x) => x.id === id)!; c.members = c.members.includes(user.id) ? c.members.filter((x) => x !== user.id) : [...c.members, user.id] })
  return (
    <>
      <PageHeader title="Clubs & Chapters" subtitle="Find your community on campus" />
      <div className="grid grid-2">
        {db.clubs.map((c) => {
          const member = c.members.includes(user.id)
          return (
            <Card key={c.id} title={c.name} action={member && <Badge tone="success">Member</Badge>}>
              <div className="stack">
                <p>{c.description}</p>
                <div className="small muted row gap"><Users size={14} /> {c.members.length} members · Advisor: {userName(db, c.facultyAdvisorId)}</div>
                <div className="small muted">{db.events.filter((e) => e.clubId === c.id && e.startsAt > Date.now()).length} upcoming events</div>
                {user.role === 'student' && <button className={`btn ${member ? 'btn-outline' : ''}`} onClick={() => toggle(c.id)}>{member ? 'Leave club' : 'Join club'}</button>}
              </div>
            </Card>
          )
        })}
      </div>
    </>
  )
}

/* ---------------- Polls & surveys ---------------- */
export function Polls() {
  const db = useDB()
  const user = useCurrentUser()!
  const [creating, setCreating] = useState(false)
  const [q, setQ] = useState('')
  const [opts, setOpts] = useState(['', ''])
  const vote = (pid: string, i: number) => update((d) => { d.polls.find((p) => p.id === pid)!.votes[user.id] = i })
  const create = () => {
    const o = opts.filter((x) => x.trim())
    if (!q.trim() || o.length < 2) return
    update((d) => { d.polls.unshift({ id: uid('pl'), question: q, options: o, votes: {}, createdBy: user.id, closesAt: Date.now() + 7 * 86_400_000 }) })
    setCreating(false); setQ(''); setOpts(['', ''])
  }
  return (
    <>
      <PageHeader title="Polls & Surveys" subtitle="Quick opinions from the campus community" actions={can(user, 'createPolls') && <button className="btn" onClick={() => setCreating(true)}><Plus size={14} /> New poll</button>} />
      <div className="grid grid-2">
        {db.polls.map((p) => {
          const total = Object.keys(p.votes).length
          const mine = p.votes[user.id]
          const closed = p.closesAt < Date.now()
          const showResults = mine !== undefined || closed || user.role !== 'student'
          return (
            <Card key={p.id} title={p.question} action={<Badge tone={closed ? 'neutral' : 'success'}>{closed ? 'Closed' : `Closes ${timeAgo(p.closesAt)}`}</Badge>}>
              <div className="stack" style={{ gap: 8 }}>
                {p.options.map((o, i) => {
                  const n = Object.values(p.votes).filter((v) => v === i).length
                  const pct = total ? Math.round((n / total) * 100) : 0
                  return showResults ? (
                    <div key={i}>
                      <div className="row between small"><span>{o} {mine === i && <Badge tone="brand">Your vote</Badge>}</span><span>{pct}% ({n})</span></div>
                      <Progress value={pct} tone={mine === i ? 'brand' : 'info'} />
                    </div>
                  ) : (
                    <button key={i} className="option" onClick={() => vote(p.id, i)}><Vote size={16} /> {o}</button>
                  )
                })}
                <span className="small muted">{total} votes · by {userName(db, p.createdBy)}</span>
              </div>
            </Card>
          )
        })}
      </div>
      {creating && (
        <Modal title="New poll" onClose={() => setCreating(false)} footer={<><button className="btn btn-ghost" onClick={() => setCreating(false)}>Cancel</button><button className="btn" onClick={create}>Publish</button></>}>
          <Field label="Question"><input className="input" value={q} onChange={(e) => setQ(e.target.value)} /></Field>
          {opts.map((o, i) => <input key={i} className="input" placeholder={`Option ${i + 1}`} value={o} onChange={(e) => setOpts(opts.map((x, k) => (k === i ? e.target.value : x)))} />)}
          <button className="btn btn-outline" onClick={() => setOpts([...opts, ''])}><Plus size={14} /> Add option</button>
        </Modal>
      )}
    </>
  )
}

