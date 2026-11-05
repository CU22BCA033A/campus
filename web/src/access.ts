/**
 * Role- and office-based access control.
 *
 * Every signed-in user has a *persona*: their role (student / faculty / parent), or, for
 * administrative staff, the office they work in. Menus, routes and in-page actions are all
 * derived from the tables below, so each office sees only its own work.
 */
import type { DB, Office, User } from './data/types'

export type Persona = 'student' | 'faculty' | 'parent' | Office

export const OFFICES: Record<Office, { label: string; description: string }> = {
  super: { label: 'System Administrator', description: 'Full access to every module, user management and the audit log' },
  registrar: { label: 'Registrar Office', description: 'Student records, admissions oversight, certificates and institutional reports' },
  admissions: { label: 'Admission Department', description: 'Applications, merit lists, offers, admitting students and their profiles' },
  finance: { label: 'Finance & Accounts', description: 'Fee collection, scholarships, refunds, purchase approvals and assets' },
  hostel: { label: 'Hostel Warden', description: 'Rooms, allocation, leave approvals, gate passes and the mess' },
  hr: { label: 'Human Resources', description: 'Staff records, leave approvals and payroll' },
  exam: { label: 'Registrar of Evaluation', description: 'Classes, courses and teacher allocation, examinations, results and semester promotion' },
  library: { label: 'Library', description: 'Catalogue, issue and return, reservations and fines' },
  placement: { label: 'Placement Cell', description: 'Recruiter drives, applications, interviews and alumni' },
  studentAffairs: { label: 'Office of Student Affairs', description: 'Clubs and chapters, campus events, polls and student grievances' },
}

export const persona = (u: User): Persona => (u.role === 'admin' ? (u.office ?? 'super') : u.role)
export const personaLabel = (u: User) => (u.role === 'admin' ? OFFICES[u.office ?? 'super'].label : u.role[0].toUpperCase() + u.role.slice(1))

const ALL: Persona[] = ['student', 'faculty', 'parent', 'super', 'registrar', 'admissions', 'exam', 'finance', 'hostel', 'hr', 'library', 'placement', 'studentAffairs']
const STAFF: Persona[] = ['faculty', 'super', 'registrar', 'admissions', 'exam', 'finance', 'hostel', 'hr', 'library', 'placement', 'studentAffairs']
const STUDENT_RECORDS: Persona[] = ['registrar', 'admissions', 'exam', 'super']
const LEARNING: Persona[] = ['student', 'faculty', 'super']

/** Which personas may open each page. */
export const ROUTE_ACCESS: Record<string, Persona[]> = {
  '/home': ALL,
  '/notices': ALL,
  '/events': ALL,
  '/help': ALL,
  '/profile': ALL,
  '/timetable': ['student', 'faculty', 'registrar', 'exam', 'super'],
  '/courses': ['student', 'faculty', 'registrar', 'exam', 'super'],
  '/classes': STUDENT_RECORDS,
  '/people': STAFF,
  '/assignments': LEARNING,
  '/quizzes': LEARNING,
  '/attendance': ['student', 'faculty', 'exam', 'super'],
  '/exams': ['student', 'faculty', 'exam', 'super'],
  '/grades': ['student', 'faculty', 'exam', 'super'],
  '/feedback': ['student', 'faculty', 'registrar', 'super'],
  '/library': ['student', 'faculty', 'library', 'super'],
  '/feed': ['student', 'faculty', 'studentAffairs', 'super'],
  '/clubs': ['student', 'faculty', 'studentAffairs', 'super'],
  '/polls': ['student', 'faculty', 'registrar', 'studentAffairs', 'super'],
  '/placements': ['student', 'placement', 'super'],
  '/alumni': ['student', 'faculty', 'placement', 'super'],
  '/fees': ['student', 'finance', 'super'],
  '/hostel': ['student', 'hostel', 'super'],
  '/gate-pass': ['student', 'faculty', 'hostel', 'super'],
  '/transport': ['student', 'faculty', 'parent', 'registrar', 'super'],
  '/venues': ['faculty', 'registrar', 'super'],
  '/hr': STAFF, // everyone on staff applies for leave and sees payslips; approvals/payroll are capabilities
  '/procurement': ['faculty', 'finance', 'registrar', 'super'],
  '/admissions': ['admissions', 'registrar', 'super'],
  '/admin/users': ['registrar', 'admissions', 'exam', 'hr', 'super'],
  '/admin/reports': ['registrar', 'finance', 'super'],
  '/admin/audit': ['super'],
}

export function canAccess(u: User, path: string) {
  const key = Object.keys(ROUTE_ACCESS).sort((a, b) => b.length - a.length).find((k) => path === k || path.startsWith(`${k}/`))
  return !!key && ROUTE_ACCESS[key].includes(persona(u))
}

/** Fine-grained actions inside pages. */
const CAPS = {
  manageAdmissions: ['admissions', 'registrar', 'super'],
  editStudentProfiles: STUDENT_RECORDS,
  manageClasses: ['exam', 'super'],
  manageCourses: ['exam', 'super'],
  promoteStudents: ['exam', 'super'],
  manageResults: ['exam', 'super'],
  manageClubs: ['studentAffairs', 'super'],
  manageFees: ['finance', 'super'],
  manageHostel: ['hostel', 'super'],
  approveGatePass: ['faculty', 'hostel', 'super'],
  approveStaffLeave: ['hr', 'super'],
  runPayroll: ['hr', 'finance', 'super'],
  approvePurchaseFinance: ['finance', 'super'],
  approvePurchaseRegistrar: ['registrar', 'super'],
  issuePurchaseOrder: ['finance', 'super'],
  manageAssets: ['finance', 'super'],
  manageExams: ['exam', 'super'],
  manageLibrary: ['library', 'super'],
  managePlacements: ['placement', 'super'],
  manageAlumni: ['placement', 'super'],
  postNotices: STAFF,
  createEvents: STAFF,
  createPolls: ['faculty', 'registrar', 'studentAffairs', 'super'],
  bookVenues: ['faculty', 'registrar', 'super'],
  manageAllBookings: ['registrar', 'super'],
  moderateNotices: ['registrar', 'super'],
  manageStudents: ['registrar', 'admissions', 'super'], // create, deactivate, reset passwords
  manageStaff: ['hr', 'super'],
  viewAllCourses: ['registrar', 'exam', 'super'],
  viewPeople: STAFF,
} satisfies Record<string, Persona[]>
export type Capability = keyof typeof CAPS
export const can = (u: User, cap: Capability) => (CAPS[cap] as Persona[]).includes(persona(u))

/** Help Center routing: which office handles each request category. */
export const TICKET_OFFICE: Record<DB['tickets'][number]['category'], Office> = {
  Grievance: 'studentAffairs',
  'Bonafide Certificate': 'registrar',
  'Facility Booking': 'registrar',
  'No-Dues Certificate': 'finance',
  'IT Support': 'super',
  Maintenance: 'hostel',
}

/** Staff accounts for an office (plus system administrators), used to route notifications. */
export const officeUsers = (db: DB, ...offices: Office[]) =>
  db.users.filter((u) => u.role === 'admin' && u.status === 'ACTIVE' && (offices.includes(u.office ?? 'super') || (u.office ?? 'super') === 'super')).map((u) => u.id)
