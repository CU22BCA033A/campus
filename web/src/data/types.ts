export type Role = 'student' | 'faculty' | 'admin'
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
}
