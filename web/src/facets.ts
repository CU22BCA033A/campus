/** Shared filter facets for people lists (students by programme/batch/class/semester; staff by department/office). */
import type { DB, User } from './data/types'
import { opts } from './components/Filters'
import { classLabel } from './classes'
import { OFFICES } from './access'

export const STUDENT_KEYS = ['programme', 'batch', 'cls', 'semester'] as const
export const studentDefs = (db: DB, students: User[]) => [
  { key: 'programme' as const, label: 'Programmes', options: opts(students.map((s) => s.program)) },
  { key: 'batch' as const, label: 'Batches', options: opts(students.map((s) => s.batch), (v) => `Batch ${v}`) },
  { key: 'cls' as const, label: 'Classes', options: opts(students.map((s) => s.classId), (v) => classLabel(db.classes.find((c) => c.id === v))) },
  { key: 'semester' as const, label: 'Semesters', options: opts(students.map((s) => s.semester), (v) => `Semester ${v}`) },
]
export const studentOk = (f: { ok: (k: (typeof STUDENT_KEYS)[number], v: string | number | undefined) => boolean }, s?: User) =>
  !!s && f.ok('programme', s.program) && f.ok('batch', s.batch) && f.ok('cls', s.classId) && f.ok('semester', s.semester)

export const officeLabel = (u: User) => (u.role === 'admin' ? OFFICES[u.office ?? 'super'].label : u.role === 'faculty' ? 'Faculty' : '')
export const staffDefs = (staff: User[]) => [
  { key: 'department' as const, label: 'Departments', options: opts(staff.map((s) => s.department)) },
  { key: 'office' as const, label: 'Offices', options: opts(staff.map(officeLabel)) },
]
