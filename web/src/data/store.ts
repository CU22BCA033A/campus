import { useSyncExternalStore } from 'react'
import { createSeed } from './seed'
import { groupIntoSessions } from '../exams'
import { normalizeBeds } from '../hostels'
import type { DB, User } from './types'

const KEY = 'campus-db-v1'
const SESSION_KEY = 'campus-session-v1'

function load(): DB {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      // Migrate older saved data: add any collections introduced since it was saved.
      const saved = JSON.parse(raw) as DB
      const fresh = createSeed()
      // Version 3 restructured students into classes; older demo data is replaced rather than patched.
      if ((saved.version ?? 1) < 3) return fresh
      if (saved.version < 8) {
        // Version 8: general ratio internal 60 / external 40 for sheets not yet published.
        for (const sh of saved.resultSheets ?? []) {
          if (sh.status === 'PUBLISHED' || sh.internalMax !== 40 || sh.externalMax !== 60) continue
          sh.internalMax = 60; sh.externalMax = 40
          for (const o of Object.values(sh.overrides)) if (o.internal !== undefined) o.internal = Math.round(o.internal * 1.5 * 10) / 10
        }
        for (const s of saved.examSessions ?? []) { s.internalMax ??= 60; s.externalMax ??= 40 }
      }
      if (saved.version < 7) {
        // Version 7: CGPA/backlogs are derived; keep earlier semesters as a prior record.
        for (const u of saved.users) {
          if (u.role !== 'student' || u.priorRecord) continue
          const f = fresh.users.find((x) => x.id === u.id)
          const semesters = Math.max(0, (u.semester ?? 1) - 1)
          u.priorRecord = f?.priorRecord ?? { semesters, credits: semesters * 20, cgpa: semesters ? u.cgpa ?? 0 : 0, backlogs: Math.max(0, (u.backlogs ?? 0) - (u.backlogCourses?.length ?? 0)) }
        }
      }
      if (saved.version < 5) {
        // Version 5: hostels with wardens, student residence/gender, result sheets and exam evaluators.
        for (const u of saved.users) {
          const f = fresh.users.find((x) => x.id === u.id)
          if (f && u.role === 'student') { u.gender ??= f.gender; u.residence ??= f.residence; u.backlogCourses ??= f.backlogCourses }
        }
        for (const r of saved.rooms) { const f = fresh.rooms.find((x) => x.id === r.id); if (!r.hostelId) { r.hostelId = f?.hostelId ?? (r.block.includes('Girls') ? 'h-girls' : 'h-boys'); r.block = f?.block ?? r.block } }
        for (const e of saved.exams) { const f = fresh.exams.find((x) => x.id === e.id); e.evaluatorId ??= f?.evaluatorId ?? saved.courses.find((c) => c.id === e.courseId)?.facultyId; e.kind ??= 'Regular' }
        for (const e of fresh.exams) if (!saved.exams.some((x) => x.id === e.id)) saved.exams.push(e)
      }
      if (saved.version < 4) {
        // Version 4: multi-part assignments. Refresh untouched demo assignments and add the new ones.
        for (const a of fresh.assignments) {
          const i = saved.assignments.findIndex((x) => x.id === a.id)
          const touched = saved.submissions.some((s) => s.assignmentId === a.id)
          if (i < 0) saved.assignments.push(a)
          else if (!saved.assignments[i].parts && a.parts && !touched) saved.assignments[i] = a
        }
      }
      for (const k of Object.keys(fresh) as (keyof DB)[]) {
        if (saved[k] === undefined) (saved as unknown as Record<string, unknown>)[k] = fresh[k]
      }
      // Add demo accounts introduced since the data was saved (parent, office staff).
      for (const u of fresh.users) if (!saved.users.some((x) => x.id === u.id)) saved.users.push(u)
      for (const u of saved.users) {
        if (u.role !== 'admin' || u.office) continue
        const seeded = fresh.users.find((x) => x.id === u.id)
        u.office = seeded?.office ?? 'super'
        if (seeded) u.name = seeded.name
      }
      groupIntoSessions(saved)
      normalizeBeds(saved)
      saved.version = fresh.version
      return saved
    }
  } catch {
    /* storage unavailable or corrupt: fall back to seed */
  }
  return createSeed()
}

let db: DB = load()
let sessionUserId: string | null = (() => {
  try {
    return localStorage.getItem(SESSION_KEY)
  } catch {
    return null
  }
})()

const listeners = new Set<() => void>()
let snapshot = { db, sessionUserId }

function emit() {
  snapshot = { db, sessionUserId }
  try {
    localStorage.setItem(KEY, JSON.stringify(db))
    if (sessionUserId) localStorage.setItem(SESSION_KEY, sessionUserId)
    else localStorage.removeItem(SESSION_KEY)
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l())
}

/** Immutable-ish update: the mutator receives a structured clone. */
export function update(mutator: (draft: DB) => void) {
  const draft = structuredClone(db)
  mutator(draft)
  groupIntoSessions(draft)
  normalizeBeds(draft)
  db = draft
  emit()
}

export function getDB() {
  return db
}

export function resetDemoData() {
  db = createSeed()
  sessionUserId = null
  emit()
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useStore() {
  return useSyncExternalStore(subscribe, () => snapshot)
}

export function useDB() {
  return useStore().db
}

export function useCurrentUser(): User | null {
  const { db, sessionUserId } = useStore()
  return db.users.find((u) => u.id === sessionUserId) ?? null
}

export function uid(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

/** Append an audit-trail entry (who did what, when). */
export function audit(actorId: string, action: string, detail: string) {
  update((d) => {
    d.audit.unshift({ id: uid('au'), at: Date.now(), actorId, action, detail })
    if (d.audit.length > 1000) d.audit.length = 1000
  })
}

export function notify(userIds: string[], text: string, link: string) {
  update((d) => {
    for (const userId of userIds) {
      d.notifications.unshift({ id: uid('nt'), userId, text, link, createdAt: Date.now(), read: false })
    }
  })
}

/* ---------------- Auth (mirrors /rest/auth/loginResponse semantics) ---------------- */

export const MAX_ATTEMPTS = 5
export const LOCK_MINUTES = 15

export interface LoginResponse {
  token: string | null
  user: User | null
  message: 'SUCCESS' | 'DEACTIVATED' | 'LOCKED' | 'INVALID_CREDENTIALS' | 'FIRST_LOGIN'
  errorMessage: string | null
  remainingLogins: number | null
  lockedAtTime: number | null
  firstLogin: boolean
  blocked: boolean
}

export function login(email: string, password: string): LoginResponse {
  const base: LoginResponse = { token: null, user: null, message: 'INVALID_CREDENTIALS', errorMessage: null, remainingLogins: null, lockedAtTime: null, firstLogin: false, blocked: false }
  const user = db.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase())
  if (!user) return { ...base, errorMessage: 'No account found with this email or username.' }

  if (user.status === 'DEACTIVATED') {
    return { ...base, message: 'DEACTIVATED', errorMessage: 'Your account has been deactivated. Please contact your Institute Administrator for further assistance' }
  }

  if (user.status === 'LOCKED' && user.lockedAtTime) {
    const unlockAt = user.lockedAtTime + LOCK_MINUTES * 60_000
    if (Date.now() < unlockAt) {
      return { ...base, message: 'LOCKED', blocked: true, lockedAtTime: user.lockedAtTime, errorMessage: `Too many failed attempts. Try again after ${new Date(unlockAt).toLocaleTimeString()}.` }
    }
    update((d) => {
      const u = d.users.find((x) => x.id === user.id)!
      u.status = 'ACTIVE'
      u.credentialsMismatchCount = 0
      u.lockedAtTime = undefined
    })
  }

  if (user.password !== password) {
    let remaining = 0
    let lockedAt: number | undefined
    update((d) => {
      const u = d.users.find((x) => x.id === user.id)!
      u.credentialsMismatchCount += 1
      remaining = MAX_ATTEMPTS - u.credentialsMismatchCount
      if (remaining <= 0) {
        u.status = 'LOCKED'
        u.lockedAtTime = lockedAt = Date.now()
      }
    })
    if (lockedAt) return { ...base, message: 'LOCKED', blocked: true, lockedAtTime: lockedAt, errorMessage: `Account locked for ${LOCK_MINUTES} minutes after ${MAX_ATTEMPTS} failed attempts.` }
    return { ...base, remainingLogins: remaining, errorMessage: `Incorrect password. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.` }
  }

  update((d) => {
    const u = d.users.find((x) => x.id === user.id)!
    u.credentialsMismatchCount = 0
  })

  if (user.firstLogin) {
    return { ...base, message: 'FIRST_LOGIN', firstLogin: true, user, token: null }
  }

  sessionUserId = user.id
  emit()
  audit(user.id, 'LOGIN', `${user.name} signed in`)
  return { ...base, message: 'SUCCESS', user, token: `demo.${user.id}` }
}

export function completeFirstLogin(userId: string, newPassword: string) {
  update((d) => {
    const u = d.users.find((x) => x.id === userId)!
    u.password = newPassword
    u.firstLogin = false
  })
  sessionUserId = userId
  emit()
}

export function logout() {
  sessionUserId = null
  emit()
}

export function switchUser(userId: string) {
  sessionUserId = userId
  emit()
}
