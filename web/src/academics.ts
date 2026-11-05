/**
 * A student's academic record, derived only from published result sheets (Registrar of
 * Evaluation) plus the prior record of semesters completed before the portal. CGPA, SGPA and
 * backlog counts are never stored separately, so every page shows the same numbers.
 */
import type { DB, User } from './data/types'
import { studentResults } from './results'

const r2 = (n: number) => Math.round(n * 100) / 100

/** Semester-wise transcript: latest published attempt per course, grouped by course semester. */
export function transcript(db: DB, studentId: string) {
  const latest = new Map<string, ReturnType<typeof studentResults>[number]>()
  // studentResults is newest first, so the first attempt seen per course is the latest.
  for (const x of studentResults(db, studentId)) if (!latest.has(x.course.id)) latest.set(x.course.id, x)
  const bySem = new Map<number, ReturnType<typeof studentResults>>()
  for (const x of latest.values()) bySem.set(x.sheet.semester, [...(bySem.get(x.sheet.semester) ?? []), x])
  const semesters = [...bySem.entries()].sort((a, b) => a[0] - b[0]).map(([semester, rows]) => {
    const credits = rows.reduce((t, x) => t + x.course.credits, 0)
    const points = rows.reduce((t, x) => t + x.row.point * x.course.credits, 0)
    const earned = rows.filter((x) => x.row.pass).reduce((t, x) => t + x.course.credits, 0)
    return { semester, rows: rows.sort((a, b) => a.course.code.localeCompare(b.course.code)), credits, earned, sgpa: credits ? r2(points / credits) : null }
  })
  return semesters
}

/** CGPA = credit-weighted over the prior record and every course's latest published attempt. */
export function cgpaOf(db: DB, u: User) {
  const prior = u.priorRecord
  let pts = prior ? prior.cgpa * prior.credits : 0
  let cr = prior?.credits ?? 0
  for (const s of transcript(db, u.id)) for (const x of s.rows) { pts += x.row.point * x.course.credits; cr += x.course.credits }
  return cr ? r2(pts / cr) : null
}

/** Uncleared failed courses (portal) plus backlogs carried in the prior record. */
export const backlogCountOf = (u: User) => (u.priorRecord?.backlogs ?? 0) + (u.backlogCourses?.length ?? 0)

export const fmtCgpa = (n: number | null) => (n === null ? '—' : n.toFixed(2))
