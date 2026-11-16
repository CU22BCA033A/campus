/** Library circulation: copies, loans, overdue fines (collected by the Library with a receipt, or waived). */
import type { Book, BookLoan, DB, User } from './data/types'

const DAY = 86_400_000
export const DEFAULT_LIBRARY = { loanDays: 14, finePerDay: 5, maxLoansStudent: 3, maxLoansStaff: 6, maxRenewals: 1 }
export const rules = (db: DB) => db.librarySettings ?? DEFAULT_LIBRARY

export const overdueDays = (l: BookLoan, at = Date.now()) => Math.max(0, Math.ceil(((l.returnedAt ?? at) - l.dueAt) / DAY))
/** Fine on a loan: fixed at return; still growing while the book is out and overdue. */
export const fineFor = (db: DB, l: BookLoan, at = Date.now()) => (l.returnedAt ? l.fine ?? 0 : overdueDays(l, at) * rules(db).finePerDay)
/** What is still owed on a loan (nothing once paid or waived). */
export const fineDue = (db: DB, l: BookLoan) => (l.fineWaived ? 0 : Math.max(0, fineFor(db, l) - (l.finePaid ?? 0)))
export const memberDues = (db: DB, userId: string) => db.loans.filter((l) => l.userId === userId).reduce((t, l) => t + fineDue(db, l), 0)
export const activeLoans = (db: DB, userId?: string) => db.loans.filter((l) => !l.returnedAt && (!userId || l.userId === userId))
export const loanLimit = (db: DB, u: User) => (u.role === 'student' ? rules(db).maxLoansStudent : rules(db).maxLoansStaff)

export const usableCopies = (b: Book) => Math.max(0, b.copies - (b.lostCopies ?? 0))
export const available = (db: DB, b: Book) => usableCopies(b) - db.loans.filter((l) => l.bookId === b.id && !l.returnedAt).length
/** Next free accession number of a book. */
export function freeAccession(db: DB, b: Book) {
  const out = new Set(db.loans.filter((l) => l.bookId === b.id && !l.returnedAt).map((l) => l.accession))
  for (let i = 1; i <= usableCopies(b); i++) { const acc = `${b.id.toUpperCase()}-${String(i).padStart(2, '0')}`; if (!out.has(acc)) return acc }
  return undefined
}
export const nextReceiptNo = (db: DB) => `LIB-${new Date().getFullYear()}-${String(db.loans.filter((l) => l.receiptNo).length + 1).padStart(4, '0')}`

/** Can this member borrow another book? Students are blocked by unpaid fines; faculty and staff get a warning. */
export function issueCheck(db: DB, u: User) {
  const dues = memberDues(db, u.id)
  const out = activeLoans(db, u.id)
  const overdue = out.filter((l) => l.dueAt < Date.now())
  if (out.length >= loanLimit(db, u)) return { block: `${u.name} already has ${out.length} book(s), the limit for ${u.role === 'student' ? 'students' : 'staff'}.`, warn: null }
  if (u.role === 'student' && dues > 0) return { block: `${u.name} has an unpaid library fine of ₹${dues}. Collect or waive it before issuing another book.`, warn: null }
  if (u.role === 'student' && overdue.length) return { block: `${u.name} has ${overdue.length} overdue book(s). Return them first.`, warn: null }
  if (dues > 0 || overdue.length) return { block: null, warn: `${u.name} has ${dues ? `an unpaid fine of ₹${dues}` : ''}${dues && overdue.length ? ' and ' : ''}${overdue.length ? `${overdue.length} overdue book(s)` : ''}.` }
  return { block: null, warn: null }
}
