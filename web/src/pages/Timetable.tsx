import { useCurrentUser, useDB } from '../data/store'
import { PageHeader } from '../components/ui'
import { coursesFor, DAYS, userName } from '../lib'

export default function Timetable() {
  const db = useDB()
  const user = useCurrentUser()!
  const ids = new Set(coursesFor(db, user).map((c) => c.id))
  const slots = db.timetable.filter((t) => ids.has(t.courseId))
  const times = [...new Set(slots.map((s) => s.start))].sort()
  const today = new Date().getDay()

  const exportIcs = () => {
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Campus Portal//EN']
    const monday = new Date(); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
    for (const s of slots) {
      const day = new Date(monday); day.setDate(monday.getDate() + s.day - 1)
      const ymd = day.toISOString().slice(0, 10).replace(/-/g, '')
      const c = db.courses.find((x) => x.id === s.courseId)!
      lines.push('BEGIN:VEVENT', `UID:${s.id}@campus`, `DTSTART:${ymd}T${s.start.replace(':', '')}00`, `DTEND:${ymd}T${s.end.replace(':', '')}00`, 'RRULE:FREQ=WEEKLY;COUNT=16', `SUMMARY:${c.code} ${c.name}`, `LOCATION:${s.room}`, 'END:VEVENT')
    }
    lines.push('END:VCALENDAR')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar' }))
    a.download = 'timetable.ics'
    a.click()
  }

  return (
    <>
      <PageHeader title="Timetable" subtitle="Weekly class schedule" actions={<button className="btn btn-outline" onClick={exportIcs}>Add to Outlook / Google Calendar</button>} />
      <div className="table-wrap">
        <div className="tt">
          <div className="tt-head" />
          {[1, 2, 3, 4, 5, 6].map((d) => <div key={d} className={`tt-head ${d === today ? 'today' : ''}`}>{DAYS[d]}</div>)}
          {times.map((t) => (
            <div key={t} style={{ display: 'contents' }}>
              <div className="tt-time">{t}</div>
              {[1, 2, 3, 4, 5, 6].map((d) => {
                const s = slots.find((x) => x.day === d && x.start === t)
                const c = s && db.courses.find((x) => x.id === s.courseId)
                return (
                  <div key={d} className="tt-cell">
                    {s && c && (
                      <div className="tt-slot">
                        <strong>{c.code}</strong>
                        <div className="ellipsis">{c.name}</div>
                        <div className="muted">{s.start}–{s.end} · {s.room}</div>
                        {user.role === 'student' && <div className="muted ellipsis">{userName(db, c.facultyId)}</div>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
