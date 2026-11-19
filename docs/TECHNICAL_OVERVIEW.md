# Campus Portal: technical overview

A single-university ERP and learning portal (in the style of DigiiCampus) covering academics, examinations,
course registration, administration offices and campus services. Built with **Claude Code** (an AI coding
agent) working as the developer under my direction: I specified the features and reviewed the results; the
agent wrote the code, the demo data and the automated tests, and verified every change in a real browser.

## 1. Stack

| Layer | Choice | Why |
|---|---|---|
| Language | **TypeScript 7** (strict mode) | Static types for ~70 domain types; the compiler catches wrong fields, nulls and unused code |
| UI library | **React 19** (function components + hooks) | Component model, large ecosystem |
| Build tool | **Vite 8** (Rolldown bundler) | Fast dev server with hot reload; optimised production build |
| Routing | **React Router 6** (`HashRouter`) | 40+ pages, works on any static host |
| Icons / QR | lucide-react, qrcode | Consistent icon set; QR codes for meal coupons |
| Styling | Plain CSS with design tokens (CSS variables), no UI framework | Full control of the look; brand colours in one file (`theme.css`) |
| Lint | **oxlint** | Very fast linter, React rules |
| Tests | **Playwright** (headless Chromium) end-to-end suites + a data-integrity script | Tests drive the real app as each kind of user |
| Runtime | Node.js 22 (build only); the app itself is static HTML/JS | |

## 2. Architecture

```
web/src
├── main.tsx, App.tsx        entry point and route table
├── access.ts                role- and office-based access control (menus, routes, capabilities)
├── data/
│   ├── types.ts             the data model (≈70 interfaces: User, ClassGroup, Course, ResultSheet, …)
│   ├── store.ts             state store: load / migrate / update / subscribe (+ localStorage persistence)
│   ├── seed.ts, seedErp.ts, seedHistory.ts   realistic, fully connected demo data
├── academics.ts, results.ts, exams.ts, classes.ts, registration.ts,
│   assess.ts, assignments.ts, hostels.ts, library.ts, lostfound.ts, lib.ts
│                            pure business logic (no UI): CGPA/SGPA, result sheets, eligibility,
│                            promotion, registration rules, auto-marking, fines, matching…
├── components/              reusable UI: Layout (shell, menu, search, notifications), ui.tsx (Card, Modal,
│                            Badge, Stat, Tabs, Field…), Filters, RecordEditor, Proctor, HallTickets,
│                            AcademicRecord, ClassChip, StudentAttendanceEditor, EditUser
└── pages/                   33 feature pages (Classes, Results, Registration, Library, Placements, …)
web/scripts/check-data.ts    data-integrity check (npm run check:data)
web/e2e/                     end-to-end browser test suites (npm run e2e)
```

**Layers.** Pages render UI and call *pure functions* in the logic modules; the logic never touches the UI.
For example `results.ts` computes a result sheet row (internal + external = final → grade → pass), and every
page that shows marks (student transcript, class result, academic record, parent view, placement
eligibility) calls the same function, so numbers always agree.

**Single source of truth.** Nothing derived is stored: CGPA, SGPA, backlogs, attendance %, seat counts,
library fines, eligibility and timetable clashes are computed from the underlying records whenever they are
shown. Changing one mark updates every page instantly.

**State management.** A small custom store (`data/store.ts`) holds the whole database as one typed object.
Components subscribe with React's `useSyncExternalStore`; changes go through `update(draft => …)`, which
works on a `structuredClone` of the data (immutable updates), then runs integrity hooks (group exam papers
into sessions, normalise hostel beds) and notifies subscribers. The data is persisted to `localStorage`
with a schema **version and migrations**, so the demo keeps working across releases.

**Access control.** `access.ts` defines a *persona* for each user (student, faculty, parent, or one of 12
administrative offices such as Registrar of Evaluation, Finance, Library, Transport). Three tables decide
everything: which **routes** a persona may open, which **menu** items it sees, and fine-grained
**capabilities** (`can(user, 'manageResults')`). Pages also check ownership (a teacher marks only their
courses, a warden manages only their hostel).

**Audit and notifications.** Every significant action writes an audit-log entry (who, what, when) and sends
in-app notifications to the people affected (e.g. a venue manager gets each booking request; a teacher gets
a malpractice alert from a proctored test).

## 3. Main concepts and algorithms (examples to discuss)

- **Result computation**: internal marks from chosen assignments / quizzes / tests (scaled or capped), external
  exam scaled to the external maximum, pass rules (minimum total and minimum external), grade points,
  credit-weighted SGPA/CGPA, backlogs updated on publish, supplementary attempts.
- **Course registration**: class (core) courses vs pan-university baskets (foundation / open elective),
  per-class basket limits, seat limits, min/max credits, a timed 15-minute session per student, office
  overrides; registrations record the student's semester so results land in the right place.
- **Timetable clash detection**: teacher, room, class and shared-students overlap checks.
- **Venue booking**: interval overlap detection and computing free time ranges in a day.
- **Proctoring**: Page Visibility API, window blur and Fullscreen API events → 2 warnings, then auto-submit
  and teacher alert; copy/paste blocked.
- **Auto-marking**: single/multiple-correct MCQ, true/false, fill-in-the-blank with several accepted answers
  (normalised), make-up tests whose marks are scaled into the original assessment.
- **Lost & Found matching**: a 0–100 score from category, shared keywords, colour, place and dates; owners
  of similar lost reports are notified automatically.
- **Hall tickets**: per-student paper lists (drops, additions, electives, backlog papers, eligibility) printed
  one per page with print CSS.
- **Placement**: eligibility rules, round-by-round pipeline, offers, one-offer policy, statistics.
- **Library**: accession numbers, loans, overdue fines, receipts, waivers, borrowing blocks.

## 4. Quality

- **TypeScript strict mode** + `noUnusedLocals/Parameters`; the build fails on any type error.
- **oxlint** with React rules.
- **Data-integrity check** (`npm run check:data`): every reference resolves (users, courses, exams…),
  course rosters match registrations, nobody is over seats, no teacher/room/student double-booking in the
  timetable, fees match semesters, hostellers have hostel fees, etc.
- **End-to-end tests** (`npm run e2e`, Playwright): 8 suites that log in as different users and use the app
  like a person would, for example:
  - *crawl*: opens every menu page for 23 accounts (~350 page loads) and fails on any runtime error, empty
    page or broken text (NaN / undefined);
  - *result-publishing*: professor submits marks → Registrar of Evaluation publishes → students see grades;
  - *academic-consistency*: the same student's CGPA must match on 6 pages before and after changes;
  - *course-registration*, *operations*, *lostfound-venues*, *timetable*, *office-access*.
- Responsive layout checked at phone width (390 px) for horizontal overflow; print stylesheets for grade
  cards, transcripts, hall tickets and receipts.

## 5. What it is today, and the path to production

Today the portal is a **complete front-end application with realistic demo data**: every workflow works in
the browser, and data is stored in the browser (`localStorage`), so it runs on any static host with no server.

To run it for a real university, the next step is a back end. The code is structured for this: all data
access goes through `store.ts` (`useDB`, `update`, `getDB`) and the business rules are pure TypeScript
functions, so they can move to (or be shared with) a server.

- **API server**: Node.js (NestJS or Express) in TypeScript, reusing the logic modules, or Django / Spring.
- **Database**: PostgreSQL; the 70 interfaces in `types.ts` map directly to tables; the integrity rules
  become constraints and transactions.
- **Authentication**: SSO (Microsoft / Google) or OAuth2 / OpenID Connect, hashed passwords, sessions/JWT;
  the demo's login is for demonstration only. Access rules in `access.ts` must also be enforced on the server.
- **Files** (assignment uploads, photos) in object storage (S3-compatible); **email/SMS/push** for
  notifications; **payment gateway** integration for fees (the UI flow exists).
- **Deployment**: static front end on a CDN, API in containers, CI running lint, type-check, data check and
  the Playwright suites on every change.
- Performance: pages are already code-split (`React.lazy`, one chunk per page, ~140 kB app entry); next is
  server-side pagination for large lists.

## 6. How it was built (AI-assisted development)

- Tool: **Claude Code** (Anthropic's coding agent) in a cloud workspace with Git, Node and a headless browser.
- Process: I described requirements in plain language (often as a university staff member would); the agent
  planned the data model and screens, implemented them, generated connected demo data, ran the type-checker,
  linter, data check and browser tests, looked at screenshots, fixed what it found, and committed to Git
  with descriptive messages after each feature.
- The agent also reverse-engineered the general feature set and flows of an existing campus ERP from public
  information and a captured session to decide what to build (no code was copied).
- Every change is in the Git history; the README lists features, demo accounts and how to run everything.

## 7. Run it

```bash
cd web
npm install
npm run dev          # development server with hot reload
npm run build        # type-check + production build into dist/
npm run lint         # oxlint
npm run check:data   # demo-data integrity
npm run e2e          # end-to-end browser suites (needs Playwright + Chromium)
```

Demo logins are in the main README (student, faculty, admin and one account per office).
