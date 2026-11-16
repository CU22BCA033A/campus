import { useCallback, useEffect, useRef, useState } from 'react'
import { ShieldAlert } from 'lucide-react'

export const MAX_VIOLATIONS = 3

/** Ask for full screen (needs a click); silently ignored where the browser refuses. */
export const enterFullscreen = () => { try { void document.documentElement.requestFullscreen?.().catch(() => {}) } catch { /* not supported */ } }
const exitFullscreen = () => { try { if (document.fullscreenElement) void document.exitFullscreen().catch(() => {}) } catch { /* ignore */ } }

/**
 * Proctoring for a test or assignment: switching tab, leaving the window or exiting full screen is a violation.
 * Violations 1 and 2 show a warning; the 3rd calls onTerminate (the attempt is closed and the teacher told).
 * Copy, paste and the context menu are blocked while active. `pause(ms)` ignores events, e.g. while a file picker is open.
 */
export function useProctor(enabled: boolean, onTerminate: (violations: number, reason: string) => void) {
  const [violations, setViolations] = useState(0)
  const [warning, setWarning] = useState<string | null>(null)
  const count = useRef(0)
  const active = useRef(false)
  const pausedUntil = useRef(0)
  const last = useRef(0)
  const terminate = useRef(onTerminate)
  useEffect(() => { terminate.current = onTerminate }, [onTerminate])

  const hit = useCallback((reason: string) => {
    if (!active.current) return
    const now = Date.now()
    if (now < pausedUntil.current || now - last.current < 1500) return // one action often fires several events
    last.current = now
    count.current += 1
    setViolations(count.current)
    if (count.current >= MAX_VIOLATIONS) { active.current = false; setWarning(null); exitFullscreen(); terminate.current(count.current, reason) }
    else setWarning(`You ${reason}. Warning ${count.current} of ${MAX_VIOLATIONS - 1}: ${count.current === MAX_VIOLATIONS - 1 ? 'one more time and this attempt closes automatically and your teacher is informed.' : 'stay on this screen until you submit.'}`)
  }, [])

  useEffect(() => {
    if (!enabled) return
    active.current = true
    const onVis = () => { if (document.hidden) hit('switched to another tab or app') }
    const onBlur = () => hit('left the test window')
    const onFs = () => { if (!document.fullscreenElement && document.fullscreenEnabled) hit('exited full screen') }
    const block = (e: Event) => { if (active.current) e.preventDefault() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('blur', onBlur)
    document.addEventListener('fullscreenchange', onFs)
    for (const ev of ['copy', 'cut', 'paste', 'contextmenu']) document.addEventListener(ev, block)
    return () => {
      active.current = false
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('fullscreenchange', onFs)
      for (const ev of ['copy', 'cut', 'paste', 'contextmenu']) document.removeEventListener(ev, block)
      exitFullscreen()
    }
  }, [enabled, hit])

  return {
    violations,
    warning,
    pause: (ms: number) => { pausedUntil.current = Date.now() + ms },
    stop: () => { active.current = false; exitFullscreen() },
    banner: enabled && (
      <div className="proctor-bar"><ShieldAlert size={14} /> Proctored: stay in full screen. Leaving the screen: {violations}/{MAX_VIOLATIONS - 1} warnings used.<span className="grow" /><button className="btn btn-ghost btn-sm" onClick={enterFullscreen}>Full screen</button></div>
    ),
    overlay: warning && (
      <div className="proctor-overlay" role="alertdialog" aria-label="Proctoring warning">
        <div className="proctor-card">
          <ShieldAlert size={36} />
          <h2>Warning {violations} of {MAX_VIOLATIONS - 1}</h2>
          <p>{warning}</p>
          <button className="btn" onClick={() => { setWarning(null); enterFullscreen() }}>Return to the test</button>
        </div>
      </div>
    ),
  }
}

/** Intro shown before a proctored attempt; the click starts full screen. */
export function ProctorIntro({ title, onBegin, onCancel }: { title: string; onBegin: () => void; onCancel: () => void }) {
  return (
    <div className="card stack" style={{ maxWidth: 560, margin: '40px auto' }}>
      <h2 className="row gap"><ShieldAlert size={20} /> {title}: proctored</h2>
      <ul className="small" style={{ paddingLeft: 18, lineHeight: 1.7 }}>
        <li>The test opens in full screen. Stay on this screen until you submit.</li>
        <li>Switching tab or window, or leaving full screen, counts as a violation. You get <strong>2 warnings</strong>.</li>
        <li>On the <strong>3rd</strong>, the attempt closes automatically with the answers so far, and your teacher is informed.</li>
        <li>Copy, paste and right-click are disabled.</li>
      </ul>
      <div className="row gap"><button className="btn" onClick={() => { enterFullscreen(); onBegin() }}>Begin</button><button className="btn btn-ghost" onClick={onCancel}>Not now</button></div>
    </div>
  )
}
