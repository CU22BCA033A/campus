import { useState } from 'react'
import { audit, update, useCurrentUser, useDB } from '../data/store'
import type { Office, User } from '../data/types'
import { can, OFFICES, persona } from '../access'
import { classLabel, resyncRosters } from '../classes'
import { matches } from '../lib'
import { Field, Modal } from './ui'

/** Who may edit which profile. */
export function canEditProfile(editor: User, target: User) {
  if (target.role === 'student') return can(editor, 'editStudentProfiles')
  if (target.role === 'parent') return can(editor, 'manageStudents')
  return can(editor, 'manageStaff')
}

export default function EditUser({ user, onClose }: { user: User; onClose: () => void }) {
  const db = useDB()
  const me = useCurrentUser()!
  const [f, setF] = useState<User>({ ...user })
  const [err, setErr] = useState('')
  const [wardQ, setWardQ] = useState('')
  const academicEditor = can(me, 'manageResults') // Registrar of Evaluation: CGPA / backlogs
  const set = <K extends keyof User>(k: K, v: User[K]) => setF((x) => ({ ...x, [k]: v }))

  const save = () => {
    if (!f.name.trim() || !/^\S+@\S+\.\S+$/.test(f.email)) return setErr('Enter a name and a valid email.')
    if (db.users.some((u) => u.id !== user.id && u.email.toLowerCase() === f.email.toLowerCase())) return setErr('Another account already uses this email.')
    if (f.rollNo && db.users.some((u) => u.id !== user.id && u.rollNo === f.rollNo)) return setErr('This roll number is already assigned.')
    const changed = (Object.keys(f) as (keyof User)[]).filter((k) => JSON.stringify(f[k]) !== JSON.stringify(user[k]))
    update((d) => {
      const x = d.users.find((u) => u.id === user.id)!
      Object.assign(x, f)
      resyncRosters(d)
    })
    audit(me.id, 'PROFILE_EDIT', `${user.name}: ${changed.join(', ') || 'no changes'}`)
    onClose()
  }

  return (
    <Modal title={`Edit profile: ${user.name}`} onClose={onClose} footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn" onClick={save}>Save changes</button></>}>
      {err && <div className="alert alert-danger">{err}</div>}
      <div className="grid grid-2">
        <Field label="Full name"><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Email"><input className="input" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Mobile"><input className="input" value={f.phone ?? ''} onChange={(e) => set('phone', e.target.value)} /></Field>
        {user.role === 'student' && <Field label="Roll number"><input className="input" value={f.rollNo ?? ''} onChange={(e) => set('rollNo', e.target.value)} /></Field>}
        {user.role !== 'student' && user.role !== 'parent' && <Field label="Department"><input className="input" value={f.department} onChange={(e) => set('department', e.target.value)} /></Field>}
      </div>

      {user.role === 'student' && (
        <>
          <Field label="Class" hint="Changing the class moves the student onto that class's current-semester courses">
            <select className="select" value={f.classId ?? ''} onChange={(e) => set('classId', e.target.value || undefined)}>
              <option value="">Unassigned</option>
              {db.classes.map((c) => <option key={c.id} value={c.id}>{classLabel(c)}</option>)}
            </select>
          </Field>
          <div className="grid grid-2">
            <Field label="CGPA" hint={academicEditor ? undefined : 'Editable by the Registrar of Evaluation'}><input className="input" type="number" step="0.01" min={0} max={10} disabled={!academicEditor} value={f.cgpa ?? 0} onChange={(e) => set('cgpa', Number(e.target.value))} /></Field>
            <Field label="Backlogs"><input className="input" type="number" min={0} disabled={!academicEditor} value={f.backlogs ?? 0} onChange={(e) => set('backlogs', Number(e.target.value))} /></Field>
          </div>
        </>
      )}

      {user.role === 'parent' && (
        <Field label="Wards (children)">
          <input className="input" placeholder="Search students to link…" value={wardQ} onChange={(e) => setWardQ(e.target.value)} />
          <div className="stack" style={{ gap: 4, maxHeight: 180, overflowY: 'auto', marginTop: 6 }}>
            {db.users.filter((u) => u.role === 'student' && (f.wardIds?.includes(u.id) || (wardQ && matches(wardQ, u.name, u.rollNo)))).map((s) => (
              <label key={s.id} className="row gap small"><input type="checkbox" checked={!!f.wardIds?.includes(s.id)} onChange={(e) => set('wardIds', e.target.checked ? [...(f.wardIds ?? []), s.id] : (f.wardIds ?? []).filter((w) => w !== s.id))} /> {s.name} · {s.rollNo}</label>
            ))}
          </div>
        </Field>
      )}

      {user.role === 'admin' && persona(me) === 'super' && (
        <Field label="Office"><select className="select" value={f.office ?? 'super'} onChange={(e) => set('office', e.target.value as Office)}>{(Object.keys(OFFICES) as Office[]).map((o) => <option key={o} value={o}>{OFFICES[o].label}</option>)}</select></Field>
      )}
      {(user.role === 'faculty' || user.role === 'admin') && can(me, 'manageStaff') && (
        <Field label="Monthly basic salary (₹)" hint="Used by payroll"><input className="input" type="number" min={0} value={f.basicSalary ?? 0} onChange={(e) => set('basicSalary', Number(e.target.value))} /></Field>
      )}
    </Modal>
  )
}
