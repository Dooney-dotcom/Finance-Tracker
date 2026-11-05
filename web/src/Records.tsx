import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { api, ApiError, fmtDate, money, REASONS, RECURRENCE, shift, today, type Category, type Lists, type Rec } from './lib'
import { Chevron } from './Dashboard'
import { DateField, MonthField } from './Controls'

type Filters = {
  monthFrom?: string; monthTo?: string; dateFrom?: string; dateTo?: string
  category?: string; paymentMethod?: string; type?: string; avoidable?: string; recurrence?: string; q?: string
}
const KEYS = ['monthFrom', 'monthTo', 'dateFrom', 'dateTo', 'category', 'paymentMethod', 'type', 'avoidable', 'recurrence', 'q'] as const

const thisMonth = () => today().slice(0, 8) + '01'

function readFilters(): { f: Filters; add: string | null } {
  const q = new URLSearchParams(window.location.hash.split('?')[1] ?? '')
  const f: Filters = {}
  for (const k of KEYS) { const v = q.get(k); if (v) f[k] = v }
  if (!q.has('all') && !f.monthFrom && !f.monthTo && !f.dateFrom && !f.dateTo) f.monthFrom = f.monthTo = thisMonth()
  return { f, add: q.get('add') }
}

function rangeLabel(f: Filters) {
  if (f.dateFrom || f.dateTo) {
    if (f.dateFrom === f.dateTo) return fmtDate(f.dateFrom!, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    return `${f.dateFrom ? fmtDate(f.dateFrom, { day: 'numeric', month: 'short' }) : '…'} – ${f.dateTo ? fmtDate(f.dateTo) : '…'}`
  }
  if (!f.monthFrom && !f.monthTo) return 'All time'
  if (f.monthFrom === f.monthTo) return fmtDate(f.monthFrom!, { month: 'long', year: 'numeric' })
  if (f.monthFrom?.slice(0, 4) === f.monthTo?.slice(0, 4) && f.monthFrom?.slice(5, 7) === '01' && f.monthTo?.slice(5, 7) === '12') return f.monthFrom!.slice(0, 4)
  return `${fmtDate(f.monthFrom!, { month: 'short', year: 'numeric' })} – ${fmtDate(f.monthTo!, { month: 'short', year: 'numeric' })}`
}

export function Swatch({ color }: { color: string | null | undefined }) {
  return <span className="key" style={{ background: color ?? 'var(--ochre)' }} />
}

export function RecordsList({ lists, onListsChanged }: { lists: Lists; onListsChanged: () => void }) {
  const initial = useMemo(readFilters, [])
  const [f, setF] = useState<Filters>(initial.f)
  const [q, setQ] = useState(initial.f.q ?? '')
  const [rows, setRows] = useState<Rec[] | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Rec | 'new' | null>(initial.add ? 'new' : null)
  const [reload, setReload] = useState(0)
  const catById = useMemo(() => new Map(lists.categories.map((c) => [c.id, c])), [lists])
  const pmById = useMemo(() => new Map(lists.paymentMethods.map((m) => [m.id, m])), [lists])

  // Debounced search, then keep the address bar in step so filters survive reloads and can be linked.
  useEffect(() => { const t = setTimeout(() => setF((p) => ({ ...p, q: q.trim() || undefined })), 250); return () => clearTimeout(t) }, [q])
  useEffect(() => {
    const p = new URLSearchParams()
    for (const k of KEYS) if (f[k]) p.set(k, f[k]!)
    if (!f.monthFrom && !f.monthTo && !f.dateFrom && !f.dateTo) p.set('all', '1')
    history.replaceState(null, '', '#/records?' + p)
  }, [f])

  useEffect(() => {
    const ctrl = new AbortController()
    const p = new URLSearchParams()
    for (const k of KEYS) if (f[k]) p.set(k, f[k]!)
    setLoading(true); setError('')
    api<{ records: Rec[]; truncated: boolean }>(`/api/records?${p}`, { signal: ctrl.signal })
      .then((r) => { setRows(r.records); setTruncated(r.truncated); setLoading(false) })
      .catch((e) => { if (!ctrl.signal.aborted) { setError(e instanceof ApiError ? e.message : 'Couldn’t load records.'); setLoading(false) } })
    return () => ctrl.abort()
  }, [f, reload])

  const set = (patch: Filters) => setF((p) => ({ ...p, ...patch }))
  const singleMonth = !f.dateFrom && !f.dateTo && f.monthFrom && f.monthFrom === f.monthTo
  const totals = (rows ?? []).reduce((t, r) => (r.type === 'Income' ? { ...t, inc: t.inc + r.amount } : { ...t, exp: t.exp + r.amount }), { inc: 0, exp: 0 })
  const filtered = !!(f.category || f.paymentMethod || f.type || f.avoidable || f.recurrence || f.q)

  /** Inline change from the table: save at once, roll back if the server refuses. */
  async function patch(r: Rec, change: Partial<Rec>) {
    const next = { ...r, ...change }
    setRows((rs) => rs?.map((x) => (x.id === r.id ? next : x)) ?? null)
    try { await api(`/api/records/${r.id}`, { method: 'PUT', json: next }); onListsChanged() }
    catch (e) { setRows((rs) => rs?.map((x) => (x.id === r.id ? r : x)) ?? null); setError(e instanceof ApiError ? e.message : 'Change not saved.') }
  }

  return (
    <>
      <div className="filter-bar">
        <div className="stepper">
          {singleMonth && <button aria-label="Previous month" onClick={() => set({ monthFrom: shift(f.monthFrom!, 'MONTH', -1), monthTo: shift(f.monthFrom!, 'MONTH', -1) })}><Chevron dir="left" /></button>}
          <h1 className="period-label">{rangeLabel(f)}</h1>
          {singleMonth && <button aria-label="Next month" onClick={() => set({ monthFrom: shift(f.monthFrom!, 'MONTH', 1), monthTo: shift(f.monthFrom!, 'MONTH', 1) })}><Chevron dir="right" /></button>}
        </div>
        {!singleMonth && <button className="btn ghost" onClick={() => set({ monthFrom: thisMonth(), monthTo: thisMonth(), dateFrom: undefined, dateTo: undefined })}>Back to this month</button>}
        {singleMonth && <button className="btn ghost" onClick={() => set({ monthFrom: undefined, monthTo: undefined })}>All time</button>}
        <div className="actions">
          <a className="btn" href="#/records/import">Import Revolut CSV</a>
          <button className="btn primary" onClick={() => setEditing('new')}>Add record</button>
        </div>
      </div>

      <div className="filters" role="search">
        <label className="field inline grow"><span className="sr-only">Search</span>
          <input type="search" placeholder="Search descriptions and notes" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <Select label="Type" value={f.type} onChange={(v) => set({ type: v })} options={[['Expense', 'Expenses'], ['Income', 'Income']]} />
        <Select label="Category" value={f.category} onChange={(v) => set({ category: v })}
          options={[['none', 'Uncategorised'], ...lists.categories.map((c) => [c.id, c.kind === 'income' ? `${c.name} (income)` : c.name] as [string, string])]} />
        <Select label="Paid with" value={f.paymentMethod} onChange={(v) => set({ paymentMethod: v })}
          options={[['none', 'Not set'], ...lists.paymentMethods.map((m) => [m.id, m.name] as [string, string])]} />
        <Select label="Avoidable" value={f.avoidable} onChange={(v) => set({ avoidable: v })}
          options={[['untagged', 'Avoidable: not tagged'], ['Yes', 'Yes'], ['Partly', 'Partly'], ['No', 'No']]} />
        <Select label="How often" value={f.recurrence} onChange={(v) => set({ recurrence: v })}
          options={[['untagged', 'How often: not tagged'], ...RECURRENCE.map((v) => [v, v] as [string, string])]} />
        {filtered && <button className="link" onClick={() => { setQ(''); set({ category: undefined, paymentMethod: undefined, type: undefined, avoidable: undefined, recurrence: undefined, q: undefined }) }}>Clear filters</button>}
      </div>

      {error && <div className="banner" role="alert"><p>{error}</p><button className="btn" onClick={() => setReload((n) => n + 1)}>Retry</button></div>}

      <p className="tally" aria-live="polite">
        {rows && <>{rows.length} record{rows.length === 1 ? '' : 's'} · spent <strong>{money(totals.exp)}</strong> · earned <strong>{money(totals.inc)}</strong></>}
      </p>
      {truncated && <p className="muted small">Showing the latest 2,000. Narrow the filters to see the rest.</p>}

      {rows && rows.length === 0 && !loading && (
        <div className="empty-tag">
          <p>{filtered ? 'Nothing matches these filters.' : 'No records in this period.'}</p>
          {!filtered && <button className="btn primary" onClick={() => setEditing('new')}>Add record</button>}
        </div>
      )}

      {rows && rows.length > 0 && (
        <div className={'table-wrap' + (loading ? ' stale' : '')}>
          <table className="records">
            <thead><tr><th scope="col">Date</th><th scope="col">Description</th><th scope="col">Category</th><th scope="col">Paid with</th><th scope="col">Avoidable</th><th scope="col">How often</th><th scope="col" className="num">Amount</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const cat = r.categoryId ? catById.get(r.categoryId) : undefined
                const kind = r.type === 'Income' ? 'income' : 'expense'
                return (
                  <tr key={r.id} onClick={(e) => { if (!(e.target as HTMLElement).closest('select, button')) setEditing(r) }}>
                    <td className="date">
                      {r.dateTime
                        ? <>{fmtDate(r.dateTime.slice(0, 10), { weekday: 'short', day: 'numeric', month: 'short' })}<span className="muted"> {r.dateTime.slice(11, 16)}</span></>
                        : <span className="muted">No date · {fmtDate(r.month, { month: 'short' })}</span>}
                    </td>
                    <td className="desc"><button className="row-open" onClick={() => setEditing(r)}>{r.description}</button>{r.notes && <span className="muted small"> · {r.notes}</span>}</td>
                    <td>
                      <span className="cell-select"><Swatch color={cat ? cat.color : null} />
                        <select aria-label={`Category for ${r.description}`} value={r.categoryId ?? ''} onChange={(e) => patch(r, { categoryId: e.target.value || null })}>
                          <option value="">Uncategorised</option>
                          {lists.categories.filter((c) => c.kind === kind).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </span>
                    </td>
                    <td>{r.paymentMethodId ? pmById.get(r.paymentMethodId)?.name : <span className="muted">—</span>}</td>
                    <td>
                      {r.type === 'Expense' && (
                        <select className={'plain' + (r.avoidable ? '' : ' unset')} aria-label={`Avoidable for ${r.description}`} value={r.avoidable ?? ''}
                          onChange={(e) => patch(r, { avoidable: (e.target.value || null) as Rec['avoidable'] })}>
                          <option value="">Not tagged</option><option>Yes</option><option>Partly</option><option>No</option>
                        </select>
                      )}
                    </td>
                    <td>
                      {r.type === 'Expense' && (
                        <select className={'plain' + (r.recurrence ? '' : ' unset')} aria-label={`How often for ${r.description}`} value={r.recurrence ?? ''}
                          onChange={(e) => patch(r, { recurrence: (e.target.value || null) as Rec['recurrence'] })}>
                          <option value="">How often?</option>{RECURRENCE.map((v) => <option key={v}>{v}</option>)}
                        </select>
                      )}
                    </td>
                    <td className={'num amt' + (r.type === 'Income' ? ' pos' : '')}>{r.type === 'Income' ? '+' : '−'}{money(r.amount)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {!rows && loading && <div className="sk"><div className="sk-block" /></div>}

      {editing && (
        <RecordPanel rec={editing === 'new' ? null : editing} lists={lists} defaultDate={initial.add ?? (singleMonth && f.monthFrom !== thisMonth() ? f.monthFrom! : today())}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); setReload((n) => n + 1); onListsChanged() }} />
      )}
    </>
  )
}

function Select({ label, value, onChange, options }: { label: string; value?: string; onChange: (v?: string) => void; options: [string, string][] }) {
  return (
    <label className="field inline"><span className="sr-only">{label}</span>
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)} className={value ? 'active' : ''}>
        <option value="">{label}: all</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  )
}

export const parseAmount = (s: string) => Number(s.replace(/\s/g, '').replace(',', '.'))

export function RecordPanel({ rec, lists, defaultDate, onClose, onSaved }:
  { rec: Rec | null; lists: Lists; defaultDate: string; onClose: () => void; onSaved: () => void }) {
  const [type, setType] = useState<Rec['type']>(rec?.type ?? 'Expense')
  const [amount, setAmount] = useState(rec ? rec.amount.toFixed(2) : '')
  const [description, setDescription] = useState(rec?.description ?? '')
  const [recurrence, setRecurrence] = useState<Rec['recurrence']>(rec?.recurrence ?? null)
  const [undated, setUndated] = useState(rec ? rec.dateTime == null : false)
  const [dateTime, setDateTime] = useState(rec?.dateTime ?? `${defaultDate}T12:00`)
  const [month, setMonth] = useState((rec?.month ?? defaultDate).slice(0, 7))
  const [categoryId, setCategoryId] = useState(rec?.categoryId ?? '')
  const [paymentMethodId, setPaymentMethodId] = useState(rec?.paymentMethodId ?? '')
  const [avoidable, setAvoidable] = useState<Rec['avoidable']>(rec?.avoidable ?? null)
  const [reason, setReason] = useState(rec?.reason ?? '')
  const [notes, setNotes] = useState(rec?.notes ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const first = useRef<HTMLInputElement>(null)
  const kind = type === 'Income' ? 'income' : 'expense'
  const categories: Category[] = lists.categories.filter((c) => c.kind === kind)

  useEffect(() => { first.current?.focus() }, [])
  useEffect(() => {
    // Escape closes the topmost thing only: an open calendar, palette or dropdown handles its own.
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !(e.target as HTMLElement).closest('select, [popover]')) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function switchType(t: Rec['type']) {
    setType(t)
    if (categoryId && !lists.categories.some((c) => c.id === categoryId && c.kind === (t === 'Income' ? 'income' : 'expense'))) setCategoryId('')
    if (t === 'Income') { setAvoidable(null); setRecurrence(null); setReason('') }
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    const a = parseAmount(amount)
    if (!description.trim()) return setError('Add a short description.')
    if (!(a > 0)) return setError('Enter an amount above zero, like 12.50.')
    const body: Rec = {
      description: description.trim(), amount: Math.round(a * 100) / 100, type,
      dateTime: undated ? null : dateTime, month: undated ? `${month}-01` : `${dateTime.slice(0, 7)}-01`,
      categoryId: categoryId || null, paymentMethodId: paymentMethodId || null,
      avoidable: type === 'Expense' ? avoidable : null, recurrence: type === 'Expense' ? recurrence : null, reason: type === 'Expense' ? reason || null : null, notes: notes.trim() || null,
    }
    // Keep a record's own month when its date didn't change (e.g. a bill filed under the previous month).
    if (rec && !undated && rec.dateTime === dateTime) body.month = rec.month
    setBusy(true); setError('')
    try {
      await api(rec ? `/api/records/${rec.id}` : '/api/records', { method: rec ? 'PUT' : 'POST', json: body })
      onSaved()
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Not saved.') } finally { setBusy(false) }
  }

  async function remove() {
    setBusy(true)
    try { await api(`/api/records/${rec!.id}`, { method: 'DELETE' }); onSaved() }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Not deleted.'); setBusy(false) }
  }

  return (
    <aside className="sheet" aria-labelledby="sheet-h">
      <div className="sheet-head">
        <h2 id="sheet-h">{rec ? 'Edit record' : 'New record'}</h2>
        <button className="btn ghost" onClick={onClose}>Close</button>
      </div>
      <form onSubmit={save} className="stack">
        <div className="seg wide" role="group" aria-label="Type">
          <button type="button" aria-pressed={type === 'Expense'} onClick={() => switchType('Expense')}>Expense</button>
          <button type="button" aria-pressed={type === 'Income'} onClick={() => switchType('Income')}>Income</button>
        </div>
        <label className="field"><span>Description</span>
          <input ref={first} required maxLength={200} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Lidl" />
        </label>
        <label className="field"><span>Amount (€)</span>
          <input required inputMode="decimal" autoComplete="off" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
        </label>
        {!undated
          ? <div className="date-time">
              <DateField label="Date" value={dateTime.slice(0, 10)} onChange={(d) => setDateTime(d + dateTime.slice(10))} />
              <label className="field"><span>Time</span>
                <input type="time" step="1" required value={dateTime.slice(11)} onChange={(e) => setDateTime(dateTime.slice(0, 11) + (e.target.value || '12:00'))} /></label>
            </div>
          : <MonthField label="Month" value={month} onChange={setMonth} />}
        <label className="check"><input type="checkbox" checked={undated} onChange={(e) => setUndated(e.target.checked)} /> I don’t know the exact date</label>
        <label className="field"><span>Category</span>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Uncategorised</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {categories.length === 0 && <span className="muted small">No {kind} categories yet. <a href="#/records/categories">Add one</a></span>}
        </label>
        <label className="field"><span>Paid with</span>
          <select value={paymentMethodId} onChange={(e) => setPaymentMethodId(e.target.value)}>
            <option value="">Not set</option>
            {lists.paymentMethods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
        {type === 'Expense' && (
          <>
            <fieldset className="field">
              <legend>How often?</legend>
              <div className="seg wide">
                {RECURRENCE.map((v) => (
                  <button type="button" key={v} aria-pressed={recurrence === v} onClick={() => setRecurrence(recurrence === v ? null : v)}>{v}</button>
                ))}
              </div>
            </fieldset>
            <fieldset className="field">
              <legend>Avoidable?</legend>
              <div className="seg wide">
                {(['Yes', 'Partly', 'No'] as const).map((v) => (
                  <button type="button" key={v} aria-pressed={avoidable === v} onClick={() => setAvoidable(avoidable === v ? null : v)}>{v}</button>
                ))}
              </div>
            </fieldset>
            <label className="field"><span>Why did you buy it? (optional)</span>
              <select value={reason} onChange={(e) => setReason(e.target.value)}>
                <option value="">—</option>
                {REASONS.map((r) => <option key={r}>{r}</option>)}
              </select>
            </label>
          </>
        )}
        <label className="field"><span>Notes (optional)</span>
          <textarea rows={3} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="row">
          <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : rec ? 'Save changes' : 'Add record'}</button>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
        </div>
      </form>
      {rec && (
        <div className="danger">
          {!confirmDelete
            ? <button className="link" onClick={() => setConfirmDelete(true)}>Delete this record</button>
            : <div className="stack">
                <p>Delete “{rec.description}”, {money(rec.amount)}? This can’t be undone.</p>
                <div className="row">
                  <button className="btn danger-btn" onClick={remove} disabled={busy}>Delete</button>
                  <button className="btn" onClick={() => setConfirmDelete(false)}>Keep it</button>
                </div>
              </div>}
        </div>
      )}
    </aside>
  )
}
