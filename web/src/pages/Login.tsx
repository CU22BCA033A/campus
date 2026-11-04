import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertCircle, BookOpen, CalendarCheck, CreditCard, Eye, EyeOff, MessageSquare } from 'lucide-react'
import { completeFirstLogin, login, type LoginResponse } from '../data/store'
import { Field } from '../components/ui'

const DEMO = [
  { label: 'Student', email: 'student@campus.edu', password: 'student123' },
  { label: 'Faculty', email: 'faculty@campus.edu', password: 'faculty123' },
  { label: 'System admin', email: 'admin@campus.edu', password: 'admin123' },
  { label: 'Registrar', email: 'registrar@campus.edu', password: 'registrar123' },
  { label: 'Finance', email: 'finance@campus.edu', password: 'finance123' },
  { label: 'Hostel warden', email: 'warden@campus.edu', password: 'warden123' },
  { label: 'HR', email: 'hr@campus.edu', password: 'hr123' },
  { label: 'Exams', email: 'exams@campus.edu', password: 'exams123' },
  { label: 'Library', email: 'library@campus.edu', password: 'library123' },
  { label: 'Placements', email: 'placement@campus.edu', password: 'placement123' },
  { label: 'Parent', email: 'parent@campus.edu', password: 'parent123' },
  { label: 'First login', email: 'new@campus.edu', password: 'welcome123' },
]

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [res, setRes] = useState<LoginResponse | null>(null)
  const [pending, setPending] = useState<LoginResponse | null>(null)
  const [np, setNp] = useState('')
  const [np2, setNp2] = useState('')
  const [npErr, setNpErr] = useState('')
  const [msInfo, setMsInfo] = useState(false)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const r = login(email, password)
    setRes(r)
    if (r.message === 'SUCCESS') navigate('/home')
    if (r.message === 'FIRST_LOGIN') setPending(r)
  }

  const setNewPassword = (e: React.FormEvent) => {
    e.preventDefault()
    if (np.length < 8) return setNpErr('Password must be at least 8 characters.')
    if (!/[0-9]/.test(np) || !/[a-zA-Z]/.test(np)) return setNpErr('Use both letters and numbers.')
    if (np !== np2) return setNpErr('Passwords do not match.')
    completeFirstLogin(pending!.user!.id, np)
    navigate('/home')
  }

  return (
    <div className="login">
      <div className="login-art">
        <div className="row gap">
          <div className="brand-logo">CP</div>
          <div>
            <div className="brand-name">Campus Portal</div>
            <div className="brand-sub">One platform for your entire campus</div>
          </div>
        </div>
        <div className="stack" style={{ gap: 24 }}>
          <h1>Learn, manage and engage, all in one place.</h1>
          <div className="login-feats">
            <div className="login-feat"><BookOpen size={18} /> Courses & LMS</div>
            <div className="login-feat"><CalendarCheck size={18} /> Attendance</div>
            <div className="login-feat"><CreditCard size={18} /> Online fee payment</div>
            <div className="login-feat"><MessageSquare size={18} /> Campus community</div>
          </div>
        </div>
        <div className="small" style={{ opacity: 0.7 }}>© {new Date().getFullYear()} Campus Portal</div>
      </div>

      <div className="login-form-wrap">
        {!pending ? (
          <form className="login-form" onSubmit={submit}>
            <div>
              <h1>Sign in</h1>
              <p className="muted">Use your institute email or username</p>
            </div>

            <button type="button" className="btn ms-btn btn-block" onClick={() => setMsInfo(true)}>
              <svg width="16" height="16" viewBox="0 0 21 21" aria-hidden="true"><rect x="1" y="1" width="9" height="9" fill="#f25022" /><rect x="11" y="1" width="9" height="9" fill="#7fba00" /><rect x="1" y="11" width="9" height="9" fill="#00a4ef" /><rect x="11" y="11" width="9" height="9" fill="#ffb900" /></svg>
              Sign in with Microsoft
            </button>
            {msInfo && (
              <div className="alert alert-info">
                <AlertCircle size={16} />
                <span>Microsoft single sign-on needs the university's Azure AD tenant and app registration. Configure <code>VITE_AZURE_CLIENT_ID</code> and <code>VITE_AZURE_TENANT_ID</code> to enable it. Use email sign-in for the demo.</span>
              </div>
            )}

            <div className="divider">or</div>

            {res?.errorMessage && (
              <div className={`alert ${res.message === 'DEACTIVATED' || res.message === 'LOCKED' ? 'alert-danger' : 'alert-warning'}`} role="alert">
                <AlertCircle size={16} /> <span>{res.errorMessage}</span>
              </div>
            )}

            <Field label="Email / Username">
              <input className="input" type="text" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            <Field label="Password">
              <div style={{ position: 'relative' }}>
                <input className="input" type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ paddingRight: 40 }} />
                <button type="button" className="icon-btn" style={{ position: 'absolute', right: 2, top: 2 }} onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}>
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </Field>
            <div className="row between small">
              <label className="row gap"><input type="checkbox" defaultChecked /> Keep me signed in</label>
              <a href="#" onClick={(e) => { e.preventDefault(); alert('A password reset link would be emailed to you. (Demo: no email is sent.)') }}>Forgot password?</a>
            </div>
            <button className="btn btn-block" type="submit">Sign in</button>
            <div className="small" style={{ textAlign: 'center' }}>New applicant? <Link to="/apply">Apply for admission</Link></div>

            <div className="stack" style={{ gap: 6 }}>
              <span className="small muted">Demo accounts (click to fill):</span>
              <div className="demo-accounts">
                {DEMO.map((d) => (
                  <button type="button" key={d.label} onClick={() => { setEmail(d.email); setPassword(d.password); setRes(null) }}>
                    <strong>{d.label}</strong><br /><span className="muted">{d.email}</span>
                  </button>
                ))}
              </div>
              <span className="small muted">Enter a wrong password 5 times to see the account lockout. <code>kavya.das@campus.edu</code> shows the deactivated-account message.</span>
            </div>
          </form>
        ) : (
          <form className="login-form" onSubmit={setNewPassword}>
            <div>
              <h1>Set a new password</h1>
              <p className="muted">Welcome, {pending.user?.name}. This is your first login, so please choose a new password.</p>
            </div>
            {npErr && <div className="alert alert-danger"><AlertCircle size={16} /> {npErr}</div>}
            <Field label="New password" hint="At least 8 characters with letters and numbers">
              <input className="input" type="password" value={np} onChange={(e) => setNp(e.target.value)} required />
            </Field>
            <Field label="Confirm password">
              <input className="input" type="password" value={np2} onChange={(e) => setNp2(e.target.value)} required />
            </Field>
            <button className="btn btn-block" type="submit">Save & continue</button>
            <button type="button" className="btn btn-ghost" onClick={() => setPending(null)}>Back to sign in</button>
          </form>
        )}
      </div>
    </div>
  )
}
