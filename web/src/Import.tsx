import { useState } from 'react'
import { api, ApiError, fmtDate, money, type Lists } from './lib'
import { Swatch } from './Records'

interface Line {
  line: number; dateTime: string | null; description: string; amount: number | null; type: 'Expense' | 'Income'
  status: 'NEW' | 'DUPLICATE' | 'SKIPPED' | 'FLAGGED'; reason: string | null; suggestedCategoryId: string | null
}

export function Import({ lists, onDone }: { lists: Lists; onDone: () => void }) {
  const [lines, setLines] = useState<Line[] | null>(null)
  const [pick, setPick] = useState<Record<number, { on: boolean; categoryId: string }>>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ added: number; alreadyThere: number } | null>(null)
  const [showSkipped, setShowSkipped] = useState(false)

  async function upload(file: File) {
    setError(''); setResult(null); setLines(null); setBusy(true)
    const form = new FormData()
    form.append('file', file)
    try {
      const ls = await api<Line[]>('/api/records/import/revolut/preview', { method: 'POST', form })
      setLines(ls)
      setPick(Object.fromEntries(ls.filter((l) => l.status === 'NEW').map((l) => [l.line, { on: true, categoryId: l.suggestedCategoryId ?? '' }])))
    } catch (e) { setError(e instanceof ApiError ? e.message : 'The file couldn’t be read.') } finally { setBusy(false) }
  }

  const fresh = lines?.filter((l) => l.status === 'NEW') ?? []
  const others = lines?.filter((l) => l.status !== 'NEW') ?? []
  const chosen = fresh.filter((l) => pick[l.line]?.on)
  const count = (s: Line['status']) => lines?.filter((l) => l.status === s).length ?? 0

  async function commit() {
    setBusy(true); setError('')
    try {
      const r = await api<{ added: number; alreadyThere: number }>('/api/records/import/revolut', {
        method: 'POST',
        json: chosen.map((l) => ({ dateTime: l.dateTime, description: l.description, amount: l.amount, type: l.type, categoryId: pick[l.line].categoryId || null })),
      })
      setResult(r); setLines(null); onDone()
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Nothing was imported.') } finally { setBusy(false) }
  }

  return (
    <div className="import">
      <section className="panel">
        <h2>Import a Revolut statement</h2>
        <ol className="steps">
          <li>In the Revolut app: <strong>Accounts → Statement → Excel/CSV</strong>, pick the period, and download it.</li>
          <li>Choose the file here. Nothing is saved until you confirm.</li>
        </ol>
        <label className="btn primary file">
          <input type="file" accept=".csv,text/csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = '' }} />
          {busy && !lines ? 'Reading…' : 'Choose CSV file'}
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        {result && (
          <p className="notice" role="status">
            Added {result.added} record{result.added === 1 ? '' : 's'}{result.alreadyThere > 0 && `; ${result.alreadyThere} were already there`}.{' '}
            <a href="#/records?category=none">Sort the uncategorised ones</a>
          </p>
        )}
      </section>

      {lines && (
        <section className="panel">
          <div className="panel-head">
            <h2>{fresh.length} new · {count('DUPLICATE')} already recorded · {count('SKIPPED')} skipped{count('FLAGGED') > 0 && ` · ${count('FLAGGED')} need attention`}</h2>
          </div>
          {fresh.length === 0
            ? <p className="empty">Everything in this file is already recorded or isn’t a payment. Nothing to add.</p>
            : (
              <div className="table-wrap">
                <table className="records import-table">
                  <thead><tr><th scope="col"><span className="sr-only">Include</span></th><th scope="col">Date</th><th scope="col">Description</th><th scope="col">Category</th><th scope="col" className="num">Amount</th></tr></thead>
                  <tbody>
                    {fresh.map((l) => {
                      const p = pick[l.line]
                      const cats = lists.categories.filter((c) => c.kind === (l.type === 'Income' ? 'income' : 'expense'))
                      const cat = cats.find((c) => c.id === p.categoryId)
                      return (
                        <tr key={l.line} className={p.on ? '' : 'off'}>
                          <td><input type="checkbox" aria-label={`Include ${l.description}`} checked={p.on} onChange={(e) => setPick({ ...pick, [l.line]: { ...p, on: e.target.checked } })} /></td>
                          <td className="date">{fmtDate(l.dateTime!.slice(0, 10), { weekday: 'short', day: 'numeric', month: 'short' })}<span className="muted"> {l.dateTime!.slice(11, 16)}</span></td>
                          <td>{l.description}</td>
                          <td>
                            <span className="cell-select"><Swatch color={cat ? cat.color : null} />
                              <select aria-label={`Category for ${l.description}`} value={p.categoryId} onChange={(e) => setPick({ ...pick, [l.line]: { ...p, categoryId: e.target.value } })}>
                                <option value="">Uncategorised</option>
                                {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                              </select>
                            </span>
                          </td>
                          <td className={'num amt' + (l.type === 'Income' ? ' pos' : '')}>{l.type === 'Income' ? '+' : '−'}{money(l.amount!)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          {others.length > 0 && (
            <details className="table-view" open={showSkipped} onToggle={(e) => setShowSkipped((e.target as HTMLDetailsElement).open)}>
              <summary>Show the {others.length} row{others.length === 1 ? '' : 's'} that won’t be added</summary>
              <table>
                <thead><tr><th scope="col">Row</th><th scope="col">Description</th><th scope="col">Why</th></tr></thead>
                <tbody>{others.map((l) => <tr key={l.line}><th scope="row">{l.line}</th><td>{l.description}</td><td>{l.reason}</td></tr>)}</tbody>
              </table>
            </details>
          )}
          <div className="row sticky-actions">
            {fresh.length > 0 && (
              <button className="btn primary" disabled={busy || chosen.length === 0} onClick={commit}>
                {busy ? 'Adding…' : `Add ${chosen.length} record${chosen.length === 1 ? '' : 's'}`}
              </button>
            )}
            <button className="btn" onClick={() => setLines(null)}>{fresh.length > 0 ? 'Cancel' : 'Done'}</button>
          </div>
        </section>
      )}
    </div>
  )
}
