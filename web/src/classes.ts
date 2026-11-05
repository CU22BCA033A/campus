/** Classes (programme + batch + section), course rosters, class results and semester promotion. */
import type { ClassGroup, DB } from './data/types'
import { gradeResults } from './lib'

export const classLabel = (c?: ClassGroup) => (c ? `${c.program} ${c.batch} · Sem ${c.semester} · Sec ${c.section}` : 'Unassigned')
export const classOf = (db: DB, studentId: string) => db.classes.find((c) => c.id === db.users.find((u) => u.id === studentId)?.classId)
export const classStudents = (db: DB, classId: string) => db.users.filter((u) => u.role === 'student' && u.classId === classId)
/** Courses a class takes in its current semester. */
export const classCourses = (db: DB, cls: ClassGroup) => db.courses.filter((c) => c.classId === cls.id && c.semester === cls.semester)

/**
 * Keep course rosters in step with classes: a course offered to a class in that class's
 * current semester is taken by everyone in the class. Past-semester courses keep their roster
 * (so history, attendance and results stay intact). Call inside `update` after changing classes
 * or a student's class.
 */
export function resyncRosters(d: DB) {
  for (const c of d.courses) {
    const cls = d.classes.find((x) => x.id === c.classId)
    if (cls && c.semester === cls.semester) c.studentIds = d.users.filter((u) => u.role === 'student' && u.classId === cls.id).map((u) => u.id)
  }
  // Students mirror their class's programme/semester/section.
  for (const u of d.users) {
    const cls = d.classes.find((x) => x.id === u.classId)
    if (u.role === 'student' && cls) { u.program = cls.program; u.semester = cls.semester; u.section = cls.section; u.batch = cls.batch }
  }
}

/** End-semester result sheet for a class's current semester. */
export function classResults(db: DB, cls: ClassGroup) {
  const courses = classCourses(db, cls)
  const exams = courses.map((c) => ({ course: c, exam: db.exams.filter((e) => e.courseId === c.id && /end sem/i.test(e.title)).sort((a, b) => b.date.localeCompare(a.date))[0] }))
  const students = classStudents(db, cls.id).filter((s) => s.status === 'ACTIVE')
  const graded = exams.map(({ course, exam }) => {
    if (!exam) return { course, exam, grades: new Map<string, { grade: string; point: number }>() }
    const rs = db.results.filter((r) => r.examId === exam.id)
    return { course, exam, grades: gradeResults(rs.map((r) => ({ studentId: r.studentId, pct: (r.marks / exam.maxMarks) * 100 })), exam.grading).grades }
  })
  const rows = students.map((s) => {
    let pts = 0, cr = 0, failed = 0
    const cells = graded.map(({ course, exam, grades }) => {
      const r = exam && db.results.find((x) => x.examId === exam.id && x.studentId === s.id)
      const g = grades.get(s.id)
      if (exam && exam.resultsPublished) {
        if (!g || g.point === 0) failed++
        if (g) { pts += g.point * course.credits; cr += course.credits }
      }
      return { course, marks: r?.marks, max: exam?.maxMarks, grade: g?.grade, published: !!exam?.resultsPublished }
    })
    return { student: s, cells, sgpa: cr ? pts / cr : null, failed }
  })
  const missingExam = graded.filter((g) => !g.exam).map((g) => g.course.code)
  const unpublished = graded.filter((g) => g.exam && !g.exam.resultsPublished).map((g) => g.course.code)
  const ready = courses.length > 0 && missingExam.length === 0 && unpublished.length === 0
  return { courses, exams: graded, rows, ready, missingExam, unpublished }
}

/**
 * Promote a class to the next semester after its results are published.
 * Failed courses become backlogs; CGPA is updated with this semester's SGPA; detained students
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
    if (row.sgpa !== null) u.cgpa = Math.round((((u.cgpa ?? row.sgpa) * (sem - 1) + row.sgpa) / sem) * 100) / 100
    u.backlogs = (u.backlogs ?? 0) + row.failed
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
