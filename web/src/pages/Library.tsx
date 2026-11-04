import { useState } from 'react'
import { BookMarked, Plus, Search } from 'lucide-react'
import { audit, notify, uid, update, useCurrentUser, useDB } from '../data/store'
import { Badge, Card, Empty, Field, Modal, PageHeader, Stat, Tabs } from '../components/ui'
import { fmtDate, inr, userName } from '../lib'
import type { Book, BookLoan, DB } from '../data/types'

const LOAN_DAYS = 14
const FINE_PER_DAY = 5
const MAX_LOANS = 3

export const fineFor = (l: BookLoan, at = Date.now()) => Math.max(0, Math.ceil(((l.returnedAt ?? at) - l.dueAt) / 86_400_000)) * FINE_PER_DAY
const available = (db: DB, b: Book) => b.copies - db.loans.filter((l) => l.bookId === b.id && !l.returnedAt).length

export default function Library() {
  const db = useDB()
  const user = useCurrentUser()!
  const isLibrarian = user.role === 'admin'
  const [tab, setTab] = useState<'catalog' | 'loans' | 'desk'>('catalog')
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ title: '', author: '', isbn: '', subject: '', copies: 1, shelf: '' })
  const [issue, setIssue] = useState({ bookId: '', member: '' })
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const books = db.books.filter((b) => (b.title + b.author + b.isbn + b.subject).toLowerCase().includes(q.toLowerCase()))
  const myLoans = db.loans.filter((l) => l.userId === user.id).sort((a, b) => Number(!!a.returnedAt) - Number(!!b.returnedAt) || a.dueAt - b.dueAt)
  const active = db.loans.filter((l) => !l.returnedAt)

  const doIssue = (bookId: string, userId: string) => {
    const b = db.books.find((x) => x.id === bookId)!
    if (available(db, b) <= 0) return setMsg({ ok: false, text: 'No copies available.' })
    if (db.loans.filter((l) => l.userId === userId && !l.returnedAt).length >= MAX_LOANS) return setMsg({ ok: false, text: `Member already has ${MAX_LOANS} books.` })
    if (b.reservations.length && b.reservations[0] !== userId && available(db, b) <= b.reservations.length) return setMsg({ ok: false, text: `Copy is held for ${userName(db, b.reservations[0])}.` })
    update((d) => {
      d.loans.push({ id: uid('ln'), bookId, userId, issuedAt: Date.now(), dueAt: Date.now() + LOAN_DAYS * 86_400_000 })
      const bk = d.books.find((x) => x.id === bookId)!; bk.reservations = bk.reservations.filter((r) => r !== userId)
    })
    notify([userId], `Issued "${b.title}", due ${fmtDate(Date.now() + LOAN_DAYS * 86_400_000)}`, '/library')
    audit(user.id, 'LIBRARY_ISSUE', `${b.title} → ${userName(db, userId)}`)
    setMsg({ ok: true, text: `Issued "${b.title}" to ${userName(db, userId)}.` })
  }
  const doReturn = (l: BookLoan) => {
    const fine = fineFor(l)
    const b = db.books.find((x) => x.id === l.bookId)!
    update((d) => { const x = d.loans.find((y) => y.id === l.id)!; x.returnedAt = Date.now(); x.fine = fine })
    if (fine) update((d) => { d.fees.push({ id: uid('fee'), studentId: l.userId, title: `Library fine: ${b.title}`, amount: fine, dueAt: Date.now() + 7 * 86_400_000, head: 'Other' }) })
    if (b.reservations[0]) notify([b.reservations[0]], `"${b.title}" is now available for you to collect`, '/library')
    audit(user.id, 'LIBRARY_RETURN', `${b.title} from ${userName(db, l.userId)}${fine ? `, fine ${inr(fine)} added to fees` : ''}`)
  }
  const renew = (l: BookLoan) => {
    const b = db.books.find((x) => x.id === l.bookId)!
    if (b.reservations.length) return alert('This book is reserved by another member and cannot be renewed.')
    if (l.dueAt < Date.now()) return alert('Overdue books must be returned at the desk.')
    update((d) => { d.loans.find((y) => y.id === l.id)!.dueAt += LOAN_DAYS * 86_400_000 })
  }
  const reserve = (b: Book) => update((d) => { const x = d.books.find((y) => y.id === b.id)!; if (!x.reservations.includes(user.id)) x.reservations.push(user.id) })
  const memberId = () => db.users.find((u) => u.rollNo?.toLowerCase() === issue.member.trim().toLowerCase() || u.email.toLowerCase() === issue.member.trim().toLowerCase())?.id

  return (
    <>
      <PageHeader title="Library" subtitle={`Online catalogue (OPAC), loans, reservations and fines. ${LOAN_DAYS}-day loans, ${inr(FINE_PER_DAY)}/day late fine`} actions={isLibrarian && <button className="btn" onClick={() => setAdding(true)}><Plus size={14} /> Add title</button>} />
      <div className="grid grid-4">
        <Stat label="Titles" value={db.books.length} hint={`${db.books.reduce((s, b) => s + b.copies, 0)} copies`} icon={<BookMarked size={22} />} />
        <Stat label="On loan" value={active.length} tone="info" />
        <Stat label="Overdue" value={active.filter((l) => l.dueAt < Date.now()).length} tone="danger" />
        {!isLibrarian && <Stat label="My fines" value={inr(myLoans.reduce((s, l) => s + fineFor(l), 0))} tone="warning" />}
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'catalog', label: 'Catalogue' }, { id: 'loans', label: isLibrarian ? 'All loans' : 'My books', count: isLibrarian ? active.length : myLoans.filter((l) => !l.returnedAt).length }, ...(isLibrarian ? [{ id: 'desk' as const, label: 'Issue desk' }] : [])]} />
      {tab === 'catalog' && (
        <Card>
          <div className="search" style={{ maxWidth: 420, marginBottom: 12 }}><Search size={16} className="muted" /><input placeholder="Search title, author, ISBN or subject" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          {books.length === 0 ? <Empty text="No books match." /> : (
            <div className="table-wrap"><table>
              <thead><tr><th>Title</th><th>Subject</th><th>Shelf</th><th>Available</th><th /></tr></thead>
              <tbody>{books.map((b) => { const av = available(db, b); return (
                <tr key={b.id}>
                  <td><strong>{b.title}</strong><div className="small muted">{b.author} · ISBN {b.isbn}</div></td>
                  <td>{b.subject}</td><td>{b.shelf}</td>
                  <td><Badge tone={av > 0 ? 'success' : 'danger'}>{av}/{b.copies}</Badge>{b.reservations.length > 0 && <span className="small muted"> · {b.reservations.length} on hold</span>}</td>
                  <td className="row gap">
                    {b.ebookUrl && <a className="btn btn-outline btn-sm" href={b.ebookUrl} target="_blank" rel="noreferrer">E-book</a>}
                    {!isLibrarian && (b.reservations.includes(user.id) ? <Badge tone="info">Reserved</Badge> : av <= 0 && <button className="btn btn-outline btn-sm" onClick={() => reserve(b)}>Reserve</button>)}
                    {isLibrarian && av > 0 && <button className="btn btn-outline btn-sm" onClick={() => { setIssue({ bookId: b.id, member: '' }); setTab('desk') }}>Issue</button>}
                  </td>
                </tr>
              ) })}</tbody>
            </table></div>
          )}
        </Card>
      )}
      {tab === 'loans' && (
        <Card>
          {(isLibrarian ? active : myLoans).length === 0 ? <Empty text="No loans." /> : (
            <div className="table-wrap"><table>
              <thead><tr><th>Book</th>{isLibrarian && <th>Member</th>}<th>Issued</th><th>Due</th><th>Fine</th><th /></tr></thead>
              <tbody>{(isLibrarian ? active : myLoans).map((l) => { const b = db.books.find((x) => x.id === l.bookId)!; const over = !l.returnedAt && l.dueAt < Date.now(); return (
                <tr key={l.id}>
                  <td>{b.title}</td>{isLibrarian && <td>{userName(db, l.userId)}</td>}<td>{fmtDate(l.issuedAt)}</td>
                  <td>{l.returnedAt ? <Badge>Returned {fmtDate(l.returnedAt)}</Badge> : <Badge tone={over ? 'danger' : 'success'}>{fmtDate(l.dueAt)}</Badge>}</td>
                  <td>{fineFor(l) ? inr(fineFor(l)) : '—'}</td>
                  <td>{!l.returnedAt && (isLibrarian ? <button className="btn btn-sm" onClick={() => doReturn(l)}>Return</button> : <button className="btn btn-outline btn-sm" onClick={() => renew(l)}>Renew</button>)}</td>
                </tr>
              ) })}</tbody>
            </table></div>
          )}
        </Card>
      )}
      {tab === 'desk' && isLibrarian && (
        <Card title="Issue a book">
          <div className="grid grid-2">
            <Field label="Book"><select className="select" value={issue.bookId} onChange={(e) => setIssue({ ...issue, bookId: e.target.value })}><option value="">Select…</option>{db.books.map((b) => <option key={b.id} value={b.id}>{b.title} ({available(db, b)} available)</option>)}</select></Field>
            <Field label="Member roll no. or email" hint="Scan the ID card barcode or type it"><input className="input" value={issue.member} onChange={(e) => setIssue({ ...issue, member: e.target.value })} placeholder="22BCA001" /></Field>
          </div>
          <button className="btn" style={{ marginTop: 12 }} disabled={!issue.bookId || !issue.member} onClick={() => { const id = memberId(); if (!id) setMsg({ ok: false, text: 'Member not found.' }); else doIssue(issue.bookId, id) }}>Issue</button>
          {msg && <div className={`alert ${msg.ok ? 'alert-success' : 'alert-danger'}`} style={{ marginTop: 12 }}>{msg.text}</div>}
        </Card>
      )}
      {adding && (
        <Modal title="Add title" onClose={() => setAdding(false)} footer={<><button className="btn btn-ghost" onClick={() => setAdding(false)}>Cancel</button><button className="btn" onClick={() => { if (!draft.title) return; update((d) => { d.books.push({ id: uid('bk'), ...draft, reservations: [] }) }); setAdding(false) }}>Add</button></>}>
          <Field label="Title"><input className="input" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></Field>
          <div className="grid grid-2">
            <Field label="Author"><input className="input" value={draft.author} onChange={(e) => setDraft({ ...draft, author: e.target.value })} /></Field>
            <Field label="ISBN"><input className="input" value={draft.isbn} onChange={(e) => setDraft({ ...draft, isbn: e.target.value })} /></Field>
            <Field label="Subject"><input className="input" value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} /></Field>
            <Field label="Shelf"><input className="input" value={draft.shelf} onChange={(e) => setDraft({ ...draft, shelf: e.target.value })} /></Field>
            <Field label="Copies"><input className="input" type="number" min={1} value={draft.copies} onChange={(e) => setDraft({ ...draft, copies: Number(e.target.value) })} /></Field>
          </div>
        </Modal>
      )}
    </>
  )
}
