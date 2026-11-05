import type { DB, User } from './types'
import { createErpSeed, officeStaff, parentUser } from './seedErp'
import { groupIntoSessions } from '../exams'
import { normalizeBeds } from '../hostels'

const DAY = 86_400_000
const now = Date.now()
const d = (offsetDays: number, hour = 10) => {
  const t = new Date(now + offsetDays * DAY)
  t.setHours(hour, 0, 0, 0)
  return t.getTime()
}
const iso = (offsetDays: number) => new Date(now + offsetDays * DAY).toISOString().slice(0, 10)

const colors = ['#7a1e2c', '#2563a8', '#1f8a4c', '#b7791f', '#6b3fa0', '#0f766e', '#be185d']

const firstNames = ['Aarav', 'Diya', 'Vihaan', 'Ananya', 'Arjun', 'Ishita', 'Kabir', 'Meera', 'Rohan', 'Saanvi', 'Aditya', 'Kavya']
const lastNames = ['Sharma', 'Rao', 'Iyer', 'Patel', 'Reddy', 'Nair', 'Gupta', 'Menon', 'Kulkarni', 'Joshi', 'Shetty', 'Das']

const students: User[] = firstNames.map((f, i) => ({
  id: `s${i + 1}`,
  name: `${f} ${lastNames[i]}`,
  email: i === 0 ? 'student@campus.edu' : `${f.toLowerCase()}.${lastNames[i].toLowerCase()}@campus.edu`,
  password: 'student123',
  role: 'student',
  status: i === 11 ? 'DEACTIVATED' : 'ACTIVE',
  department: 'Computer Applications',
  rollNo: `22BCA${String(i + 1).padStart(3, '0')}`,
  program: 'BCA',
  semester: 5,
  section: 'A',
  phone: `98450${String(10000 + i * 137).slice(0, 5)}`,
  firstLogin: false,
  credentialsMismatchCount: 0,
  avatarColor: colors[i % colors.length],
  cgpa: [8.42, 7.9, 6.8, 8.9, 7.2, 9.1, 6.2, 8.1, 7.5, 8.6, 5.9, 7.0][i],
  backlogs: [0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 3, 0][i],
  classId: 'cls-bca-2024-a',
  batch: 2024,
}))

/** Two more classes so students can be grouped: BCA 2025 (Sem 3) and BBA 2024 (Sem 5). */
const more = (prefix: string, startId: number, names: string[], cls: string, program: string, batch: number, semester: number, dept: string): User[] =>
  names.map((n, i) => ({
    id: `s${startId + i}`, name: n, email: `${n.toLowerCase().replace(/ /g, '.')}@campus.edu`, password: 'student123', role: 'student', status: 'ACTIVE',
    department: dept, rollNo: `${prefix}${String(i + 1).padStart(3, '0')}`, program, semester, section: 'A', phone: `9741${String(100000 + i * 731).slice(0, 6)}`,
    firstLogin: false, credentialsMismatchCount: 0, avatarColor: colors[(i + startId) % colors.length], cgpa: [8.1, 7.4, 6.9, 8.7, 7.8][i] ?? 7.5, backlogs: [0, 0, 1, 0, 0][i] ?? 0, classId: cls, batch,
  }))
const bca2025 = more('23BCA', 14, ['Neha Bhatt', 'Siddharth Jain', 'Pranav Hegde', 'Lavanya Gowda', 'Yash Agarwal'], 'cls-bca-2025-a', 'BCA', 2025, 3, 'Computer Applications')
const bba2024 = more('22BBA', 19, ['Riddhi Mehta', 'Karan Malhotra', 'Aisha Khan', 'Varun Shenoy'], 'cls-bba-2024-a', 'BBA', 2024, 5, 'Management')

const faculty: User[] = [
  { id: 'f1', name: 'Dr. Priya Raghavan', email: 'faculty@campus.edu', department: 'Computer Applications' },
  { id: 'f2', name: 'Prof. Sanjay Hegde', email: 'sanjay.hegde@campus.edu', department: 'Computer Applications' },
  { id: 'f3', name: 'Dr. Lakshmi Narayan', email: 'lakshmi.narayan@campus.edu', department: 'Mathematics' },
  { id: 'f4', name: 'Prof. Meena Kulkarni', email: 'meena.kulkarni@campus.edu', department: 'Management' },
].map((f, i) => ({
  ...f,
  password: 'faculty123',
  role: 'faculty' as const,
  status: 'ACTIVE' as const,
  phone: `98860${i}2345`,
  firstLogin: false,
  credentialsMismatchCount: 0,
  avatarColor: colors[(i + 3) % colors.length],
  basicSalary: [95000, 72000, 88000, 78000][i],
}))

const admin: User = {
  id: 'a1',
  name: 'System Administrator',
  office: 'super',
  email: 'admin@campus.edu',
  password: 'admin123',
  role: 'admin',
  status: 'ACTIVE',
  department: 'Administration',
  firstLogin: false,
  credentialsMismatchCount: 0,
  avatarColor: '#1f2328',
  basicSalary: 65000,
}

const newStudent: User = {
  ...students[1],
  id: 's13',
  name: 'Nikhil Bhat',
  email: 'new@campus.edu',
  password: 'welcome123',
  rollNo: '22BCA013',
  status: 'ACTIVE',
  firstLogin: true,
}

const bca2024Ids = [...students.map((s) => s.id), 's13']
const bca2025Ids = bca2025.map((s) => s.id)
const bba2024Ids = bba2024.map((s) => s.id)
const allStudentIds = [...bca2024Ids, ...bca2025Ids, ...bba2024Ids]

/** Gender and hostel/day-scholar status for demo students (four hostel students await rooms). */
const FEMALE = new Set(['s2', 's4', 's6', 's8', 's10', 's12', 's14', 's17', 's19', 's21'])
const HOSTELLERS = new Set(['s1', 's2', 's3', 's4', 's5', 's7', 's8', 's15', 's17'])
const withResidence = (u: User): User => u.role !== 'student' ? u : {
  ...u, gender: FEMALE.has(u.id) ? 'Female' : 'Male', residence: HOSTELLERS.has(u.id) ? 'HOSTEL' : 'DAY_SCHOLAR',
  backlogCourses: u.id === 's21' ? ['c8'] : [],
  // Semesters completed before the portal; the portal's published results are added on top.
  priorRecord: priorFor(u),
}
function priorFor(u: User): NonNullable<User['priorRecord']> {
  const semesters = Math.max(0, (u.semester ?? 1) - 1)
  const portalBacklogs = u.id === 's21' ? 1 : 0
  return { semesters, credits: semesters * 20, cgpa: semesters ? u.cgpa ?? 0 : 0, backlogs: Math.max(0, (u.backlogs ?? 0) - portalBacklogs) }
}

export function createSeed(): DB {
  const seed: DB = {
    version: 7,
    examSessions: [],
    users: [...students, newStudent, ...bca2025, ...bba2024, ...faculty, admin, ...officeStaff, parentUser].map(withResidence),
    classes: [
      { id: 'cls-bca-2024-a', program: 'BCA', batch: 2024, section: 'A', semester: 5, maxSemesters: 6, mentorId: 'f1' },
      { id: 'cls-bca-2025-a', program: 'BCA', batch: 2025, section: 'A', semester: 3, maxSemesters: 6, mentorId: 'f2' },
      { id: 'cls-bba-2024-a', program: 'BBA', batch: 2024, section: 'A', semester: 5, maxSemesters: 6, mentorId: 'f4' },
    ],
    ...createErpSeed(),
    courses: [
      { id: 'c1', code: 'BCA501', name: 'Web Technologies', facultyId: 'f1', credits: 4, semester: 5, description: 'HTML, CSS, JavaScript, React and REST APIs for modern web applications.', studentIds: bca2024Ids, classId: 'cls-bca-2024-a' },
      { id: 'c2', code: 'BCA502', name: 'Database Management Systems', facultyId: 'f2', credits: 4, semester: 5, description: 'Relational model, SQL, normalisation, transactions and indexing.', studentIds: bca2024Ids, classId: 'cls-bca-2024-a' },
      { id: 'c3', code: 'BCA503', name: 'Operating Systems', facultyId: 'f2', credits: 3, semester: 5, description: 'Processes, scheduling, memory management and file systems.', studentIds: bca2024Ids, classId: 'cls-bca-2024-a' },
      { id: 'c4', code: 'MAT501', name: 'Discrete Mathematics', facultyId: 'f3', credits: 3, semester: 5, description: 'Logic, sets, relations, graphs and combinatorics.', studentIds: bca2024Ids, classId: 'cls-bca-2024-a' },
      { id: 'c5', code: 'BCA504', name: 'Software Engineering', facultyId: 'f1', credits: 3, semester: 5, description: 'SDLC, requirements, design, testing and project management.', studentIds: bca2024Ids, classId: 'cls-bca-2024-a' },
      { id: 'c6', code: 'BCA301', name: 'Data Structures', facultyId: 'f1', credits: 4, semester: 3, description: 'Arrays, linked lists, stacks, queues, trees, graphs and hashing.', studentIds: bca2025Ids, classId: 'cls-bca-2025-a' },
      { id: 'c7', code: 'BCA302', name: 'Computer Networks', facultyId: 'f2', credits: 4, semester: 3, description: 'OSI and TCP/IP models, routing, transport protocols and network security.', studentIds: bca2025Ids, classId: 'cls-bca-2025-a' },
      { id: 'c8', code: 'BBA501', name: 'Marketing Management', facultyId: 'f4', credits: 4, semester: 5, description: 'Marketing mix, consumer behaviour, branding and digital marketing.', studentIds: bba2024Ids, classId: 'cls-bba-2024-a' },
      { id: 'c9', code: 'BBA502', name: 'Financial Accounting', facultyId: 'f4', credits: 4, semester: 5, description: 'Accounting principles, journals, ledgers and financial statements.', studentIds: bba2024Ids, classId: 'cls-bba-2024-a' },
    ],
    materials: [
      { id: 'm1', courseId: 'c1', title: 'Unit 1 – HTML & CSS fundamentals', kind: 'slides', url: '#', postedAt: d(-20) },
      { id: 'm2', courseId: 'c1', title: 'React Hooks – recorded lecture', kind: 'video', url: '#', postedAt: d(-7) },
      { id: 'm3', courseId: 'c2', title: 'SQL Joins cheat sheet', kind: 'pdf', url: '#', postedAt: d(-12) },
      { id: 'm4', courseId: 'c3', title: 'CPU Scheduling notes', kind: 'pdf', url: '#', postedAt: d(-5) },
      { id: 'm5', courseId: 'c4', title: 'Graph theory reference', kind: 'link', url: '#', postedAt: d(-3) },
    ],
    assignments: [
      { id: 'as1', courseId: 'c1', title: 'Build a responsive portfolio page', description: 'Create a responsive single-page portfolio using semantic HTML and CSS grid.', dueAt: d(3, 23), maxMarks: 20, parts: [
        { id: 'p1', type: 'link', prompt: 'GitHub repository link', marks: 12, required: true },
        { id: 'p2', type: 'file', prompt: 'Design report (layout decisions, screenshots)', marks: 8, required: true, accept: ['pdf', 'doc'] },
      ] },
      { id: 'as2', courseId: 'c2', title: 'ER diagram for a library system', description: 'Design an ER diagram and convert it to relational tables in 3NF.', dueAt: d(6, 23), maxMarks: 25, parts: [
        { id: 'p1', type: 'file', prompt: 'ER diagram (drawn or exported)', marks: 10, required: true, accept: ['image', 'pdf'] },
        { id: 'p2', type: 'text', prompt: 'List the relational tables in 3NF with primary and foreign keys', marks: 10, required: true },
        { id: 'p3', type: 'mcq', prompt: 'A borrower can borrow many books and a book can be borrowed by many borrowers over time. This relationship is:', marks: 5, required: true, options: ['One-to-one', 'One-to-many', 'Many-to-many', 'Recursive'], correct: [2] },
      ] },
      { id: 'as4', courseId: 'c2', title: 'Normalisation concept check', description: 'Answer the objective questions, then justify one answer in your own words.', dueAt: d(4, 23), maxMarks: 12, parts: [
        { id: 'p1', type: 'mcq', prompt: 'Which normal form removes partial dependencies?', marks: 2, required: true, options: ['1NF', '2NF', '3NF', 'BCNF'], correct: [1] },
        { id: 'p2', type: 'mcq', prompt: 'A table is in 1NF when…', marks: 2, required: true, options: ['every attribute holds atomic values', 'there are no transitive dependencies', 'every determinant is a candidate key', 'it has a single-column primary key'], correct: [0] },
        { id: 'p3', type: 'msq', prompt: 'Select ALL statements that are true about BCNF.', marks: 4, required: true, options: ['Every BCNF relation is also in 3NF', 'Every 3NF relation is also in BCNF', 'In BCNF every determinant is a candidate key', 'BCNF allows partial dependencies'], correct: [0, 2] },
        { id: 'p4', type: 'text', prompt: 'Explain, with a small example, why 3NF does not always imply BCNF.', marks: 4, required: true },
      ] },
      { id: 'as5', courseId: 'c1', title: 'HTTP & REST quick check', description: 'Objective questions, marked automatically as soon as you submit.', dueAt: d(2, 23), maxMarks: 6, parts: [
        { id: 'p1', type: 'mcq', prompt: 'Which HTTP method is idempotent and used to replace a resource?', marks: 2, required: true, options: ['POST', 'PUT', 'PATCH', 'CONNECT'], correct: [1] },
        { id: 'p2', type: 'mcq', prompt: 'Status code for "resource created" is…', marks: 2, required: true, options: ['200', '201', '204', '302'], correct: [1] },
        { id: 'p3', type: 'msq', prompt: 'Select ALL safe methods.', marks: 2, required: true, options: ['GET', 'HEAD', 'DELETE', 'OPTIONS'], correct: [0, 1, 3] },
      ] },
      { id: 'as3', courseId: 'c3', title: 'Scheduling simulation', description: 'Simulate FCFS, SJF and Round Robin for the given process table and compare waiting times.', dueAt: d(-2, 23), maxMarks: 15 },
    ],
    submissions: [
      { id: 'sub1', assignmentId: 'as3', studentId: 's1', text: 'https://github.com/example/scheduler', submittedAt: d(-3), marks: 13, feedback: 'Good comparison, add Gantt charts next time.' },
      { id: 'sub2', assignmentId: 'as3', studentId: 's2', text: 'Attached report', fileName: 'scheduling.pdf', submittedAt: d(-2, 20) },
    ],
    quizzes: [
      {
        id: 'q1', courseId: 'c2', title: 'SQL Basics – Quiz 1', durationMin: 10, opensAt: d(-1), closesAt: d(5), publishScores: true,
        questions: [
          { q: 'Which clause filters rows after grouping?', options: ['WHERE', 'HAVING', 'ORDER BY', 'LIMIT'], answer: 1 },
          { q: 'Which normal form removes transitive dependencies?', options: ['1NF', '2NF', '3NF', 'BCNF'], answer: 2 },
          { q: 'A PRIMARY KEY column can contain NULL.', options: ['True', 'False'], answer: 1 },
          { q: 'Which JOIN returns all rows from the left table?', options: ['INNER JOIN', 'RIGHT JOIN', 'LEFT JOIN', 'CROSS JOIN'], answer: 2 },
        ],
      },
      {
        id: 'q2', courseId: 'c1', title: 'JavaScript Fundamentals', durationMin: 8, opensAt: d(-1), closesAt: d(4), publishScores: true,
        questions: [
          { q: 'typeof null returns…', options: ['"null"', '"object"', '"undefined"', '"number"'], answer: 1 },
          { q: 'Which keyword declares a block-scoped constant?', options: ['var', 'let', 'const', 'static'], answer: 2 },
          { q: 'Array.prototype.map returns…', options: ['The same array', 'A new array', 'undefined', 'A number'], answer: 1 },
        ],
      },
    ],
    attempts: [],
    timetable: [
      { id: 't1', courseId: 'c1', day: 1, start: '09:00', end: '10:00', room: 'LH-201' },
      { id: 't2', courseId: 'c2', day: 1, start: '10:15', end: '11:15', room: 'LH-201' },
      { id: 't3', courseId: 'c4', day: 1, start: '11:30', end: '12:30', room: 'LH-105' },
      { id: 't4', courseId: 'c3', day: 2, start: '09:00', end: '10:00', room: 'LH-202' },
      { id: 't5', courseId: 'c5', day: 2, start: '10:15', end: '11:15', room: 'LH-202' },
      { id: 't6', courseId: 'c1', day: 2, start: '14:00', end: '16:00', room: 'Lab-3' },
      { id: 't7', courseId: 'c2', day: 3, start: '09:00', end: '10:00', room: 'LH-201' },
      { id: 't8', courseId: 'c4', day: 3, start: '10:15', end: '11:15', room: 'LH-105' },
      { id: 't9', courseId: 'c3', day: 4, start: '09:00', end: '10:00', room: 'LH-202' },
      { id: 't10', courseId: 'c2', day: 4, start: '14:00', end: '16:00', room: 'Lab-2' },
      { id: 't11', courseId: 'c5', day: 5, start: '09:00', end: '10:00', room: 'LH-202' },
      { id: 't12', courseId: 'c1', day: 5, start: '10:15', end: '11:15', room: 'LH-201' },
      { id: 't13', courseId: 'c3', day: 6, start: '09:00', end: '10:00', room: 'LH-202' },
      { id: 't14', courseId: 'c6', day: 1, start: '09:00', end: '10:00', room: 'LH-301' },
      { id: 't15', courseId: 'c7', day: 2, start: '10:15', end: '11:15', room: 'LH-301' },
      { id: 't16', courseId: 'c6', day: 4, start: '11:30', end: '12:30', room: 'Lab-1' },
      { id: 't17', courseId: 'c8', day: 1, start: '10:15', end: '11:15', room: 'MB-101' },
      { id: 't18', courseId: 'c9', day: 3, start: '09:00', end: '10:00', room: 'MB-101' },
    ],
    attendance: (() => {
      const recs = []
      let n = 0
      for (let back = 21; back >= 1; back--) {
        const date = new Date(now - back * DAY)
        const day = date.getDay()
        if (day === 0) continue
        for (const [c, ids] of [['c1', bca2024Ids], ['c2', bca2024Ids], ['c3', bca2024Ids], ['c4', bca2024Ids], ['c5', bca2024Ids], ['c6', bca2025Ids], ['c7', bca2025Ids], ['c8', bba2024Ids], ['c9', bba2024Ids]] as const) {
          if ((back + c.charCodeAt(1)) % 3 === 0) continue
          const present = ids.filter((_sid, i) => (i * 7 + back * 3 + c.charCodeAt(1) * (i % 3 + 1)) % 5 !== 0)
          recs.push({ id: `att${++n}`, courseId: c, date: iso(-back), present, markedBy: 'f1' })
        }
      }
      return recs
    })(),
    posts: [
      { id: 'p1', courseId: 'c1', authorId: 'f1', text: 'Lab on Tuesday will cover React state management. Please install Node 22 beforehand.', createdAt: d(-2), replies: [{ id: 'r1', authorId: 's3', text: 'Will we need VS Code extensions?', createdAt: d(-2, 12) }, { id: 'r2', authorId: 'f1', text: 'ESLint and Prettier are enough.', createdAt: d(-2, 14) }] },
      { id: 'p2', courseId: 'c2', authorId: 's4', text: 'Can someone explain the difference between 3NF and BCNF with an example?', createdAt: d(-1), replies: [] },
      { id: 'p3', courseId: null, authorId: 'a1', text: 'Welcome to the new semester! The campus portal now supports online fee payment and gate pass requests.', createdAt: d(-6), replies: [] },
    ],
    notices: [
      { id: 'n1', title: 'Mid-semester examinations schedule released', body: 'Mid-semester examinations for all programmes will begin next Monday. Hall tickets are available under Exams. Carry your ID card.', category: 'Exam', audience: 'all', postedBy: 'a2', createdAt: d(-1), pinned: true },
      { id: 'n2', title: 'Placement drive: Infosys & TCS', body: 'Final year students can register for the campus drive by Friday. Resume must be updated in the Placement section.', category: 'Placement', audience: 'student', postedBy: 'a2', createdAt: d(-3), pinned: false },
      { id: 'n3', title: 'Faculty development programme on GenAI', body: 'A 3-day FDP on Generative AI in teaching will be held in the Seminar Hall. Register with the IQAC office.', category: 'Academic', audience: 'faculty', postedBy: 'a2', createdAt: d(-4), pinned: false },
      { id: 'n4', title: 'Library timings extended', body: 'The central library will remain open until 10 PM during the examination period.', category: 'General', audience: 'all', postedBy: 'a2', createdAt: d(-5), pinned: false },
    ],
    events: [
      { id: 'e1', title: 'Hackathon 2026', description: '24-hour hackathon on campus sustainability. Teams of up to 4.', venue: 'Innovation Centre', startsAt: d(8, 9), clubId: 'cl1', rsvps: ['s2', 's5'], capacity: 120 },
      { id: 'e2', title: 'Guest lecture: Cloud Native Architecture', description: 'Talk by an industry architect on Kubernetes and microservices.', venue: 'Seminar Hall A', startsAt: d(4, 14), rsvps: ['s1'], capacity: 200 },
      { id: 'e3', title: 'Cultural Fest – Utsav', description: 'Music, dance and drama competitions across departments.', venue: 'Open Air Theatre', startsAt: d(15, 17), clubId: 'cl2', rsvps: [], capacity: 1000 },
    ],
    clubs: [
      { id: 'cl1', category: 'Technical', meeting: 'Fridays 4 PM, Lab-3', active: true, joinOpen: true, name: 'Coding Club', description: 'Competitive programming, hackathons and open source.', members: ['s1', 's2', 's5', 's7'], facultyAdvisorId: 'f1' },
      { id: 'cl2', category: 'Cultural', meeting: 'Wednesdays 5 PM, Open Air Theatre', active: true, joinOpen: true, name: 'Cultural Committee', description: 'Music, dance, theatre and the annual fest.', members: ['s3', 's4'], facultyAdvisorId: 'f3' },
      { id: 'cl3', category: 'Entrepreneurship', meeting: 'Alternate Thursdays, Innovation Centre', active: true, joinOpen: true, name: 'Entrepreneurship Cell', description: 'Startup talks, pitch days and incubation support.', members: ['s6'], facultyAdvisorId: 'f2' },
      { id: 'cl4', category: 'Social Service', meeting: 'Saturdays 9 AM', active: true, joinOpen: true, name: 'NSS', description: 'Community service and social outreach.', members: [], facultyAdvisorId: 'f3' },
    ],
    fees: allStudentIds.flatMap((sid, i) => {
      // Roughly half the class has already cleared this semester's fees.
      const cleared = i % 2 === 1
      return [
        { id: `fee-${sid}-1`, studentId: sid, title: 'Tuition fee – Semester 5', amount: 75000, dueAt: d(10), head: 'Tuition' as const, ...(cleared ? { paidAt: d(-4 - i), paidAmount: 75000, txnId: `TXN8421${i}`, gateway: 'Razorpay' } : {}) },
        { id: `fee-${sid}-2`, studentId: sid, title: 'Examination fee', amount: 2500, dueAt: d(5), head: 'Exam' as const, ...(cleared ? { paidAt: d(-3 - i), paidAmount: 2500, txnId: `TXN9512${i}`, gateway: 'PayU' } : {}) },
        { id: `fee-${sid}-3`, studentId: sid, title: 'Tuition fee – Semester 4', amount: 75000, dueAt: d(-170), paidAt: d(-172), paidAmount: 75000, txnId: `TXN${sid.toUpperCase()}4`, head: 'Tuition' as const },
      ]
    }),
    gatePasses: [
      { id: 'g1', studentId: 's1', reason: 'Medical appointment', outAt: d(-4, 14), returnAt: d(-4, 18), status: 'APPROVED', reviewedBy: 'a4' },
      { id: 'g2', studentId: 's3', reason: 'Family function', outAt: d(1, 16), returnAt: d(2, 20), status: 'PENDING' },
    ],
    polls: [
      { id: 'pl1', question: 'Preferred slot for the extra DBMS lab?', options: ['Saturday 10 AM', 'Wednesday 4 PM', 'Friday 3 PM'], votes: { s2: 0, s3: 0, s4: 1 }, createdBy: 'f2', closesAt: d(3) },
      { id: 'pl2', question: 'Should the canteen add a late-evening menu?', options: ['Yes', 'No', 'Only during exams'], votes: { s5: 0, s6: 2, f1: 0 }, createdBy: 'a2', closesAt: d(7) },
    ],
    routes: [
      { id: 'r1', name: 'Route 1 – Hebbal', bus: 'KA-01-F-4521', driver: 'Ramesh K', driverPhone: '9845012345', subscribers: ['s1', 's4'], stops: [{ name: 'Hebbal Flyover', time: '07:15' }, { name: 'Yelahanka New Town', time: '07:35' }, { name: 'Airport Road Toll', time: '07:55' }, { name: 'Campus', time: '08:25' }] },
      { id: 'r2', name: 'Route 2 – Majestic', bus: 'KA-01-F-7783', driver: 'Suresh M', driverPhone: '9845067890', subscribers: ['s2'], stops: [{ name: 'Majestic', time: '06:50' }, { name: 'Mekhri Circle', time: '07:15' }, { name: 'Jakkur', time: '07:40' }, { name: 'Campus', time: '08:20' }] },
      { id: 'r3', name: 'Route 3 – Whitefield', bus: 'KA-53-F-1209', driver: 'Manjunath R', driverPhone: '9845011122', subscribers: [], stops: [{ name: 'ITPL', time: '06:40' }, { name: 'KR Puram', time: '07:05' }, { name: 'Hennur', time: '07:35' }, { name: 'Campus', time: '08:25' }] },
    ],
    feedback: [],
    bookings: [
      { id: 'b1', venue: 'Seminar Hall A', date: iso(4), slot: '14:00–16:00', purpose: 'Guest lecture', bookedBy: 'f1' },
    ],
    notifications: [
      { id: 'nt1', userId: 's1', text: 'New assignment posted in Web Technologies', link: '/assignments', createdAt: d(-1), read: false },
      { id: 'nt2', userId: 's1', text: 'Quiz "SQL Basics – Quiz 1" is now open', link: '/quizzes', createdAt: d(-1, 11), read: false },
      { id: 'nt3', userId: 's1', text: 'Your gate pass was approved', link: '/gate-pass', createdAt: d(-4, 12), read: true },
    ],
  }
  groupIntoSessions(seed)
  normalizeBeds(seed)
  return seed
}
