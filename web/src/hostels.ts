/** Hostel scoping: boys/girls hostels, block wardens, residence and waiting lists. */
import type { DB, User } from './data/types'

/** The hostel a student belongs to by gender (boys → Boys hostel, girls → Girls hostel). */
export const hostelsForGender = (db: DB, g?: User['gender']) => db.hostels.filter((h) => (g === 'Female' ? h.gender === 'Girls' : g === 'Male' ? h.gender === 'Boys' : true))
/** Hostels a member of the hostel office may manage: a block warden only theirs; chief warden / admin all. */
export const managedHostels = (db: DB, u: User) => (u.role === 'admin' && u.office === 'hostel' && u.hostelId ? db.hostels.filter((h) => h.id === u.hostelId) : db.hostels)
export const isChiefWarden = (u: User) => u.role === 'admin' && ((u.office === 'hostel' && !u.hostelId) || (u.office ?? 'super') === 'super')
export const roomOf = (db: DB, studentId: string) => db.rooms.find((r) => r.occupants.includes(studentId))
export const hostelOfStudent = (db: DB, studentId: string) => db.hostels.find((h) => h.id === roomOf(db, studentId)?.hostelId)
/** Hostel students without a room, for one hostel (matched by gender). */
export const waitingList = (db: DB, hostelId: string) => {
  const h = db.hostels.find((x) => x.id === hostelId)
  return db.users.filter((u) => u.role === 'student' && u.status === 'ACTIVE' && u.residence === 'HOSTEL' && !roomOf(db, u.id) && (!h || (h.gender === 'Girls' ? u.gender === 'Female' : u.gender === 'Male')))
}
/** Wardens to notify for a student's hostel (block warden + chief wardens). */
export const wardensFor = (db: DB, student: User) => {
  const hostel = hostelOfStudent(db, student.id) ?? hostelsForGender(db, student.gender)[0]
  return db.users.filter((u) => u.role === 'admin' && u.office === 'hostel' && u.status === 'ACTIVE' && (!u.hostelId || u.hostelId === hostel?.id)).map((u) => u.id)
}

/* ---------------- Beds (A, B, C…) ---------------- */
export const bedLetters = (capacity: number) => Array.from({ length: capacity }, (_, i) => String.fromCharCode(65 + i))
/** Give every occupant a unique bed letter within the room's capacity (keeps existing letters). */
export function normalizeBeds(d: DB) {
  for (const r of d.rooms) {
    const letters = bedLetters(r.capacity)
    const beds: Record<string, string> = {}
    for (const o of r.occupants) { const b = r.beds?.[o]; if (b && letters.includes(b) && !Object.values(beds).includes(b)) beds[o] = b }
    for (const o of r.occupants) if (!beds[o]) { const free = letters.find((l) => !Object.values(beds).includes(l)); if (free) beds[o] = free }
    r.beds = beds
  }
}
export const bedOf = (r: DB['rooms'][number], studentId: string) => r.beds?.[studentId] ?? bedLetters(r.capacity)[r.occupants.indexOf(studentId)] ?? '?'
export const freeBeds = (r: DB['rooms'][number]) => bedLetters(r.capacity).filter((l) => !r.occupants.some((o) => bedOf(r, o) === l))
/** Residents of a hostel in walking order: room number (natural order), then bed letter. */
export function residentsInOrder(db: DB, hostelId: string) {
  return db.rooms.filter((r) => r.hostelId === hostelId)
    .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }))
    .flatMap((r) => r.occupants.map((o) => ({ id: o, room: r.number, roomId: r.id, bed: bedOf(r, o) })).sort((a, b) => a.bed.localeCompare(b.bed)))
}
