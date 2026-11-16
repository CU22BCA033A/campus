import { useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { audit, update } from '../data/store'
import { Field, Modal } from './ui'
import type { DB } from '../data/types'

/** Collections that hold records with an id. */
type Coll = { [K in keyof DB]: DB[K] extends { id: string }[] ? K : never }[keyof DB]
type Rec = Record<string, unknown> & { id: string }

export interface FieldSpec {
  key: string
  label: string
  type?: 'text' | 'number' | 'textarea' | 'select' | 'checkbox' | 'date' | 'dateMs' | 'datetimeMs'
  options?: { value: string; label: string }[]
  hint?: string
  required?: boolean
}

const toInput = (f: FieldSpec, v: unknown) => {
  if (v === undefined || v === null) return ''
  if (f.type === 'dateMs') return new Date(Number(v)).toISOString().slice(0, 10)
  if (f.type === 'datetimeMs') { const d = new Date(Number(v)); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) }
  return String(v)
}
const fromInput = (f: FieldSpec, v: string | boolean) => {
  if (f.type === 'checkbox') return !!v
  if (v === '') return undefined
  if (f.type === 'number') return Number(v)
  if (f.type === 'dateMs') return new Date(`${v}T12:00`).getTime()
  if (f.type === 'datetimeMs') return new Date(String(v)).getTime()
  return v
}

/**
 * Manual edit (or add) of any record: the office corrects or enters data by hand. Changes are audited.
 * `collection` is the DB list; `record` the current values (omit `id` to add a new record).
 */
export function RecordEditor({ title, collection, record: rec, fields, actorId, onClose, onSaved }: { title: string; collection: Coll; record: { id?: string; [k: string]: unknown } | object; fields: FieldSpec[]; actorId: string; onClose: () => void; onSaved?: (id: string) => void }) {
  const record = rec as Partial<Rec>
  const [vals, setVals] = useState<Record<string, string | boolean>>(() => Object.fromEntries(fields.map((f) => [f.key, f.type === 'checkbox' ? !!record[f.key] : toInput(f, record[f.key])])))
  const [err, setErr] = useState('')
  const save = () => {
    const missing = fields.find((f) => f.required && (vals[f.key] === '' || vals[f.key] === undefined))
    if (missing) return setErr(`${missing.label} is required.`)
    const patch = Object.fromEntries(fields.map((f) => [f.key, fromInput(f, vals[f.key])]))
    const id = record.id ?? `${String(collection).slice(0, 3)}${Date.now().toString(36)}`
    update((d) => {
      const list = d[collection] as unknown as Rec[]
      const ex = list.find((x) => x.id === id)
      if (ex) Object.assign(ex, patch); else list.push({ ...record, ...patch, id } as Rec)
    })
    audit(actorId, record.id ? 'RECORD_EDIT' : 'RECORD_ADD', `${String(collection)}: ${title}`)
    onSaved?.(id); onClose()
  }
  return (
    <Modal title={title} onClose={onClose} footer={<>{err && <span className="small" style={{ color: 'var(--danger)', marginRight: 'auto' }}>{err}</span>}<button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn" onClick={save}>Save</button></>}>
      <div className="grid grid-2">
        {fields.map((f) => (
          <div key={f.key} style={f.type === 'textarea' ? { gridColumn: '1 / -1' } : undefined}>
            <Field label={f.label} hint={f.hint}>
              {f.type === 'textarea' ? <textarea className="textarea" value={String(vals[f.key] ?? '')} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} />
                : f.type === 'select' ? <select className="select" value={String(vals[f.key] ?? '')} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })}><option value="">—</option>{f.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
                : f.type === 'checkbox' ? <label className="row gap"><input type="checkbox" checked={!!vals[f.key]} onChange={(e) => setVals({ ...vals, [f.key]: e.target.checked })} /> Yes</label>
                : <input className="input" type={f.type === 'number' ? 'number' : f.type === 'dateMs' || f.type === 'date' ? 'date' : f.type === 'datetimeMs' ? 'datetime-local' : 'text'} value={String(vals[f.key] ?? '')} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} />}
            </Field>
          </div>
        ))}
      </div>
    </Modal>
  )
}

/** Delete a record by hand (after confirmation); audited. */
export function deleteRecord(collection: Coll, id: string, label: string, actorId: string, extra?: (d: DB) => void) {
  if (!confirm(`Delete ${label}? This cannot be undone.`)) return false
  update((d) => { (d as unknown as Record<string, Rec[]>)[collection] = (d[collection] as unknown as Rec[]).filter((x) => x.id !== id); extra?.(d) })
  audit(actorId, 'RECORD_DELETE', `${String(collection)}: ${label}`)
  return true
}

/** Edit / delete icon buttons for a row. */
export function RowActions({ onEdit, onDelete, label }: { onEdit?: () => void; onDelete?: () => void; label: string }) {
  return (
    <span className="row gap" style={{ gap: 2 }}>
      {onEdit && <button className="icon-btn" aria-label={`Edit ${label}`} title="Edit" onClick={onEdit}><Pencil size={14} /></button>}
      {onDelete && <button className="icon-btn" aria-label={`Delete ${label}`} title="Delete" onClick={onDelete}><Trash2 size={14} /></button>}
    </span>
  )
}
