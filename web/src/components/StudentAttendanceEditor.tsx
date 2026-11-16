import { useState } from 'react'
import { audit, notify, update, useCurrentUser, useDB } from '../data/store'
import { Badge, Empty, Modal } from './ui'
import { can } from '../access'
import { attendanceStats, fmtDate, isCurrentCourse } from '../lib'

/**
 * One student's attendance, course by course and class by class. The Registrar of Evaluation (any course) and
 * the course's teacher can correct entries; every change is audited and the student is told.
 */
export default function StudentAttendanceEditor({ studentId, onClose }: { studentId: string; onClose: () => void }) {
  const db = useDB()
  const me = useCurrentUser()!
  const s = db.users.find((u) => u.id === studentId)!
  const [all, setAll] = useState(false)
  const courses = db.courses.filter((c) => c.studentIds.includes(studentId) && (all || isCurrentCourse(db, c)))
  const [courseId, setCourseId] = useState(courses[0]?.id ?? '')
  const c = db.courses.find((x) => x.id === courseId)
  const canEdit = !!c && (can(me, 'manageAttendance') || c.facultyId === me.id)
  const recs = db.attendance.filter((a) => a.courseId === courseId).sort((a, b) => b.date.localeCompare(a.date))
  const st = c ? attendanceStats(db, studentId, c.id) : null
  const toggle = (id: string, present: boolean) => {
    const r = db.attendance.find((x) => x.id === id)!
    update((d) => { const x = d.attendance.find((y) => y.id === id)!; x.present = present ? [...new Set([...x.present, studentId])] : x.present.filter((p) => p !== studentId) })
    notify([studentId], `Attendance corrected: ${c!.code} on ${fmtDate(r.date)} marked ${present ? 'present' : 'absent'}`, '/attendance')
    audit(me.id, 'ATTENDANCE_EDIT', `${s.name} · ${c!.code} ${r.date} → ${present ? 'present' : 'absent'}`)
  }
  return (
    <Modal wide title={`Attendance · ${s.name} (${s.rollNo ?? ''})`} onClose={onClose}>
      <div className="row gap wrap">
        {courses.map((x) => { const a = attendanceStats(db, studentId, x.id); return <button key={x.id} className={`chip ${x.id === courseId ? 'active' : ''}`} onClick={() => setCourseId(x.id)}>{x.code} · {a.total ? `${a.pct}%` : '—'}</button> })}
        <label className="row gap small"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Earlier semesters</label>
      </div>
      {st && <div className="row gap"><Badge tone={st.pct >= 75 ? 'success' : 'danger'}>{st.pct}%</Badge><span className="small muted">{st.attended} of {st.total} classes · {c?.name}</span>{!canEdit && <span className="small muted">View only</span>}</div>}
      {recs.length === 0 ? <Empty text="No classes recorded for this course." /> : (
        <div className="table-wrap"><table>
          <thead><tr><th>Date</th><th>Status</th><th>Marked by</th>{canEdit && <th>Correct</th>}</tr></thead>
          <tbody>{recs.map((r) => { const here = r.present.includes(studentId); return (
            <tr key={r.id}>
              <td>{fmtDate(r.date)}</td>
              <td><Badge tone={here ? 'success' : 'danger'}>{here ? 'Present' : 'Absent'}</Badge></td>
              <td className="small">{db.users.find((u) => u.id === r.markedBy)?.name ?? '—'}</td>
              {canEdit && <td><button className="btn btn-ghost btn-sm" onClick={() => toggle(r.id, !here)}>Mark {here ? 'absent' : 'present'}</button></td>}
            </tr>
          ) })}</tbody>
        </table></div>
      )}
    </Modal>
  )
}
