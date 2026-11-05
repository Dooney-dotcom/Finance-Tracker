import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { api, ApiError, fmtDate, money, shift, today, type Lists, type Occurrence, type Plan, type Rec } from './lib'
import { Icon } from './Controls'
import { RecordPanel, Swatch } from './Records'
import { PlanPanel } from './PlanPanel'

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
// Sequential, one hue: spend tints the day red, capped so ink text stays readable on the darkest step.
const STEPS = ['transparent', '#fbe3dc', '#f6c2b5', '#f0a08c', '#ea7e64']

export function Calendar() {
  const [month, setMonth] = useState(today().slice(0, 8) + '01')
  const [selected, setSelected] = useState(today())
  const [focus, setFocus] = useState(today())
  const [rows, setRows] = useState<Rec[] | null>(null)
  const [lists, setLists] = useState<Lists | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)
  const [editing, setEditing] = useState<Rec | 'new' | null>(null)
  const [occ, setOcc] = useState<Occurrence[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [planEditing, setPlanEditing] = useState<Plan | 'new' | null>(null)
  const grid = useRef<HTMLDivElement>(null)
  const keyNav = useRef(false)

  // Monday-first weeks covering the month: 4 to 6 rows.
  const days = useMemo(() => {
    const first = new Date(month + 'T12:00:00')
    const lead = (first.getDay() + 6) % 7
    const len = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
    return Array.from({ length: Math.ceil((lead + len) / 7) * 7 }, (_, i) => {
      const d = new Date(first)
      d.setDate(1 - lead + i)
      return { iso: iso(d), day: d.getDate(), inMonth: d.getMonth() === first.getMonth() }
    })
  }, [month])

  useEffect(() => { api<Lists>('/api/lists').then(setLists).catch(() => setLists({ categories: [], paymentMethods: [] })) }, [reload])
  useEffect(() => { api<Plan[]>('/api/plans').then(setPlans).catch(() => setPlans([])) }, [reload])
  useEffect(() => {
    const ctrl = new AbortController()
    setLoading(true); setError('')
    const dated = `/api/records?dateFrom=${days[0].iso}&dateTo=${days[days.length - 1].iso}`
    const ofMonth = `/api/records?monthFrom=${month}&monthTo=${month}`
    const planned = `/api/plans/occurrences?from=${days[0].iso}&to=${days[days.length - 1].iso}`
    Promise.all([api<{ records: Rec[] }>(dated, { signal: ctrl.signal }), api<{ records: Rec[] }>(ofMonth, { signal: ctrl.signal }),
      api<Occurrence[]>(planned, { signal: ctrl.signal })])
      .then(([a, b, o]) => { setRows([...a.records, ...b.records.filter((r) => !r.dateTime)]); setOcc(o); setLoading(false) })
      .catch((e) => { if (!ctrl.signal.aborted) { setError(e instanceof ApiError ? e.message : 'Couldn’t load the calendar.'); setLoading(false) } })
    return () => ctrl.abort()
  }, [month, days, reload])

  const byDay = useMemo(() => {
    const m = new Map<string, { spent: number; earned: number; recs: Rec[] }>()
    for (const r of rows ?? []) {
      if (!r.dateTime) continue
      const k = r.dateTime.slice(0, 10)
      const e = m.get(k) ?? { spent: 0, earned: 0, recs: [] }
      if (r.type === 'Income') e.earned += r.amount; else e.spent += r.amount
      e.recs.push(r)
      m.set(k, e)
    }
    return m
  }, [rows])
  const undated = (rows ?? []).filter((r) => !r.dateTime)
  // A plan is a promise: only unpaid, unskipped occurrences show on the grid. Paid ones already show as their record.
  const dueByDay = useMemo(() => {
    const m = new Map<string, Occurrence[]>()
    for (const o of occ) if (o.status === 'overdue' || o.status === 'upcoming') m.set(o.due, [...(m.get(o.due) ?? []), o])
    return m
  }, [occ])
  const monthOcc = occ.filter((o) => o.due.slice(0, 7) === month.slice(0, 7))
    .sort((a, b) => Number(b.status === 'overdue') - Number(a.status === 'overdue') || a.due.localeCompare(b.due))
  const paidSum = monthOcc.filter((o) => o.status === 'paid').reduce((t, o) => t + o.amount, 0)
  const toCome = monthOcc.filter((o) => o.status === 'overdue' || o.status === 'upcoming').reduce((t, o) => t + o.amount, 0)
  const [acting, setActing] = useState(false)
  async function act(path: string, method: string, json?: unknown) {
    setActing(true); setError('')
    try { await api(path, { method, json }); setReload((n) => n + 1) }
    catch (e) { setError(e instanceof ApiError ? e.message : 'That didn’t work. Try again.') }
    finally { setActing(false) }
  }
  const openPlan = (id: string) => setPlanEditing(plans.find((p) => p.id === id) ?? null)
  const row = (o: Occurrence) => (
    <OccurrenceRow key={o.planId + o.due} o={o} busy={acting} onOpen={() => openPlan(o.planId)}
      onAct={(sub, method, json) => act(`/api/plans/${o.planId}/occurrences/${o.due}${sub}`, method, json)} />
  )

  // Steps from this month's spread, so one big rent day doesn't wash out every other day.
  const inMonthSpend = days.filter((d) => d.inMonth).map((d) => byDay.get(d.iso)?.spent ?? 0).filter((v) => v > 0).sort((a, b) => a - b)
  const cap = inMonthSpend.length ? inMonthSpend[Math.floor((inMonthSpend.length - 1) * 0.9)] : 1
  const step = (v: number) => (v <= 0 ? 0 : Math.min(4, Math.max(1, Math.ceil((v / cap) * 4))))

  const now = today()
  const monthTotal = days.filter((d) => d.inMonth).reduce((t, d) => t + (byDay.get(d.iso)?.spent ?? 0), 0)

  function go(by: number) {
    const m = shift(month, 'MONTH', by)
    setMonth(m)
    setFocus(m)
  }
  function onKey(e: KeyboardEvent) {
    const d = new Date(focus + 'T12:00:00')
    const by = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key]
    if (!by) return
    e.preventDefault()
    keyNav.current = true
    d.setDate(d.getDate() + by)
    const next = iso(d)
    setFocus(next)
    if (next.slice(0, 7) !== month.slice(0, 7)) setMonth(next.slice(0, 8) + '01')
  }
  // Move focus only while the grid is being driven by the keyboard, never on load.
  useEffect(() => {
    if (!keyNav.current) return
    keyNav.current = false
    grid.current?.querySelector<HTMLButtonElement>(`[data-day="${focus}"]`)?.focus({ preventScroll: true })
  }, [focus, days])

  const sel = byDay.get(selected)
  const catById = new Map(lists?.categories.map((c) => [c.id, c]) ?? [])

  return (
    <div className="page calendar-page">
      <div className="filter-bar">
        <div className="stepper">
          <button aria-label="Previous month" onClick={() => go(-1)}><Icon name="left" /></button>
          <h1 className="period-label">{fmtDate(month, { month: 'long', year: 'numeric' })}</h1>
          <button aria-label="Next month" onClick={() => go(1)}><Icon name="right" /></button>
        </div>
        <button className="btn ghost" disabled={month === now.slice(0, 8) + '01'} onClick={() => { setMonth(now.slice(0, 8) + '01'); setSelected(now); setFocus(now) }}>Today</button>
        <p className="muted cal-total">Spent with a date this month: <strong>{money(monthTotal)}</strong>{toCome > 0 && <> · <strong>{money(toCome)}</strong> still planned</>}</p>
      </div>

      {error && <div className="banner" role="alert"><p>{error}</p><button className="btn" onClick={() => setReload((n) => n + 1)}>Retry</button></div>}

      <div className="cal-layout">
        <div className={'month' + (loading ? ' stale' : '')}>
          <div className="month-head" aria-hidden="true">{WEEKDAYS.map((w) => <span key={w}>{w}</span>)}</div>
          <div className="month-grid-big" role="grid" aria-label={fmtDate(month, { month: 'long', year: 'numeric' })} ref={grid} onKeyDown={onKey}>
            {Array.from({ length: days.length / 7 }, (_, r) => (
              <div role="row" className="week" key={r}>
                {days.slice(r * 7, r * 7 + 7).map((d) => {
                  const e = byDay.get(d.iso)
                  const s = step(e?.spent ?? 0)
                  const due = dueByDay.get(d.iso)
                  const dueSum = due?.reduce((t, o) => t + o.amount, 0) ?? 0
                  return (
                    <button key={d.iso} role="gridcell" data-day={d.iso} tabIndex={d.iso === focus ? 0 : -1}
                      className={'day' + (d.inMonth ? '' : ' out') + (s >= 4 ? ' deep' : '')}
                      style={{ background: STEPS[s] }}
                      aria-selected={d.iso === selected} aria-current={d.iso === now ? 'date' : undefined}
                      aria-label={`${fmtDate(d.iso, { weekday: 'long', day: 'numeric', month: 'long' })}: ${e ? `spent ${money(e.spent)}${e.earned ? `, earned ${money(e.earned)}` : ''}, ${e.recs.length} record${e.recs.length === 1 ? '' : 's'}` : 'no records'}${due ? `, ${money(dueSum)} planned${due.some((o) => o.status === 'overdue') ? ', overdue' : ''}` : ''}`}
                      onClick={() => { setSelected(d.iso); setFocus(d.iso) }}>
                      <span className="num">{d.day}</span>
                      {e && e.spent > 0 && <span className="spent">{money(e.spent)}</span>}
                      {e && e.earned > 0 && <span className="earned">+{money(e.earned)}</span>}
                      {due && <span className={'planned' + (due.some((o) => o.status === 'overdue') ? ' overdue' : '')} title={due.map((o) => o.description).join(', ')}>{money(dueSum)}</span>}
                      {e && <span className="dots" aria-hidden="true">{e.recs.slice(0, 5).map((x) => (
                        <i key={x.id} style={{ background: x.categoryId ? catById.get(x.categoryId)?.color ?? '#b9b6ad' : 'var(--ochre)' }} />
                      ))}</span>}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
          <div className="scale" aria-hidden="true">
            <span>Less</span>{STEPS.slice(1).map((c) => <i key={c} style={{ background: c }} />)}<span>More spent</span>
            <span className="scale-gap" /><i className="inc-key" /><span>Income</span>
          </div>
        </div>

        <aside className="day-detail" aria-labelledby="day-h">
          <div className="panel">
            <div className="panel-head">
              <h2 id="day-h">{fmtDate(selected, { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
            </div>
            {sel
              ? <p className="summary">Spent <strong>{money(sel.spent)}</strong>{sel.earned > 0 && <> · earned <strong className="pos">{money(sel.earned)}</strong></>}</p>
              : <p className="empty">Nothing recorded on this day.</p>}
            {sel && (
              <ul className="day-list">
                {sel.recs.map((r) => (
                  <li key={r.id}>
                    <button className="row-open" onClick={() => setEditing(r)}>
                      <Swatch color={r.categoryId ? catById.get(r.categoryId)?.color : null} />
                      <span>{r.description}<span className="muted small"> {r.dateTime!.slice(11, 16)}</span></span>
                    </button>
                    <span className={r.type === 'Income' ? 'pos' : ''}>{r.type === 'Income' ? '+' : '−'}{money(r.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
            {occ.some((o) => o.due === selected) && (
              <>
                <h3 className="sub-h">Planned</h3>
                <ul className="day-list plan-list">{occ.filter((o) => o.due === selected).map(row)}</ul>
              </>
            )}
            <button className="btn primary" disabled={!lists} onClick={() => setEditing('new')}>Add a record on this day</button>
          </div>

          <div className="panel" aria-labelledby="plan-h">
            <div className="panel-head"><h2 id="plan-h">Planned in {fmtDate(month, { month: 'long' })}</h2></div>
            {monthOcc.length === 0
              ? <p className="muted">Nothing planned. Add the bills you expect, like rent or subscriptions, to see what’s still to come.</p>
              : <>
                  <p className="summary"><strong>{money(paidSum)}</strong> paid · <strong>{money(toCome)}</strong> to come</p>
                  <ul className="day-list plan-list">{monthOcc.map((o) => row(o))}</ul>
                </>}
            <button className="btn" disabled={!lists} onClick={() => setPlanEditing('new')}>Add planned expense</button>
            {plans.length > 0 && (
              <details className="all-plans">
                <summary>All planned expenses ({plans.length})</summary>
                <ul className="day-list">
                  {plans.map((p) => (
                    <li key={p.id}>
                      <button className="row-open" onClick={() => setPlanEditing(p)}>{p.description}<span className="muted small"> {p.frequency === 'Once' ? fmtDate(p.firstDue) : p.frequency.toLowerCase()}</span></button>
                      <span>{money(p.amount)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>

          {undated.length > 0 && (
            <div className="panel">
              <h2>No exact date this month</h2>
              <p className="muted small">These count in {fmtDate(month, { month: 'long' })} but can’t be placed on a day.</p>
              <ul className="day-list">
                {undated.map((r) => (
                  <li key={r.id}>
                    <button className="row-open" onClick={() => setEditing(r)}>{r.description}</button>
                    <span className={r.type === 'Income' ? 'pos' : ''}>{r.type === 'Income' ? '+' : '−'}{money(r.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>

      {editing && lists && (
        <RecordPanel rec={editing === 'new' ? null : editing} lists={lists} defaultDate={selected}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setReload((n) => n + 1) }} />
      )}
      {planEditing && lists && (
        <PlanPanel plan={planEditing === 'new' ? null : planEditing} lists={lists} defaultDate={selected}
          onClose={() => setPlanEditing(null)} onSaved={() => { setPlanEditing(null); setReload((n) => n + 1) }} />
      )}
    </div>
  )
}

/** One due date of a plan, with what can be done about it. */
function OccurrenceRow({ o, busy, onOpen, onAct }:
  { o: Occurrence; busy: boolean; onOpen: () => void; onAct: (sub: string, method: string, json?: unknown) => void }) {
  const open = o.status === 'overdue' || o.status === 'upcoming'
  return (
    <li className={'plan-row ' + o.status}>
      <div className="plan-main">
        <button className="row-open" onClick={onOpen}>{o.description}</button>
        <span className="muted small">
          {fmtDate(o.due, { day: 'numeric', month: 'short' })}
          {o.status === 'overdue' && <> · <b className="late">overdue</b></>}
          {o.status === 'paid' && <> · <Icon name="check" /> paid</>}
          {o.status === 'skipped' && <> · skipped</>}
        </span>
        {open && o.suggestion && (
          <p className="match small">
            Looks paid by “{o.suggestion.description}” on {fmtDate(o.suggestion.day, { day: 'numeric', month: 'short' })}, {money(o.suggestion.amount)}.{' '}
            <button className="link" disabled={busy} onClick={() => onAct('', 'PUT', { transactionId: o.suggestion!.id })}>Confirm</button>
          </p>
        )}
        <span className="plan-actions">
          {open && <button className="link" disabled={busy} onClick={() => onAct('/pay', 'POST')}>Mark paid</button>}
          {open && <button className="link" disabled={busy} onClick={() => onAct('', 'PUT', { skipped: true })}>Skip</button>}
          {!open && <button className="link" disabled={busy} onClick={() => onAct('', 'DELETE')}>{o.status === 'paid' ? 'Unlink' : 'Undo'}</button>}
        </span>
      </div>
      <span className="plan-amt">{money(o.amount)}</span>
    </li>
  )
}
