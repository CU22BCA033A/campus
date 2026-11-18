// End-to-end tests: builds the app, serves it on :4173 and drives it in Chromium with Playwright.
// Usage: npm run e2e            (screenshots go to e2e/output/)
import { execSync, spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, 'output')
for (const d of ['', 'reg', 'flow', 'r11', 'lf', 'shots']) mkdirSync(join(out, d), { recursive: true })
const SUITES = ['crawl', 'result-publishing', 'course-registration', 'academic-consistency', 'office-access', 'operations', 'lostfound-venues', 'timetable']

execSync('npm run build', { cwd: join(here, '..'), stdio: 'inherit' })
const server = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], { cwd: join(here, '..'), stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 2500))
let failed = 0
for (const s of SUITES) {
  const t = Date.now()
  let log = ''
  try { log = execSync(`node ${join(here, `${s}.cjs`)} ${out}`, { encoding: 'utf8', timeout: 600_000 }) } catch (e) { log = `${e.stdout ?? ''}\n${e.message}` }
  const bad = /FAIL|ERRORS: (?!none)|errors \[\s*'|Error:/.test(log)
  if (bad) failed++
  console.log(`${bad ? '✗' : '✓'} ${s} (${((Date.now() - t) / 1000).toFixed(0)} s)`)
  if (bad) console.log(log.split('\n').filter((l) => /FAIL|ERRORS|errors|Error/.test(l)).join('\n'))
}
server.kill()
console.log(failed ? `${failed} suite(s) failed` : 'All end-to-end suites passed')
process.exit(failed ? 1 : 0)
