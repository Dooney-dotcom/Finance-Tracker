import { useEffect, useState } from 'react'
import { ApiError, fetchDashboard, fmtDate, money, periodLabel, shift, signed, supabase, today, type DashboardData, type Period, type Slice } from './lib'
import { Donut, Legend, Sankey, TableView, TimeChart, type Row, type Seg, type Series } from './Charts'

const INCOME = 'var(--income)', EXPENSE = 'var(--expense)', PACE = 'var(--ink-2)'
// Categories carry the colour their owner picked; ochre stays reserved for "needs attention".
const OTHER = 'var(--ink-3)', UNCATEGORISED = 'var(--ochre)'
const PERIODS: [Period, string][] = [['DAY', 'Day'], ['WEEK', 'Week'], ['MONTH', 'Month'], ['YEAR', 'Year']]

const recordsLink = (params: Record<string, string>) => '#/records?' + new URLSearchParams(params).toString()
// Month and year views count records by their month; day and week views by their date. The Records filter matches.
const periodRange = (d: DashboardData): Record<string, string> =>
  d.period === 'MONTH' || d.period === 'YEAR' ? { monthFrom: d.start, monthTo: d.end } : { dateFrom: d.start, dateTo: d.end }

export function Dashboard() {
  const [period, setPeriod] = useState<Period>('MONTH')
  const [date, setDate] = useState(today())
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const ctrl = new AbortController()
    setLoading(true); setError(null)
    fetchDashboard(period, date, ctrl.signal)
      .then((d) => { setData(d); setLoading(false) })
      .catch((e) => { if (!ctrl.signal.aborted) { setError(e instanceof ApiError ? e : new ApiError(0)); setLoading(false) } })
    return () => ctrl.abort()
  }, [period, date, attempt])

  const isCurrent = data ? data.start <= today() && today() <= data.end : false

  return (
    <div className="page dashboard">
      <div className="period-bar" role="toolbar" aria-label="Period">
        <div className="seg">
          {PERIODS.map(([p, l]) => (
            <button key={p} aria-pressed={period === p} onClick={() => setPeriod(p)}>{l}</button>
          ))}
        </div>
        <div className="stepper">
          <button aria-label="Previous period" onClick={() => setDate(shift(date, period, -1))}><Chevron dir="left" /></button>
          <h1 className="period-label" aria-live="polite">{data ? periodLabel(data.period, data.start, data.end) : ' '}</h1>
          <button aria-label="Next period" onClick={() => setDate(shift(date, period, 1))}><Chevron dir="right" /></button>
        </div>
        <button className="btn ghost" disabled={isCurrent && date === today()} onClick={() => setDate(today())}>Today</button>
      </div>

      {error && (
        <div className="banner" role="alert">
          <p>{error.message} {error.status === 401 ? 'Sign in again to continue.' : 'Check that the API is running, then retry.'}</p>
          {error.status === 401
            ? <button className="btn" onClick={() => supabase.auth.signOut()}>Sign in again</button>
            : <button className="btn" onClick={() => setAttempt((a) => a + 1)}>Retry</button>}
        </div>
      )}

      {!data && loading && <Skeleton />}
      {data && (
        <div className={'board' + (loading ? ' stale' : '')} aria-busy={loading}>
          <Hero d={data} isCurrent={isCurrent} />
          <Trend d={data} isCurrent={isCurrent} />
          <MoneyFlow d={data} />
          <WhereItWent d={data} />
          <Avoidable d={data} />
          <Recurrence d={data} />
          <Methods d={data} />
          {isCurrent && <Upcoming d={data} />}
        </div>
      )}
    </div>
  )
}

export function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d={dir === 'left' ? 'M10 3 5 8l5 5' : 'm6 3 5 5-5 5'} fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

function Skeleton() {
  return (
    <div className="board" aria-busy="true" aria-label="Loading dashboard">
      {['hero', 'trend', 'where', 'avoid', 'methods'].map((k) => <section key={k} className={'panel sk ' + k}><div className="sk-block" /></section>)}
    </div>
  )
}

/** Income and expense as two planes on one scale; the longer plane's overhang is the net. */
function Hero({ d, isCurrent }: { d: DashboardData; isCurrent: boolean }) {
  const { income, expense, net, records } = d.totals
  const scale = Math.max(income, expense) || 1
  const year = d.start.slice(0, 4)
  const sentence = records === 0 ? 'Nothing recorded in this period yet.'
    : net < 0 ? `You spent ${money(-net)} more than you earned.`
    : net > 0 ? `You kept ${money(net)} of what you earned.`
    : 'You spent exactly what you earned.'
  return (
    <section className="panel hero" aria-labelledby="hero-h">
      <h2 id="hero-h" className="sr-only">Balance</h2>
      <div className="net">
        <span className={'net-figure ' + (net < 0 ? 'neg' : net > 0 ? 'pos' : '')}>{net > 0 ? '+' : ''}{money(net)}</span>
        <p>{sentence}</p>
        {d.period === 'MONTH' && isCurrent && d.planned.stillToPay > 0 && <FreeToSpend d={d} />}
        {d.period !== 'YEAR' && <p className="muted">{signed(d.netYearToDate)} net in {year} so far</p>}
      </div>
      <div className="planes" aria-hidden="true" hidden={income === 0 && expense === 0}>
        {income > 0 && <div className="plane in" style={{ width: `${(income / scale) * 100}%` }} />}
        {expense > 0 && <div className="plane out" style={{ width: `${(expense / scale) * 100}%` }} />}
      </div>
      <dl className="io">
        <div><dt><i className="key" style={{ background: INCOME }} />Income</dt><dd>{money(income)}</dd></div>
        <div><dt><i className="key" style={{ background: EXPENSE }} />Expenses</dt><dd>{money(expense)}</dd></div>
        <div><dt>Records</dt><dd>{records}</dd></div>
      </dl>
    </section>
  )
}

function Trend({ d, isCurrent }: { d: DashboardData; isCurrent: boolean }) {
  if (d.period === 'DAY') return <DayView d={d} />

  if (d.period === 'YEAR') return <YearTrend d={d} isCurrent={isCurrent} />
  if (d.period === 'MONTH') return <MonthTrend d={d} isCurrent={isCurrent} />

  return <WeekTrend d={d} />
}

/** Each day of the week as pills on tracks, with a headline that follows the cursor. */
function WeekTrend({ d }: { d: DashboardData }) {
  const [hover, setHover] = useState<number | null>(null)
  const hasIncome = d.trend.some((p) => p.income > 0)
  const series: Series[] = [{ name: 'Expenses', color: EXPENSE }, ...(hasIncome ? [{ name: 'Income', color: INCOME }] : [])]
  const rows: Row[] = d.trend.map((p) => ({
    label: fmtDate(p.key, { weekday: 'short' }), long: fmtDate(p.key, { weekday: 'long', day: 'numeric', month: 'short' }),
    values: hasIncome ? [p.expense, p.income] : [p.expense],
  }))
  const { income, expense } = hover != null ? d.trend[hover] : d.totals
  return (
    <section className="panel trend" aria-labelledby="trend-h">
      <div className="panel-head"><h2 id="trend-h">Day by day</h2>{hasIncome && <Legend series={series} />}</div>
      <div className="headline" aria-live="polite">
        <span className="muted small">{hover != null ? `Spent on ${rows[hover].long}` : 'Spent this week'}</span>
        <div><strong>{money(expense)}</strong><KeptChip income={income} expense={expense} /></div>
      </div>
      <TimeChart rows={rows} series={series} mode="columns" onHover={setHover} label="Spending each day of the week" />
      <TableView caption="Each day of the week" head={['Day', 'Expenses', 'Income']}
        rows={d.trend.map((p, i) => [rows[i].long, money(p.expense), money(p.income)])} />
    </section>
  )
}

function KeptChip({ income, expense }: { income: number; expense: number }) {
  if (income <= 0) return null
  const kept = income - expense
  return (
    <span className={'chip ' + (kept < 0 ? 'up' : 'down')} title={`${money(income)} income`}>
      {kept < 0 ? `${Math.round((-kept / income) * 100)}% more than income` : `Kept ${Math.round((kept / income) * 100)}% of income`}
    </span>
  )
}

/** Income and expenses per month as overlapping areas, with a headline that follows the cursor. */
function YearTrend({ d, isCurrent }: { d: DashboardData; isCurrent: boolean }) {
  const [hover, setHover] = useState<number | null>(null)
  const now = today(), thisMonth = now.slice(0, 7)
  const rows: Row[] = d.trend.map((p) => {
    // The running month is incomplete; plotting it would read as a collapse.
    const future = isCurrent && p.key >= thisMonth
    return { label: fmtDate(p.key + '-01', { month: 'short' }), long: fmtDate(p.key + '-01', { month: 'long', year: 'numeric' }),
      values: future ? [null, null] : [p.income, p.expense] }
  })
  const series: Series[] = [{ name: 'Income', color: INCOME }, { name: 'Expenses', color: EXPENSE }]
  // Over a plotted month the headline shows that month; anywhere else, the whole year.
  const m = hover != null && rows[hover].values[0] != null ? d.trend[hover] : null
  const { income, expense } = m ?? d.totals
  return (
    <section className="panel trend" aria-labelledby="trend-h">
      <div className="panel-head"><h2 id="trend-h">Income and expenses by month</h2><Legend series={series} /></div>
      <div className="headline" aria-live="polite">
        <span className="muted small">{m ? `Spent in ${rows[hover!].long}` : `Spent in ${d.start.slice(0, 4)}`}</span>
        <div>
          <strong>{money(expense)}</strong>
          <KeptChip income={income} expense={expense} />
        </div>
      </div>
      <TimeChart rows={rows} series={series} mode="area" onHover={setHover} label="Monthly income and expenses" />
      {isCurrent && <p className="muted small">{fmtDate(now, { month: 'long' })} is still in progress, so the lines stop at the last complete month.</p>}
      <TableView caption="Income and expenses by month" head={['Month', 'Income', 'Expenses', 'Net']}
        rows={d.trend.map((p, i) => [rows[i].long, money(p.income), money(p.expense), money(p.income - p.expense)])} />
    </section>
  )
}

/** Running spend for the month as a filled area against the average month, with a headline that follows the cursor. */
function MonthTrend({ d, isCurrent }: { d: DashboardData; isCurrent: boolean }) {
  const [hover, setHover] = useState<number | null>(null)
  const nowDay = isCurrent ? Number(today().slice(8, 10)) : d.trend.length
  const showPace = d.trend[nowDay - 1]?.averagePace != null
  // From today on: what's spent plus each unpaid bill on its due day (overdue ones land today). Bills only, so it's a floor, not a forecast.
  const base = d.trend[nowDay - 1]?.cumulativeExpense ?? 0
  const projection = isCurrent && d.planned.unpaid.length > 0
    ? d.trend.map((_, i) => i < nowDay - 1 ? null
      : base + d.planned.unpaid.filter((o) => o.status === 'overdue' || Number(o.due.slice(8, 10)) <= i + 1).reduce((t, o) => t + o.amount, 0))
    : null
  const projectedEnd = projection ? projection[projection.length - 1]! : null
  const rows: Row[] = d.trend.map((p, i) => ({
    label: p.key, long: fmtDate(d.start.slice(0, 8) + p.key.padStart(2, '0'), { weekday: 'short', day: 'numeric', month: 'short' }),
    values: [i < nowDay ? p.cumulativeExpense : null, ...(showPace ? [p.averagePace] : []), ...(projection ? [projection[i]] : [])],
  }))
  // Days still to come have no spend yet, so the headline stays on today while the cursor is over them.
  const i = hover != null && hover < nowDay ? hover : nowDay - 1
  const at = d.trend[i]
  const series: Series[] = [{ name: 'Spent so far', color: EXPENSE }, ...(showPace ? [{ name: 'Your average month', color: PACE, thin: true }] : []),
    ...(projection ? [{ name: 'Expected', color: 'var(--expected)', dashed: true }] : [])]
  const diff = at && at.averagePace ? at.cumulativeExpense! - at.averagePace : null
  return (
    <section className="panel trend" aria-labelledby="trend-h">
      <div className="panel-head"><h2 id="trend-h">Spending through the month</h2><Legend series={series} /></div>
      {at && (
        <div className="headline" aria-live="polite">
          <span className="muted small">{hover != null ? `Spent by ${rows[i].long}` : isCurrent ? `Spent by day ${nowDay}` : 'Spent this month'}</span>
          <div>
            <strong>{money(at.cumulativeExpense!)}</strong>
            {diff != null && (
              <span className={'chip ' + (diff > 0 ? 'up' : 'down')} title={`${money(Math.abs(diff))} ${diff > 0 ? 'more' : 'less'} than your average month by this day`}>
                {diff > 0 ? '+' : '−'}{Math.round((Math.abs(diff) / at.averagePace!) * 100)}% vs average
              </span>
            )}
          </div>
          {projectedEnd != null && (
            <span className="muted small">
              Bills still to come take it to <strong>{money(projectedEnd)}</strong> by {fmtDate(d.end, { day: 'numeric', month: 'short' })}
              {d.totals.income > 0 && projectedEnd > d.totals.income && <> — {money(projectedEnd - d.totals.income)} more than you earned</>}
            </span>
          )}
        </div>
      )}
      <TimeChart rows={rows} series={series} mode="area" xEvery={5} onHover={setHover}
        refLine={d.totals.income > 0 ? { value: d.totals.income, label: `Income ${money(d.totals.income)}`, color: INCOME } : undefined}
        label="Cumulative spending through the month compared with your average month" />
      <TableView caption="Daily spending" head={['Day', 'Spent that day', 'Spent so far', 'Average month']}
        rows={d.trend.map((p, i) => [rows[i].long, money(p.expense), money(p.cumulativeExpense ?? 0), p.averagePace == null ? '—' : money(p.averagePace)])} />
    </section>
  )
}

function DayView({ d }: { d: DashboardData }) {
  const avg = d.averageDailyExpense
  const spent = d.totals.expense
  return (
    <section className="panel trend" aria-labelledby="trend-h">
      <div className="panel-head"><h2 id="trend-h">This day</h2></div>
      {avg != null && (
        <p className="summary">
          Spent <strong>{money(spent)}</strong>; your average day is {money(avg)}
          {spent > 0 && <> ({spent > avg ? `${money(spent - avg)} more` : `${money(avg - spent)} less`})</>}.
        </p>
      )}
      {d.dayRecords.length === 0
        ? <p className="empty">No records on this day. <a href={recordsLink({ add: d.start })}>Add one</a></p>
        : (
          <ul className="day-list">
            {d.dayRecords.map((r, i) => (
              <li key={i}><span>{r.description || 'No description'}</span>
                <span className={r.income ? 'pos' : ''}>{r.income ? '+' : '−'}{money(r.amount)}</span></li>
            ))}
          </ul>
        )}
      {d.undated > 0 && <p className="muted small">{d.undated} record{d.undated > 1 ? 's' : ''} this month {d.undated > 1 ? 'have' : 'has'} no exact date, so {d.undated > 1 ? 'they' : 'it'} can’t appear here.</p>}
    </section>
  )
}

const colourFor = (s: Slice) => (s.id == null ? UNCATEGORISED : s.color ?? OTHER)

// The ring and the flow stay readable at six slices at most: the biggest categories, then everything else grouped.
function groupCategories(categories: Slice[]): Seg[] {
  const uncat = categories.find((s) => s.id == null)
  const categorised = categories.filter((s) => s.id != null)
  const room = uncat ? 4 : 5
  const shown = categorised.length <= room + 1 ? categorised : categorised.slice(0, room)
  const restAmt = categorised.slice(shown.length).reduce((a, s) => a + s.amount, 0)
  return [
    ...shown.map((s) => ({ key: s.id!, label: s.name ?? '', amount: s.amount, color: colourFor(s) })),
    ...(restAmt > 0 ? [{ key: 'rest', label: `Everything else (${categorised.length - shown.length})`, amount: restAmt, color: OTHER }] : []),
    ...(uncat ? [{ key: 'none', label: 'Uncategorised', amount: uncat.amount, color: UNCATEGORISED }] : []),
  ]
}

/** Where income came from and where it went, with any surplus shown as saved. */
function MoneyFlow({ d }: { d: DashboardData }) {
  const { income, expense, net } = d.totals
  if (d.period === 'DAY') return null
  const sources = groupCategories(d.incomeCategories)
  const sinks: Seg[] = [...d.categories.map((s) => ({ key: s.id ?? 'none', label: s.name ?? 'Uncategorised', amount: s.amount, color: colourFor(s) })), ...(net > 0 ? [{ key: 'saved', label: 'Saved', amount: net, color: INCOME }] : [])]
  return (
    <section className="panel flow" aria-labelledby="flow-h">
      <div className="panel-head"><h2 id="flow-h">Money flow</h2></div>
      {income === 0 && expense === 0 ? <p className="empty">Nothing recorded in this period yet.</p> : (
        <>
          <p className="summary"><strong>{money(income)}</strong> came in and <strong>{money(expense)}</strong> went out.</p>
          <Sankey sources={sources} sinks={sinks} hub="Budget" label="Income sources flowing into spending categories and savings" />
          <TableView caption="Money flow" head={['Flow', 'Amount']}
            rows={[...sources.map((s) => ['In: ' + s.label, money(s.amount)]), ...sinks.map((s) => ['Out: ' + s.label, money(s.amount)])]} />
        </>
      )}
    </section>
  )
}

function WhereItWent({ d }: { d: DashboardData }) {
  const total = d.totals.expense
  const segs = groupCategories(d.categories)
  const uncat = d.categories.find((s) => s.id == null)
  const max = Math.max(1, ...d.categories.map((s) => s.amount))
  const range = periodRange(d)

  return (
    <section className="panel where" aria-labelledby="where-h">
      <div className="panel-head"><h2 id="where-h">Where it went</h2></div>
      {total === 0 ? <p className="empty">No expenses in this period.</p> : (
        <div className="where-grid">
          <div className="donut-col">
            <Donut segs={segs} total={total} centre={<><span className="muted small">Spent</span><strong>{money(total)}</strong></>} />
            <ul className="legend vertical">
              {segs.map((s) => <li key={s.key}><span className="key" style={{ background: s.color }} />{s.label} <b>{Math.round((s.amount / total) * 100)}%</b></li>)}
            </ul>
          </div>
          <ol className="ranked">
            {d.categories.map((s) => (
              <li key={s.id ?? 'none'}>
                <a href={recordsLink({ category: s.id ?? 'none', ...range })}>
                  <span className="name"><span className="key" style={{ background: colourFor(s) }} />{s.name ?? 'Uncategorised'}<span className="muted"> · {s.records}</span></span>
                  <span className="bar"><span style={{ width: `${(s.amount / max) * 100}%`, background: s.id == null ? UNCATEGORISED : 'var(--ink)' }} /></span>
                  <span className="amt">{money(s.amount)}</span>
                </a>
              </li>
            ))}
          </ol>
        </div>
      )}
      {uncat && (
        <p className="attention">
          <strong>{uncat.records} expense{uncat.records > 1 ? 's' : ''} ({money(uncat.amount)})</strong> {uncat.records > 1 ? 'have' : 'has'} no category.{' '}
          <a href={recordsLink({ category: 'none', ...range })}>Sort them</a>
        </p>
      )}
      {total > 0 && (
        <TableView caption="Spending by category" head={['Category', 'Records', 'Amount', 'Share']}
          rows={d.categories.map((s) => [s.name ?? 'Uncategorised', s.records, money(s.amount), `${Math.round((s.amount / total) * 100)}%`])} />
      )}
    </section>
  )
}

function Avoidable({ d }: { d: DashboardData }) {
  const a = d.avoidable
  const parts = [
    { k: 'Yes', v: a.yes, c: 'var(--expense)' },
    { k: 'Partly', v: a.partly, c: 'var(--expense-soft)' },
    { k: 'No', v: a.no, c: 'var(--ink-3)' },
  ]
  const tagged = a.yes + a.partly + a.no
  return (
    <section className="panel avoid" aria-labelledby="avoid-h">
      <div className="panel-head"><h2 id="avoid-h">Avoidable spending</h2></div>
      {a.expenses === 0 ? <p className="empty">No expenses in this period.</p>
        : a.tagged === 0 ? (
          <div className="empty-tag">
            <p>None of this period’s {a.expenses} expenses are tagged yet. Mark each one Yes, Partly or No to see how much you could have kept.</p>
            <a className="btn primary" href={recordsLink({ avoidable: 'untagged', ...periodRange(d) })}>Tag expenses</a>
          </div>
        ) : (
          <>
            <p className="summary"><strong>{money(a.yes + a.partly)}</strong> was avoidable or partly avoidable, of {money(tagged)} tagged.</p>
            <div className="stack-bar" role="img" aria-label={parts.map((p) => `${p.k} ${money(p.v)}`).join(', ')}>
              {parts.filter((p) => p.v > 0).map((p) => <span key={p.k} style={{ flexGrow: p.v, background: p.c }} />)}
            </div>
            <ul className="legend">
              {parts.map((p) => <li key={p.k}><span className="key" style={{ background: p.c }} />{p.k} <b>{money(p.v)}</b></li>)}
            </ul>
            <p className="muted small">{a.expenses - a.tagged} of {a.expenses} expenses ({money(a.untagged)}) still untagged. <a href={recordsLink({ avoidable: 'untagged', ...periodRange(d) })}>Tag them</a></p>
          </>
        )}
    </section>
  )
}

function Recurrence({ d }: { d: DashboardData }) {
  const a = d.recurrence
  const parts = [
    { k: 'Fixed', v: a.fixed, c: 'var(--ink)' },
    { k: 'Recurring', v: a.recurring, c: 'var(--ink-2)' },
    { k: 'One-off', v: a.oneOff, c: 'var(--ink-3)' },
  ]
  const tagged = a.fixed + a.recurring + a.oneOff
  const link = recordsLink({ recurrence: 'untagged', ...periodRange(d) })
  return (
    <section className="panel recur" aria-labelledby="recur-h">
      <div className="panel-head"><h2 id="recur-h">How often you spend</h2></div>
      {a.expenses === 0 ? <p className="empty">No expenses in this period.</p>
        : a.tagged === 0 ? (
          <div className="empty-tag">
            <p>None of this period’s {a.expenses} expenses say how often they happen. Mark each one Fixed, Recurring or One-off to see what’s locked in.</p>
            <a className="btn primary" href={link}>Tag expenses</a>
          </div>
        ) : (
          <>
            <p className="summary"><strong>{money(a.fixed)}</strong> is fixed, of {money(tagged)} tagged.</p>
            <div className="stack-bar" role="img" aria-label={parts.map((p) => `${p.k} ${money(p.v)}`).join(', ')}>
              {parts.filter((p) => p.v > 0).map((p) => <span key={p.k} style={{ flexGrow: p.v, background: p.c }} />)}
            </div>
            <ul className="legend">
              {parts.map((p) => <li key={p.k}><span className="key" style={{ background: p.c }} />{p.k} <b>{money(p.v)}</b></li>)}
            </ul>
            {a.expenses > a.tagged && <p className="muted small">{a.expenses - a.tagged} of {a.expenses} expenses ({money(a.untagged)}) still untagged. <a href={link}>Tag them</a></p>}
          </>
        )}
      {d.planned.monthlyCommitment > 0 && (
        <p className="commitment">
          Planned bills take <strong>{money(d.planned.monthlyCommitment)}</strong> a month
          {d.planned.averageIncome ? <>, <strong>{Math.round((d.planned.monthlyCommitment / d.planned.averageIncome) * 100)}%</strong> of what you usually earn</> : null}.
        </p>
      )}
    </section>
  )
}

/** Income left once this month's spending and the bills still to come are taken out. */
function FreeToSpend({ d }: { d: DashboardData }) {
  const free = d.totals.income - d.totals.expense - d.planned.stillToPay
  return free >= 0
    ? <p className="free"><strong>{money(free)}</strong> free to spend after <strong>{money(d.planned.stillToPay)}</strong> of bills still to come.</p>
    : <p className="free">Bills still to come would put you <strong className="neg">{money(-free)}</strong> over what you earned.</p>
}

/** Bills due in the next 7 days, overdue first. They're paid from the Calendar. */
function Upcoming({ d }: { d: DashboardData }) {
  const list = d.planned.comingUp
  const now = today(), tomorrow = shift(now, 'DAY', 1)
  const when = (iso: string) => iso === now ? 'Today' : iso === tomorrow ? 'Tomorrow' : fmtDate(iso, { weekday: 'short', day: 'numeric', month: 'short' })
  const none = d.planned.monthlyCommitment === 0 && d.planned.unpaid.length === 0
  return (
    <section className="panel upcoming" aria-labelledby="up-h">
      <div className="panel-head"><h2 id="up-h">Coming up</h2></div>
      {list.length === 0
        ? <p className="empty">{none ? <>Add the bills you expect in the <a href="#/calendar">Calendar</a> to see them here.</> : 'No bills due in the next 7 days.'}</p>
        : <>
            <p className="summary"><strong>{money(list.filter((o) => !o.suggestion).reduce((t, o) => t + o.amount, 0))}</strong> to pay in the next 7 days.</p>
            <ul className="day-list">
              {list.map((o) => (
                <li key={o.planId + o.due}>
                  <span><b>{o.description}</b><span className="muted small"> {when(o.due)}{o.suggestion ? ' · looks paid, confirm it' : o.status === 'overdue' && <> · <b className="late">overdue</b></>}</span></span>
                  <span className={o.suggestion ? 'muted' : ''}>{money(o.amount)}</span>
                </li>
              ))}
            </ul>
            <a href="#/calendar" className="small">Pay in the Calendar</a>
          </>}
    </section>
  )
}

function Methods({ d }: { d: DashboardData }) {
  const max = Math.max(1, ...d.paymentMethods.map((s) => s.amount))
  return (
    <section className="panel methods" aria-labelledby="methods-h">
      <div className="panel-head"><h2 id="methods-h">Paid with</h2></div>
      {d.paymentMethods.length === 0 ? <p className="empty">No expenses in this period.</p> : (
        <ol className="ranked compact">
          {d.paymentMethods.map((s) => (
            <li key={s.id ?? 'none'}><div>
              <span className="name">{s.name ?? 'Not set'}<span className="muted"> · {s.records}</span></span>
              <span className="bar"><span style={{ width: `${(s.amount / max) * 100}%`, background: 'var(--ink)' }} /></span>
              <span className="amt">{money(s.amount)}</span>
            </div></li>
          ))}
        </ol>
      )}
    </section>
  )
}
