import type { DB, User } from './data/types'

export const fmtDate = (t: number | string) =>
  new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
export const fmtDateTime = (t: number) =>
  new Date(t).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
export const fmtTime = (t: number) => new Date(t).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
export const inr = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)

export function timeAgo(t: number) {
  const s = Math.round((Date.now() - t) / 1000)
  if (s < 0) {
    const f = -s
    if (f < 3600) return `in ${Math.max(1, Math.round(f / 60))} min`
    if (f < 86400) return `in ${Math.round(f / 3600)} h`
    return `in ${Math.round(f / 86400)} days`
  }
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return `${Math.round(s / 86400)} days ago`
}

export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function coursesFor(db: DB, user: User) {
  if (user.role === 'student') return db.courses.filter((c) => c.studentIds.includes(user.id))
  if (user.role === 'faculty') return db.courses.filter((c) => c.facultyId === user.id)
  return db.courses
}

export function attendanceStats(db: DB, studentId: string, courseId?: string) {
  const recs = db.attendance.filter((a) => (!courseId || a.courseId === courseId) && db.courses.find((c) => c.id === a.courseId)?.studentIds.includes(studentId))
  const attended = recs.filter((r) => r.present.includes(studentId)).length
  const total = recs.length
  return { attended, total, pct: total ? Math.round((attended / total) * 100) : 0 }
}

export const userName = (db: DB, id: string) => db.users.find((u) => u.id === id)?.name ?? 'Unknown'
export const courseName = (db: DB, id: string) => db.courses.find((c) => c.id === id)?.name ?? 'Unknown course'

export function initials(name: string) {
  return name
    .replace(/^(Dr\.|Prof\.)\s*/, '')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export function gradeFor(pct: number) {
  if (pct >= 90) return { grade: 'O', point: 10 }
  if (pct >= 80) return { grade: 'A+', point: 9 }
  if (pct >= 70) return { grade: 'A', point: 8 }
  if (pct >= 60) return { grade: 'B+', point: 7 }
  if (pct >= 50) return { grade: 'B', point: 6 }
  if (pct >= 40) return { grade: 'C', point: 5 }
  return { grade: 'F', point: 0 }
}
