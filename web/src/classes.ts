/** Classes (programme + batch + section), course rosters, class results and semester promotion. */
import type { ClassGroup, DB } from './data/types'
import { sheetFor, sheetRows } from './results'
import { isPan } from './registration'

export const classLabel = (c?: ClassGroup) => (c ? `${c.program} ${c.batch} · Sem ${c.semester} · Sec ${c.section}` : 'Unassigned')
export const classOf = (db: DB, studentId: string) => db.classes.find((c) => c.id === db.users.find((u) => u.id === studentId)?.classId)
export const classStudents = (db: DB, classId: string) => db.users.filter((u) => u.role === 'student' && u.classId === classId)
/** Courses a class takes in its current semester. */
export const classCourses = (db: DB, cls: ClassGroup) => db.courses.filter((c) => !isPan(c) && c.classId === cls.id && c.semester === cls.semester)

/**
 * Keep course rosters in step with classes: a course offered to a class in that class's
 * current semester is taken by everyone in the class. Past-semester courses keep their roster
 * (so history, attendance and results stay intact). Call inside `update` after changing classes
 * or a student's class.
 */
export function resyncRosters(d: DB) {
  for (const c of d.courses) {
    const cls = d.classes.find((x) => x.id === c.classId)
    // Class roster, minus students the office dropped, plus students it added (e.g. transfers, repeaters).
    if (cls && c.semester === cls.semester) c.studentIds = [...new Set([...d.users.filter((u) => u.role === 'student' && u.classId === cls.id && !(c.droppedIds ?? []).includes(u.id)).map((u) => u.id), ...(c.extraIds ?? [])])]
  }
  // Students mirror their class's programme/semester/section.
  for (const u of d.users) {
    const cls = d.classes.find((x) => x.id === u.classId)
    if (u.role === 'student' && cls) { u.program = cls.program; u.semester = cls.semester; u.section = cls.section; u.batch = cls.batch }
  }
}

/** A class's current-semester results, from the result sheets (internal + external = final). */
export function classResults(db: DB, cls: ClassGroup, semester = cls.semester) {
  const courses = db.courses.filter((c) => c.classId === cls.id && c.semester === semester)
  const sheets = courses.map((course) => ({ course, sheet: sheetFor(db, course.id, semester) }))
  const students = classStudents(db, cls.id).filter((s) => s.status === 'ACTIVE')
  // Foundation / open-elective courses the class's students took in this semester.
  const regsHere = db.registrations.filter((r) => r.status === 'REGISTERED' && r.semester === semester && students.some((s) => s.id === r.studentId))
  const pan = db.courses.filter((c) => isPan(c) && regsHere.some((r) => r.courseId === c.id)).map((course) => ({ course, sheet: sheetFor(db, course.id, course.semester) }))
  const rowsBySheet = new Map([...sheets, ...pan].filter((x) => x.sheet).map((x) => [x.sheet!.id, sheetRows(db, x.sheet!)]))
  const rows = students.map((s) => {
    let pts = 0, cr = 0, failed = 0
    const cells = sheets.map(({ course, sheet }) => {
      const r = sheet ? rowsBySheet.get(sheet.id)!.find((x) => x.student.id === s.id) : undefined
      const published = sheet?.status === 'PUBLISHED'
      if (published && r) { if (!r.pass) failed++; pts += r.point * course.credits; cr += course.credits }
      return { course, internal: r?.internal, external: r?.external, final: r?.final, max: sheet ? sheet.internalMax + sheet.externalMax : 100, grade: r?.grade, published }
    })
    const electives = pan.filter(({ course }) => regsHere.some((r) => r.courseId === course.id && r.studentId === s.id)).map(({ course, sheet }) => {
      const r = sheet ? rowsBySheet.get(sheet.id)!.find((x) => x.student.id === s.id) : undefined
      const published = sheet?.status === 'PUBLISHED'
      if (published && r) { if (!r.pass) failed++; pts += r.point * course.credits; cr += course.credits }
      return { course, final: r?.final, grade: r?.grade, published, max: sheet ? sheet.internalMax + sheet.externalMax : 100 }
    })
    return { student: s, cells, electives, sgpa: cr ? pts / cr : null, failed }
  })
  const missingExam = [...sheets, ...pan].filter((x) => !x.sheet).map((x) => x.course.code) // no result sheet yet
  const unpublished = [...sheets, ...pan].filter((x) => x.sheet && x.sheet.status !== 'PUBLISHED').map((x) => x.course.code)
  const ready = courses.length > 0 && missingExam.length === 0 && unpublished.length === 0
  return { semester, courses, panCourses: pan.map((x) => x.course), sheets, rows, ready, missingExam, unpublished }
}

/** Analysis of a published class result: pass rate, averages, grade spread, per-course figures and rank list. */
export function classAnalysis(r: ReturnType<typeof classResults>) {
  const GRADES = ['O', 'A+', 'A', 'B+', 'B', 'C', 'F', 'AB']
  const graded = r.rows.flatMap((x) => x.cells.filter((c) => c.published && c.grade))
  const grades = GRADES.map((g) => ({ grade: g, count: graded.filter((c) => c.grade === g).length })).filter((g) => g.count || !['AB'].includes(g.grade))
  const withSgpa = r.rows.filter((x) => x.sgpa !== null)
  const passedAll = r.rows.filter((x) => x.sgpa !== null && x.failed === 0)
  const ranked = [...passedAll].sort((a, b) => (b.sgpa ?? 0) - (a.sgpa ?? 0))
  const rankOf = new Map<string, number>()
  ranked.forEach((x, i) => rankOf.set(x.student.id, i > 0 && ranked[i - 1].sgpa === x.sgpa ? rankOf.get(ranked[i - 1].student.id)! : i + 1))
  const perCourse = r.courses.map((course, i) => {
    const cells = r.rows.map((x) => x.cells[i]).filter((c) => c.published && c.final !== undefined)
    const finals = cells.map((c) => c.final!)
    return { course, avg: finals.length ? finals.reduce((t, v) => t + v, 0) / finals.length : null, high: finals.length ? Math.max(...finals) : null, passPct: cells.length ? (cells.filter((c) => c.grade !== 'F' && c.grade !== 'AB').length / cells.length) * 100 : null, max: cells[0]?.max ?? 100 }
  })
  return {
    grades, perCourse, rankOf, toppers: ranked.slice(0, 3),
    passPct: withSgpa.length ? (passedAll.length / withSgpa.length) * 100 : null,
    avgSgpa: withSgpa.length ? withSgpa.reduce((t, x) => t + (x.sgpa ?? 0), 0) / withSgpa.length : null,
  }
}

/**
 * Promote a class to the next semester after its results are published.
 * Backlogs come from published result sheets; CGPA is updated with this semester's SGPA; detained students
 * are moved to a repeat section of the same semester. A class finishing its final semester graduates.
 */
export function promoteClass(d: DB, classId: string, detainedIds: string[], actorId: string) {
  const cls = d.classes.find((c) => c.id === classId)!
  const res = classResults(d, cls)
  const graduating = cls.semester >= cls.maxSemesters
  for (const row of res.rows) {
    const u = d.users.find((x) => x.id === row.student.id)!
    if (detainedIds.includes(u.id)) {
      const repeatSection = `${cls.section}-R`
      let rep = d.classes.find((c) => c.program === cls.program && c.batch === cls.batch && c.section === repeatSection && c.semester === cls.semester)
      if (!rep) { rep = { id: `${cls.id}-r${cls.semester}`, program: cls.program, batch: cls.batch, section: repeatSection, semester: cls.semester, maxSemesters: cls.maxSemesters, mentorId: cls.mentorId }; d.classes.push(rep) }
      u.classId = rep.id
      continue
    }
    const sem = cls.semester
    void sem // CGPA is derived from published results (academics.ts), so nothing is stored here.
    // Backlogs were already recorded when each result sheet was published.
    if (graduating) {
      u.status = 'DEACTIVATED'
      d.alumni.push({ id: `al-${u.id}`, name: u.name, batch: new Date().getFullYear(), program: cls.program, company: '—', role: 'Graduate', city: '—', mentor: false, email: u.email, mentees: [], donations: 0 })
    }
  }
  if (!graduating) cls.semester += 1
  cls.promotedAt = Date.now()
  resyncRosters(d)
  d.audit.unshift({ id: `au${Date.now().toString(36)}`, at: Date.now(), actorId, action: graduating ? 'CLASS_GRADUATED' : 'CLASS_PROMOTED', detail: `${cls.program} ${cls.batch} Sec ${cls.section}: ${graduating ? 'graduated' : `Sem ${cls.semester - 1} → Sem ${cls.semester}`}, ${detainedIds.length} detained` })
}

/** Distinct colour per class (stable: derived from the class id), used on tiles and chips. */
const CLASS_COLORS = [
  { fg: '#7a1e2c', bg: '#f8eaec' }, { fg: '#1d5fa8', bg: '#e8f0fb' }, { fg: '#1f7a46', bg: '#e6f4ec' }, { fg: '#9a5b00', bg: '#fcf1de' },
  { fg: '#6b3fa0', bg: '#f1eaf9' }, { fg: '#0f766e', bg: '#e3f4f2' }, { fg: '#b42369', bg: '#fbe8f1' }, { fg: '#4b5563', bg: '#eef0f3' },
]
export function classColor(c?: { id: string }) {
  if (!c) return CLASS_COLORS[7]
  let h = 0
  for (const ch of c.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return CLASS_COLORS[h % (CLASS_COLORS.length - 1)]
}
