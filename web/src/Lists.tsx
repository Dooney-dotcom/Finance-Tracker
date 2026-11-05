import { useState, type FormEvent } from 'react'
import { api, ApiError, type Category, type Lists, type Method } from './lib'
import { ColorField } from './Controls'

// Suggested colours for new categories; red, blue and ochre stay reserved for expense, income and attention.
export const SUGGESTED = ['#6250d6', '#eb6834', '#1baf7a', '#e87ba4', '#008300', '#0f8b8d', '#8b5a2b', '#b8a400', '#a33ea1', '#4a4e9e', '#c0a062', '#7a8a99', '#d65db1', '#5b8c00', '#3d6b6e', '#7d5ba6']

const errorText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback)

/** One editable row: rename and recolour save as you go; delete asks where the records should move. */
function Item({ item, siblings, endpoint, onChange }: {
  item: Category | Method; siblings: (Category | Method)[]; endpoint: string; onChange: () => void
}) {
  const color = 'color' in item ? item.color : undefined
  const [name, setName] = useState(item.name)
  const [deleting, setDeleting] = useState(false)
  const [moveTo, setMoveTo] = useState('')
  const [error, setError] = useState('')

  async function save(patch: { name?: string; color?: string }) {
    setError('')
    const body = 'kind' in item ? { name: patch.name ?? item.name, kind: item.kind, color: patch.color ?? item.color ?? '#9c9a92' } : { name: patch.name ?? item.name }
    try { await api(`${endpoint}/${item.id}`, { method: 'PUT', json: body }); onChange() }
    catch (e) { setError(errorText(e, 'Not saved.')); setName(item.name) }
  }

  async function remove() {
    setError('')
    try { await api(`${endpoint}/${item.id}${moveTo ? `?reassignTo=${moveTo}` : ''}`, { method: 'DELETE' }); onChange() }
    catch (e) { setError(errorText(e, 'Not deleted.')) }
  }

  return (
    <li className="list-item">
      <div className="list-row">
        {color !== undefined && (
          <ColorField label={`Colour for ${item.name}`} value={color ?? '#9c9a92'} palette={SUGGESTED} onChange={(c) => save({ color: c })} />
        )}
        <input className="name-input" aria-label="Name" value={name} maxLength={50}
          onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() !== item.name && save({ name: name.trim() })}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
        <a className="muted small count" href={`#/records?${'kind' in item ? 'category' : 'paymentMethod'}=${item.id}&all=1`}>
          {item.records} record{item.records === 1 ? '' : 's'}
        </a>
        <button className="link" onClick={() => setDeleting(!deleting)}>{deleting ? 'Cancel' : 'Delete'}</button>
      </div>
      {deleting && (
        <div className="delete-box">
          {item.records === 0
            ? <p>Delete “{item.name}”?</p>
            : (
              <label className="field"><span>{item.records} record{item.records === 1 ? ' uses' : 's use'} “{item.name}”. Move {item.records === 1 ? 'it' : 'them'} to:</span>
                <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                  <option value="">Choose…</option>
                  {siblings.filter((s) => s.id !== item.id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
            )}
          <button className="btn danger-btn" disabled={item.records > 0 && !moveTo} onClick={remove}>
            {item.records > 0 ? `Move ${item.records} and delete` : 'Delete'}
          </button>
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </li>
  )
}

function AddForm({ label, onAdd }: { label: string; onAdd: (name: string) => Promise<void> }) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setError('')
    try { await onAdd(name.trim()); setName('') } catch (err) { setError(errorText(err, 'Not added.')) }
  }
  return (
    <form className="add-form" onSubmit={submit}>
      <label className="field inline grow"><span className="sr-only">{label}</span>
        <input value={name} maxLength={50} placeholder={label} onChange={(e) => setName(e.target.value)} />
      </label>
      <button className="btn">Add</button>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  )
}

export function Categories({ lists, onChange }: { lists: Lists; onChange: () => void }) {
  const used = new Set(lists.categories.map((c) => c.color))
  const nextColor = SUGGESTED.find((c) => !used.has(c)) ?? SUGGESTED[lists.categories.length % SUGGESTED.length]
  return (
    <div className="lists">
      {(['expense', 'income'] as const).map((kind) => {
        const items = lists.categories.filter((c) => c.kind === kind)
        return (
          <section className="panel" key={kind}>
            <h2>{kind === 'expense' ? 'Expense categories' : 'Income categories'}</h2>
            <p className="muted small">Click a swatch to change its colour on the dashboard. Click a name to rename it.</p>
            {items.length === 0 && <p className="empty">None yet. Add one, like “Salary” or “Refunds”.</p>}
            <ul className="list">{items.map((c) => <Item key={c.id} item={c} siblings={items} endpoint="/api/categories" onChange={onChange} />)}</ul>
            <AddForm label={`New ${kind} category`} onAdd={async (name) => { await api('/api/categories', { method: 'POST', json: { name, kind, color: nextColor } }); onChange() }} />
          </section>
        )
      })}
    </div>
  )
}

export function Methods({ lists, onChange }: { lists: Lists; onChange: () => void }) {
  return (
    <div className="lists">
      <section className="panel">
        <h2>Payment methods</h2>
        <ul className="list">{lists.paymentMethods.map((m) => <Item key={m.id} item={m} siblings={lists.paymentMethods} endpoint="/api/payment-methods" onChange={onChange} />)}</ul>
        <AddForm label="New payment method" onAdd={async (name) => { await api('/api/payment-methods', { method: 'POST', json: { name } }); onChange() }} />
      </section>
    </div>
  )
}
