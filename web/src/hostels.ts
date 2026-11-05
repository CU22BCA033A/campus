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
