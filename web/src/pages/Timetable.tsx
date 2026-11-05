import { useState } from 'react'
import { AlertTriangle, Copy, Plus, Trash2 } from 'lucide-react'
import { audit, notify, uid, update, useCurrentUser, useDB } from '../data/store'
import { Badge, Card, Empty, Field, Modal, PageHeader } from '../components/ui'
import { can } from '../access'
import { classCourses, classLabel, classStudents } from '../classes'
import { coursesFor, DAYS, matches, userName } from '../lib'
import type { DB, TimetableSlot } from '../data/types'

const WEEK = [1, 2, 3, 4, 5, 6]
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
const overlaps = (a: TimetableSlot, b: Pick<TimetableSlot, 'day' | 'start' | 'end'>) => a.day === b.day && toMin(a.start) < toMin(b.end) && toMin(b.start) < toMin(a.end)

/** Clashes for a proposed slot: same class, same teacher or same room at an overlapping time. */
export function slotConflicts(db: DB, draft: Omit<TimetableSlot, 'id'> & { id?: string }) {
  const course = db.courses.find((c) => c.id === draft.courseId)
  const out: string[] = []
  for (const s of db.timetable) {
    if (s.id === draft.id || !overlaps(s, draft)) continue
    const other = db.courses.find((c) => c.id === s.courseId)
    if (!other) continue
    const otherCls = db.classes.find((c) => c.id === other.classId)
    // Only clash with slots that are live (the course's class is currently in that semester).
    if (otherCls && other.semester !== otherCls.semester) continue
    const when = `${DAYS[s.day]} ${s.start}–${s.end}`
    if (course?.classId && other.classId === course.classId) out.push(`Class already has ${other.code} on ${when}`)
    if (course && other.facultyId === course.facultyId) out.push(`${userName(db, course.facultyId)} teaches ${other.code} (${classLabel(otherCls)}) on ${when}`)
    if (s.room.trim().toLowerCase() === draft.room.trim().toLowerCase()) out.push(`Room ${s.room} is used by ${other.code} on ${when}`)
  }
  return [...new Set(out)]
}

function exportIcs(db: DB, slots: TimetableSlot[]) {
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

function Grid({ slots, onSlot, onEmpty, showTeacher }: { slots: TimetableSlot[]; onSlot?: (s: TimetableSlot) => void; onEmpty?: (day: number, start: string) => void; showTeacher: boolean }) {
  const db = useDB()
  const times = [...new Set(slots.map((s) => s.start))].sort()
  const today = new Date().getDay()
  if (!slots.length) return <Card><Empty text="No classes scheduled." /></Card>
  return (
    <div className="table-wrap">
      <div className="tt">
        <div className="tt-head" />
        {WEEK.map((d) => <div key={d} className={`tt-head ${d === today ? 'today' : ''}`}>{DAYS[d]}</div>)}
        {times.map((t) => (
          <div key={t} style={{ display: 'contents' }}>
            <div className="tt-time">{t}</div>
            {WEEK.map((d) => {
              const here = slots.filter((x) => x.day === d && x.start === t)
              return (
                <div key={d} className="tt-cell" onClick={() => !here.length && onEmpty?.(d, t)} style={{ cursor: onEmpty && !here.length ? 'copy' : undefined }}>
                  {here.map((s) => { const c = db.courses.find((x) => x.id === s.courseId); return c && (
                    <div key={s.id} className="tt-slot" role={onSlot ? 'button' : undefined} tabIndex={onSlot ? 0 : undefined} onClick={(e) => { e.stopPropagation(); onSlot?.(s) }} style={{ cursor: onSlot ? 'pointer' : undefined, marginBottom: 4 }}>
                      <strong>{c.code}</strong>
                      <div className="ellipsis">{c.name}</div>
                      <div className="muted">{s.start}–{s.end} · {s.room}</div>
                      {showTeacher && <div className="muted ellipsis">{userName(db, c.facultyId)}</div>}
                    </div>
                  ) })}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Timetable() {
  const db = useDB()
  const user = useCurrentUser()!
  const manage = can(user, 'manageTimetable')
  const viewAll = manage || can(user, 'viewAllCourses')
  if (!viewAll) {
    const ids = new Set(coursesFor(db, user).map((c) => c.id))
    const slots = db.timetable.filter((t) => ids.has(t.courseId))
    return (
      <>
        <PageHeader title="Timetable" subtitle="Weekly class schedule" actions={<button className="btn btn-outline" onClick={() => exportIcs(db, slots)}>Add to Outlook / Google Calendar</button>} />
        <Grid slots={slots} showTeacher={user.role === 'student'} />
      </>
    )
  }
  return <TimetableManager manage={manage} />
}

function TimetableManager({ manage }: { manage: boolean }) {
  const db = useDB()
  const user = useCurrentUser()!
  const [classId, setClassId] = useState(db.classes[0]?.id ?? '')
  const [q, setQ] = useState('')
  const [draft, setDraft] = useState<(Omit<TimetableSlot, 'id'> & { id?: string }) | null>(null)
  const [copyFrom, setCopyFrom] = useState(false)
  const cls = db.classes.find((c) => c.id === classId)
  const courses = cls ? classCourses(db, cls) : []
  const slots = db.timetable.filter((s) => courses.some((c) => c.id === s.courseId))
  const shown = slots.filter((s) => { const c = db.courses.find((x) => x.id === s.courseId)!; return matches(q, c.code, c.name, s.room, userName(db, c.facultyId), DAYS[s.day]) })
  const hours = slots.reduce((t, s) => t + (toMin(s.end) - toMin(s.start)) / 60, 0)
  const conflicts = draft ? slotConflicts(db, draft) : []

  const openNew = (day = 1, start = '09:00') => setDraft({ courseId: courses[0]?.id ?? '', day, start, end: `${String(Math.min(23, Number(start.slice(0, 2)) + 1)).padStart(2, '0')}:${start.slice(3)}`, room: '' })
  const save = () => {
    if (!draft || !cls) return
    if (!draft.courseId || !draft.room.trim()) return alert('Choose a course and a room.')
    if (toMin(draft.end) <= toMin(draft.start)) return alert('End time must be after the start time.')
    if (conflicts.length && !confirm(`This slot clashes:\n• ${conflicts.join('\n• ')}\n\nSave anyway?`)) return
    const isNew = !draft.id
    update((d) => { if (draft.id) Object.assign(d.timetable.find((x) => x.id === draft.id)!, draft); else d.timetable.push({ ...draft, id: uid('t') }) })
    const c = db.courses.find((x) => x.id === draft.courseId)!
    notify([c.facultyId, ...classStudents(db, cls.id).map((s) => s.id)], `Timetable ${isNew ? 'updated' : 'changed'}: ${c.code} on ${DAYS[draft.day]} ${draft.start}–${draft.end}, ${draft.room}`, '/timetable')
    audit(user.id, isNew ? 'TIMETABLE_ADD' : 'TIMETABLE_EDIT', `${classLabel(cls)}: ${c.code} ${DAYS[draft.day]} ${draft.start}–${draft.end} ${draft.room}`)
    setDraft(null)
  }
  const remove = () => {
    if (!draft?.id || !cls) return
    const c = db.courses.find((x) => x.id === draft.courseId)!
    update((d) => { d.timetable = d.timetable.filter((x) => x.id !== draft.id) })
    audit(user.id, 'TIMETABLE_DELETE', `${classLabel(cls)}: ${c.code} ${DAYS[draft.day]} ${draft.start}`)
    setDraft(null)
  }
  /** Copy the weekly pattern of another class onto this one, matching courses by position. */
  const copyPattern = (fromId: string) => {
    const from = db.classes.find((c) => c.id === fromId)!
    const fromCourses = classCourses(db, from)
    const src = db.timetable.filter((s) => fromCourses.some((c) => c.id === s.courseId))
    if (!src.length || !courses.length) return alert('Nothing to copy.')
    update((d) => {
      for (const s of src) {
        const idx = fromCourses.findIndex((c) => c.id === s.courseId) % courses.length
        d.timetable.push({ id: uid('t'), courseId: courses[idx].id, day: s.day, start: s.start, end: s.end, room: s.room })
      }
    })
    audit(user.id, 'TIMETABLE_COPY', `${classLabel(from)} → ${classLabel(cls)} (${src.length} slots; check room clashes)`)
    setCopyFrom(false)
  }
  // Clashes already in this class's week.
  const existingClashes = slots.flatMap((s) => slotConflicts(db, s).map((m) => `${db.courses.find((c) => c.id === s.courseId)?.code} ${DAYS[s.day]} ${s.start}: ${m}`))

  return (
    <>
      <PageHeader title="Timetable" subtitle={manage ? 'Build each class\'s weekly timetable. Clashes for class, teacher and room are checked.' : 'Weekly timetable of every class'}
        search={{ value: q, onChange: setQ, placeholder: 'Search course, teacher, room or day…' }}
        actions={<>
          <button className="btn btn-outline" disabled={!slots.length} onClick={() => exportIcs(db, slots)}>Export .ics</button>
          {manage && <button className="btn btn-outline" onClick={() => setCopyFrom(true)} disabled={!courses.length}><Copy size={14} /> Copy pattern</button>}
          {manage && <button className="btn" disabled={!courses.length} onClick={() => openNew()}><Plus size={14} /> Add period</button>}
        </>} />
      <div className="row gap wrap">{db.classes.map((c) => <button key={c.id} className={`chip ${c.id === classId ? 'active' : ''}`} onClick={() => setClassId(c.id)}>{classLabel(c)}</button>)}</div>
      {cls && (
        <>
          <div className="row gap wrap small">
            <Badge tone="brand">{slots.length} periods / week</Badge><Badge tone="info">{hours.toFixed(1)} teaching hours</Badge>
            {courses.map((c) => { const n = slots.filter((s) => s.courseId === c.id).length; return <Badge key={c.id} tone={n ? 'neutral' : 'warning'}>{c.code}: {n}</Badge> })}
          </div>
          {existingClashes.length > 0 && <div className="alert alert-warning"><AlertTriangle size={16} /> <span>{existingClashes.slice(0, 4).join(' · ')}{existingClashes.length > 4 ? ` · +${existingClashes.length - 4} more` : ''}</span></div>}
          {courses.length === 0 ? <Card><Empty text="This class has no courses this semester. Create them under Classes & Promotion." /></Card> : <Grid slots={shown} showTeacher onSlot={manage ? (s) => setDraft({ ...s }) : undefined} onEmpty={manage ? (d, t) => openNew(d, t) : undefined} />}
          {manage && slots.length > 0 && <div className="small muted">Click a period to edit or delete it. Click an empty cell to add a period there.</div>}
        </>
      )}
      {draft && cls && (
        <Modal title={draft.id ? 'Edit period' : `Add period · ${classLabel(cls)}`} onClose={() => setDraft(null)} footer={<>
          {draft.id && <button className="btn btn-ghost" onClick={remove}><Trash2 size={14} /> Delete</button>}
          <div className="grow" />
          <button className="btn btn-ghost" onClick={() => setDraft(null)}>Cancel</button>
          <button className="btn" onClick={save}>Save</button>
        </>}>
          <Field label="Course"><select className="select" value={draft.courseId} onChange={(e) => setDraft({ ...draft, courseId: e.target.value })}>{courses.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name} ({userName(db, c.facultyId)})</option>)}</select></Field>
          <div className="grid grid-2">
            <Field label="Day"><select className="select" value={draft.day} onChange={(e) => setDraft({ ...draft, day: Number(e.target.value) })}>{WEEK.map((d) => <option key={d} value={d}>{DAYS[d]}</option>)}</select></Field>
            <Field label="Room / lab"><input className="input" value={draft.room} placeholder="LH-201" onChange={(e) => setDraft({ ...draft, room: e.target.value })} /></Field>
            <Field label="Start"><input className="input" type="time" value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} /></Field>
            <Field label="End"><input className="input" type="time" value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} /></Field>
          </div>
          {conflicts.length > 0
            ? <div className="alert alert-danger" role="alert"><AlertTriangle size={16} /> <span>{conflicts.join(' · ')}</span></div>
            : draft.room.trim() && <div className="alert alert-success small">No clashes for this class, teacher or room.</div>}
        </Modal>
      )}
      {copyFrom && cls && (
        <Modal title={`Copy a weekly pattern onto ${classLabel(cls)}`} onClose={() => setCopyFrom(false)}>
          <p className="small muted">Copies days, times and rooms from another class. Courses are matched in order, so review rooms afterwards; clashes are flagged.</p>
          {db.classes.filter((c) => c.id !== cls.id).map((c) => <div key={c.id} className="row between"><span>{classLabel(c)} <span className="muted small">{db.timetable.filter((s) => classCourses(db, c).some((x) => x.id === s.courseId)).length} periods</span></span><button className="btn btn-outline btn-sm" onClick={() => copyPattern(c.id)}>Copy</button></div>)}
        </Modal>
      )}
    </>
  )
}
