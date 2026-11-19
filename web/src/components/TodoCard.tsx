import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Badge, Card, Empty } from './ui'
import type { Todo } from '../todo'

/** A person's "needs attention" list; each row links to where it gets done. */
export default function TodoCard({ title = 'Needs your attention', todos, empty = 'All caught up.', linkable = true }: { title?: string; todos: Todo[]; empty?: string; linkable?: boolean }) {
  return (
    <Card title={<span>{title} <Badge tone={todos.some((t) => t.tone === 'danger') ? 'danger' : todos.length ? 'warning' : 'success'}>{todos.length}</Badge></span>}>
      {todos.length === 0 ? <Empty text={empty} /> : (
        <div className="list">{todos.slice(0, 8).map((t, i) => (
          linkable ? (
            <Link key={i} to={t.to} className="list-item" style={{ color: 'inherit', textDecoration: 'none' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: `var(--${t.tone})`, flexShrink: 0 }} />
              <div className="grow"><div style={{ fontWeight: 600 }}>{t.text}</div>{t.sub && <div className="small muted">{t.sub}</div>}</div>
              <ArrowRight size={16} className="muted" />
            </Link>
          ) : (
            <div key={i} className="list-item">
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: `var(--${t.tone})`, flexShrink: 0 }} />
              <div className="grow"><div style={{ fontWeight: 600 }}>{t.text}</div>{t.sub && <div className="small muted">{t.sub}</div>}</div>
            </div>
          )
        ))}{todos.length > 8 && <div className="small muted">+{todos.length - 8} more</div>}</div>
      )}
    </Card>
  )
}
