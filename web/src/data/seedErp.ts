import type { DB, Office, User } from './types'

const DAY = 86_400_000
const now = Date.now()
const d = (offsetDays: number, hour = 10) => {
  const t = new Date(now + offsetDays * DAY)
  t.setHours(hour, 0, 0, 0)
  return t.getTime()
}
const iso = (offsetDays: number) => new Date(now + offsetDays * DAY).toISOString().slice(0, 10)

type ErpPart = Pick<DB, 'companies' | 'placementPolicy' | 'librarySettings' | 'nightAttendance' | 'hostels' | 'resultSheets' | 'services' | 'appointments' | 'applications' | 'scholarships' | 'exams' | 'results' | 'revaluations' | 'rooms' | 'hostelLeaves' | 'mealCoupons' | 'leaves' | 'payrollRuns' | 'purchaseRequests' | 'assets' | 'tickets' | 'drives' | 'books' | 'loans' | 'alumni' | 'refunds' | 'audit'>

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
  officer('a13', 'Dr. Neha Kapoor (Counsellor)', 'counsellor@campus.edu', 'studentAffairs', 72000, '#6b3fa0'),
  officer('a14', 'Prakash Rao (Estate & Facilities)', 'facilities@campus.edu', 'facilities', 68000, '#9a5b00'),
  officer('a15', 'Manjunath Gowda (Transport Manager)', 'transport@campus.edu', 'transport', 58000, '#0f766e'),
]

const sheet = (id: string, courseId: string, semester: number, examId: string | undefined, evaluatorId: string, components: DB['resultSheets'][number]['components'], status: DB['resultSheets'][number]['status'] = 'DRAFT', overrides: DB['resultSheets'][number]['overrides'] = {}): DB['resultSheets'][number] => ({
  id, courseId, semester, term: 'Regular', internalMax: 60, externalMax: 40, scaleInternals: true, minExternalPct: 35, minTotalPct: 40, components, examId, evaluatorId,
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
      // BCA 2025 · Sem 3: papers written and evaluated; professors have submitted marks, waiting for the Registrar of Evaluation to publish.
      { id: 'ex10', courseId: 'c6', title: 'Mid-Semester Examination', date: iso(-48), start: '10:00', end: '11:30', venue: 'Exam Block', maxMarks: 50, minAttendance: 0, requireFeesCleared: false, minInternal: 0, resultsPublished: true, grading: 'ABSOLUTE', evaluatorId: 'f1', kind: 'Regular' },
      { id: 'ex11', courseId: 'c7', title: 'Mid-Semester Examination', date: iso(-46), start: '10:00', end: '11:30', venue: 'Exam Block', maxMarks: 50, minAttendance: 0, requireFeesCleared: false, minInternal: 0, resultsPublished: true, grading: 'ABSOLUTE', evaluatorId: 'f2', kind: 'Regular' },
      { id: 'ex12', courseId: 'c6', title: 'End Semester Examination', date: iso(-12), start: '09:30', end: '12:30', venue: 'Exam Block', maxMarks: 100, minAttendance: 75, requireFeesCleared: true, minInternal: 0, resultsPublished: false, grading: 'ABSOLUTE', evaluatorId: 'f1', kind: 'Regular' },
      { id: 'ex13', courseId: 'c7', title: 'End Semester Examination', date: iso(-10), start: '09:30', end: '12:30', venue: 'Exam Block', maxMarks: 100, minAttendance: 75, requireFeesCleared: true, minInternal: 0, resultsPublished: false, grading: 'ABSOLUTE', evaluatorId: 'f2', kind: 'Regular' },
      { id: 'ex5', courseId: 'c3', title: 'End Semester Examination', date: iso(16), start: '09:30', end: '12:30', venue: 'Exam Block', maxMarks: 100, minAttendance: 75, requireFeesCleared: true, minInternal: 0, resultsPublished: false, grading: 'ABSOLUTE', evaluatorId: 'f2', kind: 'Regular' },
    ],
    results: [
      ...['s19', 's20', 's21', 's22'].flatMap((sid, i) => [
        { id: `r-ex6-${sid}`, examId: 'ex6', studentId: sid, marks: [78, 64, 35, 88][i] },
        { id: `r-ex7-${sid}`, examId: 'ex7', studentId: sid, marks: [82, 71, 58, 91][i] },
      ]),
      ...['s14', 's15', 's16', 's17', 's18'].flatMap((sid, i) => [
        { id: `r-ex10-${sid}`, examId: 'ex10', studentId: sid, marks: [41, 36, 27, 45, 38][i] },
        { id: `r-ex11-${sid}`, examId: 'ex11', studentId: sid, marks: [39, 33, 30, 44, 40][i] },
        { id: `r-ex12-${sid}`, examId: 'ex12', studentId: sid, marks: [78, 66, 31, 88, 72][i] },
        { id: `r-ex13-${sid}`, examId: 'ex13', studentId: sid, marks: [74, 61, 52, 91, 69][i] },
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
    companies: [
      { id: 'co-infy', name: 'Infosys', industry: 'IT services', website: 'https://www.infosys.com', location: 'Bengaluru', contactName: 'Anand Rao', contactEmail: 'campus.hiring@infosys.example', contactPhone: '9880011223', notes: 'Visits every year in November.' },
      { id: 'co-rzp', name: 'Razorpay', industry: 'Fintech', website: 'https://razorpay.com', location: 'Bengaluru', contactName: 'Meghna Iyer', contactEmail: 'university@razorpay.example' },
      { id: 'co-msft', name: 'Microsoft', industry: 'Product / software', website: 'https://careers.microsoft.com', location: 'Hyderabad', contactName: 'Vikram Shah', contactEmail: 'campus@microsoft.example' },
      { id: 'co-dlt', name: 'Deloitte', industry: 'Consulting', website: 'https://www2.deloitte.com', location: 'Mumbai', contactName: 'Ritu Malhotra', contactEmail: 'campus@deloitte.example' },
      { id: 'co-tcs', name: 'TCS', industry: 'IT services', website: 'https://www.tcs.com', location: 'Chennai', contactName: 'S. Raghunath', contactEmail: 'nqt@tcs.example' },
      { id: 'co-kpmg', name: 'KPMG', industry: 'Audit & advisory', website: 'https://kpmg.com/in', location: 'Bengaluru', contactName: 'Nisha Fernandes', contactEmail: 'campus@kpmg.example' },
    ],
    placementPolicy: { oneOffer: true, dreamLpa: 12 },
    drives: [
      { id: 'dr1', companyId: 'co-infy', company: 'Infosys', role: 'Systems Engineer', kind: 'Full-time', ctc: '₹ 3.6 LPA', ctcLpa: 3.6, minCgpa: 6.5, maxBacklogs: 0, programs: ['BCA'], batches: [2024], rounds: ['Online aptitude test', 'Technical interview', 'HR interview'], driveDate: d(9), venue: 'Lab-3 & Seminar Hall A', openings: 15, deadline: d(6), description: 'Hiring for the 2027 batch.',
        applications: [{ studentId: 's2', status: 'SHORTLISTED', round: 1, appliedAt: d(-4) }, { studentId: 's5', status: 'APPLIED', round: 0, appliedAt: d(-2) }, { studentId: 's9', status: 'APPLIED', round: 0, appliedAt: d(-1) }] },
      { id: 'dr2', companyId: 'co-rzp', company: 'Razorpay', role: 'SDE Intern', kind: 'Internship', ctc: '₹ 40,000 / month', ctcLpa: 4.8, minCgpa: 8.0, maxBacklogs: 0, programs: ['BCA'], batches: [2024, 2025], rounds: ['Coding round', 'Technical interview'], driveDate: d(12), venue: 'Online', openings: 4, deadline: d(9), description: '6-month internship with a pre-placement offer opportunity.',
        applications: [{ studentId: 's14', status: 'APPLIED', round: 0, appliedAt: d(-1) }, { studentId: 's17', status: 'SHORTLISTED', round: 1, appliedAt: d(-2) }] },
      { id: 'dr3', companyId: 'co-msft', company: 'Microsoft', role: 'Software Engineer', kind: 'Top-tier', ctc: '₹ 45 LPA', ctcLpa: 45, minCgpa: 8.5, maxBacklogs: 0, programs: ['BCA'], batches: [2024], rounds: ['Online coding test', 'Technical interview 1', 'Technical interview 2', 'Hiring manager'], driveDate: d(7), venue: 'Online', openings: 2, deadline: d(4), description: 'Online coding round followed by three interviews.',
        applications: [{ studentId: 's6', status: 'INTERVIEW', round: 2, slot: d(7, 11), appliedAt: d(-6) }, { studentId: 's4', status: 'SHORTLISTED', round: 1, appliedAt: d(-6) }, { studentId: 's1', status: 'APPLIED', round: 0, appliedAt: d(-3) }] },
      { id: 'dr4', companyId: 'co-dlt', company: 'Deloitte', role: 'Analyst', kind: 'Full-time', ctc: '₹ 7 LPA', ctcLpa: 7, minCgpa: 7.0, maxBacklogs: 1, programs: ['BCA', 'BBA'], batches: [2024], rounds: ['Aptitude test', 'Group discussion', 'Interview'], driveDate: d(-12), venue: 'Seminar Hall A', openings: 5, deadline: d(-15), description: 'Closed. Results announced.',
        applications: [{ studentId: 's1', status: 'SELECTED', round: 3, offerCtc: 7, offer: 'ACCEPTED', appliedAt: d(-25) }, { studentId: 's8', status: 'SELECTED', round: 3, offerCtc: 7, offer: 'OFFERED', appliedAt: d(-25) }, { studentId: 's10', status: 'REJECTED', round: 2, appliedAt: d(-25), note: 'Did not clear the interview' }, { studentId: 's20', status: 'REJECTED', round: 1, appliedAt: d(-24) }] },
      { id: 'dr5', companyId: 'co-tcs', company: 'TCS', role: 'Assistant System Engineer (NQT)', kind: 'Full-time', ctc: '₹ 3.4 LPA', ctcLpa: 3.4, minCgpa: 6.0, maxBacklogs: 1, programs: ['BCA', 'BBA'], batches: [2024], rounds: ['National Qualifier Test', 'Interview'], driveDate: d(-20), venue: 'Lab-3', openings: 20, deadline: d(-24), description: 'Results announced.',
        applications: [{ studentId: 's3', status: 'SELECTED', round: 2, offerCtc: 3.4, offer: 'ACCEPTED', appliedAt: d(-30) }, { studentId: 's12', status: 'SELECTED', round: 2, offerCtc: 3.4, offer: 'DECLINED', appliedAt: d(-30) }, { studentId: 's7', status: 'REJECTED', round: 1, appliedAt: d(-30) }] },
      { id: 'dr6', companyId: 'co-kpmg', company: 'KPMG', role: 'Audit Associate', kind: 'Full-time', ctc: '₹ 6.5 LPA', ctcLpa: 6.5, minCgpa: 7.0, maxBacklogs: 0, programs: ['BBA'], batches: [2024], rounds: ['Aptitude test', 'Interview'], driveDate: d(-8), venue: 'Seminar Hall B', openings: 3, deadline: d(-10), description: 'Results announced.',
        applications: [{ studentId: 's22', status: 'SELECTED', round: 2, offerCtc: 6.5, offer: 'ACCEPTED', appliedAt: d(-14) }, { studentId: 's19', status: 'INTERVIEW', round: 1, slot: d(1, 10), appliedAt: d(-14) }] },
      { id: 'dr7', companyId: 'co-dlt', company: 'Deloitte', role: 'Business Analyst Intern', kind: 'Internship', ctc: '₹ 25,000 / month', ctcLpa: 3, minCgpa: 7.0, maxBacklogs: 0, programs: ['BBA'], batches: [2024], rounds: ['Interview'], driveDate: d(14), venue: 'Online', openings: 3, deadline: d(10), description: 'Summer internship for final-year BBA students.', applications: [] },
    ],
    books: [
      { id: 'bk1', title: 'Database System Concepts', author: 'Silberschatz, Korth, Sudarshan', isbn: '9789352601301', subject: 'DBMS', copies: 6, shelf: 'CS-12', publisher: 'McGraw Hill', edition: '7th', year: 2019, price: 925, reservations: [] },
      { id: 'bk2', title: 'Operating System Concepts', author: 'Silberschatz, Galvin, Gagne', isbn: '9781119800361', subject: 'Operating Systems', copies: 5, shelf: 'CS-14', publisher: 'Wiley', edition: '10th', year: 2021, price: 899, reservations: [] },
      { id: 'bk3', title: 'Eloquent JavaScript', author: 'Marijn Haverbeke', isbn: '9781593279509', subject: 'Web Technologies', copies: 3, shelf: 'CS-21', publisher: 'No Starch Press', edition: '3rd', year: 2018, price: 1450, ebookUrl: 'https://eloquentjavascript.net/', reservations: [] },
      { id: 'bk4', title: 'Discrete Mathematics and Its Applications', author: 'Kenneth Rosen', isbn: '9781259676512', subject: 'Mathematics', copies: 4, shelf: 'MA-03', publisher: 'McGraw Hill', edition: '8th', year: 2019, price: 1095, reservations: [] },
      { id: 'bk5', title: 'Software Engineering: A Practitioner’s Approach', author: 'Roger Pressman', isbn: '9781259872976', subject: 'Software Engineering', copies: 2, shelf: 'CS-30', publisher: 'McGraw Hill', edition: '8th', year: 2019, price: 875, reservations: [] },
      { id: 'bk6', title: 'Clean Code', author: 'Robert C. Martin', isbn: '9780132350884', subject: 'Software Engineering', copies: 1, shelf: 'CS-31', publisher: 'Pearson', year: 2008, price: 650, reservations: ['s4'] },
      { id: 'bk7', title: 'Data Structures and Algorithms in C++', author: 'Goodrich, Tamassia, Mount', isbn: '9780470383278', subject: 'Data Structures', copies: 4, shelf: 'CS-08', publisher: 'Wiley', edition: '2nd', year: 2011, price: 780, reservations: [] },
      { id: 'bk8', title: 'Computer Networking: A Top-Down Approach', author: 'Kurose, Ross', isbn: '9780136681557', subject: 'Computer Networks', copies: 4, shelf: 'CS-16', publisher: 'Pearson', edition: '8th', year: 2021, price: 950, lostCopies: 1, reservations: [] },
      { id: 'bk9', title: 'Marketing Management', author: 'Philip Kotler, Kevin Keller', isbn: '9789332557185', subject: 'Marketing', copies: 5, shelf: 'MG-04', publisher: 'Pearson', edition: '15th', year: 2017, price: 890, reservations: [] },
      { id: 'bk10', title: 'Financial Accounting', author: 'S. N. Maheshwari', isbn: '9789325982581', subject: 'Accounting', copies: 5, shelf: 'MG-09', publisher: 'Vikas', edition: '6th', year: 2018, price: 595, reservations: [] },
      { id: 'bk11', title: 'Principles of Management', author: 'Harold Koontz, Heinz Weihrich', isbn: '9789339222864', subject: 'Management', copies: 3, shelf: 'MG-01', publisher: 'McGraw Hill', edition: '2nd', year: 2015, price: 545, reservations: [] },
      { id: 'bk12', title: 'Introduction to Algorithms', author: 'Cormen, Leiserson, Rivest, Stein', isbn: '9780262046305', subject: 'Algorithms', copies: 3, shelf: 'CS-09', publisher: 'MIT Press', edition: '4th', year: 2022, price: 1995, reservations: [] },
      { id: 'bk13', title: 'Cloud Computing: Concepts, Technology & Architecture', author: 'Thomas Erl', isbn: '9789332535923', subject: 'Cloud Computing', copies: 2, shelf: 'CS-40', publisher: 'Pearson', year: 2014, price: 720, reservations: [] },
      { id: 'bk14', title: 'Wings of Fire', author: 'A. P. J. Abdul Kalam', isbn: '9788173711466', subject: 'General', copies: 4, shelf: 'GN-02', publisher: 'Universities Press', year: 1999, price: 350, reservations: [] },
    ],
    librarySettings: { loanDays: 14, finePerDay: 5, maxLoansStudent: 3, maxLoansStaff: 6, maxRenewals: 1 },
    loans: [
      // Out now
      { id: 'ln1', bookId: 'bk1', accession: 'BK1-01', userId: 's1', issuedAt: d(-10), dueAt: d(4), issuedBy: 'a7' },
      { id: 'ln2', bookId: 'bk6', accession: 'BK6-01', userId: 's2', issuedAt: d(-20), dueAt: d(-6), issuedBy: 'a7' }, // overdue: fine growing, student blocked
      { id: 'ln3', bookId: 'bk7', accession: 'BK7-01', userId: 's14', issuedAt: d(-5), dueAt: d(9), issuedBy: 'a7' },
      { id: 'ln4', bookId: 'bk12', accession: 'BK12-01', userId: 'f2', issuedAt: d(-25), dueAt: d(-11), issuedBy: 'a7' }, // faculty overdue: warning
      { id: 'ln5', bookId: 'bk9', accession: 'BK9-01', userId: 's19', issuedAt: d(-3), dueAt: d(11), issuedBy: 'a7' },
      { id: 'ln6', bookId: 'bk3', accession: 'BK3-01', userId: 'f1', issuedAt: d(-8), dueAt: d(6), issuedBy: 'a7' },
      // Returned
      { id: 'ln7', bookId: 'bk2', accession: 'BK2-02', userId: 's7', issuedAt: d(-40), dueAt: d(-26), returnedAt: d(-18), returnedBy: 'a7', fine: 40, issuedBy: 'a7' }, // unpaid fine: blocked
      { id: 'ln8', bookId: 'bk4', accession: 'BK4-01', userId: 's3', issuedAt: d(-35), dueAt: d(-21), returnedAt: d(-15), returnedBy: 'a7', fine: 30, finePaid: 30, finePaidAt: d(-15), receiptNo: 'LIB-2026-0001', issuedBy: 'a7' },
      { id: 'ln9', bookId: 'bk10', accession: 'BK10-02', userId: 's21', issuedAt: d(-30), dueAt: d(-16), returnedAt: d(-13), returnedBy: 'a7', fine: 15, fineWaived: true, waivedBy: 'a7', waiveReason: 'Medical leave certificate submitted', issuedBy: 'a7' },
      { id: 'ln10', bookId: 'bk8', accession: 'BK8-01', userId: 's1', issuedAt: d(-60), dueAt: d(-46), returnedAt: d(-47), returnedBy: 'a7', issuedBy: 'a7' },
      { id: 'ln11', bookId: 'bk14', accession: 'BK14-01', userId: 's6', issuedAt: d(-28), dueAt: d(-14), returnedAt: d(-14), returnedBy: 'a7', renewals: 0, issuedBy: 'a7' },
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
      { ...sheet('rs-c6', 'c6', 3, 'ex12', 'f1', [{ kind: 'exam', id: 'ex10' }]), status: 'SUBMITTED', submittedAt: d(-2) },
      { ...sheet('rs-c7', 'c7', 3, 'ex13', 'f2', [{ kind: 'exam', id: 'ex11' }]), status: 'SUBMITTED', submittedAt: d(-1) },
      sheet('rs-c8', 'c8', 5, 'ex6', 'f4', [], 'PUBLISHED', { s19: { internal: 48 }, s20: { internal: 42 }, s21: { internal: 24 }, s22: { internal: 54 } }),
      sheet('rs-c9', 'c9', 5, 'ex7', 'f4', [], 'PUBLISHED', { s19: { internal: 51 }, s20: { internal: 45 }, s21: { internal: 39 }, s22: { internal: 56 } }),
    ],
    services: [
      { id: 'sv1', assigneeIds: ['a13'], title: 'Counselling Centre appointment', description: 'Confidential one-to-one session with a qualified counsellor for stress, anxiety, relationships or anything on your mind.', office: 'studentAffairs', category: 'Wellbeing', mode: 'In person or online', location: 'Wellness Centre, Block C', durationMin: 45, slots: [1, 2, 3, 4, 5].flatMap((day) => [{ day, start: '10:00' }, { day, start: '14:00' }, { day, start: '16:00' }]), maxPerSlot: 1, confidential: true, active: true, createdBy: 'a9' },
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
