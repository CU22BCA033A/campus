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
| Admin | `admin@campus.edu` | `admin123` |
| Parent (two wards) | `parent@campus.edu` | `parent123` |
| First login (forced password change) | `new@campus.edu` | `welcome123` |
| Deactivated account | `kavya.das@campus.edu` | `student123` |

Five wrong passwords lock an account for 15 minutes. An admin can unlock it from **User management**.
All data is stored in the browser (localStorage). Use **avatar menu → Reset demo data** to start over.

## Modules

| Area | Student | Faculty | Admin |
|------|---------|---------|-------|
| Home dashboard | attendance %, pending work, open quizzes, fee due, today's classes | courses, students, submissions to grade, gate passes | users, inactive accounts, fee collection, events |
| Timetable | weekly grid + export to Outlook/Google (.ics) | ✓ | ✓ |
| Courses (LMS) | materials, schedule, discussion | + add materials, student list with attendance | all courses |
| Assignments | submit (text/file), late flag, marks & feedback | create, grade, feedback | |
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
