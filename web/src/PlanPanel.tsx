import { useEffect, useRef, useState, type FormEvent } from 'react'
import { api, ApiError, FREQUENCIES, money, type Lists, type Plan } from './lib'
import { DateField } from './Controls'
import { parseAmount } from './Records'

const REPEATS: Record<Plan['frequency'], string> = { Once: 'Once', Monthly: 'Monthly', Quarterly: 'Every 3 months', Annual: 'Yearly' }

/** Add or edit a planned expense: one due date, or a rule that repeats. Same sheet as the record form. */
export function PlanPanel({ plan, lists, defaultDate, onClose, onSaved }:
  { plan: Plan | null; lists: Lists; defaultDate: string; onClose: () => void; onSaved: () => void }) {
  const [description, setDescription] = useState(plan?.description ?? '')
  const [amount, setAmount] = useState(plan ? plan.amount.toFixed(2) : '')
  const [firstDue, setFirstDue] = useState(plan?.firstDue ?? defaultDate)
  const [frequency, setFrequency] = useState<Plan['frequency']>(plan?.frequency ?? 'Monthly')
  const [ends, setEnds] = useState(plan?.lastDue != null)
  const [lastDue, setLastDue] = useState(plan?.lastDue ?? firstDue)
  const [categoryId, setCategoryId] = useState(plan?.categoryId ?? '')
  const [paymentMethodId, setPaymentMethodId] = useState(plan?.paymentMethodId ?? '')
  const [notes, setNotes] = useState(plan?.notes ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const first = useRef<HTMLInputElement>(null)
  const categories = lists.categories.filter((c) => c.kind === 'expense')

  useEffect(() => { first.current?.focus() }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !(e.target as HTMLElement).closest('select, [popover]')) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function save(e: FormEvent) {
    e.preventDefault()
    const a = parseAmount(amount)
    if (!description.trim()) return setError('Add a short description, like “Rent”.')
    if (!(a >= 0)) return setError('Enter an amount, like 33.90.')
    const repeats = frequency !== 'Once'
    if (repeats && ends && lastDue < firstDue) return setError('The last payment can’t be before the first one.')
    const body: Plan = {
      description: description.trim(), amount: Math.round(a * 100) / 100, firstDue, frequency,
      lastDue: repeats && ends ? lastDue : null, categoryId: categoryId || null, paymentMethodId: paymentMethodId || null, notes: notes.trim() || null,
    }
    setBusy(true); setError('')
    try {
      await api(plan ? `/api/plans/${plan.id}` : '/api/plans', { method: plan ? 'PUT' : 'POST', json: body })
      onSaved()
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Not saved.') } finally { setBusy(false) }
  }

  async function remove() {
    setBusy(true)
    try { await api(`/api/plans/${plan!.id}`, { method: 'DELETE' }); onSaved() }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Not deleted.'); setBusy(false) }
  }

  return (
    <aside className="sheet" aria-labelledby="sheet-h">
      <div className="sheet-head">
        <h2 id="sheet-h">{plan ? 'Edit planned expense' : 'New planned expense'}</h2>
        <button className="btn ghost" onClick={onClose}>Close</button>
      </div>
      <form onSubmit={save} className="stack">
        <label className="field"><span>Description</span>
          <input ref={first} required maxLength={200} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Rent" />
        </label>
        <label className="field"><span>Amount (€)</span>
          <input required inputMode="decimal" autoComplete="off" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
        </label>
        <fieldset className="field">
          <legend>Repeats</legend>
          <div className="seg wide">
            {FREQUENCIES.map((f) => <button type="button" key={f} aria-pressed={frequency === f} onClick={() => setFrequency(f)}>{REPEATS[f]}</button>)}
          </div>
        </fieldset>
        <DateField label={frequency === 'Once' ? 'Due on' : 'First due on'} value={firstDue} onChange={setFirstDue} />
        {frequency !== 'Once' && (
          <>
            <label className="check"><input type="checkbox" checked={ends} onChange={(e) => setEnds(e.target.checked)} /> It stops after a certain date</label>
            {ends && <DateField label="Last payment on or before" value={lastDue} onChange={setLastDue} />}
          </>
        )}
        <label className="field"><span>Category</span>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Uncategorised</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="field"><span>Paid with</span>
          <select value={paymentMethodId} onChange={(e) => setPaymentMethodId(e.target.value)}>
            <option value="">Not set</option>
            {lists.paymentMethods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <span className="muted small">Set it so payments from that account are matched to this plan.</span>
        </label>
        <label className="field"><span>Notes (optional)</span>
          <textarea rows={3} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="row">
          <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : plan ? 'Save changes' : 'Add planned expense'}</button>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
        </div>
      </form>
      {plan && (
        <div className="danger">
          {!confirmDelete
            ? <button className="link" onClick={() => setConfirmDelete(true)}>Delete this planned expense</button>
            : <div className="stack">
                <p>Delete “{plan.description}”, {money(plan.amount)}{plan.frequency !== 'Once' ? `, ${REPEATS[plan.frequency].toLowerCase()}` : ''}? Records it already paid stay.</p>
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
