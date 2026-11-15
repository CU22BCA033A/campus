/**
 * Real academic history for the demo: every class gets the courses, end-semester exams, marks and
 * published result sheets of the semesters it has already completed. CGPA, SGPA, transcripts and
 * backlogs are then derived from these records (academics.ts), exactly as they would be in use.
 */
import type { DB, Exam, ExamSession, ResultSheet } from './types'

const DAY = 86_400_000

type CourseDef = [code: string, name: string, credits: number, facultyId: string]
const CURRICULUM: Record<string, CourseDef[][]> = {
  BCA: [
    [['BCA101', 'Programming in C', 4, 'f1'], ['BCA102', 'Digital Electronics', 3, 'f2'], ['MAT101', 'Mathematics I', 4, 'f3'], ['BCA103', 'Computer Fundamentals', 3, 'f1']],
    [['BCA201', 'Object Oriented Programming with C++', 4, 'f1'], ['MAT201', 'Mathematics II', 4, 'f3'], ['BCA202', 'Computer Organisation', 3, 'f2'], ['EVS201', 'Environmental Studies', 2, 'f3']],
    [['BCA301', 'Data Structures', 4, 'f1'], ['BCA302', 'Computer Networks', 4, 'f2'], ['MAT301', 'Probability & Statistics', 3, 'f3']],
    [['BCA401', 'Java Programming', 4, 'f1'], ['BCA402', 'Design & Analysis of Algorithms', 4, 'f2'], ['MAT401', 'Numerical Methods', 3, 'f3'], ['BCA403', 'Python Programming', 3, 'f1']],
  ],
  BBA: [
    [['BBA101', 'Principles of Management', 4, 'f4'], ['BBA102', 'Business Economics', 4, 'f4'], ['MAT105', 'Business Mathematics', 3, 'f3'], ['BBA103', 'Business Communication', 3, 'f4']],
    [['BBA201', 'Organisational Behaviour', 4, 'f4'], ['BBA202', 'Cost Accounting', 4, 'f4'], ['MAT205', 'Business Statistics', 3, 'f3'], ['EVS201', 'Environmental Studies', 2, 'f3']],
    [['BBA301', 'Human Resource Management', 4, 'f4'], ['BBA302', 'Business Law', 4, 'f4'], ['BBA303', 'Corporate Accounting', 3, 'f4']],
    [['BBA401', 'Financial Management', 4, 'f4'], ['BBA402', 'Production & Operations Management', 4, 'f4'], ['MAT405', 'Research Methodology', 3, 'f3']],
  ],
}

/** How strong each student is (≈ the CGPA they end up with). */
const ABILITY: Record<string, number> = {
  s1: 8.4, s2: 7.9, s3: 6.9, s4: 8.9, s5: 7.2, s6: 9.1, s7: 6.3, s8: 8.1, s9: 7.5, s10: 8.6, s11: 5.9, s12: 7.0,
  s14: 8.1, s15: 7.4, s16: 6.8, s17: 8.7, s18: 7.8, s19: 8.0, s20: 7.1, s21: 6.4, s22: 8.8,
}
/** Courses a student failed: [semester, course index, cleared later in a supplementary exam?]. */
const FAILS: Record<string, [number, number, boolean][]> = {
  s3: [[3, 2, true]],
  s7: [[2, 1, false], [4, 2, true]],
  s11: [[1, 0, true], [3, 1, false], [4, 2, false]],
  s16: [[2, 1, false]],
  s21: [[4, 2, true]],
}
/** Lateral entries join a class after its earlier semesters; their earlier record is a prior record. */
const LATERAL = new Set(['s13'])

const monthYear = (t: number) => new Date(t).toLocaleString('en-IN', { month: 'short', year: 'numeric' })
const iso = (t: number) => new Date(t).toISOString().slice(0, 10)
/** Deterministic noise in [-1, 1]. */
const noise = (...k: (string | number)[]) => { let h = 7; for (const ch of k.join('|')) h = (h * 33 + ch.charCodeAt(0)) % 100003; return ((h % 2001) / 1000) - 1 }

export function addAcademicHistory(db: DB, now: number) {
  for (const cls of db.classes) {
    const plan = CURRICULUM[cls.program]
    if (!plan) continue
    const roster = db.users.filter((u) => u.role === 'student' && u.classId === cls.id && !LATERAL.has(u.id)).map((u) => u.id)
    for (let sem = 1; sem < cls.semester; sem++) {
      // The current semester's exams are ~2 weeks away; each earlier semester ended ~6 months before the next.
      const examAt = now + (12 - (cls.semester - sem) * 182) * DAY
      const session: ExamSession = {
        id: `es-${cls.id.replace(/^cls-/, '')}-s${sem}`, title: `End Semester Examination – ${monthYear(examAt)}`, kind: 'End Semester', classId: cls.id,
        minAttendance: 75, requireFeesCleared: true, grading: 'ABSOLUTE', internalMax: 60, externalMax: 40, minTotalMarks: 40, minExternalMarks: 14, createdAt: examAt - 40 * DAY,
      }
      db.examSessions.push(session)
      plan[sem - 1].forEach(([code, name, credits, facultyId], idx) => {
        const courseId = `hc-${cls.id.replace(/^cls-/, '')}-${code.toLowerCase()}`
        db.courses.push({ id: courseId, code, name, facultyId, credits, semester: sem, description: `${name} (Semester ${sem}).`, studentIds: roster, classId: cls.id })
        const exam: Exam = {
          id: `hx-${courseId}`, courseId, title: session.title, date: iso(examAt + idx * 2 * DAY), start: '09:30', end: '12:30', venue: 'Exam Block', maxMarks: 100,
          minAttendance: 75, requireFeesCleared: true, minInternal: 0, resultsPublished: true, grading: 'ABSOLUTE', evaluatorId: facultyId, kind: 'Regular', sessionId: session.id,
        }
        db.exams.push(exam)
        const overrides: ResultSheet['overrides'] = {}
        for (const sid of roster) {
          const fail = FAILS[sid]?.find(([s, i]) => s === sem && i === idx)
          const pct = fail ? 33 + noise(sid, code) * 4 : Math.max(42, Math.min(97, (ABILITY[sid] ?? 7.5) * 10 - 1 + noise(sid, code, sem) * 9))
          const internal = Math.round(Math.min(58, Math.max(18, pct * 0.62 + noise(code, sid) * 4)))
          const externalOf40 = Math.max(0, pct - internal)
          const raw = fail ? Math.round(22 + noise(sid) * 4) : Math.min(100, Math.max(36, Math.round((externalOf40 / 40) * 100)))
          overrides[sid] = { internal }
          db.results.push({ id: `hr-${courseId}-${sid}`, examId: exam.id, studentId: sid, marks: raw })
        }
        const publishedAt = examAt + 28 * DAY
        db.resultSheets.push({
          id: `rs-${courseId}`, courseId, semester: sem, term: 'Regular', internalMax: 60, externalMax: 40, scaleInternals: true, minExternalPct: 35, minTotalPct: 40,
          components: [], examId: exam.id, evaluatorId: facultyId, extraStudentIds: [], overrides, status: 'PUBLISHED', submittedAt: publishedAt - 6 * DAY, publishedAt, publishedBy: 'a6',
        })
        // Supplementary attempt for failures that were cleared later.
        const cleared = roster.filter((sid) => FAILS[sid]?.some(([s, i, ok]) => s === sem && i === idx && ok))
        if (cleared.length) {
          const suppAt = examAt + 75 * DAY
          const sSession: ExamSession = { id: `es-supp-${courseId}`, title: `Supplementary Examination – ${monthYear(suppAt)}`, kind: 'Supplementary', minAttendance: 0, requireFeesCleared: true, grading: 'ABSOLUTE', internalMax: 60, externalMax: 40, minTotalMarks: 40, minExternalMarks: 14, createdAt: suppAt - 20 * DAY }
          if (!db.examSessions.some((x) => x.title === sSession.title)) db.examSessions.push(sSession)
          const sid0 = db.examSessions.find((x) => x.title === sSession.title)!.id
          const sx: Exam = { ...exam, id: `hxs-${courseId}`, title: sSession.title, date: iso(suppAt), kind: 'Supplementary', sessionId: sid0 }
          db.exams.push(sx)
          for (const sid of cleared) db.results.push({ id: `hrs-${courseId}-${sid}`, examId: sx.id, studentId: sid, marks: Math.round(58 + noise(sid, 'supp') * 8) })
          db.resultSheets.push({
            id: `rs-sup-${courseId}`, courseId, semester: sem, term: 'Supplementary', internalMax: 60, externalMax: 40, scaleInternals: true, minExternalPct: 35, minTotalPct: 40,
            components: [], examId: sx.id, evaluatorId: facultyId, extraStudentIds: cleared, overrides: Object.fromEntries(cleared.map((sid) => [sid, { internal: overrides[sid].internal }])),
            status: 'PUBLISHED', submittedAt: suppAt + 15 * DAY, publishedAt: suppAt + 20 * DAY, publishedBy: 'a6',
          })
        }
      })
    }
  }
}
