# Campus Portal

A single-university campus platform (LMS + ERP + campus life), modelled on the
feature set of Digii Campus. The branding, code and content are original.

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
| Fees & payments | pay (UPI / card / net banking, simulated), receipts | | outstanding dues, reminders |
| Gate pass | request, digital pass | approve / reject | approve / reject |
| Transport | routes, stops, timings, register | ✓ | ✓ |
| Venue booking | | book halls/labs by slot | ✓ |
| User management | | | add users, activate/deactivate, unlock, reset password, "view as" |
| Reports | | | attendance shortage, course averages, fee collection, CSV export |

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

## Roadmap

- Backend API (`/rest/...`) with a real database, to replace the localStorage store
- Microsoft SSO with `@azure/msal-browser`, plus Outlook calendar sync
- Real payment gateway (Razorpay / PayU)
- File uploads (assignments, materials), originality check
- Admissions, examinations / hall tickets, placements, library, hostel
- Mobile app (PWA)
