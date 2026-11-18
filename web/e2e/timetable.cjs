const { chromium } = require('playwright');
const B = 'http://localhost:4173/#'; const S = process.argv[2]
;(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }); p.setDefaultTimeout(6000)
  const errors = []; p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => { console.log('  dialog:', d.message().slice(0, 140)); d.accept() })
  await p.goto(`${B}/login`); await p.evaluate(() => localStorage.clear()); await p.reload()
  const as = async (id, path) => { await p.evaluate((i) => localStorage.setItem('campus-session-v1', i), id); await p.reload(); await p.waitForTimeout(250); await p.goto(`${B}${path}`); await p.waitForTimeout(400) }
  const db = () => p.evaluate(() => JSON.parse(localStorage.getItem('campus-db-v1')))
  // Timetable (Registrar of Evaluation)
  await as('a6', '/timetable'); await p.click('button.chip:has-text("List")'); await p.screenshot({ path: `${S}/reg/20-tt-list.png`, fullPage: true })
  await p.click('tr:has-text("BCA501") >> nth=0 >> [aria-label^="Edit"]'); await p.fill('.modal label:has-text("Room") input', 'LH-301'); await p.click('.modal-foot button:has-text("Save")')
  await p.click('button.chip:has-text("University courses")'); console.log('[tt] university periods:', await p.locator('tbody tr').count())
  await p.click('button:has-text("Add period")'); await p.selectOption('.modal label:has-text("Course") select', { label: /OEL303/ }).catch(async () => { const v = await p.locator('.modal label:has-text("Course") select option:has-text("OEL303")').getAttribute('value'); await p.selectOption('.modal label:has-text("Course") select', v) })
  await p.selectOption('.modal label:has-text("Day") select', '1'); await p.fill('.modal label:has-text("Start") input', '10:15'); await p.fill('.modal label:has-text("End") input', '11:15'); await p.fill('.modal label:has-text("Room") input', 'MB-102')
  console.log('  clash for BBA students (BBA501 Mon 10:15):', (await p.locator('.modal .alert').textContent()).slice(0, 140)); await p.screenshot({ path: `${S}/reg/21-tt-clash.png` }); await p.click('.modal-foot button:has-text("Cancel")')
  await p.click('button.chip:has-text("Week grid")'); await p.screenshot({ path: `${S}/reg/22-tt-university-grid.png`, fullPage: true })
  await as('s19', '/timetable'); console.log('[tt] BBA student sees OEL303:', await p.locator('text=OEL303').count() > 0)
  // Registration done -> semester tables
  await as('s1', '/registration'); console.log('[reg] s1 locked view: boxes', await p.locator('.reg-card').count(), '| semesters', await p.locator('.sem-head').count(), '| open', await p.locator('.sem-item.open').count())
  await p.screenshot({ path: `${S}/reg/23-sem-collapsed.png`, fullPage: true })
  await p.click('.sem-head:has-text("Semester 4")'); console.log('  Sem 4 rows:', await p.locator('.sem-item.open:has-text("Semester 4") tbody tr').count())
  await p.screenshot({ path: `${S}/reg/24-sem-expanded.png`, fullPage: true })
  await as('s5', '/registration'); console.log('[reg] s5 not started: boxes', await p.locator('.reg-card').count(), '| semesters', await p.locator('.sem-head').count())
  console.log('errors', errors); await b.close() })()
