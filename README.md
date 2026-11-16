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
| Chief warden (all hostels) | `warden@campus.edu` | `warden123` |
| Boys hostel warden | `warden.boys@campus.edu` | `wardenboys123` |
| Girls hostel warden | `warden.girls@campus.edu` | `wardengirls123` |
| Human resources | `hr@campus.edu` | `hr123` |
| Registrar of Evaluation | `exams@campus.edu` | `exams123` |
| Admission Department | `admissions@campus.edu` | `admissions123` |
| Office of Student Affairs | `studentaffairs@campus.edu` | `studentaffairs123` |
| Library | `library@campus.edu` | `library123` |
| Placement cell | `placement@campus.edu` | `placement123` |
| Counsellor (Student Affairs) | `counsellor@campus.edu` | `counsellor123` |
| Estate & Facilities (venues, maintenance) | `facilities@campus.edu` | `facilities123` |
| Transport Department | `transport@campus.edu` | `transport123` |
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

## Assignment formats

An assignment is made of parts, and each part has its own answer format and marks:
written answer, link, file upload (teacher picks allowed formats: PDF, Word, slides,
spreadsheet, image, ZIP or any), MCQ with one correct option, and MCQ with multiple correct
options (full marks only for exactly the right set). MCQ parts are marked on submission; an
all-MCQ assignment is marked instantly. Older single-answer assignments keep working.
Logic lives in `web/src/assignments.ts`.

## One academic record per student

Every result, grade, SGPA, CGPA and backlog count is **derived** from the Registrar of
Evaluation's published result sheets (`web/src/academics.ts`); nothing is stored as a separate
copy, so the student, parent, teacher, office and placement pages always agree.

- Final = internal + external (as set up on each course's sheet) → grade and points; SGPA per
  semester; CGPA over every course's latest attempt (a cleared backlog replaces the failed one).
- Semesters completed before the portal are a **prior record** (CGPA, credits, backlogs) that
  only the Registrar of Evaluation edits; portal results are added to it.
- Results become visible to a class's students (and their parents) only when published;
  students of other classes never see them. Unpublished courses show "Not yet published".
- Marks flow in live: assignment, quiz and test marks feed the sheet's internal columns;
  exam marks feed the external column; any edit and republish updates every page.
- Profile changes (name, class, hostel…) are made once and appear everywhere, because pages
  look people up by ID rather than keeping copies.

## Exams made of subjects

The Registrar of Evaluation creates **one exam** for a class (e.g. *End Semester Examination
– Nov 2026*) and adds the class's subjects to it as papers, each with its own date, time,
maximum marks and evaluator ("Fill dates" spaces them out, skipping Sundays; overlapping
papers are flagged). The exam also sets the **internal / external maximum marks** for its
subjects' result sheets (general ratio **internal 60 + external 40**); each paper's own marks
are scaled to the external maximum. It also sets the **pass rules in marks**: the minimum
final mark to pass (default 40/100) and the minimum external exam marks (default 14/40). A
subject is passed only if both are met; otherwise the grade is F (AB if absent). Changing the
split or the rules later updates unpublished subjects only. Eligibility rules and grading are set once per exam and apply to every
subject. Subjects can be added, edited or removed later; seating and invigilators can be
generated for all subjects at once; students see their schedule grouped by exam and get one
hall ticket per exam. End-semester subjects get result sheets automatically; other exams
publish marks from the exam card. Supplementary papers created from backlog registration
join a single supplementary exam. Logic lives in `web/src/exams.ts`.

## Result sheets (internal + external)

Each course offering has a **result sheet**. The Registrar of Evaluation creates the
semester's exams for a class in one go and allots an evaluator (professor) per course, or
sets up sheets directly. On the sheet:

- **Internal**: tick the assignments, quizzes and tests that count; each becomes a column and
  together they make the internal mark (scaled to the internal maximum, or added and capped). Maxima come from the exam (default
  internal 60, external 40) and can be adjusted per course.
- **External**: the evaluator enters the end-semester exam marks, scaled to the external maximum.
- **Final** = internal + external → grade; pass needs the minimum external % and total %.
- Internal/external maxima, pass rules, the internals selection and any single cell can be
  edited (manual edits are highlighted and can be reset).
- Professors fill the sheet and **submit**; the office reviews, returns or **publishes** (per
  course or the whole class). Publishing records failed courses as **backlogs**.
- **Backlog registration** re-registers a student for a course's supplementary exam. The
  internal mark carries over, the course shows on their results as a *Backlog* attempt
  (whatever semester it came from), and passing it clears the backlog.

Logic lives in `web/src/results.ts`.

### Publishing a class result, step by step

1. **Registrar of Evaluation** (`exams@campus.edu` / `exams123`) → *Examinations*: create the exam for a class (papers, dates, internal/external split, pass rules) and allot evaluators.
2. **Professor** (e.g. `faculty@campus.edu` / `faculty123`) → *Result Sheets*: open the course sheet, tick the internals that count, enter external marks, **Submit to Registrar of Evaluation**.
3. **Registrar of Evaluation** → *Result Sheets* → pick the class: every course shows *Draft / Submitted / Published*. Open a sheet to review, *Return* it for corrections, or **Publish class results**.
4. Students and parents are notified. Each student's **Grades & transcript** gets the semester (internal, external, final, grade, points, SGPA, CGPA) with a printable **grade card**; failed courses become backlogs.
5. *Classes → Results & promotion* shows the **class result**: ranks, SGPA/CGPA, pass %, class average, toppers, grade distribution and course-wise analysis, with Print and CSV. Earlier semesters can be viewed too. When every course is published, **Promote** the class (detain if needed).

Marks are visible only to the Registrar of Evaluation and the professor until published.

In the demo: **BBA 2024** (Sem 5) is already published, **BCA 2025** (Sem 3) has marks submitted by professors and is waiting for you to publish, and **BCA 2024** (Sem 5) has its end-semester exams coming up.

## Course registration (Registrar of Evaluation)

*Academics → Course Registration* is where every course is created and registration is monitored.

- **Class courses**: pick the class and semester (current, or next semester ahead of promotion). Everyone in the class is registered automatically.
- **Foundation** and **Open elective** courses are **pan-university baskets**: pick the classes whose students may opt for them, the faculty, the credits and the **seats**. A course closes for students when it's full; the office can still register a student over capacity.
- **Registration window** (settings tab): the term running now, the term students are registering for, the last date, and how many courses each student must take from each basket. *Start term* switches the baskets of the new term live.
- **Monitoring**: the catalogue shows seats filled per course; *Student registrations* shows every student as Complete / Pending with filters, *Remind pending* and CSV; *Manage* registers or drops courses for a student.
- Students choose from their baskets on the same page and see their registration history.
- Each registration stores the student's semester, so foundation and elective results land in the right semester of the transcript, SGPA, class result (a *Foundation / elective* column) and exams. *Result Sheets → University courses* holds their sheets (one per course, students from many classes), and *Examinations → Create exam → University courses* sets their exam.

## Academic record

Open any student (*Classes*, *User Management*, *Course Registration*, search) → **Academic record**. The Registrar of Evaluation lands on it by default; other student-record offices and the class mentor can view it. It shows, semester by semester, every course registered (class course / foundation / open elective, faculty, credits, attendance, internal + external = final, grade, every attempt including supplementary, status), SGPA by semester, CGPA, credits earned, backlogs, any lateral-entry prior record and the full course registration history (including drops), with print. The office can manage the student's registration or register backlogs from there.

### Demo data

The demo data is one connected record, not sample numbers per page: every class has its earlier semesters as real courses, exams, marks and published result sheets (`web/src/data/seedHistory.ts`), so CGPA, SGPA, transcripts and backlogs (including backlogs cleared in a supplementary exam) are all derived. Every past course also has its attendance, and every term its foundation and open-elective courses with registrations. Fees follow each student's semester, hostel room and bus route; attendance is marked by each course's teacher. Run `npm run check:data` to verify every reference resolves and the modules agree.

## Hostels

Boys and girls hostels each have a block warden who manages only that hostel (rooms with
lettered beds A, B, C…, add room, bed-level allotment, waiting list, leave approvals, mess). The chief warden manages all hostels,
adds hostels and assigns wardens. The Admission department and Registrar set each student's
gender and **hostel / day scholar** status (also captured on the application form); hostel
students join the matching hostel's waiting list and that warden is notified. Day scholars
are never allotted rooms. Logic lives in `web/src/hostels.ts`.

## Timetable & attendance (Registrar of Evaluation)

The Registrar of Evaluation builds each class's weekly timetable: add, edit, move or delete
periods (click an empty cell to add one there), copy another class's pattern, and export to
calendar apps. Every period is checked for clashes (same class, same teacher in any class, same
room) before saving. Teachers and students are notified of changes; the Registrar office can
view every class's timetable read-only.

Attendance: an institution-wide report with a shortage threshold, shortage notices to students
and parents, and marking/correcting attendance for any course on the teacher's behalf (logged
in the audit trail; the teacher is notified).

## Hostel night attendance

Wardens take a nightly roll call for their hostel, listed in walking order (room number, then
bed A, B, C…): each resident is *In*, *Absent* or *On
leave* (approved hostel leave covering 10 PM is applied automatically), with remarks. Parents
of absentees are notified; the last 30 nights' absences are shown per student, and students
and parents see the roll-call record. Wardens can rename their hostel.

## Help Center services

Offices (and faculty, e.g. HOD office hours) publish bookable services with weekly slots:
counselling centre, Meet the Vice-Chancellor, Registrar, results help desk, fee counselling,
career counselling and more. Students, faculty and staff book a slot; the owning office confirms (with a room or
link), declines or completes it. Confidential services hide the student's name from
notifications and the audit log.

**Assigned people.** A service can have assigned handlers (e.g. the counsellor). Each booking goes to the
assigned person with the least upcoming load, with full slot details (date, time, duration, mode, location,
who booked and their phone); it can be reassigned. **Tickets** go to the person assigned to their category
(*Help Center → Requests & tickets → Assign handlers*, system administrator) and can be reassigned by whoever handles them.

## Venue booking (Estate & Facilities)

Venues (auditorium, seminar halls, labs, grounds) have a type, capacity, opening hours, amenities and a
**manager** chosen by Estate & Facilities. Anyone can see availability on a timeline and book a time range;
overlapping requests or bookings are refused. Venues that need approval send the request to their manager
(with all details); approval, rejection and cancellation notify the person who booked.

## Library department

Accession-numbered copies; issue from the circulation desk after finding the member by name, roll/register
number, email or ID (their books, history and dues show at once). Default loan 14 days (editable), renewals,
reservations queue, lost copies. Late returns are fined per day (rules editable); the fine is paid at the
library counter with a printable **receipt**, or **waived** with a reason (no longer added to student fees).
Students with an unpaid fine or overdue book are **blocked** from borrowing; faculty and staff get a **warning**.

## Transport Department

Routes with stops and pick-up times, bus, driver, seats, semester fee and evening departure. Students and
staff request a pass at a stop; the department approves it (students get the transport fee in Fees),
manages riders, and sends announcements to a route.

## Placement Cell

Company directory; drives with CTC, eligibility (CGPA, backlogs, programmes, batches), selection rounds
and dates; round-by-round pipeline (shortlist, schedule interviews, pass, reject, select with an offer);
students accept or decline offers; one-offer policy with a dream-offer threshold; dashboard with placed %,
highest/average/median CTC, offers by company and programme; student placement profiles (resume, skills); CSV.

## Hall tickets

Students no longer download hall tickets. The Registrar of Evaluation prints a class's tickets (one per
page) from *Examinations → Hall tickets*. Each ticket lists that student's own papers: class courses they are
still registered in (drops removed, office additions included), foundation / open-elective and backlog
(supplementary) papers in the same exam period, with papers they are not eligible for printed as withheld.

## Tests and assignments

Answer keys are set when creating: one correct, multiple correct, true/false and fill-in-the-blank (several
accepted answers; case and spacing ignored); marks show as soon as the student submits. **Proctored**
tests/assignments open in full screen; leaving the screen gives 2 warnings, the 3rd closes the attempt and
informs the faculty member, who can **allow a re-attempt**. **Make-up** tests/assignments go only to selected
students (absentees are pre-selected) and their marks count for the original in the result sheet.

## Manual edits

Every office can correct records by hand: edit / delete buttons on courses and registrations (any time,
any student, over capacity), events, notices, polls, clubs, posts, course materials, alumni, applications,
leave, purchase requests, assets, tickets, fee items (or a fee for a whole class), gate passes, services,
tests, assignments, classes, venues, routes, books, drives and companies. Every change is in the audit log.

## Filters on every list

Every list page has a row of filter dropdowns (built from the values actually in the data), a live result count and a **Clear filters** button, alongside the search box.

| List | Filters |
|---|---|
| Students (User management, classes, attendance, backlog registration, hostel waiting list, gate passes) | programme, batch/year, class, semester |
| Faculty & staff (User management, HR) | department, office |
| User management | also residence (hostel/day scholar), gender, status |
| Classes | programme, batch, semester, mentor |
| Courses / Feedback | class, semester, teacher, credits |
| Assignments, quizzes, exams, result sheets | course/class, status, format/kind |
| Admissions | programme, category, gender, residence |
| Library | subject, shelf, availability |
| Alumni | programme, batch, city, company |
| Placements | type, open/closed, eligibility (students) |
| Help Center tickets / appointment bookings | category, priority, status / service, status |
| Hostel | room type, occupancy; leave status |
| Events, polls, discussions | organiser, venue; open/closed, voted; course, author |
| HR, procurement, audit log | leave type, status; category, department, location; action, user, date |

Classes are shown as compact tiles with a distinct colour per class; the same colour marks the class chips on Results and Timetable.

## Modules

| Area | Student | Faculty | Admin |
|------|---------|---------|-------|
| Home dashboard | attendance %, pending work, open quizzes, fee due, today's classes | courses, students, submissions to grade, gate passes | users, inactive accounts, fee collection, events |
| Timetable | weekly grid + export to Outlook/Google (.ics) | ✓ | ✓ |
| Courses (LMS) | materials, schedule, discussion | + add materials, student list with attendance | all courses |
| Assignments | answer each part in its format (written, link, file upload in allowed formats, MCQ / multiple-correct), edit & resubmit until marked, per-part marks, correct MCQ answers shown after marking | build assignments from mixed parts; per-student list (submitted / late / not submitted / marked); view answers, open PDFs/images inline; MCQ auto-marked (overridable), mark the rest per part, Save & next | |
| Quizzes & tests | timed quiz, auto-submit, instant score | create MCQ quizzes, results, publish/hide scores | |
| Attendance | course-wise %, 75% rule, "classes you can miss", monthly calendar | mark by tapping students, edit, CSV report | |
| Grades | official transcript: published results by semester (internal + external = final, grade, points), SGPA, CGPA, credits, backlogs | gradebook mirroring the result sheet | |
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
