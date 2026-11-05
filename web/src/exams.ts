/** Exams as sessions of subject papers. */
import type { DB, Exam, ExamKind, ExamSession } from './data/types'

export const kindOfTitle = (t: string): ExamKind => (/supplementary/i.test(t) ? 'Supplementary' : /end sem/i.test(t) ? 'End Semester' : /mid/i.test(t) ? 'Mid-Semester' : /internal|test/i.test(t) ? 'Internal Test' : 'Other')
export const sessionPapers = (db: DB, sessionId: string) => db.exams.filter((e) => e.sessionId === sessionId).sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))
export const sessionOf = (db: DB, e: Exam) => db.examSessions.find((s) => s.id === e.sessionId)
export const sessionDates = (db: DB, sessionId: string) => { const p = sessionPapers(db, sessionId); return p.length ? { from: p[0].date, to: p[p.length - 1].date } : null }

/**
 * Put every paper into an exam session. Papers of the same class and title share a session;
 * supplementary papers share one open supplementary session per month. Runs after every update,
 * so older data and papers created elsewhere (e.g. backlog registration) are always grouped.
 */
export function groupIntoSessions(d: DB) {
  if (!d.examSessions) d.examSessions = []
  for (const e of d.exams) {
    if (e.sessionId && d.examSessions.some((s) => s.id === e.sessionId)) continue
    const course = d.courses.find((c) => c.id === e.courseId)
    const kind = e.kind === 'Supplementary' ? 'Supplementary' : kindOfTitle(e.title)
    const classId = kind === 'Supplementary' ? undefined : course?.classId
    const title = kind === 'Supplementary' ? `Supplementary Examination – ${new Date(e.date).toLocaleString('en-IN', { month: 'short', year: 'numeric' })}` : e.title
    let s = d.examSessions.find((x) => x.title === title && x.classId === classId && x.kind === kind)
    if (!s) {
      const base = `es-${(classId ?? 'supp').replace(/^cls-/, '')}-${kind.toLowerCase().replace(/[^a-z]/g, '')}`
      let id = base, n = 2
      while (d.examSessions.some((x) => x.id === id)) id = `${base}-${n++}`
      s = { id, title, kind, classId, minAttendance: e.minAttendance, requireFeesCleared: e.requireFeesCleared, grading: e.grading, createdAt: Date.now() }
      d.examSessions.push(s)
    }
    e.sessionId = s.id
  }
}

/** Apply a session's eligibility & grading rules to all its papers. */
export function applySessionRules(d: DB, s: ExamSession) {
  for (const e of d.exams) if (e.sessionId === s.id) { e.minAttendance = s.minAttendance; e.requireFeesCleared = s.requireFeesCleared; e.grading = s.grading; e.title = s.title }
}
