import { useState } from 'react'
import { BookMarked, BookOpen, Pencil, Plus, Printer, Receipt, RotateCcw, Search, Trash2, UserSearch } from 'lucide-react'
import { audit, getDB, notify, uid, update, useCurrentUser, useDB } from '../data/store'
import { Avatar, Badge, Card, Empty, Field, Modal, PageHeader, Stat, Tabs } from '../components/ui'
import { FilterBar, opts, useFilters } from '../components/Filters'
import { fmtDate, inr, matches, userName } from '../lib'
import { can, personaLabel } from '../access'
import { classLabel } from '../classes'
import { activeLoans, available, fineDue, fineFor, freeAccession, issueCheck, loanLimit, memberDues, nextReceiptNo, overdueDays, rules, usableCopies } from '../library'
import type { Book, BookLoan, DB, LibrarySettings } from '../data/types'

const DAY = 86_400_000
const isoDate = (t: number) => new Date(t).toISOString().slice(0, 10)
const bookOf = (db: DB, id: string) => db.books.find((b) => b.id === id)

export default function Library() {
  const user = useCurrentUser()!
  return can(user, 'manageLibrary') ? <LibraryOffice /> : <LibraryMember />
}

/* ============================ Library department ============================ */

function LibraryOffice() {
  const db = useDB()
  const [tab, setTab] = useState<'desk' | 'catalogue' | 'loans' | 'fines' | 'holds' | 'settings'>('desk')
  const [q, setQ] = useState('')
  const [memberId, setMemberId] = useState<string | null>(null)
  const [bookDraft, setBookDraft] = useState<Partial<Book> | null>(null)
  const [receipt, setReceipt] = useState<BookLoan | null>(null)
  const out = activeLoans(db)
  const overdue = out.filter((l) => l.dueAt < Date.now())
  const finesDue = db.loans.filter((l) => fineDue(db, l) > 0)
  const collected = db.loans.filter((l) => l.receiptNo).sort((a, b) => (b.finePaidAt ?? 0) - (a.finePaidAt ?? 0))

  return (
    <>
      <PageHeader title="Library" subtitle="Catalogue, circulation desk, members, fines and receipts" search={{ value: q, onChange: setQ, placeholder: 'Search book, ISBN, accession, member…' }}
        actions={<button className="btn" onClick={() => setBookDraft({ copies: 1, subject: '', shelf: '' })}><Plus size={14} /> Add book</button>} />
      <div className="grid grid-4">
        <Stat label="Titles / copies" value={`${db.books.length} / ${db.books.reduce((t, b) => t + usableCopies(b), 0)}`} icon={<BookOpen size={22} />} />
        <Stat label="Issued now" value={out.length} tone="info" hint={`${db.books.reduce((t, b) => t + Math.max(0, available(db, b)), 0)} copies on the shelf`} />
        <Stat label="Overdue" value={overdue.length} tone="danger" hint={overdue.length ? `${inr(overdue.reduce((t, l) => t + fineFor(db, l), 0))} accruing` : undefined} />
        <Stat label="Unpaid fines" value={inr(finesDue.reduce((t, l) => t + fineDue(db, l), 0))} tone="warning" hint={`${new Set(finesDue.map((l) => l.userId)).size} member(s)`} />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'desk', label: 'Circulation desk' }, { id: 'catalogue', label: 'Catalogue', count: db.books.length }, { id: 'loans', label: 'Issued books', count: out.length },
        { id: 'fines', label: 'Fines & receipts', count: finesDue.length }, { id: 'holds', label: 'Reservations', count: db.books.reduce((t, b) => t + b.reservations.length, 0) }, { id: 'settings', label: 'Rules' },
      ]} />
      {tab === 'desk' && <Desk memberId={memberId} setMemberId={setMemberId} onReceipt={setReceipt} />}
      {tab === 'catalogue' && <Catalogue q={q} onEdit={setBookDraft} />}
      {tab === 'loans' && <IssuedBooks q={q} onMember={(id) => { setMemberId(id); setTab('desk') }} />}
      {tab === 'fines' && (
        <div className="grid grid-2">
          <Card title="Unpaid fines">
            {finesDue.length === 0 ? <Empty text="No unpaid fines." /> : <div className="list">{finesDue.filter((l) => matches(q, userName(db, l.userId), bookOf(db, l.bookId)?.title)).map((l) => (
              <div key={l.id} className="list-item"><div className="grow"><strong>{userName(db, l.userId)}</strong> <span className="small muted">{db.users.find((u) => u.id === l.userId)?.rollNo}</span><div className="small muted">{bookOf(db, l.bookId)?.title} · {overdueDays(l)} day(s) late{l.returnedAt ? '' : ' · still out'}</div></div><strong>{inr(fineDue(db, l))}</strong><button className="btn btn-outline btn-sm" onClick={() => { setMemberId(l.userId); setTab('desk') }}>Open member</button></div>
            ))}</div>}
          </Card>
          <Card title="Receipts issued">
            {collected.length === 0 ? <Empty text="No fines collected yet." /> : <div className="list">{collected.map((l) => (
              <div key={l.id} className="list-item"><div className="grow"><strong>{l.receiptNo}</strong> · {userName(db, l.userId)}<div className="small muted">{bookOf(db, l.bookId)?.title} · {l.finePaidAt ? fmtDate(l.finePaidAt) : ''}</div></div><strong>{inr(l.finePaid ?? 0)}</strong><button className="icon-btn" aria-label={`Print ${l.receiptNo}`} onClick={() => setReceipt(l)}><Printer size={14} /></button></div>
            ))}</div>}
            {db.loans.some((l) => l.fineWaived) && <div className="small muted" style={{ marginTop: 8 }}>Waived: {db.loans.filter((l) => l.fineWaived).map((l) => `${userName(db, l.userId)} ${inr(l.fine ?? 0)} (${l.waiveReason ?? 'no reason'})`).join(' · ')}</div>}
          </Card>
        </div>
      )}
      {tab === 'holds' && (
        <Card title="Reservations (first in queue gets the next copy)">
          {db.books.every((b) => !b.reservations.length) ? <Empty text="No reservations." /> : <div className="list">{db.books.filter((b) => b.reservations.length).map((b) => (
            <div key={b.id} className="list-item"><div className="grow"><strong>{b.title}</strong><div className="small muted">{available(db, b)} available · queue: {b.reservations.map((r, i) => `${i + 1}. ${userName(db, r)}`).join(', ')}</div></div>
              {b.reservations.map((r) => <button key={r} className="btn btn-ghost btn-sm" onClick={() => { update((d) => { const x = d.books.find((y) => y.id === b.id)!; x.reservations = x.reservations.filter((y) => y !== r) }); notify([r], `Your reservation for "${b.title}" was cancelled by the library`, '/library') }}>Remove {userName(db, r).split(' ')[0]}</button>)}</div>
          ))}</div>}
        </Card>
      )}
      {tab === 'settings' && <RulesPanel />}
      {bookDraft && <BookEditor draft={bookDraft} onClose={() => setBookDraft(null)} />}
      {receipt && <ReceiptModal loan={receipt} onClose={() => setReceipt(null)} />}
    </>
  )
}

/** Circulation desk: find a member, see everything about them, issue / return / renew, collect or waive fines. */
function Desk({ memberId, setMemberId, onReceipt }: { memberId: string | null; setMemberId: (id: string | null) => void; onReceipt: (l: BookLoan) => void }) {
  const db = useDB()
  const me = useCurrentUser()!
  const [find, setFind] = useState('')
  const [bookQ, setBookQ] = useState('')
  const [bookId, setBookId] = useState('')
  const [due, setDue] = useState(isoDate(Date.now() + rules(db).loanDays * DAY))
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [waive, setWaive] = useState<BookLoan | null>(null)
  const [reason, setReason] = useState('')
  const members = db.users.filter((u) => u.role !== 'parent')
  const hits = find.trim() ? members.filter((u) => matches(find, u.name, u.rollNo, u.email, u.id, u.phone)).slice(0, 8) : []
  const m = members.find((u) => u.id === memberId)
  const bookHits = bookQ.trim() ? db.books.filter((b) => matches(bookQ, b.title, b.author, b.isbn, b.id, b.subject)).slice(0, 8) : []

  const issue = () => {
    if (!m || !bookId) return
    const b = bookOf(db, bookId)!
    const check = issueCheck(getDB(), m)
    if (check.block) return setMsg({ ok: false, text: check.block })
    if (check.warn && !confirm(`${check.warn} Issue anyway?`)) return
    if (available(db, b) <= 0) return setMsg({ ok: false, text: `No copy of "${b.title}" is on the shelf.` })
    if (b.reservations.length && b.reservations[0] !== m.id && available(db, b) <= b.reservations.length) return setMsg({ ok: false, text: `The free copy is held for ${userName(db, b.reservations[0])} (reservation).` })
    const acc = freeAccession(db, b)
    const dueAt = new Date(`${due}T20:00`).getTime()
    update((d) => {
      d.loans.push({ id: uid('ln'), bookId, accession: acc, userId: m.id, issuedAt: Date.now(), dueAt, issuedBy: me.id })
      const x = d.books.find((y) => y.id === bookId)!; x.reservations = x.reservations.filter((r) => r !== m.id)
    })
    notify([m.id], `Issued "${b.title}" (${acc}). Please return it by ${fmtDate(dueAt)}; late returns are fined ${inr(rules(db).finePerDay)} a day.`, '/library')
    audit(me.id, 'LIBRARY_ISSUE', `${b.title} ${acc} → ${m.name}, due ${due}`)
    setMsg({ ok: true, text: `Issued "${b.title}" (${acc}) to ${m.name}, due ${fmtDate(dueAt)}.` }); setBookId(''); setBookQ('')
  }
  const doReturn = (l: BookLoan) => {
    const b = bookOf(db, l.bookId)!
    const fine = fineFor(db, l)
    update((d) => { const x = d.loans.find((y) => y.id === l.id)!; x.returnedAt = Date.now(); x.returnedBy = me.id; x.fine = fine })
    if (b.reservations[0]) notify([b.reservations[0]], `"${b.title}" is now available for you to collect`, '/library')
    if (fine) notify([l.userId], `Returned "${b.title}" ${overdueDays(l)} day(s) late: fine ${inr(fine)}. Pay at the library counter.`, '/library')
    audit(me.id, 'LIBRARY_RETURN', `${b.title} ${l.accession ?? ''} from ${userName(db, l.userId)}${fine ? `, fine ${inr(fine)}` : ''}`)
    setMsg({ ok: true, text: `Returned "${b.title}".${fine ? ` Fine ${inr(fine)} is due.` : ''}` })
  }
  const renew = (l: BookLoan) => {
    const b = bookOf(db, l.bookId)!
    if ((l.renewals ?? 0) >= rules(db).maxRenewals) return alert(`Already renewed ${l.renewals} time(s), the limit.`)
    if (b.reservations.some((r) => r !== l.userId)) return alert('Another member has reserved this book; it cannot be renewed.')
    if (l.dueAt < Date.now() && fineFor(db, l) > 0 && !confirm(`This book is ${overdueDays(l)} day(s) overdue (fine ${inr(fineFor(db, l))}). Renew from today anyway? The fine so far stays due.`)) return
    update((d) => { const x = d.loans.find((y) => y.id === l.id)!; x.dueAt = Math.max(Date.now(), x.dueAt) + rules(d).loanDays * DAY; x.renewals = (x.renewals ?? 0) + 1 })
    audit(me.id, 'LIBRARY_RENEW', `${b.title} for ${userName(db, l.userId)}`)
  }
  const collect = (l: BookLoan) => {
    const amount = fineDue(db, l)
    if (!confirm(`Collect ${inr(amount)} from ${userName(db, l.userId)} for "${bookOf(db, l.bookId)?.title}"?`)) return
    const no = nextReceiptNo(db)
    update((d) => { const x = d.loans.find((y) => y.id === l.id)!; x.finePaid = (x.finePaid ?? 0) + amount; x.finePaidAt = Date.now(); x.receiptNo = no })
    notify([l.userId], `Library fine of ${inr(amount)} received. Receipt ${no}.`, '/library')
    audit(me.id, 'LIBRARY_FINE_PAID', `${no} ${inr(amount)} from ${userName(db, l.userId)}`)
    onReceipt(getDB().loans.find((x) => x.id === l.id)!)
  }
  const doWaive = () => {
    if (!waive || !reason.trim()) return alert('Give a reason for waiving the fine.')
    update((d) => { const x = d.loans.find((y) => y.id === waive.id)!; x.fineWaived = true; x.waivedBy = me.id; x.waiveReason = reason.trim(); if (!x.returnedAt) x.fine = fineFor(d, x) })
    notify([waive.userId], `Your library fine for "${bookOf(db, waive.bookId)?.title}" was waived.`, '/library')
    audit(me.id, 'LIBRARY_FINE_WAIVED', `${userName(db, waive.userId)} ${inr(fineDue(db, waive))}: ${reason.trim()}`)
    setWaive(null); setReason('')
  }

  const loans = m ? db.loans.filter((l) => l.userId === m.id).sort((a, b) => Number(!!a.returnedAt) - Number(!!b.returnedAt) || b.issuedAt - a.issuedAt) : []
  const check = m ? issueCheck(db, m) : null
  return (
    <div className="stack">
      <Card title="Find a member" action={<span className="small muted">Name, roll / register number, email or ID</span>}>
        <div className="search" style={{ maxWidth: 460 }}><UserSearch size={16} className="muted" /><input aria-label="Find member" placeholder="e.g. 22BCA003, Diya, f2…" value={find} onChange={(e) => setFind(e.target.value)} /></div>
        {hits.length > 0 && <div className="list" style={{ marginTop: 8 }}>{hits.map((u) => (
          <button key={u.id} className="list-item member-hit" onClick={() => { setMemberId(u.id); setFind(''); setMsg(null) }}>
            <Avatar name={u.name} color={u.avatarColor} size={28} /><span className="grow" style={{ textAlign: 'left' }}><strong>{u.name}</strong> <span className="small muted">{u.rollNo ?? u.email} · {personaLabel(u)}</span></span>
            {memberDues(db, u.id) > 0 && <Badge tone="danger">Fine {inr(memberDues(db, u.id))}</Badge>}<Badge>{activeLoans(db, u.id).length} out</Badge>
          </button>
        ))}</div>}
      </Card>
      {msg && <div className={`alert ${msg.ok ? 'alert-success' : 'alert-danger'}`}>{msg.text}</div>}
      {m && (
        <>
          <Card>
            <div className="row between wrap gap">
              <div className="row gap"><Avatar name={m.name} color={m.avatarColor} size={48} /><div><strong style={{ fontSize: 17 }}>{m.name}</strong><div className="small muted">{personaLabel(m)} · {m.rollNo ?? m.email}{m.classId ? ` · ${classLabel(db.classes.find((c) => c.id === m.classId))}` : m.department ? ` · ${m.department}` : ''}{m.phone ? ` · ${m.phone}` : ''}</div></div></div>
              <div className="row gap wrap">
                <Badge tone="info">{activeLoans(db, m.id).length}/{loanLimit(db, m)} books out</Badge>
                <Badge tone={memberDues(db, m.id) ? 'danger' : 'success'}>{memberDues(db, m.id) ? `Fine due ${inr(memberDues(db, m.id))}` : 'No dues'}</Badge>
                <Badge>{db.loans.filter((l) => l.userId === m.id).length} loans in total</Badge>
                <button className="btn btn-ghost btn-sm" onClick={() => setMemberId(null)}>Close</button>
              </div>
            </div>
            {check?.block && <div className="alert alert-danger" style={{ marginTop: 10 }}>Cannot issue: {check.block}</div>}
            {!check?.block && check?.warn && <div className="alert alert-warning" style={{ marginTop: 10 }}>Warning: {check.warn}</div>}
          </Card>
          <Card title="Issue a book">
            <div className="grid grid-3">
              <Field label="Book (title, author, ISBN)"><div className="search"><Search size={14} className="muted" /><input aria-label="Find book" value={bookQ} onChange={(e) => { setBookQ(e.target.value); setBookId('') }} placeholder="Search the catalogue" /></div></Field>
              <Field label="Due date" hint={`Default ${rules(db).loanDays} days`}><input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
              <Field label="&nbsp;"><button className="btn" disabled={!bookId || !!check?.block} onClick={issue}><BookMarked size={14} /> Issue</button></Field>
            </div>
            {bookHits.length > 0 && <div className="list">{bookHits.map((b) => (
              <label key={b.id} className={`list-item ${bookId === b.id ? 'selected' : ''}`}><input type="radio" name="book" checked={bookId === b.id} onChange={() => setBookId(b.id)} disabled={available(db, b) <= 0} /><span className="grow"><strong>{b.title}</strong> <span className="small muted">{b.author} · {b.shelf}</span></span><Badge tone={available(db, b) > 0 ? 'success' : 'danger'}>{available(db, b)}/{usableCopies(b)} on shelf</Badge></label>
            ))}</div>}
          </Card>
          <Card title="Books and fines">
            {loans.length === 0 ? <Empty text="No borrowing history." /> : (
              <div className="table-wrap"><table>
                <thead><tr><th>Book</th><th>Copy</th><th>Issued</th><th>Due</th><th>Returned</th><th>Fine</th><th /></tr></thead>
                <tbody>{loans.map((l) => { const b = bookOf(db, l.bookId); const late = overdueDays(l); const f = fineFor(db, l); return (
                  <tr key={l.id}>
                    <td><strong>{b?.title ?? 'Removed book'}</strong><div className="small muted">{b?.author}</div></td>
                    <td className="small">{l.accession ?? '—'}</td>
                    <td className="small">{fmtDate(l.issuedAt)}{l.issuedBy ? <div className="muted">by {userName(db, l.issuedBy)}</div> : null}</td>
                    <td className="small">{fmtDate(l.dueAt)}{(l.renewals ?? 0) > 0 && <div className="muted">renewed {l.renewals}×</div>}</td>
                    <td>{l.returnedAt ? <span className="small">{fmtDate(l.returnedAt)}</span> : late ? <Badge tone="danger">{late} day(s) overdue</Badge> : <Badge tone="info">Out</Badge>}</td>
                    <td>{f ? (l.fineWaived ? <Badge>Waived {inr(f)}</Badge> : l.receiptNo && !fineDue(db, l) ? <Badge tone="success">Paid · {l.receiptNo}</Badge> : <Badge tone="danger">{inr(fineDue(db, l))}{l.returnedAt ? '' : ' so far'}</Badge>) : <span className="muted small">—</span>}</td>
                    <td className="row gap">
                      {!l.returnedAt && <><button className="btn btn-outline btn-sm" onClick={() => doReturn(l)}><RotateCcw size={12} /> Return</button><button className="btn btn-ghost btn-sm" onClick={() => renew(l)}>Renew</button></>}
                      {fineDue(db, l) > 0 && l.returnedAt && <button className="btn btn-sm" onClick={() => collect(l)}><Receipt size={12} /> Collect</button>}
                      {fineDue(db, l) > 0 && <button className="btn btn-ghost btn-sm" onClick={() => setWaive(l)}>Waive</button>}
                      {l.receiptNo && <button className="icon-btn" aria-label={`Print ${l.receiptNo}`} onClick={() => onReceipt(l)}><Printer size={14} /></button>}
                    </td>
                  </tr>
                ) })}</tbody>
              </table></div>
            )}
          </Card>
        </>
      )}
      {!m && <Card><Empty icon={<UserSearch />} text="Search for a student, faculty member or staff to issue, return, renew or settle fines." /></Card>}
      {waive && (
        <Modal title="Waive (remove) fine" onClose={() => setWaive(null)} footer={<><button className="btn btn-ghost" onClick={() => setWaive(null)}>Cancel</button><button className="btn" onClick={doWaive}>Waive {inr(fineDue(db, waive))}</button></>}>
          <div>{userName(db, waive.userId)} · {bookOf(db, waive.bookId)?.title} · {overdueDays(waive)} day(s) late</div>
          <Field label="Reason (kept in the record)"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Medical leave, library closed" /></Field>
        </Modal>
      )}
    </div>
  )
}

function Catalogue({ q, onEdit }: { q: string; onEdit: (b: Book) => void }) {
  const db = useDB()
  const me = useCurrentUser()!
  const f = useFilters(['subject', 'shelf', 'avail'] as const)
  const defs = [
    { key: 'subject' as const, label: 'Subjects', options: opts(db.books.map((b) => b.subject)) },
    { key: 'shelf' as const, label: 'Shelves', options: opts(db.books.map((b) => b.shelf)) },
    { key: 'avail' as const, label: 'Availability', options: [{ value: 'in', label: 'On the shelf' }, { value: 'out', label: 'All copies out' }] },
  ]
  const books = db.books.filter((b) => matches(q, b.title, b.author, b.isbn, b.subject, b.publisher, b.id) && f.ok('subject', b.subject) && f.ok('shelf', b.shelf) && f.ok('avail', available(db, b) > 0 ? 'in' : 'out'))
  const remove = (b: Book) => {
    if (activeLoans(db).some((l) => l.bookId === b.id)) return alert('Copies of this book are out. Receive them back first.')
    if (!confirm(`Remove "${b.title}" from the catalogue? Its loan history stays in members' records.`)) return
    update((d) => { d.books = d.books.filter((x) => x.id !== b.id) })
    audit(me.id, 'LIBRARY_BOOK_DELETE', b.title)
  }
  const lost = (b: Book) => {
    if (available(db, b) <= 0) return alert('No copy on the shelf to write off.')
    if (!confirm(`Write off one copy of "${b.title}" as lost or damaged?`)) return
    update((d) => { const x = d.books.find((y) => y.id === b.id)!; x.lostCopies = (x.lostCopies ?? 0) + 1 })
    audit(me.id, 'LIBRARY_COPY_LOST', b.title)
  }
  return (
    <>
      <FilterBar defs={defs} f={f} count={books.length} noun="title" />
      <Card>
        <div className="table-wrap"><table>
          <thead><tr><th>Title</th><th>Subject</th><th>Shelf</th><th>Copies</th><th>On shelf</th><th>Issued</th><th /></tr></thead>
          <tbody>{books.map((b) => { const av = available(db, b); const issued = activeLoans(db).filter((l) => l.bookId === b.id); return (
            <tr key={b.id}>
              <td><strong>{b.title}</strong><div className="small muted">{b.author} · ISBN {b.isbn}{b.publisher ? ` · ${b.publisher}` : ''}{b.edition ? ` · ${b.edition} ed.` : ''}{b.year ? ` · ${b.year}` : ''}</div></td>
              <td>{b.subject}</td><td>{b.shelf}</td>
              <td>{usableCopies(b)}{b.lostCopies ? <div className="small muted">{b.lostCopies} lost</div> : null}</td>
              <td><Badge tone={av > 0 ? 'success' : 'danger'}>{av}</Badge>{b.reservations.length > 0 && <div className="small muted">{b.reservations.length} on hold</div>}</td>
              <td className="small">{issued.map((l) => userName(db, l.userId)).join(', ') || '—'}</td>
              <td className="row gap"><button className="icon-btn" aria-label={`Edit ${b.title}`} onClick={() => onEdit(b)}><Pencil size={14} /></button><button className="btn btn-ghost btn-sm" onClick={() => lost(b)}>Lost copy</button><button className="icon-btn" aria-label={`Delete ${b.title}`} onClick={() => remove(b)}><Trash2 size={14} /></button></td>
            </tr>
          ) })}</tbody>
        </table></div>
      </Card>
    </>
  )
}

function IssuedBooks({ q, onMember }: { q: string; onMember: (id: string) => void }) {
  const db = useDB()
  const me = useCurrentUser()!
  const f = useFilters(['state', 'who'] as const)
  const state = (l: BookLoan) => (l.dueAt < Date.now() ? 'overdue' : l.dueAt - Date.now() < 3 * DAY ? 'soon' : 'ok')
  const list = activeLoans(db).filter((l) => f.ok('state', state(l)) && f.ok('who', db.users.find((u) => u.id === l.userId)?.role === 'student' ? 'student' : 'staff') && matches(q, userName(db, l.userId), bookOf(db, l.bookId)?.title, l.accession, db.users.find((u) => u.id === l.userId)?.rollNo)).sort((a, b) => a.dueAt - b.dueAt)
  const remind = () => {
    const late = list.filter((l) => l.dueAt < Date.now())
    for (const l of late) notify([l.userId], `"${bookOf(db, l.bookId)?.title}" was due on ${fmtDate(l.dueAt)}. Fine so far: ${inr(fineFor(db, l))}. Please return it.`, '/library')
    audit(me.id, 'LIBRARY_REMIND', `${late.length} overdue`); alert(`Reminder sent to ${late.length} member(s).`)
  }
  return (
    <>
      <div className="row between wrap gap"><FilterBar defs={[{ key: 'state' as const, label: 'Due status', options: [{ value: 'overdue', label: 'Overdue' }, { value: 'soon', label: 'Due in 3 days' }, { value: 'ok', label: 'On time' }] }, { key: 'who' as const, label: 'Members', options: [{ value: 'student', label: 'Students' }, { value: 'staff', label: 'Faculty & staff' }] }]} f={f} count={list.length} noun="book" />
        <button className="btn btn-outline btn-sm" onClick={remind}>Remind overdue</button></div>
      <Card>
        {list.length === 0 ? <Empty text="No books out." /> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Book</th><th>Member</th><th>Issued</th><th>Due</th><th>Fine so far</th><th /></tr></thead>
            <tbody>{list.map((l) => { const u = db.users.find((x) => x.id === l.userId); return (
              <tr key={l.id}>
                <td><strong>{bookOf(db, l.bookId)?.title}</strong><div className="small muted">{l.accession}</div></td>
                <td>{u?.name}<div className="small muted">{u?.rollNo ?? (u && personaLabel(u))}</div></td>
                <td className="small">{fmtDate(l.issuedAt)}</td>
                <td>{state(l) === 'overdue' ? <Badge tone="danger">{fmtDate(l.dueAt)} · {overdueDays(l)}d late</Badge> : state(l) === 'soon' ? <Badge tone="warning">{fmtDate(l.dueAt)}</Badge> : <span className="small">{fmtDate(l.dueAt)}</span>}</td>
                <td>{fineFor(db, l) ? inr(fineFor(db, l)) : '—'}</td>
                <td><button className="btn btn-outline btn-sm" onClick={() => onMember(l.userId)}>Open member</button></td>
              </tr>
            ) })}</tbody>
          </table></div>
        )}
      </Card>
    </>
  )
}

function RulesPanel() {
  const db = useDB()
  const me = useCurrentUser()!
  const [r, setR] = useState<LibrarySettings>({ ...rules(db) })
  const num = (k: keyof LibrarySettings) => <input className="input" type="number" min={0} value={r[k]} onChange={(e) => setR({ ...r, [k]: Number(e.target.value) })} />
  return (
    <Card title="Circulation rules">
      <div className="grid grid-3">
        <Field label="Loan period (days)">{num('loanDays')}</Field>
        <Field label="Fine per late day (₹)">{num('finePerDay')}</Field>
        <Field label="Renewals allowed">{num('maxRenewals')}</Field>
        <Field label="Books at a time: students">{num('maxLoansStudent')}</Field>
        <Field label="Books at a time: faculty & staff">{num('maxLoansStaff')}</Field>
      </div>
      <p className="small muted">Students with an unpaid fine or an overdue book cannot borrow; faculty and staff get a warning. Fines are paid at the library counter (receipt issued) and can be waived with a reason.</p>
      <button className="btn" onClick={() => { update((d) => { d.librarySettings = r }); audit(me.id, 'LIBRARY_RULES', JSON.stringify(r)); alert('Saved.') }}>Save rules</button>
    </Card>
  )
}

function BookEditor({ draft, onClose }: { draft: Partial<Book>; onClose: () => void }) {
  const me = useCurrentUser()!
  const [b, setB] = useState<Partial<Book>>(draft)
  const set = (p: Partial<Book>) => setB({ ...b, ...p })
  const save = () => {
    if (!b.title?.trim() || !b.author?.trim()) return alert('Enter the title and author.')
    if ((b.copies ?? 0) < 1) return alert('At least one copy.')
    const out = getDB().loans.filter((l) => l.bookId === b.id && !l.returnedAt).length
    if (b.id && (b.copies ?? 0) - (b.lostCopies ?? 0) < out) return alert(`${out} copies are out; copies cannot be fewer.`)
    update((d) => {
      const rec = { title: b.title!.trim(), author: b.author!.trim(), isbn: b.isbn ?? '', subject: b.subject ?? 'General', copies: b.copies ?? 1, shelf: b.shelf ?? '', publisher: b.publisher, edition: b.edition, year: b.year, price: b.price, ebookUrl: b.ebookUrl || undefined }
      const ex = d.books.find((x) => x.id === b.id)
      if (ex) Object.assign(ex, rec); else d.books.push({ id: `bk${Date.now().toString(36)}`, reservations: [], addedAt: Date.now(), ...rec })
    })
    audit(me.id, b.id ? 'LIBRARY_BOOK_EDIT' : 'LIBRARY_BOOK_ADD', `${b.title} (${b.copies} copies)`)
    onClose()
  }
  return (
    <Modal wide title={b.id ? `Edit ${b.title}` : 'Add a book'} onClose={onClose} footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn" onClick={save}>Save</button></>}>
      <div className="grid grid-2">
        <Field label="Title"><input className="input" value={b.title ?? ''} onChange={(e) => set({ title: e.target.value })} /></Field>
        <Field label="Author(s)"><input className="input" value={b.author ?? ''} onChange={(e) => set({ author: e.target.value })} /></Field>
        <Field label="ISBN"><input className="input" value={b.isbn ?? ''} onChange={(e) => set({ isbn: e.target.value })} /></Field>
        <Field label="Subject"><input className="input" value={b.subject ?? ''} onChange={(e) => set({ subject: e.target.value })} /></Field>
        <Field label="Publisher"><input className="input" value={b.publisher ?? ''} onChange={(e) => set({ publisher: e.target.value })} /></Field>
        <Field label="Edition"><input className="input" value={b.edition ?? ''} onChange={(e) => set({ edition: e.target.value })} /></Field>
        <Field label="Year"><input className="input" type="number" value={b.year ?? ''} onChange={(e) => set({ year: e.target.value ? Number(e.target.value) : undefined })} /></Field>
        <Field label="Price (₹)"><input className="input" type="number" value={b.price ?? ''} onChange={(e) => set({ price: e.target.value ? Number(e.target.value) : undefined })} /></Field>
        <Field label="Copies" hint="Accession numbers are given per copy"><input className="input" type="number" min={1} value={b.copies ?? 1} onChange={(e) => set({ copies: Number(e.target.value) })} /></Field>
        <Field label="Shelf"><input className="input" value={b.shelf ?? ''} onChange={(e) => set({ shelf: e.target.value })} /></Field>
      </div>
      <Field label="E-book link (optional)"><input className="input" value={b.ebookUrl ?? ''} onChange={(e) => set({ ebookUrl: e.target.value })} /></Field>
    </Modal>
  )
}

function ReceiptModal({ loan, onClose }: { loan: BookLoan; onClose: () => void }) {
  const db = useDB()
  const u = db.users.find((x) => x.id === loan.userId)
  const b = bookOf(db, loan.bookId)
  return (
    <Modal title={`Receipt ${loan.receiptNo}`} onClose={onClose} footer={<><button className="btn btn-ghost" onClick={onClose}>Close</button><button className="btn" onClick={() => window.print()}><Printer size={14} /> Print</button></>}>
      <div className="receipt print-area">
        <div className="row between"><div><strong>Campus Portal University · Central Library</strong><div className="small muted">Fine receipt</div></div><div style={{ textAlign: 'right' }}><strong>{loan.receiptNo}</strong><div className="small">{loan.finePaidAt ? new Date(loan.finePaidAt).toLocaleString('en-IN') : ''}</div></div></div>
        <table style={{ marginTop: 10 }}><tbody>
          <tr><td className="muted">Received from</td><td><strong>{u?.name}</strong> · {u?.rollNo ?? u?.email}</td></tr>
          <tr><td className="muted">Book</td><td>{b?.title} ({loan.accession})</td></tr>
          <tr><td className="muted">Due / returned</td><td>{fmtDate(loan.dueAt)} / {loan.returnedAt ? fmtDate(loan.returnedAt) : '—'} · {overdueDays(loan)} day(s) late × {inr(rules(db).finePerDay)}</td></tr>
          <tr><td className="muted">Amount paid</td><td><strong>{inr(loan.finePaid ?? 0)}</strong></td></tr>
        </tbody></table>
        <div className="small muted" style={{ marginTop: 10 }}>Received by the Library. This is a computer-generated receipt.</div>
      </div>
    </Modal>
  )
}

/* ============================ Students, faculty and staff ============================ */

function LibraryMember() {
  const db = useDB()
  const me = useCurrentUser()!
  const [tab, setTab] = useState<'catalog' | 'mine'>('catalog')
  const [q, setQ] = useState('')
  const [receipt, setReceipt] = useState<BookLoan | null>(null)
  const f = useFilters(['subject', 'avail'] as const)
  const books = db.books.filter((b) => matches(q, b.title, b.author, b.isbn, b.subject) && f.ok('subject', b.subject) && f.ok('avail', available(db, b) > 0 ? 'in' : 'out'))
  const mine = db.loans.filter((l) => l.userId === me.id).sort((a, b) => Number(!!a.returnedAt) - Number(!!b.returnedAt) || b.issuedAt - a.issuedAt)
  const dues = memberDues(db, me.id)
  const check = issueCheck(db, me)
  const reserve = (b: Book) => { update((d) => { const x = d.books.find((y) => y.id === b.id)!; if (!x.reservations.includes(me.id)) x.reservations.push(me.id) }); notify([me.id], `Reserved "${b.title}". You'll be told when a copy is ready.`, '/library') }
  return (
    <>
      <PageHeader title="Library" subtitle="Search the catalogue, reserve books, and see your books and fines" search={{ value: q, onChange: setQ, placeholder: 'Search title, author, ISBN…' }} />
      <div className="grid grid-4">
        <Stat label="Books with me" value={`${activeLoans(db, me.id).length}/${loanLimit(db, me)}`} icon={<BookOpen size={22} />} />
        <Stat label="Overdue" value={activeLoans(db, me.id).filter((l) => l.dueAt < Date.now()).length} tone="danger" />
        <Stat label="Fine due" value={inr(dues)} tone={dues ? 'danger' : 'success'} hint={dues ? 'Pay at the library counter' : 'No dues'} />
        <Stat label="Loan period" value={`${rules(db).loanDays} days`} tone="info" hint={`${inr(rules(db).finePerDay)}/day after the due date`} />
      </div>
      {check.block && <div className="alert alert-danger">Borrowing is on hold: {check.block}</div>}
      {!check.block && check.warn && <div className="alert alert-warning">{check.warn}</div>}
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'catalog', label: 'Catalogue' }, { id: 'mine', label: 'My books & fines', count: activeLoans(db, me.id).length }]} />
      {tab === 'catalog' && (
        <>
          <FilterBar defs={[{ key: 'subject' as const, label: 'Subjects', options: opts(db.books.map((b) => b.subject)) }, { key: 'avail' as const, label: 'Availability', options: [{ value: 'in', label: 'On the shelf' }, { value: 'out', label: 'All copies out' }] }]} f={f} count={books.length} noun="title" />
          <Card>
            <div className="table-wrap"><table>
              <thead><tr><th>Title</th><th>Subject</th><th>Shelf</th><th>Available</th><th /></tr></thead>
              <tbody>{books.map((b) => { const av = available(db, b); return (
                <tr key={b.id}>
                  <td><strong>{b.title}</strong><div className="small muted">{b.author}{b.edition ? ` · ${b.edition} ed.` : ''}</div></td>
                  <td>{b.subject}</td><td>{b.shelf}</td>
                  <td><Badge tone={av > 0 ? 'success' : 'danger'}>{av}/{usableCopies(b)}</Badge></td>
                  <td className="row gap">{b.ebookUrl && <a className="btn btn-outline btn-sm" href={b.ebookUrl} target="_blank" rel="noreferrer">E-book</a>}{b.reservations.includes(me.id) ? <Badge tone="info">Reserved #{b.reservations.indexOf(me.id) + 1}</Badge> : av <= 0 && <button className="btn btn-outline btn-sm" onClick={() => reserve(b)}>Reserve</button>}</td>
                </tr>
              ) })}</tbody>
            </table></div>
          </Card>
        </>
      )}
      {tab === 'mine' && (
        <Card>
          {mine.length === 0 ? <Empty text="You have not borrowed any books." /> : (
            <div className="table-wrap"><table>
              <thead><tr><th>Book</th><th>Issued</th><th>Due</th><th>Status</th><th>Fine</th></tr></thead>
              <tbody>{mine.map((l) => { const b = bookOf(db, l.bookId); const f2 = fineFor(db, l); return (
                <tr key={l.id}>
                  <td><strong>{b?.title}</strong><div className="small muted">{l.accession}</div></td>
                  <td className="small">{fmtDate(l.issuedAt)}</td><td className="small">{fmtDate(l.dueAt)}</td>
                  <td>{l.returnedAt ? <Badge>Returned {fmtDate(l.returnedAt)}</Badge> : l.dueAt < Date.now() ? <Badge tone="danger">{overdueDays(l)} day(s) overdue</Badge> : <Badge tone="info">With you</Badge>}</td>
                  <td>{!f2 ? '—' : l.fineWaived ? <Badge>Waived</Badge> : l.receiptNo && !fineDue(db, l) ? <button className="btn btn-ghost btn-sm" onClick={() => setReceipt(l)}>Paid · {l.receiptNo}</button> : <Badge tone="danger">{inr(fineDue(db, l))}</Badge>}</td>
                </tr>
              ) })}</tbody>
            </table></div>
          )}
        </Card>
      )}
      {receipt && <ReceiptModal loan={receipt} onClose={() => setReceipt(null)} />}
    </>
  )
}
