import type { ClassGroup } from '../data/types'
import { classColor, classLabel } from '../classes'

/** A class selector chip in the class's own colour. */
export default function ClassChip({ cls, active, onClick }: { cls: ClassGroup; active: boolean; onClick: () => void }) {
  const col = classColor(cls)
  return (
    <button className="chip class-chip" onClick={onClick} aria-pressed={active}
      style={{ borderColor: col.fg, color: active ? '#fff' : col.fg, background: active ? col.fg : col.bg }}>
      <span className="class-dot" style={{ background: active ? '#fff' : col.fg }} />{classLabel(cls)}
    </button>
  )
}
