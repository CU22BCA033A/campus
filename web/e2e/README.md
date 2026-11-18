# End-to-end tests

Each suite logs in as real demo users (student, faculty, Registrar of Evaluation, offices) and uses the app in
headless Chromium with [Playwright](https://playwright.dev), checking data and taking screenshots.

| Suite | What it covers |
|---|---|
| `crawl` | Every menu page for 23 accounts: no runtime errors, empty pages or NaN / undefined text |
| `result-publishing` | Professor's sheet → Registrar of Evaluation reviews and publishes → class result, grade card, promotion |
| `course-registration` | Course creation, rosters, timed 15-minute registration, basket limits, reset, term start, university-course exams |
| `academic-consistency` | One student's CGPA is identical on six pages, before and after results and corrections |
| `office-access` | Each office's menu and permissions |
| `operations` | Venue clashes and approvals, counselling assignment, ticket routing, library blocks/fines/receipts, transport passes, placement pipeline, hall tickets, proctoring, make-up tests, manual edits |
| `lostfound-venues` | Lost & Found report → match → claim → verification → handover; venue free time ranges; course details |
| `timetable` | Timetable list editing, university-course periods, clash detection, semester-wise registration view |

## Run

```bash
npm i -D playwright && npx playwright install chromium   # once
npm run e2e
```

`run.mjs` builds the app, serves it on port 4173, runs every suite and prints ✓ / ✗ per suite.
Screenshots are written to `e2e/output/`.
