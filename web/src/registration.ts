/**
 * Course registration (Registrar of Evaluation). Class courses are taken by the whole class; foundation and
 * open-elective courses are pan-university baskets that students of the listed classes opt for, up to the
 * course's seats. A registration records the student's semester, so results land in the right semester.
 */
import type { Course, CourseKind, DB, ResultSheet, User } from './data/types'

export const KIND_LABEL: Record<CourseKind, string> = { CORE: 'Class course', FOUNDATION: 'Foundation', OPEN_ELECTIVE: 'Open elective' }
export const kindOf = (c: Course): CourseKind => c.kind ?? 'CORE'
export const isPan = (c: Course) => kindOf(c) !== 'CORE'

/** Students on a course (class roster for class courses, registered students for pan-university courses). */
export const seatsTaken = (c: Course) => c.studentIds.length
export const seatsLeft = (c: Course) => (c.slots ? Math.max(0, c.slots - c.studentIds.length) : Infinity)

/** Pan-university courses offered in a term. */
export const panCourses = (db: DB, term: string) => db.courses.filter((c) => isPan(c) && c.term === term)
/** Is the registration term the next one? Then students register for their next semester. */
export const registeringAhead = (db: DB) => db.registration.registrationTerm !== db.registration.currentTerm
export const semesterForRegistration = (db: DB, s: User) => (s.semester ?? 1) + (registeringAhead(db) ? 1 : 0)

/** Pan-university courses a student may opt for in the registration term. */
export const eligibleCourses = (db: DB, s: User, kind?: CourseKind) => panCourses(db, db.registration.registrationTerm).filter((c) => (!kind || kindOf(c) === kind) && !!s.classId && (c.classIds ?? []).includes(s.classId))

export const activeRegs = (db: DB, studentId: string, term?: string) => db.registrations.filter((r) => r.studentId === studentId && r.status === 'REGISTERED' && (!term || r.term === term))

export type Basket = 'FOUNDATION' | 'OPEN_ELECTIVE'
/** How many courses a student must choose from a basket: the class's limit, else the default. */
export const basketLimit = (db: DB, s: User, k: Basket) => db.registration.basketLimits?.[s.classId ?? '']?.[k] ?? (k === 'FOUNDATION' ? db.registration.minFoundation : db.registration.minOpenElective)
export const timeLimitMin = (db: DB) => db.registration.timeLimitMin ?? 15

/** A student's timed registration session: not started, running (with ms left), submitted, or out of time. */
export function sessionState(db: DB, sid: string, now = Date.now()) {
  const s = db.registration.sessions?.[sid]
  if (!s) return { state: 'none' as const, left: timeLimitMin(db) * 60_000 }
  if (s.submittedAt) return { state: 'submitted' as const, left: 0, at: s.submittedAt, startedAt: s.startedAt }
  if (now >= s.endsAt) return { state: 'expired' as const, left: 0, at: s.endsAt, startedAt: s.startedAt }
  return { state: 'active' as const, left: s.endsAt - now, startedAt: s.startedAt }
}

/** Where a student stands for the registration term. */
export function registrationStatus(db: DB, s: User) {
  const term = db.registration.registrationTerm
  const regs = activeRegs(db, s.id, term).map((r) => db.courses.find((c) => c.id === r.courseId)!).filter(Boolean)
  const foundation = regs.filter((c) => kindOf(c) === 'FOUNDATION')
  const open = regs.filter((c) => kindOf(c) === 'OPEN_ELECTIVE')
  const nextSem = semesterForRegistration(db, s)
  const core = db.courses.filter((c) => kindOf(c) === 'CORE' && c.semester === nextSem && ((c.classId === s.classId && !(c.droppedIds ?? []).includes(s.id)) || (c.extraIds ?? []).includes(s.id)))
  const credits = [...core, ...regs].reduce((t, c) => t + c.credits, 0)
  const { minCredits = 0, maxCredits } = db.registration
  const creditsOk = credits >= minCredits
  const limits = { FOUNDATION: basketLimit(db, s, 'FOUNDATION'), OPEN_ELECTIVE: basketLimit(db, s, 'OPEN_ELECTIVE') }
  const complete = foundation.length >= limits.FOUNDATION && open.length >= limits.OPEN_ELECTIVE && creditsOk
  return { term, nextSem, core, foundation, open, credits, creditsOk, minCredits, maxCredits, overMax: maxCredits !== undefined && credits > maxCredits, complete, limits }
}

/** Register a student in a pan-university course; returns an error message or null. */
export function registerCourse(d: DB, courseId: string, studentId: string, actorId: string, override = false): string | null {
  const c = d.courses.find((x) => x.id === courseId)
  const s = d.users.find((u) => u.id === studentId)
  if (!c || !s) return 'Course or student not found.'
  if (c.studentIds.includes(studentId) || (c.extraIds ?? []).includes(studentId)) return `${s.name} is already registered in ${c.code}.`
  if (!isPan(c)) {
    // Class courses: the office can add a student from outside the class (or re-add a dropped one).
    if (!override) return 'Class courses are taken by the whole class; the Registrar of Evaluation can add other students.'
    c.droppedIds = (c.droppedIds ?? []).filter((x) => x !== studentId)
    if (s.classId !== c.classId) c.extraIds = [...new Set([...(c.extraIds ?? []), studentId])]
    c.studentIds.push(studentId)
    d.registrations.push({ id: `reg-${courseId}-${studentId}-${Date.now().toString(36)}`, courseId, studentId, semester: c.semester, term: c.term ?? d.registration.currentTerm, status: 'REGISTERED', at: Date.now(), by: actorId })
    return null
  }
  if (!override) {
    // Students register only inside their timed session, and only as many courses as the basket allows.
    const ss = sessionState(d, studentId)
    if (c.term === d.registration.registrationTerm && ss.state !== 'active') return ss.state === 'none' ? 'Start your registration first.' : 'Your registration time is over. Contact the Registrar of Evaluation.'
    const k = kindOf(c) as Basket
    const st = registrationStatus(d, s)
    const have = (k === 'FOUNDATION' ? st.foundation : st.open).length
    if (c.term === d.registration.registrationTerm && have >= st.limits[k]) return `You can choose only ${st.limits[k]} ${KIND_LABEL[k].toLowerCase()} course(s). Drop one to switch.`
  }
  if (!override && d.registration.maxCredits !== undefined) {
    const st = registrationStatus(d, s)
    if (c.term === d.registration.registrationTerm && st.credits + c.credits > d.registration.maxCredits) return `That would make ${st.credits + c.credits} credits; the limit is ${d.registration.maxCredits} per semester.`
  }
  if (!override && !(c.classIds ?? []).includes(s.classId ?? '')) return `${c.code} is not offered to ${s.name}'s class.`
  if (!override && seatsLeft(c) <= 0) return `${c.code} is full (${c.slots} seats).`
  c.studentIds.push(studentId)
  d.registrations.push({ id: `reg-${courseId}-${studentId}-${Date.now().toString(36)}`, courseId, studentId, semester: c.term === d.registration.currentTerm ? s.semester ?? 1 : semesterForRegistration(d, s), term: c.term ?? d.registration.registrationTerm, status: 'REGISTERED', at: Date.now(), by: actorId })
  return null
}

export function dropCourse(d: DB, courseId: string, studentId: string, actorId = '') {
  const c = d.courses.find((x) => x.id === courseId)
  if (!c) return
  c.studentIds = c.studentIds.filter((x) => x !== studentId)
  if (!isPan(c)) {
    c.extraIds = (c.extraIds ?? []).filter((x) => x !== studentId)
    if (d.users.find((u) => u.id === studentId)?.classId === c.classId) c.droppedIds = [...new Set([...(c.droppedIds ?? []), studentId])]
    if (!d.registrations.some((r) => r.courseId === courseId && r.studentId === studentId && r.status === 'REGISTERED')) d.registrations.push({ id: `reg-${courseId}-${studentId}-${Date.now().toString(36)}`, courseId, studentId, semester: c.semester, term: d.registration.currentTerm, status: 'REGISTERED', at: Date.now(), by: actorId })
  }
  for (const r of d.registrations) if (r.courseId === courseId && r.studentId === studentId && r.status === 'REGISTERED') { r.status = 'DROPPED'; r.droppedAt = Date.now() }
}

/** Semester a course attempt belongs to for a student (registrations place pan-university courses). */
export function semesterOf(db: DB, sheet: ResultSheet, studentId: string) {
  const c = db.courses.find((x) => x.id === sheet.courseId)
  if (c && isPan(c)) return db.registrations.find((r) => r.courseId === c.id && r.studentId === studentId && r.status === 'REGISTERED')?.semester ?? sheet.semester
  return sheet.semester
}

/** "Sem 5", "Foundation · Odd 2026-27" … */
export const courseWhen = (c: Course) => (isPan(c) ? `${KIND_LABEL[kindOf(c)]} · ${c.term ?? ''}` : `Semester ${c.semester}`)

/** Everything a student registered for, semester by semester (class courses by roster, baskets by registration). */
export function semesterCourses(db: DB, studentId: string) {
  const bySem = new Map<number, Course[]>()
  const add = (sem: number, c: Course) => { const l = bySem.get(sem) ?? []; if (!l.some((x) => x.id === c.id)) bySem.set(sem, [...l, c]) }
  for (const c of db.courses) if (!isPan(c) && c.studentIds.includes(studentId)) add(c.semester, c)
  for (const r of db.registrations) if (r.studentId === studentId && r.status === 'REGISTERED') { const c = db.courses.find((x) => x.id === r.courseId); if (c) add(r.semester, c) }
  return bySem
}
