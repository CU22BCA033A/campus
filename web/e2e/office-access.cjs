const { chromium } = require('playwright');
const B = 'http://localhost:4173/#'; const S = process.argv[2];
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1366, height: 900 } });
  const errors = []; p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept());
  await p.goto(`${B}/login`); await p.evaluate(() => localStorage.clear()); await p.reload();
  const as = async (id, path) => { await p.evaluate((i) => localStorage.setItem('campus-session-v1', i), id); await p.reload(); await p.waitForTimeout(250); await p.goto(`${B}${path}`); await p.waitForTimeout(150); };
  const db = () => p.evaluate(() => JSON.parse(localStorage.getItem('campus-db-v1')));
  const pr = async () => (await db()).purchaseRequests.find(x => x.id === 'pr1').status;
  const card = () => p.locator('section.card', { hasText: 'Dell OptiPlex' });

  // Procurement: Finance -> Registrar -> Finance PO/receive
  await as('a3', '/procurement'); await card().locator('button:has-text("Approve")').click();
  console.log('finance approved ->', await pr());
  console.log('finance can approve registrar level?', await card().locator('button:has-text("Approve")').count() > 0);
  await as('a2', '/procurement'); await card().locator('button:has-text("Approve")').click();
  console.log('registrar approved ->', await pr(), '| registrar sees Issue PO?', await card().locator('text=Issue purchase order').count() > 0);
  await as('a3', '/procurement'); await card().locator('text=Issue purchase order').click(); await card().locator('text=Mark consignment received').click();
  console.log('finance PO+receive ->', await pr(), 'assets:', (await db()).assets.filter(a => a.purchaseRequestId === 'pr1').length);

  // HR: approvals tab only for HR; payroll for finance
  await as('a3', '/hr'); console.log('finance HR tabs:', (await p.locator('[role=tab]').allTextContents()).join(' / '));
  await as('a5', '/hr'); console.log('hr HR tabs:', (await p.locator('[role=tab]').allTextContents()).join(' / '));
  await p.click('tr:has-text("Prof. Sanjay Hegde") >> button:has-text("Approve")');
  await as('a7', '/hr'); console.log('librarian HR tabs:', (await p.locator('[role=tab]').allTextContents()).join(' / '), '| menu label:', await p.locator('.nav a[href="#/hr"]').textContent());
  await as('a3', '/hr'); await p.click('role=tab[name=/Payroll/]'); await p.click('text=Run payroll');
  console.log('payroll by finance ->', (await db()).payrollRuns[0]?.payslips.length, 'payslips');

  // Hostel: parent then warden; warden notified
  await as('pa1', '/home'); await p.click('button:has-text("Approve") >> nth=0');
  let d = await db(); console.log('warden notified:', d.notifications.some(n => n.userId === 'a4' && n.text.includes('awaits warden')), '| finance notified:', d.notifications.some(n => n.userId === 'a3' && n.text.includes('awaits warden')));
  await as('a4', '/hostel'); await p.click('role=tab[name=/Leave approvals/]'); await p.click('tr:has-text("weekend") >> button:has-text("Approve")');
  d = await db(); console.log('warden approved ->', d.hostelLeaves[0].wardenStatus, 'gate pass:', d.gatePasses.some(g => g.reason.startsWith('Hostel leave')));

  // Help Center routing: student raises Maintenance -> warden sees it, finance does not
  await as('s1', '/help'); await p.click('text=Requests & tickets'); await p.click('button:has-text("Raise a request")'); await p.selectOption('.modal select >> nth=0', 'Maintenance'); await p.fill('.modal input.input', 'Leaking tap in A-101'); await p.click('.modal >> text=Submit');
  await as('a4', '/help'); await p.click('text=Requests & tickets'); const w = await p.locator('tbody tr').allTextContents();
  await as('a3', '/help'); await p.click('text=Requests & tickets'); const f = await p.locator('tbody tr').allTextContents();
  console.log('warden tickets:', w.filter(t => t.includes('Leaking')).length, '| finance tickets:', f.filter(t => t.includes('Leaking')).length);

  // Exams office: seating + attendance report
  await as('a6', '/exams'); await p.click('section.card:has-text("End Semester"):has-text("BCA 2024") >> button:has-text("Seating for all subjects")');
  console.log('exam seating ->', (await db()).exams.find(e => e.id === 'ex3').seating.length, 'seats');
  await as('a6', '/attendance'); console.log('exam attendance page:', await p.locator('h1').first().textContent(), '| mark buttons:', await p.locator('text=Save attendance').count());
  await p.screenshot({ path: `${S}/shots/exam-attendance.png` });

  // Registrar user mgmt scope / HR scope
  await as('a2', '/admin/users'); console.log('registrar user filters:', (await p.locator('.chip').allTextContents()).join(','));
  await as('a5', '/admin/users'); console.log('hr user filters:', (await p.locator('.chip').allTextContents()).join(','), '| rows', await p.locator('tbody tr').count());
  await as('a3', '/home'); await p.screenshot({ path: `${S}/shots/home-finance.png` });
  await as('a4', '/home'); await p.screenshot({ path: `${S}/shots/home-warden.png` });
  await as('a2', '/home'); await p.screenshot({ path: `${S}/shots/home-registrar.png` });
  await b.close(); console.log('ERRORS:', errors.join('\n') || 'none');
})();
