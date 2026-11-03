import { useState } from 'react'
import { update, useCurrentUser } from '../data/store'
import { Avatar, Badge, Card, Field, PageHeader } from '../components/ui'

export default function Profile() {
  const user = useCurrentUser()!
  const [phone, setPhone] = useState(user.phone ?? '')
  const [cur, setCur] = useState('')
  const [np, setNp] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const saveContact = () => { update((d) => { d.users.find((u) => u.id === user.id)!.phone = phone }); setMsg({ ok: true, text: 'Contact details saved.' }) }
  const changePw = () => {
    if (cur !== user.password) return setMsg({ ok: false, text: 'Current password is incorrect.' })
    if (np.length < 8) return setMsg({ ok: false, text: 'New password must be at least 8 characters.' })
    update((d) => { d.users.find((u) => u.id === user.id)!.password = np })
    setCur(''); setNp(''); setMsg({ ok: true, text: 'Password updated.' })
  }

  return (
    <>
      <PageHeader title="My profile" />
      {msg && <div className={`alert ${msg.ok ? 'alert-success' : 'alert-danger'}`}>{msg.text}</div>}
      <div className="grid grid-2">
        <Card>
          <div className="row gap-lg" style={{ gap: 16 }}>
            <Avatar name={user.name} color={user.avatarColor} size={72} />
            <div className="stack" style={{ gap: 4 }}>
              <h2 style={{ fontSize: 20 }}>{user.name}</h2>
              <div className="row gap"><Badge tone="brand">{user.role}</Badge><Badge tone="success">{user.status}</Badge></div>
              <span className="muted">{user.email}</span>
            </div>
          </div>
          <table style={{ marginTop: 16 }}><tbody>
            {user.rollNo && <tr><td className="muted">Roll number</td><td>{user.rollNo}</td></tr>}
            {user.program && <tr><td className="muted">Programme</td><td>{user.program} · Semester {user.semester} · Section {user.section}</td></tr>}
            <tr><td className="muted">Department</td><td>{user.department}</td></tr>
          </tbody></table>
        </Card>
        <div className="stack">
          <Card title="Contact details">
            <div className="stack">
              <Field label="Mobile number"><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
              <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={saveContact}>Save</button>
            </div>
          </Card>
          <Card title="Change password">
            <div className="stack">
              <Field label="Current password"><input className="input" type="password" value={cur} onChange={(e) => setCur(e.target.value)} /></Field>
              <Field label="New password"><input className="input" type="password" value={np} onChange={(e) => setNp(e.target.value)} /></Field>
              <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={changePw}>Update password</button>
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}
