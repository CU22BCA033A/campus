const { chromium } = require('playwright');
const B = 'http://localhost:4173/#'; const S = process.argv[2]
;(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }); p.setDefaultTimeout(6000)
  const errors = []; p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => { console.log('  dialog:', d.message().slice(0, 120)); d.accept() })
  await p.goto(`${B}/login`); await p.evaluate(() => localStorage.clear()); await p.reload()
  const as = async (id, path) => { await p.evaluate((i) => localStorage.setItem('campus-session-v1', i), id); await p.reload(); await p.waitForTimeout(250); await p.goto(`${B}${path}`); await p.waitForTimeout(400) }
  const db = () => p.evaluate(() => JSON.parse(localStorage.getItem('campus-db-v1')))
  const step = async (n, fn) => { try { await fn() } catch (e) { console.log('FAIL', n, e.message.split('\n')[0]); errors.push(n); await p.screenshot({ path: `${S}/lf/fail-${n}.png` }) } }
  await step('venue', async () => {
    await as('f1', '/venues'); const date = new Date(Date.now() + 6 * 864e5).toISOString().slice(0, 10)
    await p.fill('input[aria-label="Date"]', date); await p.waitForTimeout(200)
    console.log('[venue] auditorium free text:', await p.locator('.venue-row:has-text("Main Auditorium") + .venue-free, .venue-row:has-text("Main Auditorium") .venue-free').first().textContent())
    await p.locator('.venue-row:has-text("Main Auditorium") button:has-text("Book")').click(); await p.waitForTimeout(150)
    console.log('  prefilled', await p.inputValue('.modal label:has-text("From") input'), '→', await p.inputValue('.modal label:has-text("Till") input'), '| chips', await p.locator('.modal .free-chip').allInnerTexts())
    await p.screenshot({ path: `${S}/lf/01-venue-free.png` }); await p.click('.modal-foot button:has-text("Cancel")')
  })
  await step('catalogue', async () => {
    await as('a6', '/registration'); console.log('[catalogue] headers:', (await p.locator('thead th').allInnerTexts()).join('|'))
    await p.click('tr:has-text("FND401") .link-btn'); console.log('  details:', (await p.locator('.modal tbody').innerText()).replace(/\s+/g, ' ').slice(0, 160)); await p.screenshot({ path: `${S}/lf/02-course-details.png` }); await p.click('[aria-label=Close]')
  })
  await step('lostfound', async () => {
    // Student loses a bag
    await as('s4', '/lost-found'); await p.click('button:has-text("I lost something")')
    await p.fill('.modal label:has-text("What is it?") input', 'Blue backpack with laptop sleeve'); await p.selectOption('.modal label:has-text("Category") select', 'Bag'); await p.fill('.modal label:has-text("Colour") input', 'Blue')
    await p.fill('.modal label:has-text("Where did you") input', 'Seminar Hall A'); await p.fill('.modal textarea', 'Wildcraft backpack, keychain shaped like a star, notebook with my name inside.')
    await p.click('.modal-foot button:has-text("Report lost item")'); await p.waitForTimeout(200); await p.click('[aria-label=Close]')
    // Faculty finds it and hands it in
    await as('f2', '/lost-found'); await p.click('button:has-text("I found something")')
    await p.fill('.modal label:has-text("What is it?") input', 'Blue Wildcraft backpack'); await p.selectOption('.modal label:has-text("Category") select', 'Bag'); await p.fill('.modal label:has-text("Colour") input', 'Blue')
    await p.fill('.modal label:has-text("Where did you") input', 'Seminar Hall A, last row'); await p.fill('.modal textarea', 'Backpack with a laptop sleeve, left after the guest lecture.')
    await p.setInputFiles('.modal input[type=file]', require("path").join(__dirname, "item.png")); await p.waitForTimeout(300)
    await p.check('.modal label:has-text("handed it in") input'); console.log('[lf] preview suggestion:', (await p.locator('.modal .alert-info').textContent().catch(() => 'none')).slice(0, 100))
    await p.click('.modal-foot button:has-text("Report found item")'); await p.waitForTimeout(200); await p.click('[aria-label=Close]')
    let d = await db(); const bag = d.lostFound.find((x) => x.title === 'Blue Wildcraft backpack'); console.log('  found item tag:', bag.tagNo, '| photo', !!bag.photo, '| owner told:', d.notifications.filter((n) => n.userId === 's4').map((n) => n.text).find((t) => t.includes('backpack')))
    // Owner claims
    await as('s4', '/lost-found'); await p.screenshot({ path: `${S}/lf/03-found-board.png`, fullPage: true })
    await p.click('.lf-card:has-text("Blue Wildcraft backpack") button:has-text("This is mine")'); await p.fill('.modal textarea', 'There is a star-shaped keychain and my notebook with “Ananya” inside.'); await p.click('.modal-foot button:has-text("Send claim")')
    await p.click('.tabs button:has-text("My reports")'); await p.screenshot({ path: `${S}/lf/04-my-reports.png`, fullPage: true })
    // Desk verifies and hands over
    await as('a14', '/lost-found'); console.log('[lf] desk claims:', await p.locator('.lf-proof').count()); await p.screenshot({ path: `${S}/lf/05-desk-claims.png`, fullPage: true })
    await p.locator('.card:has-text("Blue Wildcraft backpack") button:has-text("Approve")').click(); await p.waitForTimeout(150)
    await p.click('.tabs button:has-text("All records")'); await p.click('tr:has-text("Blue Wildcraft backpack") .link-btn'); await p.click('.modal-foot button:has-text("Hand over")')
    await p.fill('.modal input[placeholder^="University ID"]', 'ID card 22BCA004 checked'); await p.click('.modal button:has-text("Confirm handover")'); await p.waitForTimeout(150)
    await p.screenshot({ path: `${S}/lf/06-handover-receipt.png` }); await p.click('[aria-label=Close]')
    d = await db(); const lost = d.lostFound.find((x) => x.title === 'Blue backpack with laptop sleeve'); const f = d.lostFound.find((x) => x.title === 'Blue Wildcraft backpack')
    console.log('  status found/lost:', f.status, lost.status, '| finder thanked:', d.notifications.some((n) => n.userId === 'f2' && n.text.includes('returned to its owner')))
    // Phone match (seeded): desk links, past-hold warning
    await p.click('tr:has-text("Redmi phone with blue cover") .link-btn'); console.log('[lf] phone suggestions:', await p.locator('.modal .list-item').count(), (await p.locator('.modal .list-item .badge').first().textContent()))
    await p.click('.modal .list-item button:has-text("Link")'); await p.click('[aria-label=Close]')
    console.log('  hold warning:', (await p.locator('.alert-warning').first().textContent()).slice(0, 80))
  })
  console.log('errors', errors); await b.close() })()
