/** Multi-part assignments: answer formats, auto-marking of MCQ parts and totals. */
import type { Assignment, AssignmentPart, FileKind, PartAnswer, PartType, Submission } from './data/types'

export const PART_LABEL: Record<PartType, string> = {
  text: 'Written answer',
  link: 'Link (GitHub, Drive…)',
  file: 'File upload',
  mcq: 'MCQ: one correct',
  msq: 'MCQ: multiple correct',
}
export const FILE_KINDS: Record<FileKind, { label: string; accept: string; exts: string[] }> = {
  pdf: { label: 'PDF', accept: '.pdf,application/pdf', exts: ['pdf'] },
  doc: { label: 'Word', accept: '.doc,.docx,.odt,.rtf', exts: ['doc', 'docx', 'odt', 'rtf'] },
  slides: { label: 'Slides', accept: '.ppt,.pptx,.odp,.key', exts: ['ppt', 'pptx', 'odp', 'key'] },
  sheet: { label: 'Spreadsheet', accept: '.xls,.xlsx,.ods,.csv', exts: ['xls', 'xlsx', 'ods', 'csv'] },
  image: { label: 'Image', accept: 'image/*', exts: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'heic'] },
  zip: { label: 'ZIP', accept: '.zip,.rar,.7z', exts: ['zip', 'rar', '7z'] },
  any: { label: 'Any file', accept: '', exts: [] },
}
export const isAuto = (p: AssignmentPart) => p.type === 'mcq' || p.type === 'msq'

/** Parts of an assignment; classic assignments get a written answer plus an optional file. */
export function partsOf(a: Assignment): AssignmentPart[] {
  if (a.parts?.length) return a.parts
  return [
    { id: 'legacy-text', type: 'text', prompt: 'Answer / link', marks: a.maxMarks, required: false },
    { id: 'legacy-file', type: 'file', prompt: 'Attachment', marks: 0, required: false, accept: ['any'] },
  ]
}

/** A student's answer to one part (handles classic submissions). */
export function answerOf(s: Submission | undefined, p: AssignmentPart): PartAnswer | undefined {
  if (!s) return undefined
  const a = s.answers?.find((x) => x.partId === p.id)
  if (a) return a
  if (p.id === 'legacy-text' && s.text) return { partId: p.id, text: s.text }
  if (p.id === 'legacy-file' && s.fileName) return { partId: p.id, fileName: s.fileName, fileData: s.fileData }
  return undefined
}

export const isAnswered = (p: AssignmentPart, a?: PartAnswer) =>
  !!a && (p.type === 'file' ? !!a.fileName : isAuto(p) ? !!a.choices?.length : !!a.text?.trim())

/** Auto mark for an MCQ part: full marks only when exactly the correct options are chosen. */
export function autoMark(p: AssignmentPart, a?: PartAnswer) {
  if (!isAuto(p)) return undefined
  const chosen = [...(a?.choices ?? [])].sort().join(',')
  return chosen && chosen === [...(p.correct ?? [])].sort().join(',') ? p.marks : 0
}

/** Is the file's extension allowed by the part? */
export function fileAllowed(p: AssignmentPart, name: string) {
  const kinds: FileKind[] = p.accept?.length ? p.accept : ['any']
  if (kinds.includes('any')) return true
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return kinds.some((k) => FILE_KINDS[k].exts.includes(ext))
}
export const acceptAttr = (p: AssignmentPart) => (p.accept?.includes('any') || !p.accept?.length ? undefined : p.accept.map((k) => FILE_KINDS[k].accept).join(','))
export const formatsLabel = (p: AssignmentPart) => (p.accept?.length ? p.accept.map((k) => FILE_KINDS[k].label).join(' / ') : 'Any file')

/** Parts still waiting for the teacher (non-MCQ parts that carry marks and have no mark yet). */
export function pendingManual(a: Assignment, s: Submission) {
  return partsOf(a).filter((p) => !isAuto(p) && p.marks > 0 && s.partMarks?.[p.id] === undefined)
}

/** Total marks from per-part marks (classic submissions keep their single overall mark). */
export function totalOf(a: Assignment, partMarks: Record<string, number>) {
  return partsOf(a).reduce((t, p) => t + Math.min(p.marks, Math.max(0, partMarks[p.id] ?? 0)), 0)
}
