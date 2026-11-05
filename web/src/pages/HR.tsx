import { useState } from 'react'
import { Download, Play, Plus } from 'lucide-react'
import { audit, notify, uid, update, useCurrentUser, useDB } from '../data/store'
import { Badge, Card, Empty, Field, Modal, PageHeader, Stat, Tabs } from '../components/ui'
import { computePayslip, fmtDate, inr, userName, matches } from '../lib'
import { can, officeUsers } from '../access'
import type { Payslip, StaffLeave } from '../data/types'

const QUOTA: Record<StaffLeave['type'], number> = { Casual: 12, Sick: 10, Earned: 15, Duty: 30, 'Loss of Pay': 365 }
const days = (from: string, to: string) => Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000) + 1)

/** Loss-of-pay days for a staff member in a month, from approved leave (leave ↔ payroll sync). */
function lopDaysIn(leaves: StaffLeave[], staffId: string, month: string) {
  return leaves.filter((l) => l.staffId === staffId && l.status === 'APPROVED' && l.type === 'Loss of Pay' && l.from.slice(0, 7) === month).reduce((s, l) => s + l.days, 0)
}

export default function HR() {
  const db = useDB()
  const user = useCurrentUser()!
  const canApprove = can(user, 'approveStaffLeave')
  const canPayroll = can(user, 'runPayroll')
  const [tab, setTab] = useState<'leave' | 'payslips' | 'approvals' | 'payroll'>(canApprove ? 'approvals' : canPayroll ? 'payroll' : 'leave')
  const [applying, setApplying] = useState(false)
  const [draft, setDraft] = useState<{ type: StaffLeave['type']; from: string; to: string; reason: string }>({ type: 'Casual', from: '', to: '', reason: '' })
  const [slip, setSlip] = useState<{ p: Payslip; month: string } | null>(null)
  const [term, setTerm] = useState('')
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))

  const mine = db.leaves.filter((l) => l.staffId === user.id)
  const used = (t: StaffLeave['type']) => mine.filter((l) => l.type === t && l.status === 'APPROVED').reduce((s, l) => s + l.days, 0)
  const staff = db.users.filter((u) => (u.role === 'faculty' || u.role === 'admin') && u.basicSalary)

  const apply = () => {
    if (!draft.from || !draft.to || !draft.reason) return
    const n = days(draft.from, draft.to)
    if (draft.type !== 'Loss of Pay' && used(draft.type) + n > QUOTA[draft.type]) return alert(`Not enough ${draft.type} leave balance.`)
    update((d) => { d.leaves.push({ id: uid('lv'), staffId: user.id, ...draft, days: n, status: 'PENDING' }) })
    notify(officeUsers(db, 'hr').filter((id) => id !== user.id), `${user.name} applied for ${n} day(s) ${draft.type} leave`, '/hr')
    setApplying(false); setDraft({ type: 'Casual', from: '', to: '', reason: '' })
  }
  const review = (l: StaffLeave, status: 'APPROVED' | 'REJECTED') => {
    update((d) => { const x = d.leaves.find((y) => y.id === l.id)!; x.status = status; x.reviewedBy = user.id })
    notify([l.staffId], `Your ${l.type} leave (${fmtDate(l.from)}) was ${status.toLowerCase()}`, '/hr')
    audit(user.id, `LEAVE_${status}`, `${userName(db, l.staffId)}: ${l.type} ${l.from}–${l.to}`)
  }
  const runPayroll = () => {
    if (db.payrollRuns.some((r) => r.month === month) && !confirm(`Payroll for ${month} already exists. Re-run it?`)) return
    const payslips = staff.map((s) => computePayslip(s.id, s.basicSalary!, lopDaysIn(db.leaves, s.id, month)))
    update((d) => { d.payrollRuns = d.payrollRuns.filter((r) => r.month !== month); d.payrollRuns.unshift({ id: uid('pay'), month, runAt: Date.now(), payslips }) })
    notify(staff.map((s) => s.id), `Payslip for ${month} is available`, '/hr')
    audit(user.id, 'PAYROLL_RUN', `Payroll run for ${month}: ${payslips.length} employees, net ${inr(payslips.reduce((s, p) => s + p.net, 0))}`)
  }
  const exportBank = (month: string) => {
    const run = db.payrollRuns.find((r) => r.month === month)!
    const rows = [['Employee', 'Gross', 'LOP', 'PF', 'ESI', 'PT', 'TDS', 'Net'], ...run.payslips.map((p) => [userName(db, p.staffId), p.gross, p.lopDeduction, p.pf, p.esi, p.professionalTax, p.tds, p.net].map(String))]
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([rows.map((r) => r.join(',')).join('\n')], { type: 'text/csv' })); a.download = `payroll-${month}.csv`; a.click()
  }

  const mySlips = db.payrollRuns.flatMap((r) => r.payslips.filter((p) => p.staffId === user.id).map((p) => ({ p, month: r.month })))

  return (
    <>
      <PageHeader search={{ value: term, onChange: setTerm, placeholder: 'Search employee…' }} title="HR & payroll" subtitle="Leave → approval → payroll sync, with PF, ESI, professional tax and TDS" actions={<button className="btn" onClick={() => setApplying(true)}><Plus size={14} /> Apply for leave</button>} />
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'leave', label: 'My leave' }, { id: 'payslips', label: 'My payslips', count: mySlips.length },
        ...(canApprove ? [{ id: 'approvals' as const, label: 'Leave approvals', count: db.leaves.filter((l) => l.status === 'PENDING').length }] : []),
        ...(canPayroll ? [{ id: 'payroll' as const, label: 'Payroll' }] : []),
      ]} />
      {tab === 'leave' && (
        <>
          <div className="grid grid-4">{(['Casual', 'Sick', 'Earned', 'Duty'] as const).map((t) => <Stat key={t} label={`${t} leave left`} value={QUOTA[t] - used(t)} hint={`${used(t)} of ${QUOTA[t]} used`} tone={t === 'Sick' ? 'warning' : t === 'Earned' ? 'success' : 'info'} />)}</div>
          <Card title="Leave history">
            {mine.length === 0 ? <Empty text="No leave applications." /> : (
              <table><thead><tr><th>Type</th><th>Dates</th><th>Days</th><th>Reason</th><th>Status</th><th /></tr></thead><tbody>
                {mine.map((l) => <tr key={l.id}><td>{l.type}</td><td>{fmtDate(l.from)} – {fmtDate(l.to)}</td><td>{l.days}</td><td>{l.reason}</td><td><Badge tone={l.status === 'APPROVED' ? 'success' : l.status === 'PENDING' ? 'warning' : 'danger'}>{l.status}</Badge></td><td>{l.status === 'PENDING' && <button className="btn btn-ghost btn-sm" onClick={() => update((d) => { d.leaves.find((x) => x.id === l.id)!.status = 'CANCELLED' })}>Cancel</button>}</td></tr>)}
              </tbody></table>
            )}
          </Card>
        </>
      )}
      {tab === 'payslips' && (
        <Card>
          {mySlips.length === 0 ? <Empty text="No payslips yet. They appear after payroll is run." /> : (
            <div className="list">{mySlips.map(({ p, month }) => <div key={month} className="list-item"><div className="grow"><strong>{new Date(`${month}-01`).toLocaleString('en-IN', { month: 'long', year: 'numeric' })}</strong><div className="small muted">Gross {inr(p.gross)} · deductions {inr(p.gross - p.net)}</div></div><strong>{inr(p.net)}</strong><button className="btn btn-outline btn-sm" onClick={() => setSlip({ p, month })}>View</button></div>)}</div>
          )}
        </Card>
      )}
      {tab === 'approvals' && canApprove && (
        <Card>
          <table><thead><tr><th>Employee</th><th>Type</th><th>Dates</th><th>Days</th><th>Reason</th><th>Status</th><th /></tr></thead><tbody>
            {db.leaves.filter((l) => matches(term, userName(db, l.staffId), l.type, l.reason, l.status)).sort((a, b) => Number(b.status === 'PENDING') - Number(a.status === 'PENDING')).map((l) => (
              <tr key={l.id}><td>{userName(db, l.staffId)}</td><td>{l.type}</td><td>{fmtDate(l.from)} – {fmtDate(l.to)}</td><td>{l.days}</td><td>{l.reason}</td>
                <td><Badge tone={l.status === 'APPROVED' ? 'success' : l.status === 'PENDING' ? 'warning' : 'danger'}>{l.status}</Badge></td>
                <td>{l.status === 'PENDING' && l.staffId !== user.id && <div className="row gap"><button className="btn btn-success btn-sm" onClick={() => review(l, 'APPROVED')}>Approve</button><button className="btn btn-danger btn-sm" onClick={() => review(l, 'REJECTED')}>Decline</button></div>}</td></tr>
            ))}
          </tbody></table>
        </Card>
      )}
      {tab === 'payroll' && canPayroll && (
        <>
          <Card>
            <div className="row gap wrap">
              <Field label="Payroll month"><input className="input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></Field>
              <div className="grow" />
              <button className="btn" onClick={runPayroll}><Play size={14} /> Run payroll</button>
            </div>
            <p className="small muted" style={{ marginTop: 8 }}>Approved "Loss of Pay" leave in the month is deducted automatically. Deductions: PF 12% (wage ceiling ₹15,000), ESI 0.75% (gross ≤ ₹21,000), professional tax ₹200, TDS (new regime with standard deduction and 87A rebate).</p>
          </Card>
          {db.payrollRuns.map((r) => (
            <Card key={r.id} title={`Payroll · ${r.month}`} action={<button className="btn btn-outline btn-sm" onClick={() => exportBank(r.month)}><Download size={14} /> Bank file (CSV)</button>}>
              <div className="table-wrap"><table>
                <thead><tr><th>Employee</th><th>Gross</th><th>LOP</th><th>PF</th><th>ESI</th><th>PT</th><th>TDS</th><th>Net pay</th><th /></tr></thead>
                <tbody>{r.payslips.filter((p) => matches(term, userName(db, p.staffId))).map((p) => <tr key={p.staffId}><td>{userName(db, p.staffId)}</td><td>{inr(p.gross)}</td><td>{p.lopDays ? `${p.lopDays}d · ${inr(p.lopDeduction)}` : '—'}</td><td>{inr(p.pf)}</td><td>{inr(p.esi)}</td><td>{inr(p.professionalTax)}</td><td>{inr(p.tds)}</td><td><strong>{inr(p.net)}</strong></td><td><button className="btn btn-ghost btn-sm" onClick={() => setSlip({ p, month: r.month })}>Payslip</button></td></tr>)}</tbody>
              </table></div>
            </Card>
          ))}
        </>
      )}
      {applying && (
        <Modal title="Apply for leave" onClose={() => setApplying(false)} footer={<><button className="btn btn-ghost" onClick={() => setApplying(false)}>Cancel</button><button className="btn" onClick={apply}>Submit</button></>}>
          <Field label="Leave type"><select className="select" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as StaffLeave['type'] })}>{Object.keys(QUOTA).map((t) => <option key={t}>{t}</option>)}</select></Field>
          <div className="grid grid-2">
            <Field label="From"><input className="input" type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} /></Field>
            <Field label="To"><input className="input" type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} /></Field>
          </div>
          <Field label="Reason"><textarea className="textarea" value={draft.reason} onChange={(e) => setDraft({ ...draft, reason: e.target.value })} /></Field>
          <div className="small muted">The request goes to your reporting manager. Approved "Loss of Pay" leave syncs to payroll.</div>
        </Modal>
      )}
      {slip && (
        <Modal title={`Payslip · ${slip.month}`} onClose={() => setSlip(null)} footer={<button className="btn" onClick={() => window.print()}>Print</button>}>
          <strong>{userName(db, slip.p.staffId)}</strong>
          <div className="grid grid-2">
            <table><thead><tr><th>Earnings</th><th /></tr></thead><tbody>
              <tr><td>Basic</td><td>{inr(slip.p.basic)}</td></tr><tr><td>HRA (40%)</td><td>{inr(slip.p.hra)}</td></tr><tr><td>DA (10%)</td><td>{inr(slip.p.da)}</td></tr><tr><td><strong>Gross</strong></td><td><strong>{inr(slip.p.gross)}</strong></td></tr>
            </tbody></table>
            <table><thead><tr><th>Deductions</th><th /></tr></thead><tbody>
              <tr><td>Loss of pay ({slip.p.lopDays}d)</td><td>{inr(slip.p.lopDeduction)}</td></tr><tr><td>Provident fund</td><td>{inr(slip.p.pf)}</td></tr><tr><td>ESI</td><td>{inr(slip.p.esi)}</td></tr><tr><td>Professional tax</td><td>{inr(slip.p.professionalTax)}</td></tr><tr><td>TDS</td><td>{inr(slip.p.tds)}</td></tr>
            </tbody></table>
          </div>
          <div className="alert alert-success row between"><span>Net pay</span><strong>{inr(slip.p.net)}</strong></div>
        </Modal>
      )}
    </>
  )
}
