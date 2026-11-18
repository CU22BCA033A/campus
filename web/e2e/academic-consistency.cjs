const { chromium } = require('playwright');
const B = 'http://localhost:4173/#'; const S = process.argv[2];
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = []; p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => { console.log('  dialog:', d.message().replace(/\n/g, ' ').slice(0, 120)); d.accept() });
  p.on('console', m => m.type() === 'error' && !/fonts\.g|net::/.test(m.text()) && errors.push('console: ' + m.text()));
  await p.goto(`${B}/login`); await p.evaluate(() => localStorage.clear()); await p.reload();
  const as = async (id, path) => { await p.evaluate((i) => localStorage.setItem('campus-session-v1', i), id); await p.reload(); await p.waitForTimeout(250); await p.goto(`${B}${path}`); await p.waitForTimeout(250); };
  const stat = async (label) => (await p.locator(`.stat:has(.stat-label:text-is("${label}")) .stat-value`).first().textContent().catch(() => '?')).trim();
  /** CGPA for Aarav as shown on every page that displays it. */
  const everywhere = async (tag) => {
    const out = {}
    await as('s1', '/grades'); out.grades = await stat('CGPA')
    await as('s1', '/exams'); out.exams = await stat('CGPA')
    await as('s1', '/placements'); out.placements = await stat('My CGPA')
    await as('pa1', '/home'); out.parent = await stat('CGPA')
    await as('a6', '/classes'); out.classes = (await p.locator('tbody tr:has-text("Aarav") td >> nth=3').textContent()).trim()
    await as('a6', '/people/s1'); await p.click('.tabs button:has-text("Profile")'); out.people = (await p.locator('tr:has-text("CGPA") td >> nth=1').textContent()).split(' ')[0]
    console.log(`[${tag}] Aarav CGPA ->`, JSON.stringify(out), Object.values(out).every((v) => v === out.grades) ? 'ALL MATCH' : 'MISMATCH')
  }

  await everywhere('before any Sem 5 result')
  await as('s1', '/grades'); console.log('  transcript:', (await p.locator('section.card .card-head h2').allTextContents()).join(' | '), '| unpublished rows', await p.locator('.list-item:has-text("Not yet published")').count());

  // Teacher marks an assignment → flows into the sheet's internal (not visible to student until published)
  await as('f1', '/assignments'); 
  // Registrar of Evaluation fills externals of BCA501 and publishes
  await as('a6', '/results'); await p.click('tr:has-text("BCA501") >> text=Open sheet');
  const ext = p.locator('.modal input[aria-label$=" external"]'); const n = await ext.count();
  for (let i = 0; i < n; i++) if (await ext.nth(i).isEnabled()) await ext.nth(i).fill(String(i === 0 ? 81 : 60 + (i * 7) % 35));
  const sheetRow = (await p.locator('.modal tbody tr:has-text("Aarav")').textContent()).replace(/\s+/g, ' ');
  await as('s1', '/grades'); console.log('  before publish, student sees Sem 5 card:', await p.locator('section.card:has-text("Semester 5") table').count());
  await as('a6', '/results'); await p.click('tr:has-text("BCA501") >> text=Open sheet'); await p.click('.modal-foot >> button:has-text("Publish")');
  console.log('  sheet row (office):', sheetRow.slice(0, 80));
  await as('s1', '/grades'); console.log('  student transcript row:', (await p.locator('tbody tr:has-text("BCA501")').textContent()).replace(/\s+/g, ' '));
  await p.screenshot({ path: `${S}/shots/transcript.png` });
  await everywhere('after BCA501 published')
  // Other class cannot see it
  await as('s14', '/grades'); console.log('[BCA 2025 student] sees BCA501?', await p.locator('td:has-text("BCA501")').count());
  await as('s14', '/exams'); await p.click('role=tab[name=/Results/]'); console.log('  exams results rows:', await p.locator('tbody tr:has-text("BCA501")').count());

  // Office edits a mark after publishing and republishes → student sees the change
  await as('a6', '/results'); await p.click('tr:has-text("BCA501") >> text=Open sheet');
  await p.locator('.modal input[aria-label="Aarav Sharma internal"]').fill('40'); await p.click('.modal-foot >> button:has-text("Republish")');
  await as('s1', '/grades'); console.log('[edit] student row now:', (await p.locator('tbody tr:has-text("BCA501")').textContent()).replace(/\s+/g, ' '));
  // Registrar of Evaluation corrects the prior record → CGPA changes everywhere
  await as('a6', '/admin/users'); await p.fill('input[type=search]', 'Aarav'); await p.waitForTimeout(150); await p.click('tr:has-text("Aarav") >> button:has-text("Edit")');
  await p.fill('.modal input[aria-label="Prior cgpa"]', '9.0'); await p.click('.modal-foot >> text=Save changes');
  await everywhere('after prior record correction')
  // Rename propagates everywhere
  await as('a2', '/admin/users'); await p.fill('input[type=search]', 'Aarav'); await p.waitForTimeout(150); await p.click('tr:has-text("Aarav") >> button:has-text("Edit")');
  await p.locator('.modal label:has-text("Full name") input').fill('Aarav S. Sharma'); await p.click('.modal-foot >> text=Save changes');
  const seen = {}
  await as('a6', '/results'); await p.click('tr:has-text("BCA501") >> text=Open sheet'); seen.sheet = await p.locator('.modal td:has-text("Aarav S. Sharma")').count()
  await as('a11', '/hostel'); await p.click('role=tab[name=/Night attendance/]'); seen.rollcall = await p.locator('td:has-text("Aarav S. Sharma")').count()
  await as('f1', '/attendance'); seen.attendance = await p.locator('text=Aarav S. Sharma').count()
  await as('pa1', '/home'); seen.parent = await p.locator('text=Aarav S. Sharma').count()
  await as('a3', '/fees'); await p.fill('input[type=search]', 'Aarav'); await p.waitForTimeout(150); seen.fees = await p.locator('td:has-text("Aarav S. Sharma")').count()
  console.log('[rename] new name shown in:', JSON.stringify(seen))
  // Placement eligibility follows the derived CGPA
  await as('s1', '/placements'); console.log('[placements] Microsoft (8.5) eligible:', await p.locator('section.card:has-text("Microsoft") button:has-text("Apply")').count(), '| note:', (await p.locator('section.card:has-text("Microsoft") .small').last().textContent()).slice(0, 60));
  await b.close(); console.log('ERRORS:', errors.join('\n') || 'none');
})().catch(e => { console.error('FAIL', e.message.split('\n')[0]); process.exit(1) });
