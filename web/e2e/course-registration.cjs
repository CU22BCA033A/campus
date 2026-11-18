const { chromium } = require('playwright');
const B = 'http://localhost:4173/#'; const S = process.argv[2] + '/reg';
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }); p.setDefaultTimeout(6000)
  const errors = []; p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => { console.log('  dialog:', d.message().slice(0, 160)); d.accept() })
  await p.goto(`${B}/login`); await p.evaluate(() => localStorage.clear()); await p.reload()
  const as = async (id, path) => { await p.evaluate((i) => localStorage.setItem('campus-session-v1', i), id); await p.reload(); await p.waitForTimeout(250); await p.goto(`${B}${path}`); await p.waitForTimeout(400); };
  const shot = async (n, full = false) => { await p.screenshot({ path: `${S}/${n}.png`, fullPage: full }); console.log('shot', n) }
  const db = () => p.evaluate(() => JSON.parse(localStorage.getItem('campus-db-v1')))
  // 1. Catalogue
  await as('a6', '/registration'); await shot('01-catalogue', true)
  // 2. New open elective for two classes, 3 seats
  await p.click('button:has-text("New course")'); await p.click('.modal button.chip:has-text("Open elective")'); await p.waitForTimeout(150)
  await p.click('.modal button.class-chip:has-text("BCA 2024")'); await p.click('.modal button.class-chip:has-text("BBA 2024")')
  await p.fill('.modal label:has-text("Course code") input', 'OEL404'); await p.fill('.modal label:has-text("Course name") input', 'Public Speaking')
  await p.fill('.modal label:has-text("Seats") input', '3'); await p.selectOption('.modal label:has-text("Faculty") select', 'f3')
  await shot('02-new-course-modal'); await p.click('.modal-foot >> button:has-text("Create course")'); await p.waitForTimeout(200)
  let d = await db(); const nc = d.courses.find(c => c.code === 'OEL404'); console.log('[created]', nc.kind, nc.term, nc.classIds, nc.slots, nc.facultyId)
  // New class course for next semester
  await p.click('button:has-text("New course")'); await p.selectOption('.modal label:has-text("Class") select', 'cls-bba-2024-a'); await p.waitForTimeout(100)
  await p.selectOption('.modal label:has-text("Semester") select', '6'); await p.fill('.modal label:has-text("Course code") input', 'BBA603'); await p.fill('.modal label:has-text("Course name") input', 'Strategic Management'); await p.selectOption('.modal label:has-text("Faculty") select', 'f4')
  await p.click('.modal-foot >> button:has-text("Create course")'); await p.waitForTimeout(200)
  d = await db(); const core = d.courses.find(c => c.code === 'BBA603'); console.log('[core]', core.kind, core.classId, core.semester, core.studentIds.length)
  // 3. Students tab, pending, manage s3
  await p.click('.tabs button:has-text("Student registrations")'); await p.selectOption('select[aria-label="Filter by statuses"]', 'pending'); await shot('03-students-pending')
  await p.click('tr:has-text("Vihaan Iyer") >> button:has-text("Manage")'); await p.waitForTimeout(200)
  await p.click('.modal .reg-card:has-text("FND401") >> button:has-text("Register")'); await p.click('.modal .reg-card:has-text("OEL404") >> button:has-text("Register")'); await p.waitForTimeout(150)
  await shot('04-manage-student'); await p.click('[aria-label=Close]')
  d = await db(); console.log('[s3 regs]', d.registrations.filter(r => r.studentId === 's3' && r.term === 'Even 2026-27').map(r => r.courseId + ':' + r.semester + ':' + r.status))
  // 4. Student registers; seats run out
  await as('s5', '/registration'); console.log('[timer] before start:', (await p.locator('.alert-info').first().textContent()).slice(0, 80), '| timer shown', await p.locator('.reg-timer').count())
  await p.click('.reg-card:has-text("FND402") >> button:has-text("Register")'); console.log('  popup:', await p.locator('.modal h2').textContent(), '|', (await p.locator('.modal p').first().textContent()))
  await shot('05a-start-popup'); await p.click('.modal-foot button:has-text("Go back")')
  let dd = await db(); console.log('  after Go back: registered?', dd.courses.find((c) => c.code === 'FND402' && c.term === 'Even 2026-27').studentIds.includes('s5'), '| session', !!dd.registration.sessions?.s5)
  await p.click('.reg-card:has-text("FND402") >> button:has-text("Register")'); await p.click('.modal-foot button:has-text("OK")'); await p.waitForTimeout(1200)
  console.log('  timer:', (await p.locator('.reg-timer').innerText()).replace(/\n/g, ' '), '| FND401 register disabled (limit 1):', await p.locator('.reg-card:has-text("FND401") button').isDisabled())
  await p.click('.reg-card:has-text("OEL401") >> button:has-text("Register")'); await p.waitForTimeout(150); await shot('05-student-registered', true)
  console.log('  other buttons disabled after choosing:', await p.locator('.reg-card:has-text("OEL402") button').isDisabled())
  await p.click('.reg-card:has-text("OEL401") >> button:has-text("Drop")'); await p.waitForTimeout(100); await p.click('.reg-card:has-text("OEL404") >> button:has-text("Register")'); await p.waitForTimeout(100)
  await as('s7', '/registration'); await p.click('.reg-card:has-text("OEL404") >> button:has-text("Register")'); await p.click('.modal-foot button:has-text("OK")'); await p.waitForTimeout(150)
  await as('s8', '/registration'); console.log('  s8 sees OEL404:', (await p.locator('.reg-card:has-text("OEL404")').innerText()).replace(/\n/g, ' '), '| button disabled', await p.locator('.reg-card:has-text("OEL404") button').isDisabled())
  // Time runs out for s7 (started earlier), then the office resets it
  await as('s7', '/registration'); await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('campus-db-v1')); d.registration.sessions.s7.endsAt = Date.now() - 1000; localStorage.setItem('campus-db-v1', JSON.stringify(d)) }); await p.reload(); await p.waitForTimeout(300)
  console.log('[timer] s7 after time up:', (await p.locator('.alert-info').last().textContent()).slice(0, 90), '| register buttons:', await p.locator('.reg-card button').count())
  await as('a6', '/registration'); await p.click('.tabs button:has-text("Student registrations")'); await p.click('tr:has-text("Kabir Gupta") >> button:has-text("Manage")'); await p.click('.modal button:has-text("Reset timer")'); await p.click('[aria-label=Close]')
  await as('s7', '/registration'); console.log('  s7 after reset: info', (await p.locator('.alert-info').first().textContent()).slice(0, 60))
  // BCA 2025 must choose 2 foundation courses
  await as('s15', '/registration'); console.log('[limits] s15 foundation basket:', await p.locator('.card:has(h2:text("Foundation basket")) .badge').first().textContent(), '| open elective:', await p.locator('.card:has(h2:text("Open elective basket")) .badge').first().textContent())
  await as('a6', '/registration'); await p.click('.tabs button:has-text("Registration settings")'); await p.fill('input[aria-label="BCA 2024 · Sem 5 · Sec A Foundation limit"]', '2'); await p.fill('label:has-text("Time to register") input', '20'); await p.click('button:has-text("Save settings")'); await shot('05b-settings', true)
  dd = await db(); console.log('  saved limits:', JSON.stringify(dd.registration.basketLimits['cls-bca-2024-a']), 'time', dd.registration.timeLimitMin)
  // 5. Academic record
  await as('a6', '/people/s16'); await shot('06-academic-record-s16', true)
  await as('a6', '/people/s3'); await shot('07-academic-record-s3', true)
  await as('a6', '/people/s13'); await shot('08-academic-record-lateral', true)
  // 6. University courses results + class publish
  await as('a6', '/results'); await p.click('.tabs button:has-text("University courses")'); await shot('09-university-sheets')
  await p.click('.tabs button:has-text("Class results")'); await p.click('.class-chip:has-text("BCA 2025")'); await p.click('button:has-text("Publish class results")'); await p.waitForTimeout(300)
  d = await db(); console.log('[after publish] OEL302', d.resultSheets.find(s => s.courseId === 'pc-oel302').status, '| BCA301', d.resultSheets.find(s => s.id === 'rs-c6').status)
  await as('a6', '/classes?class=cls-bca-2025-a&tab=results'); await shot('10-class-result-with-electives', true)
  // 7. Exam creation for university courses
  await as('a6', '/exams'); await p.click('button:has-text("Create exam")'); await p.selectOption('.modal label:has-text("Class") select', 'pan'); await p.waitForTimeout(150); await shot('11-exam-university-courses')
  console.log('  papers:', (await p.locator('.modal tbody tr').allInnerTexts()).map(t => t.split('\n')[0]).join(' | ')); await p.click('[aria-label=Close]')
  // 8. Student transcript with university courses; faculty course list
  await as('s14', '/grades'); await shot('12-student-transcript', true)
  await as('f3', '/courses'); console.log('  f3 courses:', (await p.locator('.card h3').allInnerTexts()).join(' | '))
  // 9. Start the new term
  await as('a6', '/registration'); await p.click('.tabs button:has-text("Registration settings")'); await p.click('button:has-text("Start Even 2026-27")'); await p.waitForTimeout(200)
  d = await db(); console.log('[new term]', d.registration.currentTerm, 'open', d.registration.open)
  await as('s3', '/courses'); console.log('  s3 courses now:', (await p.locator('.card h3').allInnerTexts()).join(' | '))
  console.log('errors', errors); await b.close()
})();
