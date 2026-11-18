const { chromium } = require('playwright');
const B = 'http://localhost:4173/#'; const S = process.argv[2] + '/flow';
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }); p.setDefaultTimeout(6000)
  const errors = []; p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => { console.log('  dialog:', d.message().slice(0, 140)); d.accept() })
  await p.goto(`${B}/login`); await p.evaluate(() => localStorage.clear()); await p.reload()
  const as = async (id, path) => { await p.evaluate((i) => localStorage.setItem('campus-session-v1', i), id); await p.reload(); await p.waitForTimeout(250); await p.goto(`${B}${path}`); await p.waitForTimeout(400); };
  const shot = async (name, full = false) => { await p.screenshot({ path: `${S}/${name}.png`, fullPage: full }); console.log('shot', name) }
  // 1. Exams of the Registrar of Evaluation
  await as('a6', '/exams'); await shot('01-exams-roe')
  // 2. Professor's result sheet (internal + external = final)
  await as('f1', '/results'); await shot('02-professor-sheets')
  await p.click('tr:has-text("BCA301") >> button:has-text("Open sheet")'); await p.waitForTimeout(300); await shot('03-professor-sheet-bca301'); await p.click('[aria-label=Close]')
  // 3. Registrar of Evaluation: class results, sheets submitted
  await as('a6', '/results'); await p.click('.class-chip:has-text("BCA 2025")'); await p.waitForTimeout(200); await shot('04-roe-class-before-publish')
  await p.click('tr:has-text("BCA302") >> button:has-text("Open sheet")'); await p.waitForTimeout(300); await shot('05-roe-review-sheet'); await p.click('[aria-label=Close]')
  // Students do not see unpublished marks
  await as('s16', '/grades'); await shot('06-student-before-publish', true)
  // 4. Publish
  await as('a6', '/results'); await p.click('.class-chip:has-text("BCA 2025")'); await p.click('button:has-text("Publish class results")'); await p.waitForTimeout(300); await shot('07-roe-after-publish')
  // 5. Class result
  await p.click('a:has-text("View class result")'); await p.waitForTimeout(400); await shot('08-class-result', true)
  await p.emulateMedia({ media: 'print' }); await shot('09-class-result-print', true); await p.emulateMedia({ media: 'screen' })
  // 6. Students
  await as('s14', '/grades'); await shot('10-student-grades-topper', true)
  console.log('  notifications s14:', await p.evaluate(() => JSON.parse(localStorage.getItem('campus-db-v1')).notifications.filter(n => n.userId === 's14').map(n => n.text)))
  await as('s16', '/grades'); await shot('11-student-grades-backlog', true)
  await p.emulateMedia({ media: 'print' }); await shot('12-grade-card-print', true); await p.emulateMedia({ media: 'screen' })
  // 7. Promotion
  await as('a6', '/classes?class=cls-bca-2025-a&tab=results'); await p.click('button:has-text("Promote to Sem 4")'); await p.waitForTimeout(300); await shot('13-promote-modal')
  // other offices see no draft marks
  await as('a2', '/classes?class=cls-bca-2024-a&tab=results'); await shot('14-registrar-bca2024-in-progress', true)
  await as('a6', '/results'); await p.click('.tabs button:has-text("Backlog")'); await p.waitForTimeout(300); await shot('15-backlog-registration', true)
  console.log('errors', errors); await b.close()
})();
