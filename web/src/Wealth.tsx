import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { api, ApiError, fmtDate, money, signed, supabase, today } from './lib'
import { ChangeBars, Donut, Legend, TableView, TimeChart, type Part, type Row, type Seg, type Series } from './Charts'
import { ColorField, DateField, MonthField } from './Controls'
import { Chevron } from './Dashboard'
import { SUGGESTED } from './Lists'
import { parseAmount } from './Records'
import {
  ASSET_CLASSES, CLASS_COLOR, PURPOSES, PURPOSE_COLOR, index, invested, isOpen, liquid, locked, monthsOf, prevMonth,
  type Account, type Wealth,
} from './wealthMath'

type Split = 'purpose' | 'class' | 'account'
const SPLITS: [Split, string][] = [['purpose', 'Purpose'], ['class', 'Asset class'], ['account', 'Account']]
const SAVED = 'var(--income)', MARKET = 'var(--ink)', UNKNOWN = 'var(--ink-3)'
const SUBS = [['', 'Overview'], ['accounts', 'Accounts']] as const

const monthLong = (m: string) => fmtDate(m, { month: 'long', year: 'numeric' })
const monthShort = (m: string) => fmtDate(m, { month: 'short' })
const errorText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback)

export function WealthPage({ sub }: { sub: string }) {
  const [w, setW] = useState<Wealth | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [checkIn, setCheckIn] = useState<string | null>(null)
  const [editing, setEditing] = useState<Account | 'new' | null>(null)

  const load = useCallback(() => {
    api<Wealth>('/api/wealth').then((d) => { setW(d); setError(null) }).catch((e) => setError(e instanceof ApiError ? e : new ApiError(0)))
  }, [])
  useEffect(load, [load])

  return (
    <div className="page wealth-page">
      <nav className="subtabs" aria-label="Wealth sections">
        {SUBS.map(([id, label]) => <a key={id} href={`#/wealth${id ? '/' + id : ''}`} aria-current={sub === id ? 'page' : undefined}>{label}</a>)}
      </nav>
      {error && (
        <div className="banner" role="alert">
          <p>{error.message} {error.status === 401 ? 'Sign in again to continue.' : 'Check that the API is running, then retry.'}</p>
          {error.status === 401 ? <button className="btn" onClick={() => supabase.auth.signOut()}>Sign in again</button>
            : <button className="btn" onClick={load}>Retry</button>}
        </div>
      )}
      {!w && !error && <div className="sk"><div className="sk-block" /></div>}
      {w && sub === '' && <Overview w={w} onCheckIn={setCheckIn} />}
      {w && sub === 'accounts' && <Accounts w={w} onEdit={setEditing} />}
      {w && checkIn && <CheckIn w={w} initial={checkIn} onClose={() => setCheckIn(null)} onSaved={() => { setCheckIn(null); load() }} />}
      {w && editing && <AccountPanel w={w} account={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
    </div>
  )
}

// ---------------------------------------------------------------- overview

function Overview({ w, onCheckIn }: { w: Wealth; onCheckIn: (month: string) => void }) {
  const thisMonth = today().slice(0, 8) + '01'
  const x = useMemo(() => index(w), [w])
  const [year, setYear] = useState(() => +([...x.months].sort().pop() ?? thisMonth).slice(0, 4))
  const [split, setSplit] = useState<Split>('purpose')
  const months = monthsOf(year)
  const recorded = months.filter((m) => x.months.has(m))
  const latest = recorded[recorded.length - 1]

  if (w.accounts.length === 0) {
    return (
      <div className="empty-tag wealth-empty">
        <p>Add the places your money sits (current accounts, cash, savings, investments, pension) and you’ll check in once a month to see how it grows.</p>
        <a className="btn primary" href="#/wealth/accounts">Add your accounts</a>
      </div>
    )
  }

  return (
    <>
      <div className="period-bar" role="toolbar" aria-label="Year and split">
        <div className="stepper">
          <button aria-label="Previous year" onClick={() => setYear(year - 1)}><Chevron dir="left" /></button>
          <h1 className="period-label" aria-live="polite">{year}</h1>
          <button aria-label="Next year" onClick={() => setYear(year + 1)}><Chevron dir="right" /></button>
        </div>
        <div className="seg" role="group" aria-label="Split charts by">
          {SPLITS.map(([s, l]) => <button key={s} aria-pressed={split === s} onClick={() => setSplit(s)}>{l}</button>)}
        </div>
        <button className="btn primary push" onClick={() => onCheckIn(thisMonth)}>Monthly check-in</button>
      </div>
      {!latest ? (
        <div className="empty-tag wealth-empty">
          <p>No balances recorded in {year}.</p>
          <button className="btn primary" onClick={() => onCheckIn(year === +thisMonth.slice(0, 4) ? thisMonth : `${year}-01-01`)}>Record balances</button>
        </div>
      ) : (
        <div className="board">
          <Hero x={x} month={latest} first={recorded[0]} />
          <NetWorth w={w} x={x} months={months} latest={latest} split={split} />
          <Allocation w={w} x={x} month={latest} split={split} />
          <Changes x={x} months={months} latest={latest} />
          <Emergency w={w} x={x} month={latest} />
          <Investments w={w} x={x} months={months} month={latest} />
          <Grid w={w} x={x} months={months} latest={latest} thisMonth={thisMonth} onCheckIn={onCheckIn} />
        </div>
      )}
    </>
  )
}

type Ix = ReturnType<typeof index>

function Hero({ x, month, first }: { x: Ix; month: string; first: string }) {
  const total = x.total(month)
  const prev = prevMonth(month)
  const missing = x.missing(month)
  const lockedNow = x.total(month, (a) => locked(a, month))
  const fromStart = first !== month ? total - x.total(first) : null
  return (
    <section className="panel hero" aria-labelledby="w-hero-h">
      <h2 id="w-hero-h" className="sr-only">Net worth</h2>
      <span className="muted small">Net worth, {monthLong(month)}</span>
      <span className="net-figure">{money(total)}</span>
      {x.months.has(prev) && <p>{signed(total - x.total(prev))} since {fmtDate(prev, { month: 'long' })}</p>}
      {fromStart != null && <p className="muted">{signed(fromStart)} since {fmtDate(first, { month: 'long' })}</p>}
      {missing.length > 0 && (
        <p className="attention">Incomplete: no balance for <strong>{missing.map((a) => a.name).join(', ')}</strong>.</p>
      )}
      <div className="stack-bar avail-bar" aria-hidden="true" hidden={total <= 0}>
        <span style={{ flexGrow: total - lockedNow, background: 'var(--ink)' }} />
        {lockedNow > 0 && <span style={{ flexGrow: lockedNow, background: 'var(--ink-3)' }} />}
      </div>
      <dl className="io">
        <div><dt><i className="key" style={{ background: 'var(--ink)' }} />Available</dt><dd>{money(total - lockedNow)}</dd></div>
        <div><dt><i className="key" style={{ background: 'var(--ink-3)' }} />Locked</dt><dd>{money(lockedNow)}</dd></div>
        <div><dt>Liquid</dt><dd>{money(x.total(month, liquid))}</dd></div>
      </dl>
    </section>
  )
}

/** The groups a split produces, with the accounts in each. Only groups that hold something this year. */
function groups(w: Wealth, x: Ix, months: string[], split: Split) {
  const used = w.accounts.filter((a) => months.some((m) => x.get(a, m)))
  if (split === 'account') return used.map((a) => ({ key: a.id!, label: a.name, color: a.color, accounts: [a] }))
  const keys = split === 'purpose' ? PURPOSES : ASSET_CLASSES
  return keys.map((k) => ({
    key: k, label: k, color: split === 'purpose' ? PURPOSE_COLOR[k as keyof typeof PURPOSE_COLOR] : CLASS_COLOR[k as keyof typeof CLASS_COLOR],
    accounts: used.filter((a) => (split === 'purpose' ? a.purpose : a.assetClass) === k),
  })).filter((g) => g.accounts.length > 0)
}

function NetWorth({ w, x, months, latest, split }: { w: Wealth; x: Ix; months: string[]; latest: string; split: Split }) {
  const gs = groups(w, x, months, split)
  const series: Series[] = gs.map((g) => ({ name: g.label, color: g.color }))
  const shown = months.filter((m) => m <= latest)
  const rows: Row[] = shown.map((m) => {
    const has = x.months.has(m)
    return {
      label: monthShort(m), long: has ? `${monthLong(m)} · ${money(x.total(m))}` : `${monthLong(m)} · not recorded`,
      values: gs.map((g) => (has ? g.accounts.reduce((t, a) => t + (x.get(a, m)?.value ?? 0), 0) : null)),
    }
  })
  return (
    <section className="panel trend" aria-labelledby="w-nw-h">
      <div className="panel-head"><h2 id="w-nw-h">Net worth by month</h2><Legend series={series} /></div>
      <TimeChart rows={rows} series={series} mode="stack" label={`Net worth each month, split by ${split}`} />
      <TableView caption="Net worth by month" head={['Month', ...gs.map((g) => g.label), 'Total']}
        rows={shown.map((m, i) => [monthLong(m), ...rows[i].values.map((v) => (v == null ? '—' : money(v))), x.months.has(m) ? money(x.total(m)) : '—'])} />
    </section>
  )
}

function Allocation({ w, x, month, split }: { w: Wealth; x: Ix; month: string; split: Split }) {
  const segs: Seg[] = groups(w, x, [month], split)
    .map((g) => ({ key: g.key, label: g.label, color: g.color, amount: g.accounts.reduce((t, a) => t + Math.max(0, x.get(a, month)?.value ?? 0), 0) }))
    .filter((s) => s.amount > 0).sort((a, b) => b.amount - a.amount)
  const total = segs.reduce((t, s) => t + s.amount, 0)
  return (
    <section className="panel w-alloc" aria-labelledby="w-alloc-h">
      <div className="panel-head"><h2 id="w-alloc-h">Where it sits</h2><span className="muted small">{monthLong(month)}</span></div>
      <div className="donut-col">
        <Donut segs={segs} total={total} centre={<><span className="muted small">Total</span><strong>{money(total)}</strong></>} />
        <ul className="legend vertical">
          {segs.map((s) => <li key={s.key}><span className="key" style={{ background: s.color }} />{s.label} <b>{Math.round((s.amount / total) * 100)}%</b></li>)}
        </ul>
      </div>
      <TableView caption="Where the money sits" head={['Group', 'Amount', 'Share']}
        rows={segs.map((s) => [s.label, money(s.amount), `${Math.round((s.amount / total) * 100)}%`])} />
    </section>
  )
}

function Changes({ x, months, latest }: { x: Ix; months: string[]; latest: string }) {
  const shown = months.filter((m) => m <= latest)
  const changes = shown.map((m) => x.change(m))
  const rows = shown.map((m, i) => {
    const c = changes[i]
    const parts: Part[] = !c ? [] : c.market == null ? [{ name: 'Change (split unknown)', color: UNKNOWN, value: c.delta }]
      : [{ name: 'Saved', color: SAVED, value: c.saved! }, { name: 'Market', color: MARKET, value: c.market }]
    return { label: monthShort(m), long: monthLong(m) + (c?.incomplete ? ' · incomplete' : ''), parts }
  })
  const known = changes.filter((c) => c != null)
  const delta = known.reduce((t, c) => t + c.delta, 0)
  const unknown = known.filter((c) => c.market == null).length
  const market = known.reduce((t, c) => t + (c.market ?? 0), 0)
  return (
    <section className="panel w-change" aria-labelledby="w-ch-h">
      <div className="panel-head">
        <h2 id="w-ch-h">What changed each month</h2>
        <Legend series={[{ name: 'Saved', color: SAVED }, { name: 'Market', color: MARKET }, ...(unknown ? [{ name: 'Split unknown', color: UNKNOWN }] : [])]} />
      </div>
      {known.length === 0 ? <p className="empty">Record two months in a row to see what changed.</p> : (
        <>
          <p className="summary">
            <strong>{signed(delta)}</strong> over {known.length} month{known.length > 1 ? 's' : ''}
            {unknown < known.length && <>; the market added <strong>{signed(market)}</strong> where contributions are known</>}.
          </p>
          <ChangeBars rows={rows} label="Change in net worth each month, split into money saved and market movement" />
          {unknown > 0 && (
            <p className="muted small">For {unknown} month{unknown > 1 ? 's' : ''} it’s not recorded what you put into your investments, so saved and market can’t be told apart. Add it in the month’s check-in.</p>
          )}
          <TableView caption="Change each month" head={['Month', 'Change', 'Saved', 'Market']}
            rows={shown.map((m, i) => { const c = changes[i]; return [monthLong(m), c ? signed(c.delta) : '—', c?.saved == null ? '—' : signed(c.saved), c?.market == null ? '—' : signed(c.market)] })} />
        </>
      )}
    </section>
  )
}

function Emergency({ w, x, month }: { w: Wealth; x: Ix; month: string }) {
  const accs = w.accounts.filter((a) => a.purpose === 'Emergency fund' && isOpen(a, month))
  const value = accs.reduce((t, a) => t + (x.get(a, month)?.value ?? 0), 0)
  const target = accs.reduce((t, a) => t + (a.target ?? 0), 0)
  const pct = target ? Math.min(100, Math.round((value / target) * 100)) : 0
  return (
    <section className="panel w-emerg" aria-labelledby="w-em-h">
      <div className="panel-head"><h2 id="w-em-h">Emergency fund</h2></div>
      {accs.length === 0 ? <p className="empty">No account is marked as your emergency fund. <a href="#/wealth/accounts">Choose one</a></p> : (
        <>
          <p className="summary"><strong>{money(value)}</strong>{target ? <> of {money(target)} target</> : <> in {accs.map((a) => a.name).join(', ')}</>}</p>
          {target > 0 ? (
            <>
              <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Emergency fund target reached">
                <span style={{ width: `${pct}%` }} />
              </div>
              <p className="muted small">{value >= target ? 'Target reached.' : `${pct}% there, ${money(target - value)} to go.`}</p>
            </>
          ) : <p className="muted small">Set a target in <a href="#/wealth/accounts">Accounts</a> to track progress, for example six months of expenses.</p>}
        </>
      )}
    </section>
  )
}

function Investments({ w, x, months, month }: { w: Wealth; x: Ix; months: string[]; month: string }) {
  const list = w.accounts.filter((a) => invested(a) && x.get(a, month))
  const [pick, setPick] = useState<string | null>(null)
  const sel = list.find((a) => a.id === pick) ?? list[0]
  if (!sel) return null
  const shown = months.filter((m) => m <= month)
  const series: Series[] = [{ name: 'Value', color: sel.color }, { name: 'Put in', color: 'var(--ink-2)', dashed: true }]
  const rows: Row[] = shown.map((m) => {
    const b = x.get(sel, m)
    return { label: monthShort(m), long: monthLong(m), values: [b?.value ?? null, b ? x.putIn(sel, m) : null] }
  })
  const unknown = list.filter((a) => x.putIn(a, month) == null)
  return (
    <section className="panel w-invest" aria-labelledby="w-inv-h">
      <div className="panel-head">
        <h2 id="w-inv-h">Investments</h2>
        <label className="field inline"><span className="sr-only">Investment to chart</span>
          <select value={sel.id} onChange={(e) => setPick(e.target.value)}>{list.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
        </label>
      </div>
      <Legend series={series} />
      <TimeChart rows={rows} series={series} mode="line" height={220} label={`${sel.name}: value against money put in`} />
      <table className="gains">
        <thead><tr><th scope="col">Investment</th><th scope="col">Value</th><th scope="col">Put in</th><th scope="col">Gain</th></tr></thead>
        <tbody>
          {list.map((a) => {
            const v = x.get(a, month)!.value, p = x.putIn(a, month)
            const g = p == null ? null : v - p
            return (
              <tr key={a.id}>
                <th scope="row"><span className="key" style={{ background: a.color }} />{a.name}<span className="muted small"> · {a.assetClass}</span></th>
                <td>{money(v)}</td>
                <td>{p == null ? <span className="muted">Unknown</span> : money(p)}</td>
                <td className={g == null ? '' : g < 0 ? 'neg' : 'pos'}>{g == null ? '—' : <>{signed(g)}{p ? <span className="muted small"> {(g / p * 100).toFixed(1)}%</span> : null}</>}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {unknown.length > 0 && (
        <p className="muted small">Gain needs what you put in: set it on {unknown.map((a) => a.name).join(', ')} in <a href="#/wealth/accounts">Accounts</a>, then note new contributions at each check-in.</p>
      )}
    </section>
  )
}

function Grid({ w, x, months, latest, thisMonth, onCheckIn }:
  { w: Wealth; x: Ix; months: string[]; latest: string; thisMonth: string; onCheckIn: (m: string) => void }) {
  const end = latest > thisMonth ? latest : thisMonth
  const rows = months.filter((m) => m <= end)
  const cols = w.accounts.filter((a) => rows.some((m) => isOpen(a, m) || x.get(a, m)))
  return (
    <section className="panel w-grid" aria-labelledby="w-grid-h">
      <div className="panel-head"><h2 id="w-grid-h">Balances</h2><span className="muted small">Select a month to edit it</span></div>
      <div className="table-wrap">
        <table className="wgrid">
          <thead>
            <tr>
              <th scope="col">Month</th>
              {cols.map((a) => <th key={a.id} scope="col" className="num"><span className="key" style={{ background: a.color }} /> {a.name}</th>)}
              <th scope="col" className="num sub">Liquid</th><th scope="col" className="num sub">Invested</th><th scope="col" className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const has = x.months.has(m)
              return (
                <tr key={m} onClick={() => onCheckIn(m)} className={has ? '' : 'off'}>
                  <th scope="row"><button className="row-open" onClick={(e) => { e.stopPropagation(); onCheckIn(m) }}>{fmtDate(m, { month: 'long' })}</button></th>
                  {cols.map((a) => {
                    const b = x.get(a, m)
                    return <td key={a.id} className="num amt">{b ? money(b.value) : isOpen(a, m) && has ? <span className="gap" title="Not recorded">—</span> : ''}</td>
                  })}
                  <td className="num sub">{has ? money(x.total(m, liquid)) : ''}</td>
                  <td className="num sub">{has ? money(x.total(m, (a) => !liquid(a))) : ''}</td>
                  <td className="num amt">{has ? money(x.total(m)) : <span className="muted small">Not recorded</span>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- check-in

function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !(e.target as HTMLElement).closest('select, [popover]')) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
}

const fmtInput = (n: number | null | undefined) => (n == null ? '' : n.toFixed(2))

/** One month's balances at once, pre-filled from the month before so only what moved needs typing. */
function CheckIn({ w, initial, onClose, onSaved }: { w: Wealth; initial: string; onClose: () => void; onSaved: () => void }) {
  const x = useMemo(() => index(w), [w])
  const [month, setMonth] = useState(initial)
  const accounts = w.accounts.filter((a) => isOpen(a, month) || x.get(a, month))
  const prev = prevMonth(month)
  const fill = useCallback((m: string) => Object.fromEntries(w.accounts.map((a) => {
    const b = x.get(a, m), p = x.get(a, prevMonth(m))
    return [a.id!, { value: fmtInput(b?.value ?? p?.value), contributed: fmtInput(b?.contributed), carried: !b && !!p }]
  })), [w, x])
  const [form, setForm] = useState(() => fill(initial))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const first = useRef<HTMLInputElement>(null)
  useEscape(onClose)
  useEffect(() => { first.current?.focus() }, [])

  const set = (id: string, k: 'value' | 'contributed', v: string) => setForm({ ...form, [id]: { ...form[id], [k]: v, carried: false } })
  const num = (s: string) => (s.trim() === '' ? null : parseAmount(s))
  const total = accounts.reduce((t, a) => t + (num(form[a.id!].value) ?? 0), 0)
  const prevTotal = x.months.has(prev) ? x.total(prev) : null
  const carried = accounts.filter((a) => form[a.id!].carried).length

  async function save(e: FormEvent) {
    e.preventDefault()
    const entries = accounts.map((a) => ({ accountId: a.id!, value: num(form[a.id!].value), contributed: num(form[a.id!].contributed) }))
    const bad = accounts.find((_, i) => Number.isNaN(entries[i].value) || Number.isNaN(entries[i].contributed))
    if (bad) return setError(`Check the numbers for ${bad.name}, like 1250.40.`)
    const orphan = accounts.find((_, i) => entries[i].value == null && entries[i].contributed != null)
    if (orphan) return setError(`Enter ${orphan.name}’s balance as well as what you put in.`)
    setBusy(true); setError('')
    try { await api(`/api/wealth/balances/${month}`, { method: 'PUT', json: entries }); onSaved() }
    catch (err) { setError(errorText(err, 'Not saved.')); setBusy(false) }
  }

  return (
    <aside className="sheet" aria-labelledby="ci-h">
      <div className="sheet-head">
        <h2 id="ci-h">Check-in</h2>
        <button className="btn ghost" onClick={onClose}>Close</button>
      </div>
      <form onSubmit={save} className="stack">
        <MonthField label="Balances for" value={month.slice(0, 7)} onChange={(v) => { const m = v + '-01'; setMonth(m); setForm(fill(m)) }} />
        {carried > 0 && <p className="muted small">{carried} balance{carried > 1 ? 's are' : ' is'} copied from {fmtDate(prev, { month: 'long' })}. Change what moved; clear a field if you didn’t check that account.</p>}
        {accounts.length === 0 && <p className="empty">No accounts were open in {monthLong(month)}.</p>}
        <ul className="checkin">
          {accounts.map((a, i) => (
            <li key={a.id}>
              <div className="ci-name"><span className="key" style={{ background: a.color }} /><b>{a.name}</b><span className="muted small">{a.assetClass}</span></div>
              <label className="field"><span className="sr-only">{a.name} balance (€)</span>
                <input ref={i === 0 ? first : undefined} inputMode="decimal" autoComplete="off" placeholder="Not checked" value={form[a.id!].value}
                  className={form[a.id!].carried ? 'carried' : ''} onChange={(e) => set(a.id!, 'value', e.target.value)} />
              </label>
              {invested(a) && (
                <label className="field ci-put"><span>Put in since last check-in (minus if taken out)</span>
                  <input inputMode="decimal" autoComplete="off" placeholder="0.00" value={form[a.id!].contributed}
                    onChange={(e) => set(a.id!, 'contributed', e.target.value)} />
                </label>
              )}
            </li>
          ))}
        </ul>
        <div className="ci-total" aria-live="polite">
          <span className="muted small">Total</span><strong>{money(total)}</strong>
          {prevTotal != null && <span className="muted small">{signed(total - prevTotal)} vs {fmtDate(prev, { month: 'long' })}</span>}
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="row">
          <button className="btn primary" disabled={busy || accounts.length === 0}>{busy ? 'Saving…' : `Save ${fmtDate(month, { month: 'long' })}`}</button>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </aside>
  )
}

// ---------------------------------------------------------------- accounts

function Accounts({ w, onEdit }: { w: Wealth; onEdit: (a: Account | 'new') => void }) {
  const thisMonth = today().slice(0, 8) + '01'
  const open = w.accounts.filter((a) => !a.closed || a.closed > thisMonth)
  const closed = w.accounts.filter((a) => !open.includes(a))
  const item = (a: Account) => (
    <li key={a.id} className="list-item">
      <div className="list-row">
        <span className="key big" style={{ background: a.color }} />
        <button className="row-open grow" onClick={() => onEdit(a)}>{a.name}</button>
        <span className="muted small tags">{a.purpose} · {a.assetClass}{a.target ? ` · target ${money(a.target)}` : ''}
          {a.closed ? ` · closed ${monthLong(a.closed)}` : locked(a, thisMonth) ? (a.lockedUntil ? ` · locked until ${fmtDate(a.lockedUntil)}` : ' · locked') : ''}</span>
      </div>
    </li>
  )
  return (
    <div className="lists">
      <section className="panel">
        <div className="panel-head"><h2>Accounts</h2><button className="btn" onClick={() => onEdit('new')}>Add account</button></div>
        {open.length === 0 ? <p className="empty">No accounts yet. Add one for each place your money sits.</p> : <ul className="list">{open.map(item)}</ul>}
        {closed.length > 0 && (<><h3 className="sub-h">Closed</h3><ul className="list">{closed.map(item)}</ul></>)}
      </section>
    </div>
  )
}

function AccountPanel({ w, account, onClose, onSaved }: { w: Wealth; account: Account | null; onClose: () => void; onSaved: () => void }) {
  const thisMonth = today().slice(0, 7)
  const used = new Set(w.accounts.map((a) => a.color))
  const [f, setF] = useState(() => ({
    name: account?.name ?? '', institution: account?.institution ?? '', purpose: account?.purpose ?? 'Everyday', assetClass: account?.assetClass ?? 'Cash',
    color: account?.color ?? SUGGESTED.find((c) => !used.has(c)) ?? SUGGESTED[0],
    opened: (account?.opened ?? thisMonth + '-01').slice(0, 7), isClosed: account?.closed != null, closed: (account?.closed ?? thisMonth + '-01').slice(0, 7),
    isLocked: account?.lockedUntil != null, lockedUntil: account?.lockedUntil ?? today(),
    before: fmtInput(account?.contributedBefore), target: fmtInput(account?.target), notes: account?.notes ?? '',
  }))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const first = useRef<HTMLInputElement>(null)
  const balances = account ? w.balances.filter((b) => b.accountId === account.id).length : 0
  useEscape(onClose)
  useEffect(() => { first.current?.focus() }, [])
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF({ ...f, [k]: v })

  async function save(e: FormEvent) {
    e.preventDefault()
    const num = (s: string) => (s.trim() === '' ? null : parseAmount(s))
    const before = num(f.before), target = num(f.target)
    if (!f.name.trim()) return setError('Give the account a name.')
    if (Number.isNaN(before) || (before ?? 0) < 0) return setError('Enter what you put in before as an amount, like 800.')
    if (Number.isNaN(target) || (target != null && target <= 0)) return setError('Enter the target as an amount above zero.')
    if (f.isClosed && f.closed <= f.opened) return setError('It can only close after the first tracked month.')
    const body: Account = {
      name: f.name.trim(), institution: f.institution.trim() || null, purpose: f.purpose, assetClass: f.assetClass, color: f.color,
      lockedUntil: f.isLocked ? f.lockedUntil : null, opened: f.opened + '-01', closed: f.isClosed ? f.closed + '-01' : null,
      contributedBefore: before, target, notes: f.notes.trim() || null, sort: account?.sort ?? 0,
    }
    setBusy(true); setError('')
    try { await api(account ? `/api/wealth/accounts/${account.id}` : '/api/wealth/accounts', { method: account ? 'PUT' : 'POST', json: body }); onSaved() }
    catch (err) { setError(errorText(err, 'Not saved.')); setBusy(false) }
  }

  async function remove() {
    setBusy(true)
    try { await api(`/api/wealth/accounts/${account!.id}`, { method: 'DELETE' }); onSaved() }
    catch (err) { setError(errorText(err, 'Not deleted.')); setBusy(false) }
  }

  const isInvested = f.assetClass !== 'Cash'
  return (
    <aside className="sheet" aria-labelledby="acc-h">
      <div className="sheet-head">
        <h2 id="acc-h">{account ? 'Edit account' : 'New account'}</h2>
        <button className="btn ghost" onClick={onClose}>Close</button>
      </div>
      <form onSubmit={save} className="stack">
        <div className="name-color">
          <ColorField label="Colour on charts" value={f.color} palette={SUGGESTED} onChange={(c) => set('color', c)} />
          <label className="field grow"><span>Name</span>
            <input ref={first} required maxLength={50} value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Trade Republic" />
          </label>
        </div>
        <label className="field"><span>Institution (optional)</span>
          <input maxLength={50} value={f.institution} onChange={(e) => set('institution', e.target.value)} />
        </label>
        <label className="field"><span>What it’s for</span>
          <select value={f.purpose} onChange={(e) => set('purpose', e.target.value as Account['purpose'])}>{PURPOSES.map((p) => <option key={p}>{p}</option>)}</select>
        </label>
        <label className="field"><span>What it’s held in</span>
          <select value={f.assetClass} onChange={(e) => set('assetClass', e.target.value as Account['assetClass'])}>{ASSET_CLASSES.map((p) => <option key={p}>{p}</option>)}</select>
          {f.assetClass === 'Pension fund' && <span className="muted small">Pension funds always count as locked.</span>}
        </label>
        <MonthField label="First month to track" value={f.opened} onChange={(v) => set('opened', v)} />
        <label className="check"><input type="checkbox" checked={f.isClosed} onChange={(e) => set('isClosed', e.target.checked)} /> Closed, or no longer tracked</label>
        {f.isClosed && <MonthField label="No balance from" value={f.closed} onChange={(v) => set('closed', v)} />}
        {f.assetClass !== 'Pension fund' && (
          <>
            <label className="check"><input type="checkbox" checked={f.isLocked} onChange={(e) => set('isLocked', e.target.checked)} /> Locked: can’t be withdrawn before a date</label>
            {f.isLocked && <DateField label="Locked until" value={f.lockedUntil} onChange={(v) => set('lockedUntil', v)} />}
          </>
        )}
        {isInvested && (
          <label className="field"><span>Put in before the first tracked month (€)</span>
            <input inputMode="decimal" autoComplete="off" value={f.before} onChange={(e) => set('before', e.target.value)} placeholder="Unknown" />
            <span className="muted small">Needed to show your gain. Later contributions go in each check-in.</span>
          </label>
        )}
        <label className="field"><span>Target (€, optional)</span>
          <input inputMode="decimal" autoComplete="off" value={f.target} onChange={(e) => set('target', e.target.value)} placeholder="No target" />
        </label>
        <label className="field"><span>Notes (optional)</span>
          <textarea rows={3} maxLength={2000} value={f.notes} onChange={(e) => set('notes', e.target.value)} />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="row">
          <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : account ? 'Save changes' : 'Add account'}</button>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
        </div>
      </form>
      {account && (
        <div className="danger">
          {!confirmDelete
            ? <button className="link" onClick={() => setConfirmDelete(true)}>Delete this account</button>
            : <div className="stack">
                <p>Delete “{account.name}” and its {balances} recorded balance{balances === 1 ? '' : 's'}? Past totals will change. To stop tracking it but keep its history, mark it closed instead.</p>
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
