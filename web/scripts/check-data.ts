/** Demo-data integrity check: every reference points at a real record and modules agree (run: npm run check:data). */
import { createSeed } from '../src/data/seed'
import { feeOutstanding } from '../src/lib'
const db = createSeed() as any
const users = new Set(db.users.map((u: any) => u.id))
const sets: Record<string, Set<string>> = {
  course: new Set(db.courses.map((x: any) => x.id)), exam: new Set(db.exams.map((x: any) => x.id)), class: new Set(db.classes.map((x: any) => x.id)),
  hostel: new Set(db.hostels.map((x: any) => x.id)), service: new Set(db.services.map((x: any) => x.id)), club: new Set(db.clubs.map((x: any) => x.id)),
  assignment: new Set(db.assignments.map((x: any) => x.id)), quiz: new Set(db.quizzes.map((x: any) => x.id)), book: new Set(db.books.map((x: any) => x.id)), session: new Set(db.examSessions.map((x: any) => x.id)),
  scholarship: new Set(db.scholarships.map((x: any) => x.id)),
}
const U = /^(studentId|userId|authorId|facultyId|staffId|raisedBy|assignedTo|postedBy|createdBy|reviewedBy|markedBy|actorId|publishedBy|evaluatorId|mentorId|wardenId|requestedBy|bookedBy|facultyAdvisorId|ownerFacultyId|by)$/
const UA = /^(studentIds|present|absent|onLeave|rsvps|members|subscribers|occupants|wardIds|mentees|extraStudentIds|reservations)$/
const R: Record<string, string> = { courseId: 'course', examId: 'exam', classId: 'class', hostelId: 'hostel', serviceId: 'service', clubId: 'club', assignmentId: 'assignment', quizId: 'quiz', bookId: 'book', sessionId: 'session', scholarshipId: 'scholarship' }
const bad: string[] = []
const walk = (o: any, path: string) => {
  if (Array.isArray(o)) return o.forEach((x, i) => walk(x, `${path}[${i}]`))
  if (!o || typeof o !== 'object') return
  for (const [k, v] of Object.entries(o)) {
    if (typeof v === 'string' && U.test(k) && !users.has(v) && !['web', 'system'].includes(v)) bad.push(`${path}.${k}=${v}`)
    if (Array.isArray(v) && UA.test(k)) for (const x of v) if (typeof x === 'string' && !users.has(x)) bad.push(`${path}.${k} has ${x}`)
    if (typeof v === 'string' && R[k] && !sets[R[k]].has(v)) bad.push(`${path}.${k}=${v}`)
    if (k === 'backlogCourses') for (const x of v as string[]) if (!sets.course.has(x)) bad.push(`${path}.backlogCourses ${x}`)
    walk(v, `${path}.${k}`)
  }
}
for (const [k, v] of Object.entries(db)) walk(v, k)
// cross-module rules
const st = db.users.filter((u: any) => u.role === 'student')
for (const s of st) {
  const room = db.rooms.find((r: any) => r.occupants.includes(s.id))
  if (room && s.residence !== 'HOSTEL') bad.push(`${s.id} has room but residence ${s.residence}`)
  const h = db.hostels.find((x: any) => x.id === room?.hostelId)
  if (h && (h.gender === 'Boys') !== (s.gender === 'Male')) bad.push(`${s.id} ${s.gender} in ${h.name}`)
  if (db.routes.some((r: any) => r.subscribers.includes(s.id)) && s.residence === 'HOSTEL') bad.push(`${s.id} hosteller on bus route`)
  const fees = db.fees.filter((f: any) => f.studentId === s.id)
  if (!fees.length) bad.push(`${s.id} no fees`)
  const cls = db.classes.find((c: any) => c.id === s.classId)
  for (const f of fees) { const m = /Semester (\d+)/.exec(f.title); if (m && +m[1] > cls.semester) bad.push(`${s.id} fee ${f.title} beyond sem ${cls.semester}`) }
  if (room && !fees.some((f: any) => f.head === 'Hostel')) bad.push(`${s.id} in hostel w/o hostel fee`)
}
for (const c of db.courses) { const cls = db.classes.find((x: any) => x.id === c.classId); const f = db.users.find((u: any) => u.id === c.facultyId); if (f?.role !== 'faculty') bad.push(`${c.id} teacher ${c.facultyId}`); if (cls && c.semester > cls.semester) bad.push(`${c.id} future semester`) }
for (const a of db.attendance) { const c = db.courses.find((x: any) => x.id === a.courseId); if (c.facultyId !== a.markedBy) bad.push(`att ${a.id} marked by ${a.markedBy} not ${c.facultyId}`) }
for (const t of db.timetable) if (!sets.course.has(t.courseId)) bad.push(`tt ${t.id}`)
for (const p of db.users.filter((u: any) => u.role === 'parent')) for (const w of p.wardIds) if (db.users.find((u: any) => u.id === w)?.role !== 'student') bad.push(`parent ward ${w}`)
console.log(bad.length ? `${bad.length} issue(s):\n${bad.join("\n")}` : "Demo data OK: all references resolve and modules agree."); if (bad.length) process.exit(1)
void feeOutstanding
