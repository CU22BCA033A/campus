# Campus Portal

A single-university campus platform (LMS + ERP + campus life), modelled on the
feature set of Digii Campus. The branding, code and content are original.

Like the original, modules are chained into gated workflows rather than standing alone:

- **Admissions:** enquiry → application → document verification → merit list → offer letter (scholarship auto-matched) → fee → auto-generated student ID, fee plan and course enrolment
- **Examinations:** eligibility gate (attendance, fees, internal marks) → hall ticket → seating plan + invigilators → marks → absolute/relative grading → results → re-evaluation
- **Procurement:** purchase request → approvals by amount (HOD → Finance → Registrar) → purchase order → consignment received → assets auto-created in the register
- **Hostel leave:** student request → parent approval → warden approval → gate pass issued
- **HR:** staff leave → manager approval → loss-of-pay synced into payroll
- **No-dues certificate:** a Help Center ticket checks accounts, library and hostel clearance automatically

## Run it

```bash
cd web
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in web/dist
```

### Demo accounts

| Role | Email | Password |
|------|-------|----------|
| Student | `student@campus.edu` | `student123` |
| Faculty | `faculty@campus.edu` | `faculty123` |
| System administrator (everything) | `admin@campus.edu` | `admin123` |
| Registrar office | `registrar@campus.edu` | `registrar123` |
| Finance & accounts | `finance@campus.edu` | `finance123` |
| Hostel warden | `warden@campus.edu` | `warden123` |
| Human resources | `hr@campus.edu` | `hr123` |
| Registrar of Evaluation | `exams@campus.edu` | `exams123` |
| Admission Department | `admissions@campus.edu` | `admissions123` |
| Office of Student Affairs | `studentaffairs@campus.edu` | `studentaffairs123` |
| Library | `library@campus.edu` | `library123` |
| Placement cell | `placement@campus.edu` | `placement123` |
| Parent (two wards) | `parent@campus.edu` | `parent123` |
| First login (forced password change) | `new@campus.edu` | `welcome123` |
| Deactivated account | `kavya.das@campus.edu` | `student123` |

Five wrong passwords lock an account for 15 minutes. An admin can unlock it from **User management**.
All data is stored in the browser (localStorage). Use **avatar menu → Reset demo data** to start over.

## Who sees what

Menus, page access and in-page actions depend on the user's role and, for administrative
staff, their **office**. All of it is defined in one place: `web/src/access.ts`
(`ROUTE_ACCESS` for pages, `CAPS` for actions such as approving or running payroll).

| Office | Sees | Can act on |
|--------|------|-----------|
| Registrar | Admissions, student & parent records, classes (view), courses, timetable, feedback, venues, reports | edit student profiles, admissions, Registrar-level purchase approvals, certificates, VC/Registrar appointments |
| Admission Department | Admissions, student profiles, classes (view) | admissions pipeline, create & edit student profiles |
| Registrar of Evaluation | Classes & promotion, courses, examinations, attendance report, gradebook, timetable | create classes, create courses per class & assign teachers, exams, seating, marks, publish results, promote/detain/graduate, edit student profiles (incl. CGPA/backlogs) |
| Office of Student Affairs | Clubs, events, polls, discussions | create/edit/archive clubs and memberships, counselling appointments, student grievances |
| Finance | Fee collection, procurement & assets, payroll, reports | refunds, scholarships, Finance-level approvals, purchase orders, receiving, assets, payroll run |
| Hostel warden | Hostel & mess, gate passes | room allocation, leave approvals (after parent), mess counter, maintenance tickets |
| HR | Leave & payroll, staff records | staff leave approvals, payroll run, staff accounts |
| Library | Library | issue desk, returns & fines, catalogue |
| Placement cell | Placements, alumni | drives, shortlists, interviews, alumni records |
| System administrator | everything + audit log | everything |

Every office also has Home (its own "needs your action" queue), notices, events, the Help
Center (tickets are routed to the office that handles each category) and its own leave and
payslips. Notifications go to the responsible office, not to every admin.

## Classes, courses and promotion

Students belong to a **class** (programme + batch + section, currently in semester *n*). The
Registrar of Evaluation creates each class's courses for the semester and assigns a teacher;
the course roster follows the class automatically, so the teacher gets those students for
attendance, assignments, quizzes and marks. When every course's end-semester result is
published, **Promote** moves the class to the next semester: failed courses become backlogs,
CGPA is updated, ticked students are detained in a repeat section, and a final-semester class
graduates into the alumni network. Logic lives in `web/src/classes.ts`.

## Help Center services

Offices (and faculty, e.g. HOD office hours) publish bookable services with weekly slots:
counselling centre, Meet the Vice-Chancellor, Registrar, results help desk, fee counselling,
career counselling and more. Students book a slot; the owning office confirms (with a room or
link), declines or completes it. Confidential services hide the student's name from
notifications and the audit log.

## Modules

| Area | Student | Faculty | Admin |
|------|---------|---------|-------|
| Home dashboard | attendance %, pending work, open quizzes, fee due, today's classes | courses, students, submissions to grade, gate passes | users, inactive accounts, fee collection, events |
| Timetable | weekly grid + export to Outlook/Google (.ics) | ✓ | ✓ |
| Courses (LMS) | materials, schedule, discussion | + add materials, student list with attendance | all courses |
| Assignments | submit text/link/file, resubmit until marked, view own submission, marks & feedback | create; per-student list (submitted / late / not submitted / marked); view answer & attachment; mark with feedback, Save & next | |
| Quizzes & tests | timed quiz, auto-submit, instant score | create MCQ quizzes, results, publish/hide scores | |
| Attendance | course-wise %, 75% rule, "classes you can miss", monthly calendar | mark by tapping students, edit, CSV report | |
| Grades | internal marks, grade, projected SGPA | gradebook | |
| Faculty feedback | anonymous star rating + comment | view ratings | |
| Discussions | campus feed + course threads, replies | ✓ | ✓ |
| Notice board | category filters, pinned | post / pin / delete, audience targeting | ✓ |
| Events | RSVP, capacity | create events | ✓ |
| Clubs & chapters | join / leave | | |
| Polls & surveys | vote, live results | create polls | ✓ |
| Fees & payments | pay in full or 2 instalments, choose gateway (charge shown), receipts, refund requests | | dues, reminders (also to parents), scholarship plans & grants, refund approval |
| Admissions | public application form (`#/apply`) | | pipeline by stage, document verification, merit list, offer letters, bulk CSV import, admit → student ID |
| Examinations | eligibility with reasons, hall ticket, seat, grade sheet, SGPA, re-evaluation | enter marks for own courses | schedule, seating & invigilators, publish results, relative grading with small-class fallback, re-evaluation review |
| Parent portal | | | parent: switch between wards, attendance, results, pay fees, approve hostel leave |
| Hostel & mess | room, leave requests, QR meal coupons | | rooms, manual/auto allocation, warden approvals, mess counter (redeem coupons) |
| HR & payroll | | leave balances, apply, payslips | leave approvals, payroll run (HRA/DA, PF, ESI, PT, TDS new regime, LOP), bank CSV |
| Procurement & assets | | raise requests, HOD approval | approval chain, PO, receive → assets, allot/return/maintenance, warranty-expiry filter |
| Help Center | tickets with SLA, anonymous grievances, bonafide/no-dues certificates | ✓ | assign, resolve, SLA breaches, printable certificates |
| Placements | eligible drives (CGPA/backlogs), apply, status, interview slot | | drives, shortlist, schedule interviews, select |
| Library | OPAC search, availability, reserve, renew, e-books, fines | ✓ | issue desk (roll no./barcode), returns with fines → fees, reservations queue |
| Alumni | directory, request mentorship | ✓ | add alumni, record donations |
| Gate pass | request, digital pass | approve / reject | approve / reject |
| Transport | routes, stops, timings, register | ✓ | ✓ |
| Venue booking | | book halls/labs by slot | ✓ |
| User management | | | add users, activate/deactivate, unlock, reset password, "view as" |
| Reports | | | attendance shortage, course averages, fee collection, CSV export |
| Audit log | | | every sensitive action (logins, approvals, payments, grades…), filter, CSV export |

Notifications (bell icon) are created by every action, such as a new assignment, a grade, an approved gate pass, an absence, or a notice.

## Theme / brand colours

Every colour comes from `web/src/theme.css`. The current maroon + gold palette is a
**placeholder**: the university website could not be reached from the build environment.
To match it, replace the hex values in that one file.

## Reverse-engineering notes (from a HAR capture of the original portal)

- SPA at `/V2/#/home` (hash routing; this app does the same), with the build served from a CDN.
- Microsoft SSO through MSAL Browser (auth code + PKCE) against the university's Azure AD tenant,
  scopes `openid profile User.Read Calendars.ReadWrite offline_access`. The frontend then
  calls `GET /rest/auth/loginResponse?provider=azure_ad&token=…`.
- The login response carries `message` (e.g. `DEACTIVATED`), `remainingLogins`, `lockedAtTime`,
  `credentialsMismatchCount`, `mfaEnabled`, `forceResetToken`, `firstLogin` and `featureFlags`.
  The login flow here reproduces those states (`web/src/data/store.ts` → `login()`).
- Requests carry `device-id`, `device-type`, `platform`, `os` and `browser` headers.
- Everything after login is still unknown: the captured account was deactivated.

## Project structure

```
web/src
├── theme.css            brand colour tokens
├── index.css            all styles
├── data/
│   ├── types.ts         data model
│   ├── seed.ts          demo data
│   └── store.ts         localStorage store + auth (login, lockout, first login)
├── components/          Layout (sidebar, top bar, search, notifications), UI kit
└── pages/               one file per module
```

## Beyond the original (gaps from the feature research, now filled)

Library/OPAC, alumni network, statutory payroll (PF/ESI/PT/TDS), refund workflow, named and
selectable payment gateways, interview scheduling for placements, and an audit trail. None of
these is documented in the original's public materials.

## Roadmap

- Backend API (`/rest/...`) with a real database, to replace the localStorage store
- Microsoft SSO with `@azure/msal-browser`, plus Outlook calendar sync
- Live payment-gateway keys; SMS/email/WhatsApp delivery for notifications
- File storage for uploads; Turnitin originality check
- Native general ledger (instead of Tally/Zoho sync), document management with e-signature, GPS bus tracking
- Mobile app (PWA)
