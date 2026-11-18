/** Lost & Found: likely matches between lost reports and found items, and the holding period. */
import type { DB, LostFoundItem } from './data/types'

export const HOLD_DAYS = 60 // unclaimed found items may be donated / disposed after this
const DAY = 86_400_000
const words = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !['the', 'and', 'with', 'near', 'from', 'black', 'blue', 'red', 'white', 'grey', 'gray', 'green'].includes(w)))

/** 0–100: same category, shared words, colour, place and close dates make a likely match. */
export function matchScore(a: LostFoundItem, b: LostFoundItem) {
  if (a.kind === b.kind) return 0
  const lost = a.kind === 'LOST' ? a : b, found = a.kind === 'LOST' ? b : a
  // Found before it was lost is impossible (allow one day of slack).
  if (new Date(found.date).getTime() + DAY < new Date(lost.date).getTime()) return 0
  let score = lost.category === found.category ? 40 : 0
  const wa = words(`${lost.title} ${lost.description}`), wb = words(`${found.title} ${found.description}`)
  const shared = [...wa].filter((w) => wb.has(w)).length
  score += Math.min(30, shared * 10)
  if (lost.color && found.color && lost.color.toLowerCase() === found.color.toLowerCase()) score += 15
  if (words(lost.location).size && [...words(lost.location)].some((w) => words(found.location).has(w))) score += 10
  const gap = Math.abs(new Date(found.date).getTime() - new Date(lost.date).getTime()) / DAY
  score += gap <= 2 ? 5 : 0
  return Math.min(100, score)
}
const isOpen = (x: LostFoundItem) => x.status === 'OPEN' || x.status === 'MATCHED'
/** Open items of the other kind that look like this one, best first. */
export const suggestions = (db: DB, item: LostFoundItem, min = 50) =>
  db.lostFound.filter((x) => x.id !== item.id && isOpen(x) && x.kind !== item.kind).map((x) => ({ x, score: matchScore(item, x) })).filter((m) => m.score >= min).sort((a, b) => b.score - a.score)
export const nextTag = (db: DB) => `LF-${new Date().getFullYear()}-${String(db.lostFound.filter((x) => x.tagNo).length + 1).padStart(3, '0')}`
export const pastHold = (x: LostFoundItem) => x.kind === 'FOUND' && isOpen(x) && Date.now() - x.createdAt > HOLD_DAYS * DAY
