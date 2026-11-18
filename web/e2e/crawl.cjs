// Visit every page each account may open; report runtime errors, broken text and empty pages.
const { chromium } = require('playwright');
const B = 'http://localhost:4173/#'
const ROUTES = ['/home','/notices','/events','/help','/profile','/timetable','/courses','/classes','/people','/assignments','/quizzes','/attendance','/exams','/results','/grades','/feedback','/library','/feed','/clubs','/polls','/placements','/alumni','/fees','/hostel','/gate-pass','/transport','/venues','/hr','/procurement','/admissions','/admin/users','/admin/reports','/admin/audit','/parent','/registration','/venues','/transport','/library','/placements','/lost-found']
const ACCOUNTS = ['a13','a14','a15','a1','a2','a3','a4','a5','a6','a7','a8','a9','a10','a11','a12','f1','f2','f4','s1','s7','s14','s21','pa1']
;(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1300, height: 900 } }); p.setDefaultTimeout(5000)
  let errors = []; p.on('pageerror', e => errors.push(e.message)); p.on('console', m => m.type() === 'error' && !/fonts|net::/.test(m.text()) && errors.push(m.text()))
  await p.goto(`${B}/login`); await p.evaluate(() => localStorage.clear()); await p.reload()
  let n = 0
  for (const id of ACCOUNTS) {
    await p.evaluate(i => localStorage.setItem('campus-session-v1', i), id); await p.reload(); await p.waitForTimeout(200)
    const links = await p.$$eval('nav a, .sidebar a', as => as.map(a => a.getAttribute('href')).filter(Boolean))
    const routes = [...new Set(links.map(h => h.replace(/^#/, '')).filter(h => h.startsWith('/')))]
    for (const r of routes) {
      errors = []; await p.goto(`${B}${r}`); await p.waitForTimeout(220); n++
      const txt = await p.locator('.content, main').first().innerText().catch(() => '')
      const probs = []
      if (/\bNaN\b|undefined|Invalid Date|\[object Object\]|Infinity/.test(txt)) probs.push('bad text: ' + (txt.match(/.{0,40}(NaN|undefined|Invalid Date|\[object Object\]|Infinity).{0,30}/) || [''])[0].replace(/\n/g, ' '))
      if (txt.trim().length < 40) probs.push('almost empty')
      if (/not allowed|no access|don't have access/i.test(txt)) probs.push('access denied page')
      if (errors.length) probs.push('errors: ' + errors.slice(0, 2).join(' | ').slice(0, 200))
      if (probs.length) console.log(`${id} ${r}: ${probs.join(' ; ')}`)
    }
  }
  console.log('visited', n); await b.close()
})()
