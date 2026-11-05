import type { DB, Office, User } from './types'

const DAY = 86_400_000
const now = Date.now()
const d = (offsetDays: number, hour = 10) => {
  const t = new Date(now + offsetDays * DAY)
  t.setHours(hour, 0, 0, 0)
  return t.getTime()
}
const iso = (offsetDays: number) => new Date(now + offsetDays * DAY).toISOString().slice(0, 10)

type ErpPart = Pick<DB, 'applications' | 'scholarships' | 'exams' | 'results' | 'revaluations' | 'rooms' | 'hostelLeaves' | 'mealCoupons' | 'leaves' | 'payrollRuns' | 'purchaseRequests' | 'assets' | 'tickets' | 'drives' | 'books' | 'loans' | 'alumni' | 'refunds' | 'audit'>

/** Extra users the ERP modules need (parent, librarian-style staff etc.). */
export const parentUser: User = {
  id: 'pa1',
  name: 'Suresh Sharma',
  email: 'parent@campus.edu',
  password: 'parent123',
  role: 'parent',
  status: 'ACTIVE',
  department: 'Parent',
  phone: '9845098450',
  firstLogin: false,
  credentialsMismatchCount: 0,
  avatarColor: '#0f766e',
  wardIds: ['s1', 's2'],
}

const officer = (id: string, name: string, email: string, office: Office, basicSalary: number, avatarColor: string): User => ({
  id, name, email, password: `${email.split('@')[0]}123`, role: 'admin', office, status: 'ACTIVE', department: 'Administration',
  firstLogin: false, credentialsMismatchCount: 0, avatarColor, basicSalary,
})

/** One login per administrative office; each sees only its own modules. */
export const officeStaff: User[] = [
  officer('a2', 'Dr. Ramesh Iyengar (Registrar)', 'registrar@campus.edu', 'registrar', 120000, '#7a1e2c'),
  officer('a3', 'Anita Krishnan (Finance Officer)', 'finance@campus.edu', 'finance', 85000, '#1f8a4c'),
  officer('a4', 'Mahesh Gowda (Chief Warden)', 'warden@campus.edu', 'hostel', 55000, '#b7791f'),
  officer('a5', 'Shalini Rao (HR Manager)', 'hr@campus.edu', 'hr', 80000, '#be185d'),
  officer('a6', 'Dr. Vinod Kumar (Controller of Exams)', 'exams@campus.edu', 'exam', 110000, '#2563a8'),
  officer('a7', 'Geetha Murthy (Librarian)', 'library@campus.edu', 'library', 60000, '#0f766e'),
  officer('a8', 'Arjun Nair (Placement Officer)', 'placement@campus.edu', 'placement', 75000, '#6b3fa0'),
]

export function createErpSeed(): ErpPart {
  const apps: DB['applications'] = [
    { id: 'ap1', name: 'Riya Kapoor', email: 'riya.kapoor@mail.com', phone: '9900011111', program: 'BCA', qualifyingPct: 92, entranceScore: 88, category: 'General', stage: 'APPLIED', createdAt: d(-6), history: [{ stage: 'ENQUIRY', at: d(-9), by: 'web' }, { stage: 'APPLIED', at: d(-6), by: 'web' }], documents: [{ name: '10th marksheet', status: 'PENDING' }, { name: '12th marksheet', status: 'PENDING' }, { name: 'Transfer certificate', status: 'PENDING' }, { name: 'Aadhaar', status: 'PENDING' }] },
    { id: 'ap2', name: 'Harsh Vardhan', email: 'harsh.v@mail.com', phone: '9900022222', program: 'BCA', qualifyingPct: 78, entranceScore: 71, category: 'OBC', stage: 'VERIFIED', createdAt: d(-8), history: [{ stage: 'APPLIED', at: d(-8), by: 'web' }, { stage: 'VERIFIED', at: d(-4), by: 'a2' }], documents: [{ name: '10th marksheet', status: 'VERIFIED' }, { name: '12th marksheet', status: 'VERIFIED' }, { name: 'Transfer certificate', status: 'VERIFIED' }, { name: 'Aadhaar', status: 'VERIFIED' }] },
    { id: 'ap3', name: 'Sneha Pillai', email: 'sneha.p@mail.com', phone: '9900033333', program: 'BBA', qualifyingPct: 95, entranceScore: 93, category: 'General', stage: 'VERIFIED', createdAt: d(-10), history: [{ stage: 'APPLIED', at: d(-10), by: 'web' }, { stage: 'VERIFIED', at: d(-5), by: 'a2' }], documents: [{ name: '10th marksheet', status: 'VERIFIED' }, { name: '12th marksheet', status: 'VERIFIED' }, { name: 'Transfer certificate', status: 'VERIFIED' }, { name: 'Aadhaar', status: 'VERIFIED' }] },
    { id: 'ap4', name: 'Mohammed Faiz', email: 'faiz@mail.com', phone: '9900044444', program: 'BCA', qualifyingPct: 84, entranceScore: 80, category: 'EWS', stage: 'ENQUIRY', createdAt: d(-1), history: [{ stage: 'ENQUIRY', at: d(-1), by: 'web' }], documents: [] },
    { id: 'ap5', name: 'Tanvi Deshpande', email: 'tanvi.d@mail.com', phone: '9900055555', program: 'B.Sc Data Science', qualifyingPct: 88, entranceScore: 90, category: 'General', stage: 'OFFERED', meritScore: 89.2, rank: 1, scholarshipId: 'sc1', offerFee: 63750, createdAt: d(-14), history: [{ stage: 'APPLIED', at: d(-14), by: 'web' }, { stage: 'VERIFIED', at: d(-11), by: 'a2' }, { stage: 'SHORTLISTED', at: d(-9), by: 'a2' }, { stage: 'OFFERED', at: d(-7), by: 'a2' }], documents: [{ name: '10th marksheet', status: 'VERIFIED' }, { name: '12th marksheet', status: 'VERIFIED' }, { name: 'Transfer certificate', status: 'VERIFIED' }, { name: 'Aadhaar', status: 'VERIFIED' }] },
  ]

  return {
    applications: apps,
    scholarships: [
      { id: 'sc1', name: 'Merit Scholarship (15%)', kind: 'PERCENT', value: 15, minMerit: 85 },
      { id: 'sc2', name: 'Chancellor’s Excellence (50%)', kind: 'PERCENT', value: 50, minMerit: 93 },
      { id: 'sc3', name: 'Sports Quota Grant', kind: 'FIXED', value: 20000, minMerit: 60 },
    ],
    exams: [
      { id: 'ex1', courseId: 'c1', title: 'Mid-Semester Examination', date: iso(-10), start: '10:00', end: '11:30', venue: 'Exam Block', maxMarks: 50, minAttendance: 75, requireFeesCleared: false, minInternal: 0, resultsPublished: true, grading: 'ABSOLUTE' },
      { id: 'ex2', courseId: 'c2', title: 'Mid-Semester Examination', date: iso(-9), start: '10:00', end: '11:30', venue: 'Exam Block', maxMarks: 50, minAttendance: 75, requireFeesCleared: false, minInternal: 0, resultsPublished: true, grading: 'ABSOLUTE' },
      { id: 'ex3', courseId: 'c1', title: 'End Semester Examination', date: iso(12), start: '09:30', end: '12:30', venue: 'Exam Block', maxMarks: 100, minAttendance: 75, requireFeesCleared: true, minInternal: 0, resultsPublished: false, grading: 'RELATIVE' },
      { id: 'ex4', courseId: 'c2', title: 'End Semester Examination', date: iso(14), start: '09:30', end: '12:30', venue: 'Exam Block', maxMarks: 100, minAttendance: 75, requireFeesCleared: true, minInternal: 0, resultsPublished: false, grading: 'ABSOLUTE' },
      { id: 'ex6', courseId: 'c8', title: 'End Semester Examination', date: iso(-8), start: '09:30', end: '12:30', venue: 'Exam Block', maxMarks: 100, minAttendance: 0, requireFeesCleared: false, minInternal: 0, resultsPublished: true, grading: 'ABSOLUTE' },
      { id: 'ex7', courseId: 'c9', title: 'End Semester Examination', date: iso(-6), start: '09:30', end: '12:30', venue: 'Exam Block', maxMarks: 100, minAttendance: 0, requireFeesCleared: false, minInternal: 0, resultsPublished: true, grading: 'ABSOLUTE' },
      { id: 'ex5', courseId: 'c3', title: 'End Semester Examination', date: iso(16), start: '09:30', end: '12:30', venue: 'Exam Block', maxMarks: 100, minAttendance: 75, requireFeesCleared: true, minInternal: 0, resultsPublished: false, grading: 'ABSOLUTE' },
    ],
    results: [
      ...['s19', 's20', 's21', 's22'].flatMap((sid, i) => [
        { id: `r-ex6-${sid}`, examId: 'ex6', studentId: sid, marks: [78, 64, 35, 88][i] },
        { id: `r-ex7-${sid}`, examId: 'ex7', studentId: sid, marks: [82, 71, 58, 91][i] },
      ]),
      ...['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11', 's13'].flatMap((sid, i) => [
      { id: `r-ex1-${sid}`, examId: 'ex1', studentId: sid, marks: 22 + ((i * 7) % 27) },
      { id: `r-ex2-${sid}`, examId: 'ex2', studentId: sid, marks: 19 + ((i * 11) % 30) },
    ])],
    revaluations: [],
    rooms: [
      { id: 'rm1', block: 'A (Boys)', number: 'A-101', capacity: 2, occupants: ['s1'], type: 'AC', feePerSem: 55000 },
      { id: 'rm2', block: 'A (Boys)', number: 'A-102', capacity: 2, occupants: ['s3', 's5'], type: 'AC', feePerSem: 55000 },
      { id: 'rm3', block: 'A (Boys)', number: 'A-103', capacity: 3, occupants: [], type: 'Non-AC', feePerSem: 38000 },
      { id: 'rm4', block: 'B (Girls)', number: 'B-201', capacity: 2, occupants: ['s2'], type: 'AC', feePerSem: 55000 },
      { id: 'rm5', block: 'B (Girls)', number: 'B-202', capacity: 3, occupants: ['s4'], type: 'Non-AC', feePerSem: 38000 },
      { id: 'rm6', block: 'B (Girls)', number: 'B-203', capacity: 2, occupants: [], type: 'AC', feePerSem: 55000 },
    ],
    hostelLeaves: [
      { id: 'hl1', studentId: 's1', reason: 'Going home for the weekend', from: d(2, 17), to: d(4, 19), parentStatus: 'PENDING', wardenStatus: 'PENDING', createdAt: d(-0.2) },
    ],
    mealCoupons: [],
    leaves: [
      { id: 'lv1', staffId: 'f2', type: 'Casual', from: iso(3), to: iso(4), days: 2, reason: 'Family function', status: 'PENDING' },
      { id: 'lv2', staffId: 'f1', type: 'Sick', from: iso(-12), to: iso(-12), days: 1, reason: 'Fever', status: 'APPROVED', reviewedBy: 'a5' },
      { id: 'lv3', staffId: 'f3', type: 'Loss of Pay', from: `${iso(0).slice(0, 7)}-01`, to: `${iso(0).slice(0, 7)}-02`, days: 2, reason: 'Personal', status: 'APPROVED', reviewedBy: 'a5' },
    ],
    payrollRuns: [],
    purchaseRequests: [
      { id: 'pr1', title: 'Dell OptiPlex desktops for Lab-3', category: 'IT Equipment', quantity: 20, unitCost: 52000, vendor: 'Dell India', requestedBy: 'f1', department: 'Computer Applications', status: 'PENDING_FINANCE', approvals: [{ level: 'HOD', by: 'f2', at: d(-2), decision: 'APPROVED' }], warrantyMonths: 36, createdAt: d(-3) },
      { id: 'pr2', title: 'Whiteboard markers & dusters', category: 'Stationery', quantity: 200, unitCost: 45, vendor: 'Office Mart', requestedBy: 'f3', department: 'Mathematics', status: 'PENDING_HOD', approvals: [], warrantyMonths: 0, createdAt: d(-1) },
      { id: 'pr3', title: 'Epson projectors', category: 'IT Equipment', quantity: 4, unitCost: 48000, vendor: 'Epson', requestedBy: 'f2', department: 'Computer Applications', status: 'PO_ISSUED', poNumber: 'PO-2026-0041', approvals: [{ level: 'HOD', by: 'f2', at: d(-15), decision: 'APPROVED' }, { level: 'Finance', by: 'a3', at: d(-13), decision: 'APPROVED' }], warrantyMonths: 24, createdAt: d(-16) },
    ],
    assets: [
      { id: 'as-1', tag: 'AST-0001', name: 'HP LaserJet Printer', category: 'IT Equipment', location: 'Admin Block', status: 'ALLOTTED', assignedTo: 'a1', purchasedAt: d(-700), warrantyUntil: d(30), cost: 32000 },
      { id: 'as-2', tag: 'AST-0002', name: 'Lenovo ThinkPad', category: 'IT Equipment', location: 'Faculty Room', status: 'ALLOTTED', assignedTo: 'f1', purchasedAt: d(-300), warrantyUntil: d(430), cost: 78000 },
      { id: 'as-3', tag: 'AST-0003', name: 'Digital oscilloscope', category: 'Lab Equipment', location: 'Electronics Lab', status: 'MAINTENANCE', purchasedAt: d(-1200), warrantyUntil: d(-100), cost: 64000 },
      { id: 'as-4', tag: 'AST-0004', name: 'Conference table', category: 'Furniture', location: 'Conference Room', status: 'IN_STOCK', purchasedAt: d(-400), warrantyUntil: d(-35), cost: 45000 },
    ],
    tickets: [
      { id: 'tk1', number: 'HC-1001', category: 'IT Support', subject: 'Wi-Fi not working in Block A', description: 'Campus Wi-Fi drops every few minutes on the 1st floor of Block A.', raisedBy: 's1', status: 'IN_PROGRESS', priority: 'High', anonymous: false, createdAt: d(-1), slaHours: 24, assignedTo: 'a1', comments: [{ by: 'a1', text: 'Network team has been informed.', at: d(-0.8) }] },
      { id: 'tk2', number: 'HC-1002', category: 'Grievance', subject: 'Canteen hygiene', description: 'Plates are not cleaned properly at the main canteen.', raisedBy: 's3', status: 'OPEN', priority: 'Medium', anonymous: true, createdAt: d(-2), slaHours: 72, comments: [] },
      { id: 'tk3', number: 'HC-1003', category: 'Bonafide Certificate', subject: 'Bonafide for bank account', description: 'Need a bonafide certificate for opening a bank account.', raisedBy: 's2', status: 'RESOLVED', priority: 'Low', anonymous: false, createdAt: d(-5), slaHours: 48, assignedTo: 'a2', comments: [{ by: 'a2', text: 'Certificate generated. Download from the ticket.', at: d(-4) }] },
    ],
    drives: [
      { id: 'dr1', company: 'Infosys', role: 'Systems Engineer', kind: 'Full-time', ctc: '₹ 3.6 LPA', minCgpa: 6.5, maxBacklogs: 0, deadline: d(6), description: 'Hiring for the 2027 batch. Aptitude test, technical and HR interviews.', applications: [{ studentId: 's2', status: 'SHORTLISTED' }] },
      { id: 'dr2', company: 'Razorpay', role: 'SDE Intern', kind: 'Internship', ctc: '₹ 40,000 / month', minCgpa: 8.0, maxBacklogs: 0, deadline: d(9), description: '6-month internship with a pre-placement offer opportunity.', applications: [] },
      { id: 'dr3', company: 'Microsoft', role: 'Software Engineer', kind: 'Top-tier', ctc: '₹ 45 LPA', minCgpa: 8.5, maxBacklogs: 0, deadline: d(4), description: 'Online coding round followed by 3 technical interviews.', applications: [] },
      { id: 'dr4', company: 'Deloitte', role: 'Analyst', kind: 'Full-time', ctc: '₹ 7 LPA', minCgpa: 7.0, maxBacklogs: 1, deadline: d(-2), description: 'Closed. Results announced.', applications: [{ studentId: 's1', status: 'SELECTED' }] },
    ],
    books: [
      { id: 'bk1', title: 'Database System Concepts', author: 'Silberschatz, Korth, Sudarshan', isbn: '9789352601301', subject: 'DBMS', copies: 6, shelf: 'CS-12', reservations: [] },
      { id: 'bk2', title: 'Operating System Concepts', author: 'Silberschatz, Galvin', isbn: '9781119800361', subject: 'Operating Systems', copies: 5, shelf: 'CS-14', reservations: [] },
      { id: 'bk3', title: 'Eloquent JavaScript', author: 'Marijn Haverbeke', isbn: '9781593279509', subject: 'Web Technologies', copies: 3, shelf: 'CS-21', ebookUrl: 'https://eloquentjavascript.net/', reservations: [] },
      { id: 'bk4', title: 'Discrete Mathematics and Its Applications', author: 'Kenneth Rosen', isbn: '9781259676512', subject: 'Mathematics', copies: 4, shelf: 'MA-03', reservations: [] },
      { id: 'bk5', title: 'Software Engineering: A Practitioner’s Approach', author: 'Roger Pressman', isbn: '9781259872976', subject: 'Software Engineering', copies: 2, shelf: 'CS-30', reservations: [] },
      { id: 'bk6', title: 'Clean Code', author: 'Robert C. Martin', isbn: '9780132350884', subject: 'Software Engineering', copies: 1, shelf: 'CS-31', reservations: ['s4'] },
    ],
    loans: [
      { id: 'ln1', bookId: 'bk1', userId: 's1', issuedAt: d(-10), dueAt: d(4) },
      { id: 'ln2', bookId: 'bk6', userId: 's2', issuedAt: d(-20), dueAt: d(-6) },
    ],
    alumni: [
      { id: 'al1', name: 'Karthik Subramanian', batch: 2019, program: 'BCA', company: 'Google', role: 'Software Engineer', city: 'Bengaluru', mentor: true, email: 'karthik.s@alumni.campus.edu', mentees: [], donations: 50000 },
      { id: 'al2', name: 'Pooja Venkatesh', batch: 2020, program: 'BBA', company: 'Deloitte', role: 'Consultant', city: 'Mumbai', mentor: true, email: 'pooja.v@alumni.campus.edu', mentees: ['s2'], donations: 15000 },
      { id: 'al3', name: 'Rahul Menon', batch: 2018, program: 'BCA', company: 'Swiggy', role: 'Product Manager', city: 'Bengaluru', mentor: false, email: 'rahul.m@alumni.campus.edu', mentees: [], donations: 0 },
      { id: 'al4', name: 'Fatima Sheikh', batch: 2021, program: 'B.Sc Data Science', company: 'Amazon', role: 'Data Scientist', city: 'Hyderabad', mentor: true, email: 'fatima.s@alumni.campus.edu', mentees: [], donations: 25000 },
    ],
    refunds: [],
    audit: [
      { id: 'au0', at: d(-1), actorId: 'a2', action: 'ADMISSION_VERIFY', detail: 'Verified documents for Harsh Vardhan' },
    ],
  }
}
