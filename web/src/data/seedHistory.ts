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
const noise = (...k: (string | number)[]) => { let h = 2166136261; for (const ch of k.join('|')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0 } return ((h % 2001) / 1000) - 1 } // FNV-1a

/** 20 recorded classes over the semester before an exam; stronger students miss fewer. */
function pastAttendance(db: DB, courseId: string, facultyId: string, roster: string[], examAt: number) {
  for (let k = 0; k < 20; k++) {
    const date = iso(examAt - (110 - k * 5) * DAY)
    const present = roster.filter((sid) => (noise(sid, courseId, k) + 1) / 2 > (10 - (ABILITY[sid] ?? 7.5)) * 0.035 + 0.04)
    db.attendance.push({ id: `hatt-${courseId}-${k}`, courseId, date, present, markedBy: facultyId })
  }
}

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
        pastAttendance(db, courseId, facultyId, roster, examAt)
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

type PanDef = { code: string; name: string; kind: 'FOUNDATION' | 'OPEN_ELECTIVE'; credits: number; facultyId: string; slots: number; programs: string[] }

/** Academic terms of the demo. */
export const TERMS = { past: 'Even 2025-26', current: 'Odd 2026-27', next: 'Even 2026-27' }

/**
 * Pan-university baskets: last term (results published), this term (exams written; one sheet waiting to be
 * published) and next term (registration open, some students registered, one elective nearly full).
 */
export function addUniversityCourses(db: DB, now: number) {
  db.registration = { currentTerm: TERMS.current, registrationTerm: TERMS.next, open: true, closesAt: now + 10 * DAY, minFoundation: 1, minOpenElective: 1, minCredits: 12, maxCredits: 26 }
  db.registrations = []
  const classesFor = (programs: string[]) => db.classes.filter((c) => programs.includes(c.program)).map((c) => c.id)
  const student = (id: string) => db.users.find((u) => u.id === id)!
  const makeCourse = (p: PanDef, term: string) => {
    const id = `pc-${p.code.toLowerCase()}`
    db.courses.push({ id, code: p.code, name: p.name, kind: p.kind, credits: p.credits, facultyId: p.facultyId, slots: p.slots, classIds: classesFor(p.programs), term, semester: 0, description: `${p.kind === 'FOUNDATION' ? 'Foundation' : 'Open elective'} course open to students across programmes.`, studentIds: [] })
    return id
  }
  const reg = (courseId: string, sid: string, semester: number, term: string, at: number) => {
    db.courses.find((c) => c.id === courseId)!.studentIds.push(sid)
    db.registrations.push({ id: `reg-${courseId}-${sid}`, courseId, studentId: sid, semester, term, status: 'REGISTERED', at, by: sid })
  }
  /** Exam + result sheet for a pan-university course. */
  const examine = (courseId: string, sessionId: string, title: string, examAt: number, status: ResultSheet['status'], idx: number) => {
    const c = db.courses.find((x) => x.id === courseId)!
    const exam: Exam = { id: `px-${courseId}`, courseId, title, date: iso(examAt + idx * DAY), start: '14:00', end: '16:00', venue: 'Exam Block', maxMarks: 100, minAttendance: 75, requireFeesCleared: true, minInternal: 0, resultsPublished: status === 'PUBLISHED', grading: 'ABSOLUTE', evaluatorId: c.facultyId, kind: 'Regular', sessionId }
    db.exams.push(exam)
    const overrides: ResultSheet['overrides'] = {}
    for (const sid of c.studentIds) {
      const pct = Math.max(48, Math.min(96, (ABILITY[sid] ?? 7.5) * 10 + 2 + noise(sid, c.code) * 8))
      const internal = Math.round(Math.min(58, pct * 0.62 + noise(c.code, sid) * 3))
      overrides[sid] = { internal }
      db.results.push({ id: `pr-${courseId}-${sid}`, examId: exam.id, studentId: sid, marks: Math.min(100, Math.max(40, Math.round(((pct - internal) / 40) * 100))) })
    }
    const publishedAt = examAt + 20 * DAY
    db.resultSheets.push({
      id: `rs-${courseId}`, courseId, semester: 0, term: 'Regular', internalMax: 60, externalMax: 40, scaleInternals: true, minExternalPct: 35, minTotalPct: 40, components: [], examId: exam.id,
      evaluatorId: c.facultyId, extraStudentIds: [], overrides, status, ...(status !== 'DRAFT' ? { submittedAt: Math.min(now - DAY, publishedAt - 3 * DAY) } : {}), ...(status === 'PUBLISHED' ? { publishedAt: Math.min(now - DAY, publishedAt), publishedBy: 'a6' } : {}),
    })
  }
  const studentsOf = (classId: string) => db.users.filter((u) => u.role === 'student' && u.classId === classId && !LATERAL.has(u.id)).map((u) => u.id)
  const session = (id: string, title: string, at: number) => db.examSessions.push({ id, title, kind: 'End Semester', minAttendance: 75, requireFeesCleared: true, grading: 'ABSOLUTE', internalMax: 60, externalMax: 40, minTotalMarks: 40, minExternalMarks: 14, createdAt: at - 30 * DAY })

  // Last term: every student took one foundation course and one open elective outside their programme.
  const pastAt = now + (12 - 182) * DAY
  const pFnd = makeCourse({ code: 'FND201', name: 'Indian Constitution & Professional Ethics', kind: 'FOUNDATION', credits: 2, facultyId: 'f3', slots: 40, programs: ['BCA', 'BBA'] }, TERMS.past)
  const pMkt = makeCourse({ code: 'OEL201', name: 'Digital Marketing Basics', kind: 'OPEN_ELECTIVE', credits: 3, facultyId: 'f4', slots: 20, programs: ['BCA'] }, TERMS.past)
  const pWeb = makeCourse({ code: 'OEL202', name: 'Web Design for Beginners', kind: 'OPEN_ELECTIVE', credits: 3, facultyId: 'f1', slots: 20, programs: ['BBA'] }, TERMS.past)
  for (const cls of db.classes) for (const sid of studentsOf(cls.id)) {
    reg(pFnd, sid, cls.semester - 1, TERMS.past, pastAt - 120 * DAY)
    reg(cls.program === 'BCA' ? pMkt : pWeb, sid, cls.semester - 1, TERMS.past, pastAt - 120 * DAY)
  }
  const pastTitle = `University Courses Examination – ${monthYear(pastAt)}`
  session('es-pan-past', pastTitle, pastAt)
  for (const id of [pFnd, pMkt, pWeb]) { const c = db.courses.find((x) => x.id === id)!; pastAttendance(db, id, c.facultyId, c.studentIds, pastAt) }
  ;[pFnd, pMkt, pWeb].forEach((id, i) => examine(id, 'es-pan-past', pastTitle, pastAt - 6 * DAY, 'PUBLISHED', i))

  // This term: exams written two weeks ago. Personal Finance marks are submitted and await publication.
  const curAt = now - 16 * DAY
  const cFnd = makeCourse({ code: 'FND301', name: 'Universal Human Values', kind: 'FOUNDATION', credits: 2, facultyId: 'f3', slots: 40, programs: ['BCA', 'BBA'] }, TERMS.current)
  const cPho = makeCourse({ code: 'OEL301', name: 'Photography & Visual Storytelling', kind: 'OPEN_ELECTIVE', credits: 3, facultyId: 'f4', slots: 10, programs: ['BCA'] }, TERMS.current)
  const cFin = makeCourse({ code: 'OEL302', name: 'Personal Finance', kind: 'OPEN_ELECTIVE', credits: 3, facultyId: 'f4', slots: 10, programs: ['BCA'] }, TERMS.current)
  const cDat = makeCourse({ code: 'OEL303', name: 'Introduction to Data Analytics', kind: 'OPEN_ELECTIVE', credits: 3, facultyId: 'f1', slots: 10, programs: ['BBA'] }, TERMS.current)
  for (const cls of db.classes) studentsOf(cls.id).forEach((sid, i) => {
    reg(cFnd, sid, cls.semester, TERMS.current, curAt - 100 * DAY)
    reg(cls.program === 'BBA' ? cDat : i % 2 ? cFin : cPho, sid, cls.semester, TERMS.current, curAt - 100 * DAY)
  })
  const curTitle = `University Courses Examination – ${monthYear(curAt)}`
  session('es-pan-current', curTitle, curAt)
  for (const id of [cFnd, cPho, cFin, cDat]) { const c = db.courses.find((x) => x.id === id)!; pastAttendance(db, id, c.facultyId, c.studentIds, curAt) }
  examine(cFnd, 'es-pan-current', curTitle, curAt, 'PUBLISHED', 0)
  examine(cPho, 'es-pan-current', curTitle, curAt, 'PUBLISHED', 1)
  examine(cFin, 'es-pan-current', curTitle, curAt, 'SUBMITTED', 1)
  examine(cDat, 'es-pan-current', curTitle, curAt, 'PUBLISHED', 1)

  // Next term: registration open.
  const n = {
    dt: makeCourse({ code: 'FND401', name: 'Design Thinking & Innovation', kind: 'FOUNDATION', credits: 2, facultyId: 'f2', slots: 20, programs: ['BCA', 'BBA'] }, TERMS.next),
    env: makeCourse({ code: 'FND402', name: 'Environmental Sustainability', kind: 'FOUNDATION', credits: 2, facultyId: 'f3', slots: 20, programs: ['BCA', 'BBA'] }, TERMS.next),
    cw: makeCourse({ code: 'OEL401', name: 'Creative Writing', kind: 'OPEN_ELECTIVE', credits: 3, facultyId: 'f4', slots: 6, programs: ['BCA', 'BBA'] }, TERMS.next),
    ent: makeCourse({ code: 'OEL402', name: 'Entrepreneurship Essentials', kind: 'OPEN_ELECTIVE', credits: 3, facultyId: 'f4', slots: 12, programs: ['BCA'] }, TERMS.next),
    py: makeCourse({ code: 'OEL403', name: 'Python for Business', kind: 'OPEN_ELECTIVE', credits: 3, facultyId: 'f1', slots: 8, programs: ['BBA'] }, TERMS.next),
  }
  const picks: [string, string[]][] = [['s1', [n.dt, n.ent]], ['s2', [n.dt, n.cw]], ['s4', [n.env, n.cw]], ['s6', [n.dt]], ['s9', [n.env, n.ent]], ['s14', [n.env, n.cw]], ['s17', [n.dt, n.cw]], ['s19', [n.env, n.py]], ['s22', [n.dt, n.cw]]]
  picks.forEach(([sid, cs], i) => cs.forEach((cid) => reg(cid, sid, (student(sid).semester ?? 1) + 1, TERMS.next, now - (5 - i * 0.4) * DAY)))
  // One student changed their mind: a dropped registration stays in the history.
  db.registrations.push({ id: 'reg-drop-s2', courseId: n.ent, studentId: 's2', semester: 6, term: TERMS.next, status: 'DROPPED', at: now - 6 * DAY, by: 's2', droppedAt: now - 5.5 * DAY })

  // Class courses already set up for next semester (rosters fill when the class is promoted).
  db.courses.push(
    { id: 'c-bca601', code: 'BCA601', name: 'Cloud Computing', facultyId: 'f2', credits: 4, semester: 6, description: 'Virtualisation, cloud service models, deployment and DevOps basics.', studentIds: [], classId: 'cls-bca-2024-a', kind: 'CORE', slots: 60 },
    { id: 'c-bca602', code: 'BCA602', name: 'Major Project', facultyId: 'f1', credits: 6, semester: 6, description: 'Team project from proposal to deployment.', studentIds: [], classId: 'cls-bca-2024-a', kind: 'CORE', slots: 60 },
    { id: 'c-bca401', code: 'BCA401', name: 'Java Programming', facultyId: 'f1', credits: 4, semester: 4, description: 'Object-oriented programming in Java, collections and JDBC.', studentIds: [], classId: 'cls-bca-2025-a', kind: 'CORE', slots: 60 },
    { id: 'c-bca402', code: 'BCA402', name: 'Design & Analysis of Algorithms', facultyId: 'f2', credits: 4, semester: 4, description: 'Complexity, divide and conquer, greedy methods and dynamic programming.', studentIds: [], classId: 'cls-bca-2025-a', kind: 'CORE', slots: 60 },
    { id: 'c-bba601', code: 'BBA601', name: 'Strategic Management', facultyId: 'f4', credits: 4, semester: 6, description: 'Strategy formulation, competitive analysis and implementation.', studentIds: [], classId: 'cls-bba-2024-a', kind: 'CORE', slots: 60 },
    { id: 'c-bba602', code: 'BBA602', name: 'International Business', facultyId: 'f4', credits: 4, semester: 6, description: 'Trade theory, foreign markets, FDI and global operations.', studentIds: [], classId: 'cls-bba-2024-a', kind: 'CORE', slots: 60 },
  )
}
