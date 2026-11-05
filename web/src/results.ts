/**
 * Result sheets: internal (selected assignments / quizzes / tests) + external (end-semester exam)
 * = final marks → grade. Backlog registrations and publishing live here too.
 */
import type { DB, InternalComponent, ResultSheet, User } from './data/types'
import { gradeFor } from './lib'

export const compKey = (c: InternalComponent) => `${c.kind}:${c.id}`
const r1 = (n: number) => Math.round(n * 10) / 10

/** Label and maximum marks of an internal component. */
export function componentInfo(db: DB, c: InternalComponent) {
  if (c.kind === 'assignment') { const a = db.assignments.find((x) => x.id === c.id); return { label: a?.title ?? 'Assignment', short: 'Asg', max: a?.maxMarks ?? 0 } }
  if (c.kind === 'quiz') { const q = db.quizzes.find((x) => x.id === c.id); return { label: q?.title ?? 'Quiz', short: 'Quiz', max: q?.questions.length ?? 0 } }
  const e = db.exams.find((x) => x.id === c.id); return { label: e?.title ?? 'Test', short: 'Test', max: e?.maxMarks ?? 0 }
}

/** Everything that could count towards a course's internals. */
export function availableComponents(db: DB, courseId: string, externalExamId?: string): InternalComponent[] {
  return [
    ...db.assignments.filter((a) => a.courseId === courseId).map((a) => ({ kind: 'assignment' as const, id: a.id })),
    ...db.quizzes.filter((q) => q.courseId === courseId).map((q) => ({ kind: 'quiz' as const, id: q.id })),
    ...db.exams.filter((e) => e.courseId === courseId && e.id !== externalExamId && !/end sem|supplementary/i.test(e.title)).map((e) => ({ kind: 'exam' as const, id: e.id })),
  ]
}

/** A student's raw mark on a component (before any override). */
function rawComponent(db: DB, c: InternalComponent, studentId: string): number | undefined {
  if (c.kind === 'assignment') return db.submissions.find((s) => s.assignmentId === c.id && s.studentId === studentId)?.marks
  if (c.kind === 'quiz') return db.attempts.find((a) => a.quizId === c.id && a.studentId === studentId)?.score
  return db.results.find((r) => r.examId === c.id && r.studentId === studentId)?.marks
}

/** Students on a sheet: the course roster plus backlog / re-exam registrations. */
export function sheetRoster(db: DB, sh: ResultSheet) {
  const course = db.courses.find((c) => c.id === sh.courseId)
  const ids = [...new Set([...(sh.term === 'Regular' ? course?.studentIds ?? [] : []), ...sh.extraStudentIds])]
  return ids.map((id) => db.users.find((u) => u.id === id)).filter(Boolean) as User[]
}

export interface SheetRow {
  student: User
  backlogAttempt: boolean
  components: { key: string; value: number | undefined; max: number; overridden: boolean }[]
  internalRaw: number
  internalRawMax: number
  internal: number
  internalOverridden: boolean
  externalRaw: number | undefined // marks on the exam paper
  externalRawMax: number
  external: number | undefined // scaled to externalMax
  absent: boolean
  final: number | undefined
  pct: number | undefined
  grade: string | undefined
  point: number
  pass: boolean | undefined
}

export function sheetRows(db: DB, sh: ResultSheet): SheetRow[] {
  const exam = db.exams.find((e) => e.id === sh.examId)
  const course = db.courses.find((c) => c.id === sh.courseId)
  return sheetRoster(db, sh).map((student) => {
    const o = sh.overrides[student.id] ?? {}
    const components = sh.components.map((c) => {
      const k = compKey(c)
      const max = componentInfo(db, c).max
      const ov = o.components?.[k]
      return { key: k, value: ov ?? rawComponent(db, c, student.id), max, overridden: ov !== undefined }
    })
    const internalRaw = components.reduce((t, c) => t + (c.value ?? 0), 0)
    const internalRawMax = components.reduce((t, c) => t + c.max, 0)
    const computed = sh.scaleInternals ? (internalRawMax ? (internalRaw / internalRawMax) * sh.internalMax : 0) : Math.min(internalRaw, sh.internalMax)
    const internal = r1(Math.min(sh.internalMax, Math.max(0, o.internal ?? computed)))
    const externalRaw = exam ? db.results.find((r) => r.examId === exam.id && r.studentId === student.id)?.marks : undefined
    const externalRawMax = exam?.maxMarks ?? sh.externalMax
    const absent = !!o.absent
    const external = absent ? 0 : externalRaw === undefined ? undefined : r1((externalRaw / externalRawMax) * sh.externalMax)
    const final = external === undefined ? undefined : Math.round(internal + external)
    const total = sh.internalMax + sh.externalMax
    const pct = final === undefined ? undefined : (final / total) * 100
    const pass = final === undefined ? undefined : !absent && (external! / sh.externalMax) * 100 >= sh.minExternalPct && pct! >= sh.minTotalPct
    const g = pct === undefined ? undefined : pass ? gradeFor(pct) : { grade: absent ? 'AB' : 'F', point: 0 }
    return {
      student, backlogAttempt: sh.term === 'Supplementary' || (sh.extraStudentIds.includes(student.id) && !course?.studentIds.includes(student.id)),
      components, internalRaw, internalRawMax, internal, internalOverridden: o.internal !== undefined,
      externalRaw, externalRawMax, external, absent, final, pct, grade: g?.grade, point: g?.point ?? 0, pass,
    }
  })
}

export function sheetProgress(db: DB, sh: ResultSheet) {
  const rows = sheetRows(db, sh)
  const withExternal = rows.filter((r) => r.external !== undefined).length
  return { rows, total: rows.length, withExternal, complete: rows.length > 0 && withExternal === rows.length, passed: rows.filter((r) => r.pass).length }
}

/** The regular sheet for a course in a given semester (one per course offering). */
export const sheetFor = (db: DB, courseId: string, semester: number) => db.resultSheets.find((s) => s.courseId === courseId && s.semester === semester && s.term === 'Regular')

/** Published results for a student across all attempts, newest first. */
export function studentResults(db: DB, studentId: string) {
  return db.resultSheets.filter((sh) => sh.status === 'PUBLISHED')
    .map((sh) => ({ sheet: sh, course: db.courses.find((c) => c.id === sh.courseId)!, row: sheetRows(db, sh).find((r) => r.student.id === studentId) }))
    .filter((x) => x.row && x.course)
    .sort((a, b) => (b.sheet.publishedAt ?? 0) - (a.sheet.publishedAt ?? 0)) as { sheet: ResultSheet; course: DB['courses'][number]; row: SheetRow }[]
}

/** SGPA for a semester from published regular results (credit-weighted). */
export function sgpaOf(db: DB, studentId: string, semester?: number) {
  let pts = 0, cr = 0
  for (const x of studentResults(db, studentId)) {
    if (x.sheet.term !== 'Regular' || x.row.backlogAttempt || (semester !== undefined && x.sheet.semester !== semester)) continue
    pts += x.row.point * x.course.credits; cr += x.course.credits
  }
  return cr ? pts / cr : null
}

/**
 * Publish a sheet: freeze it, mark the linked exam published, and update every student's
 * backlogs (a failed course becomes a backlog; passing a backlog attempt clears it).
 */
export function publishSheet(d: DB, sheetId: string, actorId: string) {
  const sh = d.resultSheets.find((s) => s.id === sheetId)!
  const rows = sheetRows(d, sh)
  sh.status = 'PUBLISHED'; sh.publishedAt = Date.now(); sh.publishedBy = actorId
  const exam = d.exams.find((e) => e.id === sh.examId)
  if (exam) exam.resultsPublished = true
  for (const r of rows) {
    if (r.pass === undefined) continue
    const u = d.users.find((x) => x.id === r.student.id)!
    const list = new Set(u.backlogCourses ?? [])
    const had = list.has(sh.courseId)
    if (r.pass) list.delete(sh.courseId); else list.add(sh.courseId)
    u.backlogCourses = [...list]
    if (!had && !r.pass) u.backlogs = (u.backlogs ?? 0) + 1
    if (had && r.pass) u.backlogs = Math.max(0, (u.backlogs ?? 0) - 1)
  }
}

/** Default sheet for a course offering. */
export function newSheet(courseId: string, semester: number, evaluatorId: string, examId?: string, term: ResultSheet['term'] = 'Regular'): ResultSheet {
  return { id: `rs-${courseId}-${term === 'Regular' ? `s${semester}` : `sup${Date.now().toString(36)}`}`, courseId, semester, term, internalMax: 40, externalMax: 60, scaleInternals: true, minExternalPct: 35, minTotalPct: 40, components: [], examId, evaluatorId, extraStudentIds: [], overrides: {}, status: 'DRAFT' }
}
