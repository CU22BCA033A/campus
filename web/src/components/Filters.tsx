import { useState } from 'react'
import { Filter, X } from 'lucide-react'

export interface FilterOption { value: string; label: string }
export interface FilterDef { key: string; label: string; options: FilterOption[]; hidden?: boolean }

/** Distinct, sorted options from values present in the data (empty values dropped). */
export function opts(values: (string | number | undefined | null)[], label: (v: string) => string = (v) => v): FilterOption[] {
  const uniq = [...new Set(values.filter((v) => v !== undefined && v !== null && v !== '').map(String))]
  uniq.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  return uniq.map((v) => ({ value: v, label: label(v) }))
}

/** Filter state for a page: `f.programme` is '' when not filtered. */
export function useFilters<K extends string>(keys: readonly K[]) {
  const empty = Object.fromEntries(keys.map((k) => [k, ''])) as Record<K, string>
  const [values, setValues] = useState<Record<K, string>>(empty)
  return {
    values,
    set: (k: K, v: string) => setValues((x) => ({ ...x, [k]: v })),
    clear: () => setValues(empty),
    /** true when no filter is set for k, or the value matches */
    ok: (k: K, v: string | number | undefined | null) => !values[k] || String(v ?? '') === values[k],
    active: keys.filter((k) => values[k]).length,
  }
}

/** A row of filter dropdowns with a result count and a clear button. */
export function FilterBar<K extends string>({ defs, f, count, noun = 'result' }: { defs: (FilterDef & { key: K })[]; f: ReturnType<typeof useFilters<K>>; count?: number; noun?: string }) {
  const shown = defs.filter((d) => !d.hidden && d.options.length > 0)
  if (!shown.length && count === undefined) return null
  return (
    <div className="row gap wrap filter-bar">
      {shown.length > 0 && <Filter size={14} className="muted" aria-hidden />}
      {shown.map((d) => (
        <select key={d.key} className={`select filter-select ${f.values[d.key] ? 'filter-on' : ''}`} aria-label={`Filter by ${d.label.toLowerCase()}`} value={f.values[d.key]} onChange={(e) => f.set(d.key, e.target.value)}>
          <option value="">All {d.label.toLowerCase()}</option>
          {d.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ))}
      {f.active > 0 && <button className="btn btn-ghost btn-sm" onClick={f.clear}><X size={12} /> Clear filters</button>}
      {count !== undefined && <span className="small muted">{count} {count === 1 ? noun : noun.endsWith('s') ? noun + 'es' : noun + 's'}</span>}
    </div>
  )
}
