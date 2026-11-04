export type Role = 'student' | 'faculty' | 'admin' | 'parent'
export type Office = 'super' | 'registrar' | 'finance' | 'hostel' | 'hr' | 'exam' | 'library' | 'placement'
export type AccountStatus = 'ACTIVE' | 'DEACTIVATED' | 'LOCKED'

export interface User {
  id: string
  name: string
  email: string
  password: string
  role: Role
  status: AccountStatus
  department: string
  rollNo?: string
  program?: string
  semester?: number
  section?: string
  phone?: string
  firstLogin: boolean
  credentialsMismatchCount: number
  lockedAtTime?: number
  avatarColor: string
  office?: Office // admin accounts: the office they work in (defaults to 'super')
  wardIds?: string[] // parent accounts: children at this institution
  cgpa?: number
  backlogs?: number
  basicSalary?: number // staff: monthly basic pay (INR)
  hostelRoomId?: string
}

export interface Course {
  id: string
  code: string
  name: string
  facultyId: string
  credits: number
  semester: number
  description: string
  studentIds: string[]
}

export interface Material {
  id: string
  courseId: string
  title: string
  kind: 'pdf' | 'video' | 'link' | 'slides'
  url: string
  postedAt: number
}

export interface Assignment {
  id: string
  courseId: string
  title: string
  description: string
  dueAt: number
  maxMarks: number
}

export interface Submission {
  id: string
  assignmentId: string
  studentId: string
  text: string
  fileName?: string
  submittedAt: number
  marks?: number
  feedback?: string
}

export interface QuizQuestion {
  q: string
  options: string[]
  answer: number
}

export interface Quiz {
  id: string
  courseId: string
  title: string
  durationMin: number
  opensAt: number
  closesAt: number
  questions: QuizQuestion[]
  publishScores: boolean
}

export interface QuizAttempt {
  id: string
  quizId: string
  studentId: string
  answers: number[]
  score: number
  submittedAt: number
}

export interface TimetableSlot {
  id: string
  courseId: string
  day: number // 1 = Mon ... 6 = Sat
  start: string // "09:00"
  end: string
  room: string
}

export interface AttendanceRecord {
  id: string
  courseId: string
  date: string // YYYY-MM-DD
  present: string[] // student ids present
  markedBy: string
}

export interface Post {
  id: string
  courseId: string | null // null = campus feed
  authorId: string
  text: string
  createdAt: number
  replies: { id: string; authorId: string; text: string; createdAt: number }[]
}

export interface Notice {
  id: string
  title: string
  body: string
  category: 'Academic' | 'Exam' | 'Event' | 'General' | 'Placement'
  audience: 'all' | Role
  postedBy: string
  createdAt: number
  pinned: boolean
}

export interface CampusEvent {
  id: string
  title: string
  description: string
  venue: string
  startsAt: number
  clubId?: string
  rsvps: string[]
  capacity: number
}

export interface Club {
  id: string
  name: string
  description: string
  members: string[]
  facultyAdvisorId: string
}

export interface FeeItem {
  id: string
  studentId: string
  title: string
  amount: number
  dueAt: number
  paidAt?: number
  txnId?: string
  head?: 'Tuition' | 'Exam' | 'Hostel' | 'Transport' | 'Other'
  scholarship?: number // amount waived
  paidAmount?: number // supports instalments
  installments?: { amount: number; dueAt: number; paidAt?: number; txnId?: string }[]
  gateway?: string
}

export interface GatePass {
  id: string
  studentId: string
  reason: string
  outAt: number
  returnAt: number
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  reviewedBy?: string
}

export interface Poll {
  id: string
  question: string
  options: string[]
  votes: Record<string, number> // userId -> option index
  createdBy: string
  closesAt: number
}

export interface TransportRoute {
  id: string
  name: string
  stops: { name: string; time: string }[]
  bus: string
  driver: string
  driverPhone: string
  subscribers: string[]
}

export interface Feedback {
  id: string
  courseId: string
  studentId: string
  rating: number
  comment: string
  createdAt: number
}

export interface Booking {
  id: string
  venue: string
  date: string
  slot: string
  purpose: string
  bookedBy: string
}

export interface Notification {
  id: string
  userId: string
  text: string
  link: string
  createdAt: number
  read: boolean
}

export interface DB {
  version: number
  users: User[]
  courses: Course[]
  materials: Material[]
  assignments: Assignment[]
  submissions: Submission[]
  quizzes: Quiz[]
  attempts: QuizAttempt[]
  timetable: TimetableSlot[]
  attendance: AttendanceRecord[]
  posts: Post[]
  notices: Notice[]
  events: CampusEvent[]
  clubs: Club[]
  fees: FeeItem[]
  gatePasses: GatePass[]
  polls: Poll[]
  routes: TransportRoute[]
  feedback: Feedback[]
  bookings: Booking[]
  notifications: Notification[]
  // ---- ERP modules ----
  applications: Application[]
  scholarships: Scholarship[]
  exams: Exam[]
  results: ExamResult[]
  revaluations: Revaluation[]
  rooms: HostelRoom[]
  hostelLeaves: HostelLeave[]
  mealCoupons: MealCoupon[]
  leaves: StaffLeave[]
  payrollRuns: PayrollRun[]
  purchaseRequests: PurchaseRequest[]
  assets: Asset[]
  tickets: Ticket[]
  drives: PlacementDrive[]
  books: Book[]
  loans: BookLoan[]
  alumni: Alumnus[]
  refunds: Refund[]
  audit: AuditEntry[]
}

/* ---------------- Admissions ---------------- */
export type AppStage = 'ENQUIRY' | 'APPLIED' | 'VERIFIED' | 'SHORTLISTED' | 'OFFERED' | 'FEE_PAID' | 'ADMITTED' | 'REJECTED'
export interface Application {
  id: string
  name: string
  email: string
  phone: string
  program: string
  qualifyingPct: number // 12th / qualifying exam %
  entranceScore: number // out of 100
  category: 'General' | 'OBC' | 'SC' | 'ST' | 'EWS'
  documents: { name: string; status: 'PENDING' | 'VERIFIED' | 'REJECTED' }[]
  stage: AppStage
  meritScore?: number
  rank?: number
  scholarshipId?: string
  offerFee?: number
  studentId?: string // auto-generated user id once admitted
  rollNo?: string
  createdAt: number
  history: { stage: AppStage; at: number; by: string }[]
}
export interface Scholarship {
  id: string
  name: string
  kind: 'PERCENT' | 'FIXED'
  value: number
  minMerit: number // eligibility: merit score threshold
}

/* ---------------- Examinations ---------------- */
export interface Exam {
  id: string
  courseId: string
  title: string // e.g. "End Semester Examination"
  date: string // YYYY-MM-DD
  start: string
  end: string
  venue: string
  maxMarks: number
  minAttendance: number // eligibility gates
  requireFeesCleared: boolean
  minInternal: number // min internal % to be eligible
  seating?: { studentId: string; room: string; seat: string }[]
  invigilators?: { room: string; facultyId: string }[]
  resultsPublished: boolean
  grading: 'ABSOLUTE' | 'RELATIVE'
}
export interface ExamResult {
  id: string
  examId: string
  studentId: string
  marks: number
}
export interface Revaluation {
  id: string
  examId: string
  studentId: string
  reason: string
  fee: number
  status: 'REQUESTED' | 'UNDER_REVIEW' | 'REVISED' | 'NO_CHANGE'
  oldMarks: number
  newMarks?: number
  createdAt: number
}

/* ---------------- Hostel & mess ---------------- */
export interface HostelRoom {
  id: string
  block: string
  number: string
  capacity: number
  occupants: string[]
  type: 'AC' | 'Non-AC'
  feePerSem: number
}
export interface HostelLeave {
  id: string
  studentId: string
  reason: string
  from: number
  to: number
  parentStatus: 'PENDING' | 'APPROVED' | 'REJECTED'
  wardenStatus: 'PENDING' | 'APPROVED' | 'REJECTED'
  createdAt: number
}
export interface MealCoupon {
  id: string
  studentId: string
  date: string
  meal: 'Breakfast' | 'Lunch' | 'Snacks' | 'Dinner'
  code: string
  redeemedAt?: number
}

/* ---------------- HR & payroll ---------------- */
export interface StaffLeave {
  id: string
  staffId: string
  type: 'Casual' | 'Sick' | 'Earned' | 'Duty' | 'Loss of Pay'
  from: string
  to: string
  days: number
  reason: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
  reviewedBy?: string
}
export interface Payslip {
  staffId: string
  basic: number
  hra: number
  da: number
  gross: number
  lopDays: number
  lopDeduction: number
  pf: number
  esi: number
  professionalTax: number
  tds: number
  net: number
}
export interface PayrollRun {
  id: string
  month: string // YYYY-MM
  runAt: number
  payslips: Payslip[]
}

/* ---------------- Procurement & assets ---------------- */
export type PRStatus = 'PENDING_HOD' | 'PENDING_FINANCE' | 'PENDING_REGISTRAR' | 'APPROVED' | 'PO_ISSUED' | 'RECEIVED' | 'REJECTED'
export interface PurchaseRequest {
  id: string
  title: string
  category: 'IT Equipment' | 'Furniture' | 'Lab Equipment' | 'Stationery' | 'Sports'
  quantity: number
  unitCost: number
  vendor: string
  requestedBy: string
  department: string
  status: PRStatus
  approvals: { level: string; by: string; at: number; decision: 'APPROVED' | 'REJECTED' }[]
  poNumber?: string
  warrantyMonths: number
  createdAt: number
}
export interface Asset {
  id: string
  tag: string
  name: string
  category: PurchaseRequest['category']
  purchaseRequestId?: string
  location: string
  assignedTo?: string
  status: 'IN_STOCK' | 'ALLOTTED' | 'MAINTENANCE' | 'RETIRED'
  purchasedAt: number
  warrantyUntil: number
  cost: number
}

/* ---------------- Help center ---------------- */
export interface Ticket {
  id: string
  number: string
  category: 'Grievance' | 'IT Support' | 'Facility Booking' | 'No-Dues Certificate' | 'Bonafide Certificate' | 'Maintenance'
  subject: string
  description: string
  raisedBy: string
  assignedTo?: string
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'
  priority: 'Low' | 'Medium' | 'High'
  anonymous: boolean
  createdAt: number
  slaHours: number
  comments: { by: string; text: string; at: number }[]
}

/* ---------------- Placements ---------------- */
export interface PlacementDrive {
  id: string
  company: string
  role: string
  kind: 'Internship' | 'Full-time' | 'Project' | 'Top-tier'
  ctc: string
  minCgpa: number
  maxBacklogs: number
  deadline: number
  description: string
  applications: { studentId: string; status: 'APPLIED' | 'SHORTLISTED' | 'INTERVIEW' | 'SELECTED' | 'REJECTED'; slot?: number }[]
}

/* ---------------- Library ---------------- */
export interface Book {
  id: string
  title: string
  author: string
  isbn: string
  subject: string
  copies: number
  shelf: string
  ebookUrl?: string
  reservations: string[]
}
export interface BookLoan {
  id: string
  bookId: string
  userId: string
  issuedAt: number
  dueAt: number
  returnedAt?: number
  fine?: number
}

/* ---------------- Alumni ---------------- */
export interface Alumnus {
  id: string
  name: string
  batch: number
  program: string
  company: string
  role: string
  city: string
  mentor: boolean
  email: string
  mentees: string[]
  donations: number
}

/* ---------------- Finance & audit ---------------- */
export interface Refund {
  id: string
  feeId: string
  studentId: string
  amount: number
  reason: string
  status: 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'PROCESSED'
  createdAt: number
}
export interface AuditEntry {
  id: string
  at: number
  actorId: string
  action: string
  detail: string
}
