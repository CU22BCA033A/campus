import type { DB, ResultSheet, User } from './data/types'

/** Case-insensitive "does any field contain the query" (all words must match somewhere). */
export function matches(q: string, ...fields: (string | number | undefined | null)[]) {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const hay = fields.filter((f) => f !== undefined && f !== null).join(' ').toLowerCase()
  return words.every((w) => hay.includes(w))
}

export const fmtDate = (t: number | string) =>
  new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
export const fmtDateTime = (t: number) =>
  new Date(t).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
export const fmtTime = (t: number) => new Date(t).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
export const inr = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)

export function timeAgo(t: number) {
  const s = Math.round((Date.now() - t) / 1000)
  if (s < 0) {
    const f = -s
    if (f < 3600) return `in ${Math.max(1, Math.round(f / 60))} min`
    if (f < 86400) return `in ${Math.round(f / 3600)} h`
    return `in ${Math.round(f / 86400)} days`
  }
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return `${Math.round(s / 86400)} days ago`
}

export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function coursesFor(db: DB, user: User) {
  if (user.role === 'student') return db.courses.filter((c) => c.studentIds.includes(user.id))
  if (user.role === 'faculty') return db.courses.filter((c) => c.facultyId === user.id)
  return db.courses
}

export function attendanceStats(db: DB, studentId: string, courseId?: string) {
  const recs = db.attendance.filter((a) => (!courseId || a.courseId === courseId) && db.courses.find((c) => c.id === a.courseId)?.studentIds.includes(studentId))
  const attended = recs.filter((r) => r.present.includes(studentId)).length
  const total = recs.length
  return { attended, total, pct: total ? Math.round((attended / total) * 100) : 0 }
}

export const userName = (db: DB, id: string) => db.users.find((u) => u.id === id)?.name ?? 'Unknown'
export const courseName = (db: DB, id: string) => db.courses.find((c) => c.id === id)?.name ?? 'Unknown course'

export function initials(name: string) {
  return name
    .replace(/^(Dr\.|Prof\.)\s*/, '')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export function gradeFor(pct: number) {
  if (pct >= 90) return { grade: 'O', point: 10 }
  if (pct >= 80) return { grade: 'A+', point: 9 }
  if (pct >= 70) return { grade: 'A', point: 8 }
  if (pct >= 60) return { grade: 'B+', point: 7 }
  if (pct >= 50) return { grade: 'B', point: 6 }
  if (pct >= 40) return { grade: 'C', point: 5 }
  return { grade: 'F', point: 0 }
}

/* ======================= ERP domain logic ======================= */

/** Internal marks: assignments (60%) + quizzes (40%), as a 0–100 percentage, or null if nothing graded. */
export function internalPct(db: DB, studentId: string, courseId: string): number | null {
  let got = 0, max = 0
  for (const a of db.assignments.filter((x) => x.courseId === courseId)) {
    const s = db.submissions.find((x) => x.assignmentId === a.id && x.studentId === studentId)
    if (s?.marks !== undefined) { got += s.marks; max += a.maxMarks }
  }
  let qgot = 0, qmax = 0
  for (const q of db.quizzes.filter((x) => x.courseId === courseId)) {
    const at = db.attempts.find((x) => x.quizId === q.id && x.studentId === studentId)
    if (at) { qgot += at.score; qmax += q.questions.length }
  }
  const aPct = max ? got / max : null
  const qPct = qmax ? qgot / qmax : null
  if (aPct === null && qPct === null) return null
  const pct = aPct !== null && qPct !== null ? aPct * 0.6 + qPct * 0.4 : (aPct ?? qPct)!
  return Math.round(pct * 100)
}

export const feeOutstanding = (f: DB['fees'][number]) => (f.paidAt ? 0 : f.amount - (f.scholarship ?? 0) - (f.paidAmount ?? 0))
export const studentDues = (db: DB, studentId: string) => db.fees.filter((f) => f.studentId === studentId).reduce((s, f) => s + feeOutstanding(f), 0)

/** Exam eligibility gate: attendance, fee clearance and internal marks (as in the original platform). */
export function examEligibility(db: DB, studentId: string, exam: DB['exams'][number]) {
  const reasons: string[] = []
  const att = attendanceStats(db, studentId, exam.courseId).pct
  if (att < exam.minAttendance) reasons.push(`Attendance ${att}% is below ${exam.minAttendance}%`)
  if (exam.requireFeesCleared) {
    const due = studentDues(db, studentId)
    if (due > 0) reasons.push(`Fee dues of ₹${due.toLocaleString('en-IN')} pending`)
  }
  if (exam.minInternal > 0) {
    // Internal % as set up on the course's result sheet; falls back to raw coursework.
    const sh = db.resultSheets.find((s) => s.courseId === exam.courseId && s.term === 'Regular')
    const row = sh && sheetInternal(db, sh, studentId)
    const internal = row !== undefined && sh ? Math.round((row / sh.internalMax) * 100) : internalPct(db, studentId, exam.courseId) ?? 0
    if (internal < exam.minInternal) reasons.push(`Internal marks ${internal}% below ${exam.minInternal}%`)
  }
  return { eligible: reasons.length === 0, reasons, attendance: att }
}

/**
 * Grade a set of marks. Absolute: fixed bands. Relative: percentile bands within the class,
 * falling back to absolute grading for classes too small for relative grading (< 10).
 */
export function gradeResults(marks: { studentId: string; pct: number }[], scheme: 'ABSOLUTE' | 'RELATIVE') {
  const out = new Map<string, { grade: string; point: number }>()
  if (scheme === 'ABSOLUTE' || marks.length < 10) {
    for (const m of marks) out.set(m.studentId, gradeFor(m.pct))
    return { grades: out, schemeUsed: 'ABSOLUTE' as const }
  }
  const sorted = [...marks].sort((a, b) => b.pct - a.pct)
  const bands = [
    { upTo: 0.1, grade: 'O', point: 10 }, { upTo: 0.25, grade: 'A+', point: 9 }, { upTo: 0.45, grade: 'A', point: 8 },
    { upTo: 0.65, grade: 'B+', point: 7 }, { upTo: 0.85, grade: 'B', point: 6 }, { upTo: 1, grade: 'C', point: 5 },
  ]
  sorted.forEach((m, i) => {
    if (m.pct < 40) return out.set(m.studentId, { grade: 'F', point: 0 })
    const rank = (i + 1) / sorted.length
    const b = bands.find((x) => rank <= x.upTo)!
    out.set(m.studentId, { grade: b.grade, point: b.point })
  })
  return { grades: out, schemeUsed: 'RELATIVE' as const }
}

/** Indian payroll: HRA 40%, DA 10%, PF 12% (wage ceiling ₹15,000), ESI 0.75% (gross ≤ ₹21,000), PT ₹200 (Karnataka), TDS under the new regime. */
export function computePayslip(staffId: string, basic: number, lopDays: number, daysInMonth = 30) {
  const hra = Math.round(basic * 0.4)
  const da = Math.round(basic * 0.1)
  const gross = basic + hra + da
  const lopDeduction = Math.round((gross / daysInMonth) * lopDays)
  const earned = gross - lopDeduction
  const pf = Math.round(Math.min(basic, 15000) * 0.12)
  const esi = earned <= 21000 ? Math.round(earned * 0.0075) : 0
  const professionalTax = earned >= 25000 ? 200 : 0
  const annual = earned * 12 - 75000 // standard deduction
  const slabs = [[400000, 0], [800000, 0.05], [1200000, 0.1], [1600000, 0.15], [2000000, 0.2], [2400000, 0.25], [Infinity, 0.3]] as const
  let tax = 0, prev = 0
  for (const [limit, rate] of slabs) { if (annual > prev) tax += (Math.min(annual, limit) - prev) * rate; prev = limit }
  if (annual <= 1200000) tax = 0 // section 87A rebate
  const tds = Math.round((tax * 1.04) / 12)
  const net = earned - pf - esi - professionalTax - tds
  return { staffId, basic, hra, da, gross, lopDays, lopDeduction, pf, esi, professionalTax, tds, net }
}

/** Approval chain for a purchase request by total value. */
export function approvalChain(total: number) {
  if (total <= 10000) return ['HOD']
  if (total <= 100000) return ['HOD', 'Finance']
  return ['HOD', 'Finance', 'Registrar']
}

/** Internal mark from a result sheet without importing results.ts (avoids a module cycle). */
let sheetInternalImpl: ((db: DB, sh: ResultSheet, studentId: string) => number | undefined) | null = null
export const registerSheetInternal = (f: typeof sheetInternalImpl) => { sheetInternalImpl = f }
const sheetInternal = (db: DB, sh: ResultSheet, studentId: string) => sheetInternalImpl?.(db, sh, studentId)
