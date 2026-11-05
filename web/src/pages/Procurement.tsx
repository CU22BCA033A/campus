import { useState } from 'react'
import { PackageCheck, Plus, ShoppingCart } from 'lucide-react'
import { audit, notify, uid, update, useCurrentUser, useDB } from '../data/store'
import { Badge, Card, Empty, Field, Modal, PageHeader, Stat, Tabs } from '../components/ui'
import { approvalChain, fmtDate, inr, userName, matches } from '../lib'
import { can, officeUsers, persona } from '../access'
import type { Asset, Office, PRStatus, PurchaseRequest, User } from '../data/types'

const CATS: PurchaseRequest['category'][] = ['IT Equipment', 'Furniture', 'Lab Equipment', 'Stationery', 'Sports']
const HOD_OF: Record<string, string> = { 'Computer Applications': 'f2', Mathematics: 'f3' }
const statusFor: Record<string, PRStatus> = { HOD: 'PENDING_HOD', Finance: 'PENDING_FINANCE', Registrar: 'PENDING_REGISTRAR' }
const tone = (s: PRStatus) => (s === 'REJECTED' ? 'danger' : s === 'RECEIVED' ? 'success' : s === 'APPROVED' || s === 'PO_ISSUED' ? 'info' : 'warning')
const total = (p: PurchaseRequest) => p.quantity * p.unitCost

/** Who may act on the current approval level. */
function canApprove(p: PurchaseRequest, user: User) {
  if (p.status === 'PENDING_HOD') return HOD_OF[p.department] === user.id || persona(user) === 'super'
  if (p.status === 'PENDING_FINANCE') return can(user, 'approvePurchaseFinance')
  if (p.status === 'PENDING_REGISTRAR') return can(user, 'approvePurchaseRegistrar')
  return false
}
const NEXT_OFFICE: Record<string, Office> = { Finance: 'finance', Registrar: 'registrar' }

export default function Procurement() {
  const db = useDB()
  const user = useCurrentUser()!
  const isAdmin = can(user, 'issuePurchaseOrder')
  const canAssets = can(user, 'manageAssets')
  const seesAll = isAdmin || can(user, 'approvePurchaseRegistrar')
  const [tab, setTab] = useState<'requests' | 'assets'>('requests')
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState({ title: '', category: 'IT Equipment' as PurchaseRequest['category'], quantity: 1, unitCost: 0, vendor: '', warrantyMonths: 12 })
  const [assetFilter, setAssetFilter] = useState<'all' | 'expiring' | 'expired'>('all')
  const [allot, setAllot] = useState<Asset | null>(null)
  const [allotTo, setAllotTo] = useState('')
  const [term, setTerm] = useState('')

  const prs = db.purchaseRequests.filter((p) => matches(term, p.title, p.vendor, p.department, p.category, p.poNumber, userName(db, p.requestedBy))).filter((p) => seesAll || p.requestedBy === user.id || HOD_OF[p.department] === user.id).sort((a, b) => b.createdAt - a.createdAt)

  const create = () => {
    if (!draft.title || draft.unitCost <= 0) return
    // Duplicate check: an open request with the same title in the same department.
    if (db.purchaseRequests.some((p) => p.title.toLowerCase() === draft.title.toLowerCase() && p.department === user.department && !['RECEIVED', 'REJECTED'].includes(p.status)) && !confirm('A similar open request already exists. Create anyway?')) return
    const chain = approvalChain(draft.quantity * draft.unitCost)
    update((d) => { d.purchaseRequests.push({ id: uid('pr'), ...draft, requestedBy: user.id, department: user.department, status: statusFor[chain[0]], approvals: [], createdAt: Date.now() }) })
    notify([HOD_OF[user.department] ?? 'a1'], `Purchase request "${draft.title}" awaits HOD approval`, '/procurement')
    audit(user.id, 'PR_CREATE', `${draft.title} (${inr(draft.quantity * draft.unitCost)})`)
    setCreating(false)
  }

  const decide = (p: PurchaseRequest, ok: boolean) => {
    const chain = approvalChain(total(p))
    const level = Object.entries(statusFor).find(([, s]) => s === p.status)![0]
    const next = chain[chain.indexOf(level) + 1]
    update((d) => {
      const x = d.purchaseRequests.find((y) => y.id === p.id)!
      x.approvals.push({ level, by: user.id, at: Date.now(), decision: ok ? 'APPROVED' : 'REJECTED' })
      x.status = !ok ? 'REJECTED' : next ? statusFor[next] : 'APPROVED'
    })
    notify([p.requestedBy], `"${p.title}": ${level} ${ok ? 'approved' : 'rejected'}${ok && next ? `, now with ${next}` : ''}`, '/procurement')
    if (ok && next) notify(officeUsers(db, NEXT_OFFICE[next]), `Purchase request "${p.title}" awaits ${next} approval`, '/procurement')
    if (ok && !next) notify(officeUsers(db, 'finance'), `"${p.title}" fully approved: issue the purchase order`, '/procurement')
    audit(user.id, `PR_${ok ? 'APPROVE' : 'REJECT'}`, `${p.title} at ${level}`)
  }
  const issuePO = (p: PurchaseRequest) => {
    const po = `PO-${new Date().getFullYear()}-${String(db.purchaseRequests.filter((x) => x.poNumber).length + 42).padStart(4, '0')}`
    update((d) => { const x = d.purchaseRequests.find((y) => y.id === p.id)!; x.status = 'PO_ISSUED'; x.poNumber = po })
    audit(user.id, 'PO_ISSUE', `${po} to ${p.vendor} for ${p.title}`)
  }
  /** Goods received → assets auto-created with tags and warranty (purchase-to-asset chain). */
  const receive = (p: PurchaseRequest) => {
    const start = db.assets.length + 1
    const isAsset = p.category !== 'Stationery'
    update((d) => {
      d.purchaseRequests.find((y) => y.id === p.id)!.status = 'RECEIVED'
      if (isAsset) for (let i = 0; i < p.quantity; i++) {
        d.assets.push({ id: uid('as'), tag: `AST-${String(start + i).padStart(4, '0')}`, name: p.title, category: p.category, purchaseRequestId: p.id, location: 'Central Store', status: 'IN_STOCK', purchasedAt: Date.now(), warrantyUntil: Date.now() + p.warrantyMonths * 30 * 86_400_000, cost: p.unitCost })
      }
    })
    audit(user.id, 'PR_RECEIVED', `${p.poNumber}: ${p.quantity} × ${p.title}${isAsset ? `. ${p.quantity} assets created` : ' (consumables, no assets)'}`)
    if (isAsset) setTab('assets')
  }

  const now = Date.now()
  const assets = db.assets.filter((a) => matches(term, a.tag, a.name, a.category, a.location, a.assignedTo ? userName(db, a.assignedTo) : '')).filter((a) => assetFilter === 'all' || (assetFilter === 'expired' ? a.warrantyUntil < now : a.warrantyUntil >= now && a.warrantyUntil < now + 90 * 86_400_000)).sort((a, b) => a.warrantyUntil - b.warrantyUntil)
  const spend = db.purchaseRequests.filter((p) => ['PO_ISSUED', 'RECEIVED'].includes(p.status)).reduce((s, p) => s + total(p), 0)

  return (
    <>
      <PageHeader search={{ value: term, onChange: setTerm, placeholder: 'Search item, vendor, asset tag…' }} title="Procurement & assets" subtitle="Request → approvals by amount → purchase order → receipt → asset register" actions={<button className="btn" onClick={() => setCreating(true)}><Plus size={14} /> New purchase request</button>} />
      <div className="grid grid-4">
        <Stat label="Pending approvals" value={db.purchaseRequests.filter((p) => p.status.startsWith('PENDING')).length} tone="warning" icon={<ShoppingCart size={22} />} />
        <Stat label="Committed spend" value={inr(spend)} tone="info" />
        <Stat label="Assets" value={db.assets.length} tone="brand" icon={<PackageCheck size={22} />} />
        <Stat label="Warranty expiring ≤ 90 days" value={db.assets.filter((a) => a.warrantyUntil >= now && a.warrantyUntil < now + 90 * 86_400_000).length} tone="danger" />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'requests', label: 'Purchase requests', count: prs.length }, { id: 'assets', label: 'Asset register', count: db.assets.length }]} />
      {tab === 'requests' && (
        <div className="stack">
          {prs.length === 0 && <Card><Empty text="No purchase requests." /></Card>}
          {prs.map((p) => {
            const chain = approvalChain(total(p))
            return (
              <Card key={p.id} title={<span>{p.title} <Badge tone={tone(p.status)}>{p.status.replace(/_/g, ' ')}</Badge></span>} action={<strong>{inr(total(p))}</strong>}>
                <div className="small muted">{p.quantity} × {inr(p.unitCost)} · {p.category} · {p.vendor} · {p.department} · by {userName(db, p.requestedBy)} on {fmtDate(p.createdAt)}{p.poNumber ? ` · ${p.poNumber}` : ''}</div>
                <div className="row gap wrap" style={{ margin: '10px 0' }}>
                  {chain.map((lvl) => { const a = p.approvals.find((x) => x.level === lvl); return <Badge key={lvl} tone={a ? (a.decision === 'APPROVED' ? 'success' : 'danger') : statusFor[lvl] === p.status ? 'warning' : 'neutral'}>{lvl}{a ? `: ${userName(db, a.by)}` : ''}</Badge> })}
                  <span className="small muted">Approval chain for {inr(total(p))}</span>
                </div>
                <div className="row gap">
                  {canApprove(p, user) && <><button className="btn btn-success btn-sm" onClick={() => decide(p, true)}>Approve</button><button className="btn btn-danger btn-sm" onClick={() => decide(p, false)}>Reject</button></>}
                  {isAdmin && p.status === 'APPROVED' && <button className="btn btn-sm" onClick={() => issuePO(p)}>Issue purchase order</button>}
                  {isAdmin && p.status === 'PO_ISSUED' && <button className="btn btn-sm" onClick={() => receive(p)}><PackageCheck size={14} /> Mark consignment received</button>}
                </div>
              </Card>
            )
          })}
        </div>
      )}
      {tab === 'assets' && (
        <Card action={<div className="row gap">{(['all', 'expiring', 'expired'] as const).map((f) => <button key={f} className={`chip ${assetFilter === f ? 'active' : ''}`} onClick={() => setAssetFilter(f)}>{f === 'all' ? 'All' : f === 'expiring' ? 'Warranty ≤ 90 days' : 'Warranty expired'}</button>)}</div>} title="Assets (sorted by warranty expiry)">
          <div className="table-wrap"><table>
            <thead><tr><th>Tag</th><th>Asset</th><th>Category</th><th>Location / holder</th><th>Warranty</th><th>Status</th>{canAssets && <th />}</tr></thead>
            <tbody>{assets.map((a) => (
              <tr key={a.id}>
                <td><strong>{a.tag}</strong></td><td>{a.name}<div className="small muted">{inr(a.cost)}{a.purchaseRequestId ? ` · from ${db.purchaseRequests.find((p) => p.id === a.purchaseRequestId)?.poNumber}` : ''}</div></td>
                <td>{a.category}</td><td>{a.assignedTo ? userName(db, a.assignedTo) : a.location}</td>
                <td><Badge tone={a.warrantyUntil < now ? 'danger' : a.warrantyUntil < now + 90 * 86_400_000 ? 'warning' : 'success'}>{fmtDate(a.warrantyUntil)}</Badge></td>
                <td><Badge tone={a.status === 'ALLOTTED' ? 'info' : a.status === 'MAINTENANCE' ? 'warning' : a.status === 'RETIRED' ? 'neutral' : 'success'}>{a.status.replace('_', ' ')}</Badge></td>
                {canAssets && <td><div className="row gap">
                  {a.status === 'IN_STOCK' && <button className="btn btn-outline btn-sm" onClick={() => { setAllot(a); setAllotTo('') }}>Allot</button>}
                  {a.status === 'ALLOTTED' && <button className="btn btn-outline btn-sm" onClick={() => update((d) => { const x = d.assets.find((y) => y.id === a.id)!; x.status = 'IN_STOCK'; x.assignedTo = undefined; x.location = 'Central Store' })}>Return</button>}
                  {a.status !== 'MAINTENANCE' && a.status !== 'RETIRED' && <button className="btn btn-ghost btn-sm" onClick={() => update((d) => { d.assets.find((y) => y.id === a.id)!.status = 'MAINTENANCE' })}>Maintenance</button>}
                  {a.status === 'MAINTENANCE' && <button className="btn btn-ghost btn-sm" onClick={() => update((d) => { d.assets.find((y) => y.id === a.id)!.status = 'IN_STOCK' })}>Repaired</button>}
                </div></td>}
              </tr>
            ))}</tbody>
          </table></div>
        </Card>
      )}
      {creating && (
        <Modal title="New purchase request" onClose={() => setCreating(false)} footer={<><button className="btn btn-ghost" onClick={() => setCreating(false)}>Cancel</button><button className="btn" onClick={create}>Submit</button></>}>
          <Field label="Item"><input className="input" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></Field>
          <div className="grid grid-2">
            <Field label="Category"><select className="select" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as PurchaseRequest['category'] })}>{CATS.map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Vendor (approved quote)"><input className="input" value={draft.vendor} onChange={(e) => setDraft({ ...draft, vendor: e.target.value })} /></Field>
            <Field label="Quantity"><input className="input" type="number" min={1} value={draft.quantity} onChange={(e) => setDraft({ ...draft, quantity: Number(e.target.value) })} /></Field>
            <Field label="Unit cost (₹)"><input className="input" type="number" min={0} value={draft.unitCost} onChange={(e) => setDraft({ ...draft, unitCost: Number(e.target.value) })} /></Field>
            <Field label="Warranty (months)"><input className="input" type="number" min={0} value={draft.warrantyMonths} onChange={(e) => setDraft({ ...draft, warrantyMonths: Number(e.target.value) })} /></Field>
          </div>
          <div className="alert alert-info">Total {inr(draft.quantity * draft.unitCost)} → approvals: {approvalChain(draft.quantity * draft.unitCost).join(' → ')}</div>
        </Modal>
      )}
      {allot && (
        <Modal title={`Allot ${allot.tag}`} onClose={() => setAllot(null)} footer={<button className="btn" disabled={!allotTo} onClick={() => { update((d) => { const x = d.assets.find((y) => y.id === allot.id)!; x.status = 'ALLOTTED'; x.assignedTo = allotTo }); audit(user.id, 'ASSET_ALLOT', `${allot.tag} → ${userName(db, allotTo)}`); setAllot(null) }}>Allot</button>}>
          <Field label="Allot to"><select className="select" value={allotTo} onChange={(e) => setAllotTo(e.target.value)}><option value="">Select staff…</option>{db.users.filter((u) => u.role === 'faculty' || u.role === 'admin').map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
        </Modal>
      )}
    </>
  )
}
