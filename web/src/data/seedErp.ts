import type { DB, Office, User } from './types'

const DAY = 86_400_000
const now = Date.now()
const d = (offsetDays: number, hour = 10) => {
  const t = new Date(now + offsetDays * DAY)
  t.setHours(hour, 0, 0, 0)
  return t.getTime()
}
const iso = (offsetDays: number) => new Date(now + offsetDays * DAY).toISOString().slice(0, 10)

type ErpPart = Pick<DB, 'nightAttendance' | 'hostels' | 'resultSheets' | 'services' | 'appointments' | 'applications' | 'scholarships' | 'exams' | 'results' | 'revaluations' | 'rooms' | 'hostelLeaves' | 'mealCoupons' | 'leaves' | 'payrollRuns' | 'purchaseRequests' | 'assets' | 'tickets' | 'drives' | 'books' | 'loans' | 'alumni' | 'refunds' | 'audit'>

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
  officer('a6', 'Dr. Vinod Kumar (Registrar of Evaluation)', 'exams@campus.edu', 'exam', 110000, '#2563a8'),
  officer('a7', 'Geetha Murthy (Librarian)', 'library@campus.edu', 'library', 60000, '#0f766e'),
  officer('a8', 'Arjun Nair (Placement Officer)', 'placement@campus.edu', 'placement', 75000, '#6b3fa0'),
  officer('a9', 'Dr. Farah Siddiqui (Dean, Student Affairs)', 'studentaffairs@campus.edu', 'studentAffairs', 98000, '#0f766e'),
  officer('a10', 'Kiran Desai (Admissions Officer)', 'admissions@campus.edu', 'admissions', 70000, '#2563a8'),
  { ...officer('a11', 'Ravi Shankar (Warden, Boys Hostel)', 'warden.boys@campus.edu', 'hostel', 48000, '#2563a8'), password: 'wardenboys123', hostelId: 'h-boys' },
  { ...officer('a12', 'Sunita Pai (Warden, Girls Hostel)', 'warden.girls@campus.edu', 'hostel', 48000, '#be185d'), password: 'wardengirls123', hostelId: 'h-girls' },
]

const sheet = (id: string, courseId: string, semester: number, examId: string | undefined, evaluatorId: string, components: DB['resultSheets'][number]['components'], status: DB['resultSheets'][number]['status'] = 'DRAFT', overrides: DB['resultSheets'][number]['overrides'] = {}): DB['resultSheets'][number] => ({
  id, courseId, semester, term: 'Regular', internalMax: 40, externalMax: 60, scaleInternals: true, minExternalPct: 35, minTotalPct: 40, components, examId, evaluatorId,
  extraStudentIds: [], overrides, status, ...(status === 'PUBLISHED' ? { submittedAt: d(-4), publishedAt: d(-3), publishedBy: 'a6' } : {}),
})

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
      { id: 'ex1', courseId: 'c1', title: 'Mid-Semester Examination', date: iso(-10), start: '10:00', end: '11:30', venue: 'Exam Block', maxMarks: 50, minAttendance: 75, requireFeesCleared: false, minInternal: 0, resultsPublished: true, grading: 'ABSOLUTE', evaluatorId: 'f1', kind: 'Regular' },
      { id: 'ex2', courseId: 'c2', title: 'Mid-Semester Examination', date: iso(-9), start: '10:00', end: '11:30', venue: 'Exam Block', maxMarks: 50, minAttendance: 75, requireFeesCleared: false, minInternal: 0, resultsPublished: true, grading: 'ABSOLUTE', evaluatorId: 'f2', kind: 'Regular' },
      { id: 'ex3', courseId: 'c1', title: 'End Semester Examination', date: iso(12), start: '09:30', end: '12:30', venue: 'Exam Block', maxMarks: 100, minAttendance: 75, requireFeesCleared: true, minInternal: 0, resultsPublished: false, grading: 'RELATIVE', evaluatorId: 'f1', kind: 'Regular' },
      { id: 'ex4', courseId: 'c2', title: 'End Semester Examination', date: iso(14), start: '09:30', end: '12:30', venue: 'Exam Block', maxMarks: 100, minAttendance: 75, requireFeesCleared: true, minInternal: 0, resultsPublished: false, grading: 'ABSOLUTE', evaluatorId: 'f2', kind: 'Regular' },
      { id: 'ex6', courseId: 'c8', title: 'End Semester Examination', date: iso(-8), start: '09:30', end: '12:30', venue: 'Exam Block', maxMarks: 100, minAttendance: 0, requireFeesCleared: false, minInternal: 0, resultsPublished: true, grading: 'ABSOLUTE', evaluatorId: 'f4', kind: 'Regular' },
      { id: 'ex7', courseId: 'c9', title: 'End Semester Examination', date: iso(-6), start: '09:30', end: '12:30', venue: 'Exam Block', maxMarks: 100, minAttendance: 0, requireFeesCleared: false, minInternal: 0, resultsPublished: true, grading: 'ABSOLUTE', evaluatorId: 'f4', kind: 'Regular' },
      { id: 'ex8', courseId: 'c4', title: 'End Semester Examination', date: iso(18), start: '09:30', end: '12:30', venue: 'Exam Block', maxMarks: 100, minAttendance: 75, requireFeesCleared: true, minInternal: 0, resultsPublished: false, grading: 'ABSOLUTE', evaluatorId: 'f3', kind: 'Regular' },
      { id: 'ex9', courseId: 'c5', title: 'End Semester Examination', date: iso(20), start: '09:30', end: '12:30', venue: 'Exam Block', maxMarks: 100, minAttendance: 75, requireFeesCleared: true, minInternal: 0, resultsPublished: false, grading: 'ABSOLUTE', evaluatorId: 'f1', kind: 'Regular' },
      { id: 'ex5', courseId: 'c3', title: 'End Semester Examination', date: iso(16), start: '09:30', end: '12:30', venue: 'Exam Block', maxMarks: 100, minAttendance: 75, requireFeesCleared: true, minInternal: 0, resultsPublished: false, grading: 'ABSOLUTE', evaluatorId: 'f2', kind: 'Regular' },
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
    hostels: [
      { id: 'h-boys', name: 'Aryabhata Hostel (Boys)', gender: 'Boys', wardenId: 'a11' },
      { id: 'h-girls', name: 'Gargi Hostel (Girls)', gender: 'Girls', wardenId: 'a12' },
    ],
    rooms: [
      { id: 'rm1', hostelId: 'h-boys', block: 'Aryabhata Hostel (Boys)', number: 'A-101', capacity: 2, occupants: ['s1'], type: 'AC', feePerSem: 55000 },
      { id: 'rm2', hostelId: 'h-boys', block: 'Aryabhata Hostel (Boys)', number: 'A-102', capacity: 2, occupants: ['s3', 's5'], type: 'AC', feePerSem: 55000 },
      { id: 'rm3', hostelId: 'h-boys', block: 'Aryabhata Hostel (Boys)', number: 'A-103', capacity: 3, occupants: [], type: 'Non-AC', feePerSem: 38000 },
      { id: 'rm4', hostelId: 'h-girls', block: 'Gargi Hostel (Girls)', number: 'B-201', capacity: 2, occupants: ['s2'], type: 'AC', feePerSem: 55000 },
      { id: 'rm5', hostelId: 'h-girls', block: 'Gargi Hostel (Girls)', number: 'B-202', capacity: 3, occupants: ['s4'], type: 'Non-AC', feePerSem: 38000 },
      { id: 'rm6', hostelId: 'h-girls', block: 'Gargi Hostel (Girls)', number: 'B-203', capacity: 2, occupants: [], type: 'AC', feePerSem: 55000 },
    ],
    nightAttendance: [1, 2, 3].flatMap((back) => [
      { id: `na-b-${back}`, hostelId: 'h-boys', date: iso(-back), present: back === 2 ? ['s1', 's3'] : ['s1', 's3', 's5'], onLeave: [], absent: back === 2 ? ['s5'] : [], remarks: (back === 2 ? { s5: 'Returned at 11:40 PM' } : {}) as Record<string, string>, markedBy: 'a11', at: d(-back, 22) },
      { id: `na-g-${back}`, hostelId: 'h-girls', date: iso(-back), present: ['s2', 's4'], onLeave: [], absent: [], remarks: {}, markedBy: 'a12', at: d(-back, 22) },
    ]),
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
    resultSheets: [
      sheet('rs-c1', 'c1', 5, 'ex3', 'f1', [{ kind: 'exam', id: 'ex1' }, { kind: 'assignment', id: 'as1' }, { kind: 'assignment', id: 'as5' }]),
      sheet('rs-c2', 'c2', 5, 'ex4', 'f2', [{ kind: 'exam', id: 'ex2' }, { kind: 'assignment', id: 'as2' }, { kind: 'assignment', id: 'as4' }, { kind: 'quiz', id: 'q1' }]),
      sheet('rs-c3', 'c3', 5, 'ex5', 'f2', [{ kind: 'assignment', id: 'as3' }]),
      sheet('rs-c4', 'c4', 5, 'ex8', 'f3', []),
      sheet('rs-c5', 'c5', 5, 'ex9', 'f1', []),
      sheet('rs-c8', 'c8', 5, 'ex6', 'f4', [], 'PUBLISHED', { s19: { internal: 32 }, s20: { internal: 28 }, s21: { internal: 18 }, s22: { internal: 36 } }),
      sheet('rs-c9', 'c9', 5, 'ex7', 'f4', [], 'PUBLISHED', { s19: { internal: 34 }, s20: { internal: 30 }, s21: { internal: 26 }, s22: { internal: 37 } }),
    ],
    services: [
      { id: 'sv1', title: 'Counselling Centre appointment', description: 'Confidential one-to-one session with a qualified counsellor for stress, anxiety, relationships or anything on your mind.', office: 'studentAffairs', category: 'Wellbeing', mode: 'In person or online', location: 'Wellness Centre, Block C', durationMin: 45, slots: [1, 2, 3, 4, 5].flatMap((day) => [{ day, start: '10:00' }, { day, start: '14:00' }, { day, start: '16:00' }]), maxPerSlot: 1, confidential: true, active: true, createdBy: 'a9' },
      { id: 'sv2', title: 'Meet the Vice-Chancellor', description: 'Open-house slot for student representatives and individual students to share ideas or concerns with the Vice-Chancellor.', office: 'registrar', category: 'Leadership', mode: 'In person', location: 'VC Office, Admin Block', durationMin: 15, slots: [{ day: 3, start: '15:00' }, { day: 3, start: '15:15' }, { day: 3, start: '15:30' }], maxPerSlot: 1, confidential: false, active: true, createdBy: 'a2' },
      { id: 'sv3', title: 'Registrar appointment', description: 'Certificates, transfers, name corrections, migration and other record-related matters.', office: 'registrar', category: 'Administrative', mode: 'In person', location: 'Registrar Office, Admin Block', durationMin: 20, slots: [1, 2, 4].flatMap((day) => [{ day, start: '11:00' }, { day, start: '11:30' }]), maxPerSlot: 2, confidential: false, active: true, createdBy: 'a2' },
      { id: 'sv4', title: 'Results & re-evaluation help desk', description: 'Questions about marks, grade sheets, backlogs or re-evaluation.', office: 'exam', category: 'Academic', mode: 'In person or online', location: 'Evaluation Section, Exam Block', durationMin: 15, slots: [2, 4].flatMap((day) => [{ day, start: '12:00' }, { day, start: '12:15' }]), maxPerSlot: 1, confidential: false, active: true, createdBy: 'a6' },
      { id: 'sv5', title: 'Fee & scholarship counselling', description: 'Instalment plans, scholarships, education loans and refunds.', office: 'finance', category: 'Financial', mode: 'In person', location: 'Accounts Section, Admin Block', durationMin: 20, slots: [1, 3, 5].flatMap((day) => [{ day, start: '14:30' }]), maxPerSlot: 2, confidential: false, active: true, createdBy: 'a3' },
      { id: 'sv6', title: 'Career counselling', description: 'Resume review, mock interview and career path guidance from the Placement Cell.', office: 'placement', category: 'Career', mode: 'In person or online', location: 'Placement Cell, Block B', durationMin: 30, slots: [2, 5].flatMap((day) => [{ day, start: '15:00' }, { day, start: '15:30' }]), maxPerSlot: 1, confidential: false, active: true, createdBy: 'a8' },
      { id: 'sv7', title: 'HOD office hours – Computer Applications', description: 'Meet the Head of Department about electives, projects, internships or academic concerns.', ownerFacultyId: 'f2', category: 'Academic', mode: 'In person', location: 'CA Department, LH Block 2nd floor', durationMin: 15, slots: [{ day: 2, start: '16:00' }, { day: 4, start: '16:00' }], maxPerSlot: 2, confidential: false, active: true, createdBy: 'f2' },
    ],
    appointments: [
      { id: 'apt1', serviceId: 'sv6', studentId: 's1', at: d(2, 15), reason: 'Resume review before the Infosys drive', status: 'CONFIRMED', note: 'Bring a printed copy of your resume.', createdAt: d(-1) },
      { id: 'apt2', serviceId: 'sv3', studentId: 's2', at: d(1, 11), reason: 'Name correction on 12th certificate in records', status: 'REQUESTED', createdAt: d(-0.3) },
    ],
    audit: [
      { id: 'au0', at: d(-1), actorId: 'a2', action: 'ADMISSION_VERIFY', detail: 'Verified documents for Harsh Vardhan' },
    ],
  }
}
