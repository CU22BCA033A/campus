/** Tests and assignments: auto-marking against the teacher's answer key, valid attempts, and make-up marks. */
import type { DB, QuizAnswer, QuizQuestion } from './data/types'

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
const r1 = (n: number) => Math.round(n * 10) / 10

export const qMarks = (q: QuizQuestion) => q.marks ?? 1
export const quizMax = (qs: QuizQuestion[]) => qs.reduce((t, q) => t + qMarks(q), 0)
/** Marks for one answer: MCQ / true-false one option; multiple-correct needs exactly the right set; blanks match any accepted answer. */
export function markQuestion(q: QuizQuestion, a: QuizAnswer | undefined) {
  const type = q.type ?? 'mcq'
  if (a === undefined || a === -1 || a === '') return 0
  if (type === 'blank') return typeof a === 'string' && (q.accepted ?? []).some((x) => norm(x) === norm(a)) ? qMarks(q) : 0
  if (type === 'msq') return Array.isArray(a) && a.length && [...a].sort().join(',') === [...(q.answers ?? [])].sort().join(',') ? qMarks(q) : 0
  return a === q.answer ? qMarks(q) : 0
}
export const scoreQuiz = (qs: QuizQuestion[], answers: QuizAnswer[]) => qs.reduce((t, q, i) => t + markQuestion(q, answers[i]), 0)
export const isAnsweredQ = (a: QuizAnswer | undefined) => a !== undefined && a !== -1 && a !== '' && !(Array.isArray(a) && !a.length)
export const blankMatches = (accepted: string[] | undefined, text: string | undefined) => !!text?.trim() && (accepted ?? []).some((x) => norm(x) === norm(text))

/** A student's current attempt (ignoring attempts the teacher voided for a retake). */
export const validAttempt = (db: DB, quizId: string, sid: string) => db.attempts.filter((a) => a.quizId === quizId && a.studentId === sid && !a.voided).sort((a, b) => b.submittedAt - a.submittedAt)[0]

/** Can this student see / take the quiz or assignment? (make-ups are for the selected students only) */
export const visibleTo = (x: { onlyFor?: string[] }, sid: string) => !x.onlyFor?.length || x.onlyFor.includes(sid)

/** Quiz marks for the result sheet: the student's attempt, or their make-up attempt scaled to the original. */
export function quizMark(db: DB, quizId: string, sid: string) {
  const q = db.quizzes.find((x) => x.id === quizId)
  if (!q) return undefined
  const own = validAttempt(db, quizId, sid)
  if (own) return own.score
  for (const m of db.quizzes.filter((x) => x.makeupOf === quizId && visibleTo(x, sid))) {
    const at = validAttempt(db, m.id, sid)
    if (at) return r1((at.score / Math.max(1, quizMax(m.questions))) * quizMax(q.questions))
  }
  return undefined
}
/** Assignment marks for the result sheet: the student's own, or their make-up marks scaled to the original. */
export function assignmentMark(db: DB, assignmentId: string, sid: string) {
  const a = db.assignments.find((x) => x.id === assignmentId)
  if (!a) return undefined
  const own = db.submissions.find((s) => s.assignmentId === assignmentId && s.studentId === sid)?.marks
  if (own !== undefined) return own
  for (const m of db.assignments.filter((x) => x.makeupOf === assignmentId && visibleTo(x, sid))) {
    const s = db.submissions.find((x) => x.assignmentId === m.id && x.studentId === sid)
    if (s?.marks !== undefined) return r1((s.marks / Math.max(1, m.maxMarks)) * a.maxMarks)
  }
  return undefined
}
