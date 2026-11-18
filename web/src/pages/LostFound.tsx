import { useState } from 'react'
import { Camera, Check, Link2, PackageSearch, Plus, Printer, Search, X } from 'lucide-react'
import { audit, getDB, notify, uid, update, useCurrentUser, useDB } from '../data/store'
import { Badge, Card, Empty, Field, Modal, PageHeader, Stat, Tabs } from '../components/ui'
import { FilterBar, opts, useFilters } from '../components/Filters'
import { deleteRecord, RecordEditor, RowActions } from '../components/RecordEditor'
import { can, officeUsers, personaLabel } from '../access'
import { fmtDate, fmtDateTime, matches, userName } from '../lib'
import { HOLD_DAYS, matchScore, nextTag, pastHold, suggestions } from '../lostfound'
import type { LFCategory, LostFoundItem } from '../data/types'

export const LF_CATEGORIES: LFCategory[] = ['Electronics', 'ID / cards', 'Wallet / money', 'Keys', 'Books / notes', 'Bag', 'Clothing', 'Bottle / tiffin', 'Jewellery / watch', 'Other']
const STATUS_TONE = { OPEN: 'warning', MATCHED: 'info', RETURNED: 'success', CLOSED: 'neutral', DISPOSED: 'neutral' } as const
const STATUS_LABEL = { OPEN: 'Open', MATCHED: 'Possible match', RETURNED: 'Returned', CLOSED: 'Closed', DISPOSED: 'Donated / disposed' }
const today = () => new Date().toISOString().slice(0, 10)

/** Shrink a photo to a small JPEG so it can be stored with the record. */
function shrink(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image(); const url = URL.createObjectURL(file)
    img.onload = () => {
      const k = Math.min(1, 480 / Math.max(img.width, img.height))
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); resolve(c.toDataURL('image/jpeg', 0.72))
    }
    img.onerror = reject; img.src = url
  })
}

export default function LostFound() {
  const db = useDB()
  const me = useCurrentUser()!
  const desk = can(me, 'manageLostFound')
  const [tab, setTab] = useState<'found' | 'lost' | 'mine' | 'desk' | 'claims'>(desk ? 'claims' : 'found')
  const [q, setQ] = useState('')
  const [report, setReport] = useState<Partial<LostFoundItem> | null>(null)
  const [claimFor, setClaimFor] = useState<LostFoundItem | null>(null)
  const [view, setView] = useState<string | null>(null)
  const f = useFilters(['category', 'status', 'place'] as const)
  const items = db.lostFound.filter((x) => f.ok('category', x.category) && f.ok('status', x.status) && f.ok('place', x.location) && matches(q, x.title, x.description, x.location, x.color, x.tagNo, x.category, userName(db, x.reportedBy)))
  const openFound = items.filter((x) => x.kind === 'FOUND' && (x.status === 'OPEN' || x.status === 'MATCHED')).sort((a, b) => b.createdAt - a.createdAt)
  const openLost = items.filter((x) => x.kind === 'LOST' && (x.status === 'OPEN' || x.status === 'MATCHED')).sort((a, b) => b.createdAt - a.createdAt)
  const mine = db.lostFound.filter((x) => x.reportedBy === me.id || x.claims.some((c) => c.claimantId === me.id)).sort((a, b) => b.createdAt - a.createdAt)
  const pendingClaims = db.lostFound.flatMap((x) => x.claims.filter((c) => c.status === 'PENDING').map((c) => ({ x, c })))
  const defs = [
    { key: 'category' as const, label: 'Categories', options: LF_CATEGORIES.map((c) => ({ value: c, label: c })) },
    { key: 'status' as const, label: 'Statuses', options: (Object.keys(STATUS_LABEL) as (keyof typeof STATUS_LABEL)[]).map((k) => ({ value: k, label: STATUS_LABEL[k] })), hidden: tab === 'found' || tab === 'lost' },
    { key: 'place' as const, label: 'Places', options: opts(db.lostFound.map((x) => x.location)) },
  ]
  const v = view ? db.lostFound.find((x) => x.id === view) : null

  return (
    <>
      <PageHeader title="Lost & Found" subtitle={desk ? 'Log items handed in, match them with lost reports, verify claims and hand items back' : 'Report something you lost or found, browse found items and claim yours'}
        search={{ value: q, onChange: setQ, placeholder: 'Search item, colour, place, tag no…' }}
        actions={<><button className="btn btn-outline" onClick={() => setReport({ kind: 'LOST', date: today(), category: 'Electronics' })}><Search size={14} /> I lost something</button><button className="btn" onClick={() => setReport({ kind: 'FOUND', date: today(), category: 'Electronics', heldByOffice: desk })}><Plus size={14} /> I found something</button></>} />
      <div className="grid grid-4">
        <Stat label="Found items waiting" value={db.lostFound.filter((x) => x.kind === 'FOUND' && (x.status === 'OPEN' || x.status === 'MATCHED')).length} icon={<PackageSearch size={22} />} />
        <Stat label="Lost reports open" value={db.lostFound.filter((x) => x.kind === 'LOST' && (x.status === 'OPEN' || x.status === 'MATCHED')).length} tone="warning" />
        <Stat label="Returned to owners" value={db.lostFound.filter((x) => x.status === 'RETURNED').length} tone="success" />
        <Stat label={desk ? 'Claims to verify' : 'My reports & claims'} value={desk ? pendingClaims.length : mine.length} tone="info" />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[
        ...(desk ? [{ id: 'claims' as const, label: 'Claims to verify', count: pendingClaims.length }, { id: 'desk' as const, label: 'All records', count: db.lostFound.length }] : []),
        { id: 'found', label: 'Found items', count: openFound.length }, { id: 'lost', label: 'Lost reports', count: openLost.length }, { id: 'mine', label: 'My reports & claims', count: mine.length },
      ]} />
      <FilterBar defs={defs} f={f} />

      {(tab === 'found' || tab === 'lost') && (
        (tab === 'found' ? openFound : openLost).length === 0 ? <Card><Empty icon={<PackageSearch />} text={tab === 'found' ? 'No found items waiting.' : 'No open lost reports.'} /></Card> : (
          <div className="lf-grid">{(tab === 'found' ? openFound : openLost).map((x) => (
            <ItemCard key={x.id} x={x} onOpen={() => setView(x.id)}
              action={x.kind === 'FOUND' ? (x.reportedBy !== me.id && !x.claims.some((c) => c.claimantId === me.id) ? <button className="btn btn-sm" onClick={() => setClaimFor(x)}>This is mine</button> : x.claims.some((c) => c.claimantId === me.id) ? <Badge tone="info">Claim sent</Badge> : null)
                : x.reportedBy !== me.id ? <button className="btn btn-outline btn-sm" onClick={() => setReport({ kind: 'FOUND', date: today(), category: x.category, title: x.title, color: x.color, heldByOffice: desk, matchedWith: x.id })}>I found this</button> : null} />
          ))}</div>
        )
      )}

      {tab === 'mine' && (mine.length === 0 ? <Card><Empty text="You have not reported or claimed anything." /></Card> : (
        <div className="stack">{mine.map((x) => { const my = x.claims.find((c) => c.claimantId === me.id); const sug = x.reportedBy === me.id && (x.status === 'OPEN' || x.status === 'MATCHED') ? suggestions(db, x) : []; return (
          <Card key={x.id}>
            <div className="row gap wrap" style={{ alignItems: 'flex-start' }}>
              <Thumb x={x} />
              <div className="grow stack" style={{ gap: 4 }}>
                <div className="row gap wrap"><strong>{x.title}</strong><Badge tone={x.kind === 'LOST' ? 'danger' : 'success'}>{x.kind === 'LOST' ? 'Lost' : 'Found'}</Badge><Badge tone={STATUS_TONE[x.status]}>{STATUS_LABEL[x.status]}</Badge>{x.tagNo && <Badge>{x.tagNo}</Badge>}</div>
                <span className="small muted">{x.category} · {x.location} · {fmtDate(x.date)}</span>
                {my && <span className="small">Your claim: <Badge tone={my.status === 'APPROVED' ? 'success' : my.status === 'REJECTED' ? 'danger' : 'warning'}>{my.status.toLowerCase()}</Badge>{my.status === 'APPROVED' && x.status !== 'RETURNED' ? ` · collect it from ${x.storage ?? 'the Lost & Found desk'} with your ID card (tag ${x.tagNo})` : ''}{my.note ? ` · ${my.note}` : ''}</span>}
                {x.handover && <span className="small">Handed over {fmtDateTime(x.handover.at)} by {userName(db, x.handover.by)}</span>}
                {sug.length > 0 && <div className="alert alert-info small">Possible match{sug.length > 1 ? 'es' : ''}: {sug.slice(0, 3).map((m) => <button key={m.x.id} className="link-btn" onClick={() => setView(m.x.id)}><strong>{m.x.title}</strong> ({m.x.location}, {fmtDate(m.x.date)})</button>)}</div>}
              </div>
              {x.reportedBy === me.id && x.kind === 'LOST' && (x.status === 'OPEN' || x.status === 'MATCHED') && <button className="btn btn-ghost btn-sm" onClick={() => { update((d) => { const y = d.lostFound.find((z) => z.id === x.id)!; y.status = 'CLOSED'; y.closedNote = 'Owner found it' }); audit(me.id, 'LF_CLOSE', x.title) }}>I got it back</button>}
            </div>
          </Card>
        ) })}</div>
      ))}

      {tab === 'claims' && desk && (pendingClaims.length === 0 ? <Card><Empty text="No claims waiting." /></Card> : (
        <div className="stack">{pendingClaims.map(({ x, c }) => <ClaimRow key={c.id} x={x} claimId={c.id} />)}</div>
      ))}

      {tab === 'desk' && desk && <DeskTable items={items} onOpen={setView} />}

      {report && <ReportModal draft={report} onClose={() => setReport(null)} onSaved={(id) => { setReport(null); setView(id) }} />}
      {claimFor && <ClaimModal item={claimFor} onClose={() => setClaimFor(null)} />}
      {v && <ItemModal x={v} onClose={() => setView(null)} onClaim={() => { setView(null); setClaimFor(v) }} />}
    </>
  )
}

function Thumb({ x }: { x: LostFoundItem }) {
  return x.photo ? <img className="lf-thumb" src={x.photo} alt={x.title} /> : <div className="lf-thumb lf-thumb-empty"><PackageSearch size={22} /></div>
}

function ItemCard({ x, onOpen, action }: { x: LostFoundItem; onOpen: () => void; action: React.ReactNode }) {
  const db = useDB()
  return (
    <div className="card lf-card">
      <button className="link-btn" onClick={onOpen} aria-label={`Open ${x.title}`}>{x.photo ? <img className="lf-photo" src={x.photo} alt={x.title} /> : <div className="lf-photo lf-thumb-empty"><PackageSearch size={30} /></div>}</button>
      <div className="stack" style={{ gap: 4, padding: 12 }}>
        <div className="row between gap"><button className="link-btn" onClick={onOpen}><strong>{x.title}</strong></button>{x.status === 'MATCHED' && <Badge tone="info">Possible match</Badge>}</div>
        <span className="small muted">{x.category}{x.color ? ` · ${x.color}` : ''}</span>
        <span className="small">{x.kind === 'FOUND' ? 'Found' : 'Lost'} at {x.location} · {fmtDate(x.date)}</span>
        {x.kind === 'FOUND' ? <span className="small muted">{x.heldByOffice ? `At the Lost & Found desk${x.tagNo ? ` · ${x.tagNo}` : ''}` : `With ${userName(db, x.reportedBy)}`}</span> : <span className="small muted">Reported by {userName(db, x.reportedBy)}</span>}
        <div className="row gap">{action}</div>
      </div>
    </div>
  )
}

/** Report a lost or found item; similar open reports of the other kind are suggested and their owners told. */
function ReportModal({ draft, onClose, onSaved }: { draft: Partial<LostFoundItem>; onClose: () => void; onSaved: (id: string) => void }) {
  const db = useDB()
  const me = useCurrentUser()!
  const desk = can(me, 'manageLostFound')
  const [x, setX] = useState<Partial<LostFoundItem>>(draft)
  const [busy, setBusy] = useState(false)
  const set = (p: Partial<LostFoundItem>) => setX({ ...x, ...p })
  const lost = x.kind === 'LOST'
  const preview = x.title ? suggestions(db, { id: '_', claims: [], status: 'OPEN', createdAt: Date.now(), reportedBy: me.id, description: '', location: '', ...x } as LostFoundItem, 40).slice(0, 3) : []
  const save = () => {
    if (!x.title?.trim() || !x.location?.trim() || !x.date) return alert('Enter what it is, where and when.')
    if (x.date > today()) return alert('The date cannot be in the future.')
    const id = uid('lf')
    const held = !lost && !!x.heldByOffice
    const rec: LostFoundItem = { id, kind: x.kind!, title: x.title.trim(), category: x.category ?? 'Other', description: x.description?.trim() ?? '', color: x.color?.trim() || undefined, location: x.location.trim(), date: x.date, reportedBy: me.id, photo: x.photo, status: x.matchedWith ? 'MATCHED' : 'OPEN', heldByOffice: held, tagNo: held ? nextTag(db) : undefined, storage: held ? x.storage || 'Security desk' : undefined, matchedWith: x.matchedWith, claims: [], createdAt: Date.now() }
    update((d) => { d.lostFound.push(rec); if (rec.matchedWith) { const o = d.lostFound.find((y) => y.id === rec.matchedWith); if (o) { o.status = 'MATCHED'; o.matchedWith = id } } })
    const office = [...new Set([...officeUsers(db, 'facilities'), ...officeUsers(db, 'studentAffairs')])].filter((u) => u !== me.id)
    notify(office, `${lost ? 'Lost' : 'Found'} item reported: ${rec.title} (${rec.location}) by ${me.name}${held ? `, tag ${rec.tagNo}` : ''}`, '/lost-found')
    const best = suggestions(getDB(), rec)
    // Owners of similar lost reports hear about a found item; a lost report shows similar found items.
    if (!lost) for (const m of best) notify([m.x.reportedBy], `An item like your lost “${m.x.title}” was found: ${rec.title} at ${rec.location}. Open Lost & Found to claim it.`, '/lost-found')
    if (rec.matchedWith) { const o = db.lostFound.find((y) => y.id === rec.matchedWith); if (o) notify([o.reportedBy], `Someone found an item matching your lost “${o.title}”. Open Lost & Found.`, '/lost-found') }
    audit(me.id, lost ? 'LF_LOST_REPORT' : 'LF_FOUND_REPORT', `${rec.title} · ${rec.location}${rec.tagNo ? ` · ${rec.tagNo}` : ''}`)
    onSaved(id)
  }
  return (
    <Modal wide title={lost ? 'Report a lost item' : 'Report a found item'} onClose={onClose} footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn" disabled={busy} onClick={save}>{lost ? 'Report lost item' : 'Report found item'}</button></>}>
      <div className="row gap"><button className={`chip ${lost ? 'active' : ''}`} onClick={() => set({ kind: 'LOST', heldByOffice: undefined })}>I lost it</button><button className={`chip ${!lost ? 'active' : ''}`} onClick={() => set({ kind: 'FOUND', heldByOffice: desk })}>I found it</button></div>
      <div className="grid grid-2">
        <Field label="What is it?"><input className="input" value={x.title ?? ''} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Black Redmi phone, blue water bottle" /></Field>
        <Field label="Category"><select className="select" value={x.category} onChange={(e) => set({ category: e.target.value as LFCategory })}>{LF_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Colour"><input className="input" value={x.color ?? ''} onChange={(e) => set({ color: e.target.value })} /></Field>
        <Field label={lost ? 'When did you lose it?' : 'When did you find it?'}><input className="input" type="date" max={today()} value={x.date ?? ''} onChange={(e) => set({ date: e.target.value })} /></Field>
      </div>
      <Field label={lost ? 'Where did you last have it?' : 'Where did you find it?'}><input className="input" value={x.location ?? ''} onChange={(e) => set({ location: e.target.value })} placeholder="e.g. Library 1st floor, Lab-3, canteen" /></Field>
      <Field label={lost ? 'Description (marks, contents, stickers)' : 'Description (do not reveal everything: keep a detail to check the owner)'}><textarea className="textarea" value={x.description ?? ''} onChange={(e) => set({ description: e.target.value })} /></Field>
      <Field label="Photo (optional)"><label className="row gap" style={{ cursor: 'pointer' }}><span className="btn btn-outline btn-sm"><Camera size={14} /> {x.photo ? 'Change photo' : 'Add photo'}</span><input type="file" accept="image/*" style={{ display: 'none' }} onChange={async (e) => { const fl = e.target.files?.[0]; if (!fl) return; setBusy(true); try { set({ photo: await shrink(fl) }) } catch { alert('Could not read that image.') } setBusy(false) }} />{x.photo && <img className="lf-thumb" src={x.photo} alt="" />}</label></Field>
      {!lost && (
        <label className="row gap"><input type="checkbox" checked={!!x.heldByOffice} onChange={(e) => set({ heldByOffice: e.target.checked })} /> {desk ? 'Item is kept at the Lost & Found desk (gets a tag number)' : 'I have handed it in at the Lost & Found / security desk'}</label>
      )}
      {!lost && desk && x.heldByOffice && <Field label="Stored at"><input className="input" value={x.storage ?? ''} onChange={(e) => set({ storage: e.target.value })} placeholder="Security desk · Locker 3" /></Field>}
      {preview.length > 0 && <div className="alert alert-info small">Looks similar to: {preview.map((m) => `${m.x.title} (${m.x.kind === 'FOUND' ? 'found' : 'lost'} at ${m.x.location}, ${fmtDate(m.x.date)})`).join(' · ')}{lost ? '. You can claim it after reporting.' : '. The owner will be told.'}</div>}
    </Modal>
  )
}

function ClaimModal({ item, onClose }: { item: LostFoundItem; onClose: () => void }) {
  const db = useDB()
  const me = useCurrentUser()!
  const [msg, setMsg] = useState('')
  const send = () => {
    if (msg.trim().length < 15) return alert('Describe something only the owner would know (a mark, the contents, where you lost it).')
    update((d) => { d.lostFound.find((x) => x.id === item.id)!.claims.push({ id: uid('lfc'), claimantId: me.id, message: msg.trim(), status: 'PENDING', at: Date.now() }) })
    notify([...new Set([...officeUsers(db, 'facilities'), ...officeUsers(db, 'studentAffairs')]), ...(item.heldByOffice ? [] : [item.reportedBy])], `Claim for “${item.title}”${item.tagNo ? ` (${item.tagNo})` : ''} by ${me.name}`, '/lost-found')
    audit(me.id, 'LF_CLAIM', item.title)
    onClose()
  }
  return (
    <Modal title={`Claim: ${item.title}`} onClose={onClose} footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn" onClick={send}>Send claim</button></>}>
      <p className="small muted">The Lost & Found desk checks your claim. Bring your university ID card when you collect it.</p>
      <Field label="Proof that it is yours"><textarea className="textarea" value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="e.g. My initials A.R. are scratched on the cap; I left it in Lab-3 on Friday afternoon." /></Field>
    </Modal>
  )
}

/** Desk: approve or reject a claim; approving another claim on the same item is blocked. */
function ClaimRow({ x, claimId }: { x: LostFoundItem; claimId: string }) {
  const db = useDB()
  const me = useCurrentUser()!
  const c = x.claims.find((y) => y.id === claimId)!
  const u = db.users.find((y) => y.id === c.claimantId)
  const [note, setNote] = useState('')
  const decide = (status: 'APPROVED' | 'REJECTED') => {
    if (status === 'APPROVED' && x.claims.some((y) => y.status === 'APPROVED')) return alert('Another claim on this item is already approved.')
    update((d) => { const y = d.lostFound.find((z) => z.id === x.id)!; const cc = y.claims.find((z) => z.id === claimId)!; cc.status = status; cc.decidedBy = me.id; cc.note = note.trim() || undefined; if (status === 'APPROVED') y.status = 'MATCHED' })
    notify([c.claimantId], status === 'APPROVED' ? `Your claim for “${x.title}” is approved. Collect it from ${x.storage ?? 'the Lost & Found desk'} with your ID card${x.tagNo ? ` (tag ${x.tagNo})` : ''}.` : `Your claim for “${x.title}” was not approved${note.trim() ? `: ${note.trim()}` : ''}.`, '/lost-found')
    audit(me.id, `LF_CLAIM_${status}`, `${x.title} · ${u?.name}`)
  }
  return (
    <Card>
      <div className="row gap wrap" style={{ alignItems: 'flex-start' }}>
        <Thumb x={x} />
        <div className="grow stack" style={{ gap: 4 }}>
          <div className="row gap wrap"><strong>{x.title}</strong>{x.tagNo && <Badge>{x.tagNo}</Badge>}<span className="small muted">{x.category}{x.color ? ` · ${x.color}` : ''} · found at {x.location}, {fmtDate(x.date)}</span></div>
          <div className="small muted">Item description: {x.description || '—'}</div>
          <div><strong>{u?.name}</strong> <span className="small muted">{u && personaLabel(u)} · {u?.rollNo ?? u?.email}{u?.phone ? ` · ${u.phone}` : ''} · {fmtDateTime(c.at)}</span></div>
          <div className="lf-proof">“{c.message}”</div>
          {db.lostFound.filter((y) => y.kind === 'LOST' && y.reportedBy === c.claimantId).map((y) => <div key={y.id} className="small">Their lost report: <strong>{y.title}</strong> ({y.location}, {fmtDate(y.date)}) · match {matchScore(x, y)}%</div>)}
          <input className="input" placeholder="Note to the claimant (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="stack" style={{ gap: 6 }}>
          <button className="btn btn-success btn-sm" onClick={() => decide('APPROVED')}><Check size={12} /> Approve</button>
          <button className="btn btn-ghost btn-sm" onClick={() => decide('REJECTED')}><X size={12} /> Reject</button>
        </div>
      </div>
    </Card>
  )
}

function DeskTable({ items, onOpen }: { items: LostFoundItem[]; onOpen: (id: string) => void }) {
  const db = useDB()
  const me = useCurrentUser()!
  const [edit, setEdit] = useState<LostFoundItem | null>(null)
  const old = db.lostFound.filter(pastHold)
  return (
    <>
      {old.length > 0 && <div className="alert alert-warning">{old.length} found item(s) unclaimed for over {HOLD_DAYS} days: {old.map((x) => `${x.title} (${x.tagNo ?? 'no tag'})`).join(', ')}. You can donate or dispose of them from the item.</div>}
      <Card>
        <div className="table-wrap"><table>
          <thead><tr><th>Item</th><th>Type</th><th>Where / when</th><th>Reported by</th><th>Kept at</th><th>Claims</th><th>Status</th><th /></tr></thead>
          <tbody>{[...items].sort((a, b) => b.createdAt - a.createdAt).map((x) => (
            <tr key={x.id}>
              <td><button className="link-btn" onClick={() => onOpen(x.id)}><strong>{x.title}</strong></button><div className="small muted">{x.category}{x.color ? ` · ${x.color}` : ''}</div></td>
              <td><Badge tone={x.kind === 'LOST' ? 'danger' : 'success'}>{x.kind === 'LOST' ? 'Lost' : 'Found'}</Badge></td>
              <td className="small">{x.location}<div className="muted">{fmtDate(x.date)}</div></td>
              <td className="small">{userName(db, x.reportedBy)}</td>
              <td className="small">{x.tagNo ? <><strong>{x.tagNo}</strong><div className="muted">{x.storage}</div></> : x.kind === 'FOUND' ? 'With finder' : '—'}</td>
              <td>{x.claims.length ? <Badge tone={x.claims.some((c) => c.status === 'PENDING') ? 'warning' : 'neutral'}>{x.claims.length}</Badge> : '—'}</td>
              <td><Badge tone={STATUS_TONE[x.status]}>{STATUS_LABEL[x.status]}</Badge>{pastHold(x) && <div><Badge tone="danger">Past {HOLD_DAYS} days</Badge></div>}</td>
              <td><RowActions label={x.title} onEdit={() => setEdit(x)} onDelete={() => deleteRecord('lostFound', x.id, `${x.kind.toLowerCase()} item “${x.title}”`, me.id)} /></td>
            </tr>
          ))}</tbody>
        </table></div>
      </Card>
      {edit && <RecordEditor title={`Edit ${edit.title}`} collection="lostFound" record={edit} actorId={me.id} onClose={() => setEdit(null)} fields={[{ key: 'title', label: 'Item', required: true }, { key: 'category', label: 'Category', type: 'select', options: LF_CATEGORIES.map((c) => ({ value: c, label: c })) }, { key: 'color', label: 'Colour' }, { key: 'location', label: 'Place' }, { key: 'date', label: 'Date (YYYY-MM-DD)' }, { key: 'tagNo', label: 'Tag no.' }, { key: 'storage', label: 'Stored at' }, { key: 'status', label: 'Status', type: 'select', options: (Object.keys(STATUS_LABEL) as (keyof typeof STATUS_LABEL)[]).map((k) => ({ value: k, label: STATUS_LABEL[k] })) }, { key: 'description', label: 'Description', type: 'textarea' }]} />}
    </>
  )
}

/** One item in full: details, photo, matches, claims; the desk hands it over, links matches or closes it. */
function ItemModal({ x, onClose, onClaim }: { x: LostFoundItem; onClose: () => void; onClaim: () => void }) {
  const db = useDB()
  const me = useCurrentUser()!
  const desk = can(me, 'manageLostFound')
  const [hand, setHand] = useState<{ to: string; idChecked: string; remarks: string } | null>(null)
  const [receipt, setReceipt] = useState(false)
  const sug = suggestions(db, x, 40)
  const approved = x.claims.find((c) => c.status === 'APPROVED')
  const link = (otherId: string) => {
    update((d) => { const a = d.lostFound.find((y) => y.id === x.id)!, b = d.lostFound.find((y) => y.id === otherId)!; a.status = 'MATCHED'; b.status = 'MATCHED'; a.matchedWith = b.id; b.matchedWith = a.id })
    const lost = x.kind === 'LOST' ? x : db.lostFound.find((y) => y.id === otherId)!
    const found = x.kind === 'FOUND' ? x : db.lostFound.find((y) => y.id === otherId)!
    notify([lost.reportedBy], `Your lost “${lost.title}” may have been found (${found.tagNo ?? found.title}). Claim it in Lost & Found or visit the desk with proof.`, '/lost-found')
    audit(me.id, 'LF_LINK', `${lost.title} ↔ ${found.title}`)
  }
  const handOver = () => {
    if (!hand?.to || !hand.idChecked.trim()) return alert('Choose who collected it and record how their identity was checked.')
    update((d) => {
      const y = d.lostFound.find((z) => z.id === x.id)!; y.status = 'RETURNED'; y.handover = { to: hand.to, at: Date.now(), by: me.id, idChecked: hand.idChecked.trim(), remarks: hand.remarks.trim() || undefined }
      // The owner's lost report is closed too.
      for (const l of d.lostFound) if (l.kind === 'LOST' && (l.id === y.matchedWith || l.reportedBy === hand.to) && (l.status === 'OPEN' || l.status === 'MATCHED') && matchScore(y, l) >= 40) { l.status = 'RETURNED'; l.closedNote = `Returned via ${y.tagNo ?? y.title}` }
    })
    notify([hand.to], `“${x.title}” was handed over to you. Thank you for your patience.`, '/lost-found')
    if (x.reportedBy !== me.id && x.reportedBy !== hand.to) notify([x.reportedBy], `The “${x.title}” you found has been returned to its owner. Thank you!`, '/lost-found')
    audit(me.id, 'LF_HANDOVER', `${x.tagNo ?? x.title} → ${userName(db, hand.to)} (${hand.idChecked})`)
    setHand(null); setReceipt(true)
  }
  const dispose = (how: 'Donated' | 'Disposed') => {
    if (!confirm(`${how} “${x.title}”? It will be closed.`)) return
    update((d) => { const y = d.lostFound.find((z) => z.id === x.id)!; y.status = 'DISPOSED'; y.closedNote = `${how} on ${fmtDate(Date.now())} by ${me.name}` })
    audit(me.id, 'LF_DISPOSE', `${x.tagNo ?? x.title}: ${how}`)
  }
  const people = db.users.filter((u) => u.role !== 'parent')
  return (
    <Modal wide title={x.title} onClose={onClose} footer={<>
      {x.kind === 'FOUND' && x.reportedBy !== me.id && !desk && (x.status === 'OPEN' || x.status === 'MATCHED') && !x.claims.some((c) => c.claimantId === me.id) && <button className="btn" onClick={onClaim}>This is mine</button>}
      {desk && x.kind === 'FOUND' && (x.status === 'OPEN' || x.status === 'MATCHED') && <><button className="btn btn-ghost" onClick={() => dispose('Donated')}>Donate</button><button className="btn btn-ghost" onClick={() => dispose('Disposed')}>Dispose</button><button className="btn btn-success" onClick={() => setHand({ to: approved?.claimantId ?? '', idChecked: '', remarks: '' })}>Hand over</button></>}
      {x.handover && <button className="btn btn-outline" onClick={() => setReceipt(true)}><Printer size={14} /> Handover receipt</button>}
    </>}>
      <div className="row gap wrap" style={{ alignItems: 'flex-start' }}>
        {x.photo && <img className="lf-big" src={x.photo} alt={x.title} />}
        <table className="grow"><tbody>
          <tr><td className="muted">Type</td><td><Badge tone={x.kind === 'LOST' ? 'danger' : 'success'}>{x.kind === 'LOST' ? 'Lost' : 'Found'}</Badge> <Badge tone={STATUS_TONE[x.status]}>{STATUS_LABEL[x.status]}</Badge></td></tr>
          <tr><td className="muted">Category</td><td>{x.category}{x.color ? ` · ${x.color}` : ''}</td></tr>
          <tr><td className="muted">{x.kind === 'LOST' ? 'Lost at' : 'Found at'}</td><td>{x.location} · {fmtDate(x.date)}</td></tr>
          <tr><td className="muted">Reported by</td><td>{userName(db, x.reportedBy)} · {fmtDateTime(x.createdAt)}</td></tr>
          {x.kind === 'FOUND' && <tr><td className="muted">Kept</td><td>{x.heldByOffice ? `${x.storage ?? 'Lost & Found desk'}${x.tagNo ? ` · tag ${x.tagNo}` : ''}` : `With the finder (${userName(db, x.reportedBy)})`}</td></tr>}
          {(desk || x.reportedBy === me.id) && x.description && <tr><td className="muted">Description</td><td>{x.description}</td></tr>}
          {x.handover && <tr><td className="muted">Handed over</td><td>to {userName(db, x.handover.to)} on {fmtDateTime(x.handover.at)} by {userName(db, x.handover.by)} · ID: {x.handover.idChecked}</td></tr>}
          {x.closedNote && <tr><td className="muted">Note</td><td>{x.closedNote}</td></tr>}
        </tbody></table>
      </div>
      {desk && x.claims.length > 0 && <div className="small"><strong>Claims:</strong> {x.claims.map((c) => `${userName(db, c.claimantId)} (${c.status.toLowerCase()})`).join(', ')}</div>}
      {(desk || x.reportedBy === me.id) && sug.length > 0 && (x.status === 'OPEN' || x.status === 'MATCHED') && (
        <Card title={`Possible ${x.kind === 'LOST' ? 'found items' : 'owners'}`}>
          <div className="list">{sug.slice(0, 4).map((m) => (
            <div key={m.x.id} className="list-item"><Thumb x={m.x} /><div className="grow"><strong>{m.x.title}</strong><div className="small muted">{m.x.location} · {fmtDate(m.x.date)} · {userName(db, m.x.reportedBy)}</div></div><Badge tone={m.score >= 70 ? 'success' : 'info'}>{m.score}% match</Badge>{desk && x.matchedWith !== m.x.id && <button className="btn btn-ghost btn-sm" onClick={() => link(m.x.id)}><Link2 size={12} /> Link</button>}</div>
          ))}</div>
        </Card>
      )}
      {hand && (
        <Card title="Hand over to the owner">
          <div className="grid grid-2">
            <Field label="Collected by"><select className="select" value={hand.to} onChange={(e) => setHand({ ...hand, to: e.target.value })}><option value="">Choose…</option>{approved && <option value={approved.claimantId}>{userName(db, approved.claimantId)} (approved claim)</option>}{people.filter((u) => u.id !== approved?.claimantId).map((u) => <option key={u.id} value={u.id}>{u.name} · {u.rollNo ?? personaLabel(u)}</option>)}</select></Field>
            <Field label="Identity checked with"><input className="input" value={hand.idChecked} onChange={(e) => setHand({ ...hand, idChecked: e.target.value })} placeholder="University ID card no. / matched photo" /></Field>
          </div>
          <Field label="Remarks"><input className="input" value={hand.remarks} onChange={(e) => setHand({ ...hand, remarks: e.target.value })} /></Field>
          <div className="row gap"><button className="btn btn-success" onClick={handOver}>Confirm handover</button><button className="btn btn-ghost" onClick={() => setHand(null)}>Cancel</button></div>
        </Card>
      )}
      {receipt && x.handover && (() => { const h = db.lostFound.find((y) => y.id === x.id)!.handover!; return (
        <div className="receipt print-area">
          <div className="row between"><strong>Campus Portal University · Lost & Found</strong><span>{x.tagNo}</span></div>
          <div className="small">Handover receipt · {new Date(h.at).toLocaleString('en-IN')}</div>
          <p>Item: <strong>{x.title}</strong> ({x.category}) found at {x.location} on {fmtDate(x.date)}.</p>
          <p>Received by <strong>{userName(db, h.to)}</strong> ({db.users.find((u) => u.id === h.to)?.rollNo ?? ''}); identity checked: {h.idChecked}. Handed over by {userName(db, h.by)}.</p>
          <div className="row between small" style={{ marginTop: 18 }}><span>Owner's signature</span><span>Lost & Found desk</span></div>
          <button className="btn btn-outline btn-sm no-print" onClick={() => window.print()}><Printer size={12} /> Print</button>
        </div>
      ) })()}
    </Modal>
  )
}
