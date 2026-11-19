/**
 * "Needs your attention" lists for students, parents and faculty, built from the live records:
 * registration, fees and exam eligibility, attendance, library, hostel, transport, placements, Lost & Found,
 * marking, result sheets, malpractice alerts and mentees. Wording is neutral so parents can see a ward's list.
 */
import type { DB, User } from './data/types'
import { attendanceStats, coursesFor, examEligibility, fmtDate, inr, studentDues, userName } from './lib'
import { registrationStatus, sessionState } from './registration'
import { activeLoans, memberDues } from './library'
import { suggestions } from './lostfound'
import { backlogCountOf } from './academics'

export interface Todo { text: string; sub?: string; to: string; tone: 'danger' | 'warning' | 'info' | 'success' }
const DAY = 86_400_000

export function studentTodos(db: DB, s: User): Todo[] {
  const out: Todo[] = []
  const now = Date.now()
  // Course registration window
  const reg = db.registration
  const closesOk = reg.open && (!reg.closesAt || now < reg.closesAt)
  if (closesOk && s.classId) {
    const st = registrationStatus(db, s), ss = sessionState(db, s.id)
    if (ss.state === 'active') out.push({ text: `Course registration in progress: ${Math.ceil(ss.left / 60000)} min left`, sub: 'Finish and submit before the timer runs out', to: '/registration', tone: 'danger' })
    else if (ss.state === 'none' && !st.complete) out.push({ text: `Course registration for ${reg.registrationTerm} is open`, sub: `${st.limits.FOUNDATION} foundation + ${st.limits.OPEN_ELECTIVE} open elective${reg.closesAt ? ` · closes ${fmtDate(reg.closesAt)}` : ''} · ${db.registration.timeLimitMin ?? 15} min once started`, to: '/registration', tone: 'warning' })
  }
  // Fees, and what unpaid fees block
  const dues = studentDues(db, s.id)
  const upcoming = db.exams.filter((e) => !e.resultsPublished && e.date >= new Date().toISOString().slice(0, 10) && db.courses.find((c) => c.id === e.courseId)?.studentIds.includes(s.id))
  const barred = upcoming.filter((e) => !examEligibility(db, s.id, e).eligible)
  if (dues > 0) {
    const feeBar = upcoming.filter((e) => e.requireFeesCleared)
    const next = db.fees.filter((f) => f.studentId === s.id && !(f.paidAt || (f.paidAmount ?? 0) >= f.amount)).sort((a, b) => a.dueAt - b.dueAt)[0]
    out.push({ text: `Fees due: ${inr(dues)}`, sub: `${next ? `${next.title} due ${fmtDate(next.dueAt)}` : ''}${feeBar.length ? ` · blocks ${feeBar.length} exam paper(s) from ${fmtDate(feeBar.sort((a, b) => a.date.localeCompare(b.date))[0].date)}` : ''}`, to: '/fees', tone: feeBar.length || (next && next.dueAt < now) ? 'danger' : 'warning' })
  }
  // Attendance shortage per course (exam eligibility)
  for (const c of coursesFor(db, s)) {
    const a = attendanceStats(db, s.id, c.id)
    if (a.total >= 4 && a.pct < 75) out.push({ text: `Attendance ${a.pct}% in ${c.code} ${c.name}`, sub: `Below 75%: the exam may be withheld · ${a.attended}/${a.total} classes`, to: '/attendance', tone: 'danger' })
  }
  if (barred.length && dues === 0) out.push({ text: `${barred.length} exam paper(s) withheld`, sub: barred.map((e) => db.courses.find((c) => c.id === e.courseId)?.code).join(', '), to: '/exams', tone: 'danger' })
  // Hall tickets ready
  for (const sess of db.examSessions.filter((x) => x.ticketsIssuedAt && upcoming.some((e) => e.sessionId === x.id))) out.push({ text: `Hall ticket ready: ${sess.title}`, sub: 'Collect it from the Registrar of Evaluation office', to: '/exams', tone: 'info' })
  // Open tests closing soon
  for (const q of db.quizzes.filter((q) => q.opensAt < now && q.closesAt > now && q.closesAt - now < 2 * DAY && db.courses.find((c) => c.id === q.courseId)?.studentIds.includes(s.id) && (!q.onlyFor?.length || q.onlyFor.includes(s.id)) && !db.attempts.some((a) => a.quizId === q.id && a.studentId === s.id && !a.voided)))
    out.push({ text: `Test closes soon: ${q.title}`, sub: `Closes ${fmtDate(q.closesAt)}`, to: '/quizzes', tone: 'warning' })
  // Library
  for (const l of activeLoans(db, s.id)) {
    const b = db.books.find((x) => x.id === l.bookId)
    if (l.dueAt < now) out.push({ text: `Library book overdue: ${b?.title}`, sub: `Was due ${fmtDate(l.dueAt)}; a fine is adding up`, to: '/library', tone: 'danger' })
    else if (l.dueAt - now < 3 * DAY) out.push({ text: `Return soon: ${b?.title}`, sub: `Due ${fmtDate(l.dueAt)}`, to: '/library', tone: 'warning' })
  }
  const fine = memberDues(db, s.id)
  if (fine > 0) out.push({ text: `Library fine ${inr(fine)} unpaid`, sub: 'Borrowing is blocked until it is paid at the library counter', to: '/library', tone: 'warning' })
  // Hostel leave, transport
  for (const l of db.hostelLeaves.filter((x) => x.studentId === s.id && x.to > now && (x.parentStatus === 'PENDING' || x.wardenStatus === 'PENDING'))) out.push({ text: `Hostel leave awaiting ${l.parentStatus === 'PENDING' ? 'parent' : 'warden'} approval`, sub: `${l.reason} · ${fmtDate(l.from)}`, to: '/hostel', tone: 'info' })
  for (const r of db.transportRequests.filter((x) => x.userId === s.id && x.status === 'PENDING')) out.push({ text: 'Bus pass request pending', sub: `${db.routes.find((x) => x.id === r.routeId)?.name} · ${r.stop}`, to: '/transport', tone: 'info' })
  // Placements
  for (const d of db.drives) for (const a of d.applications.filter((x) => x.studentId === s.id)) {
    if (a.offer === 'OFFERED') out.push({ text: `Offer from ${d.company}: accept or decline`, sub: `${d.role} · ${a.offerCtc ?? d.ctcLpa} LPA`, to: '/placements', tone: 'success' })
    if (a.status === 'INTERVIEW' && a.slot && a.slot > now) out.push({ text: `Interview: ${d.company}`, sub: `${fmtDate(a.slot)} · ${d.venue ?? ''}`, to: '/placements', tone: 'info' })
  }
  // Lost & Found
  for (const x of db.lostFound.filter((y) => y.reportedBy === s.id && y.kind === 'LOST' && (y.status === 'OPEN' || y.status === 'MATCHED'))) if (suggestions(db, x).length) out.push({ text: `Possible match for your lost “${x.title}”`, sub: 'Check Lost & Found and claim it', to: '/lost-found', tone: 'success' })
  for (const x of db.lostFound.filter((y) => y.status !== 'RETURNED' && y.claims.some((c) => c.claimantId === s.id && c.status === 'APPROVED'))) out.push({ text: `Collect “${x.title}” from Lost & Found`, sub: `${x.storage ?? 'Lost & Found desk'} · tag ${x.tagNo ?? ''} · bring your ID card`, to: '/lost-found', tone: 'success' })
  // Appointments
  for (const a of db.appointments.filter((x) => x.studentId === s.id && x.status === 'CONFIRMED' && x.at > now && x.at - now < 3 * DAY)) out.push({ text: `Appointment: ${db.services.find((v) => v.id === a.serviceId)?.title}`, sub: fmtDate(a.at), to: '/help', tone: 'info' })
  const order = { danger: 0, warning: 1, success: 2, info: 3 }
  return out.sort((a, b) => order[a.tone] - order[b.tone])
}

export function facultyTodos(db: DB, f: User): Todo[] {
  const out: Todo[] = []
  const now = Date.now(), today = new Date().toISOString().slice(0, 10), dow = new Date().getDay(), hhmm = new Date().toTimeString().slice(0, 5)
  const mine = coursesFor(db, f)
  // Today's classes already held but not marked
  for (const t of db.timetable.filter((t) => t.day === dow && t.start <= hhmm && mine.some((c) => c.id === t.courseId))) {
    if (!db.attendance.some((a) => a.courseId === t.courseId && a.date === today)) { const c = mine.find((x) => x.id === t.courseId)!; out.push({ text: `Mark attendance: ${c.code} (${t.start})`, sub: `${c.name} · ${t.room}`, to: '/attendance', tone: 'warning' }) }
  }
  // Result sheets waiting for marks / submission
  for (const sh of db.resultSheets.filter((x) => x.status === 'DRAFT' && (x.evaluatorId === f.id || db.courses.find((c) => c.id === x.courseId)?.facultyId === f.id))) {
    const c = db.courses.find((x) => x.id === sh.courseId)
    const exam = db.exams.find((e) => e.id === sh.examId)
    if (c && exam && exam.date <= today) out.push({ text: `Enter marks and submit: ${c.code} result sheet`, sub: `${exam.title} was on ${fmtDate(exam.date)}`, to: '/results', tone: 'danger' })
  }
  // Submissions to mark
  for (const a of db.assignments.filter((x) => mine.some((c) => c.id === x.courseId))) {
    const n = db.submissions.filter((s) => s.assignmentId === a.id && s.marks === undefined).length
    if (n) out.push({ text: `${n} submission(s) to mark: ${a.title}`, sub: db.courses.find((c) => c.id === a.courseId)?.code, to: '/assignments', tone: 'warning' })
  }
  // Malpractice in proctored tests (last 7 days)
  for (const at of db.attempts.filter((a) => a.terminated && !a.voided && now - a.submittedAt < 7 * DAY && db.quizzes.some((q) => q.id === a.quizId && mine.some((c) => c.id === q.courseId))))
    out.push({ text: `Proctoring alert: ${userName(db, at.studentId)}`, sub: `${db.quizzes.find((q) => q.id === at.quizId)?.title} closed after ${at.violations} violations · allow a re-attempt if needed`, to: '/quizzes', tone: 'danger' })
  // Mentees needing attention
  for (const cls of db.classes.filter((c) => c.mentorId === f.id)) {
    const risk = db.users.filter((u) => u.role === 'student' && u.status === 'ACTIVE' && u.classId === cls.id).filter((s) => backlogCountOf(s) > 0 || coursesFor(db, s).some((c) => { const a = attendanceStats(db, s.id, c.id); return a.total >= 4 && a.pct < 75 }))
    if (risk.length) out.push({ text: `${risk.length} mentee(s) need attention in ${cls.program} ${cls.batch}`, sub: risk.slice(0, 5).map((s) => { const low = coursesFor(db, s).map((c) => ({ c, a: attendanceStats(db, s.id, c.id) })).filter((x) => x.a.total >= 4 && x.a.pct < 75).sort((x, y) => x.a.pct - y.a.pct)[0]; return `${s.name.split(' ')[0]}: ${[low ? `${low.c.code} ${low.a.pct}%` : '', backlogCountOf(s) ? `${backlogCountOf(s)} backlog` : ''].filter(Boolean).join(', ')}` }).join(' · ') + (risk.length > 5 ? ` · +${risk.length - 5} more` : ''), to: `/classes`, tone: 'warning' })
  }
  // Venue requests for venues they manage, library
  const reqs = db.bookings.filter((b) => b.status === 'PENDING' && db.venues.some((v) => v.id === b.venueId && v.managerId === f.id))
  if (reqs.length) out.push({ text: `${reqs.length} venue booking request(s) to approve`, sub: reqs.map((b) => db.venues.find((v) => v.id === b.venueId)?.name).join(', '), to: '/venues', tone: 'warning' })
  for (const l of activeLoans(db, f.id).filter((l) => l.dueAt < now)) out.push({ text: `Library book overdue: ${db.books.find((b) => b.id === l.bookId)?.title}`, sub: `Due ${fmtDate(l.dueAt)}`, to: '/library', tone: 'info' })
  const order = { danger: 0, warning: 1, success: 2, info: 3 }
  return out.sort((a, b) => order[a.tone] - order[b.tone])
}
