import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } },
)

/** Where Supabase sends people back after OAuth / email links. */
export const appUrl = () => window.location.origin + import.meta.env.BASE_URL

export type Period = 'DAY' | 'WEEK' | 'MONTH' | 'YEAR'

export interface Slice { id: string | null; name: string | null; color: string | null; amount: number; records: number }
export interface Point { key: string; income: number; expense: number; cumulativeExpense: number | null; averagePace: number | null }
export interface DashboardData {
  period: Period
  start: string
  end: string
  totals: { income: number; expense: number; net: number; records: number }
  netYearToDate: number
  trend: Point[]
  averageDailyExpense: number | null
  dayRecords: { description: string; income: boolean; amount: number; categoryId: string | null }[]
  categories: Slice[]
  incomeCategories: Slice[]
  paymentMethods: Slice[]
  avoidable: { yes: number; partly: number; no: number; untagged: number; tagged: number; expenses: number }
  recurrence: { fixed: number; recurring: number; oneOff: number; untagged: number; tagged: number; expenses: number }
  undated: number
  /** Bills from planned expenses. A promise, never part of the totals. */
  planned: { stillToPay: number; unpaid: Occurrence[]; comingUp: Occurrence[]; monthlyCommitment: number; averageIncome: number | null }
}

export class ApiError extends Error {
  status: number
  constructor(status: number, detail?: string) {
    super(status === 401 ? 'Your session has expired.' : detail ?? (status === 0 ? 'The server can’t be reached.' : 'Something went wrong on the server.'))
    this.status = status
  }
}

/** Calls the Spring API with the current session's token. Errors carry the API's own message when it sent one. */
export async function api<T>(path: string, init: { method?: string; json?: unknown; form?: FormData; signal?: AbortSignal } = {}): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new ApiError(401)
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
  if (init.json !== undefined) headers['Content-Type'] = 'application/json'
  let res: Response
  try {
    res = await fetch(`${import.meta.env.VITE_API_URL}${path}`, {
      method: init.method ?? 'GET', headers, signal: init.signal,
      body: init.form ?? (init.json === undefined ? undefined : JSON.stringify(init.json)),
    })
  } catch (e) {
    if (init.signal?.aborted) throw e
    throw new ApiError(0)
  }
  if (!res.ok) {
    let detail: string | undefined
    try { detail = (await res.json()).detail } catch { /* no body */ }
    throw new ApiError(res.status, detail)
  }
  // Saves and deletes answer with an empty body.
  const text = await res.text()
  return (text ? JSON.parse(text) : undefined) as T
}

export const fetchDashboard = (period: Period, date: string, signal: AbortSignal) =>
  api<DashboardData>(`/api/dashboard?period=${period}&date=${date}`, { signal })

export interface Rec {
  id?: string
  description: string
  amount: number
  type: 'Expense' | 'Income'
  dateTime: string | null // Europe/Rome wall time, "YYYY-MM-DDTHH:mm[:ss]"
  month: string // YYYY-MM-01
  categoryId: string | null
  paymentMethodId: string | null
  avoidable: 'Yes' | 'Partly' | 'No' | null
  recurrence: 'Fixed' | 'Recurring' | 'One-off' | null
  reason: string | null
  notes: string | null
}
export interface Category { id: string; name: string; kind: 'expense' | 'income'; color: string | null; records: number }
export interface Method { id: string; name: string; records: number }
export interface Lists { categories: Category[]; paymentMethods: Method[] }
export const RECURRENCE = ['Fixed', 'Recurring', 'One-off'] as const
export const REASONS = ['Impulse', 'Boredom', 'Stress', 'Social / FOMO', 'Discount', 'Convenience', 'Habit']

// ---- formatting: EUR in English style (€1,257.00), dates like 2 Nov 2026 ----

const eur = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' })
const eurRound = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

export const money = (n: number) => eur.format(n).replace('-', '−')
export const moneyRound = (n: number) => eurRound.format(n).replace('-', '−')
export const signed = (n: number) => (n > 0 ? '+' : '') + money(n)

const parse = (iso: string) => new Date(iso + 'T12:00:00')
export const fmtDate = (iso: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) =>
  parse(iso).toLocaleDateString('en-GB', opts)

/** Today in Europe/Rome as YYYY-MM-DD. */
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date())

export function shift(iso: string, period: Period, by: number): string {
  const d = parse(iso)
  if (period === 'DAY') d.setDate(d.getDate() + by)
  if (period === 'WEEK') d.setDate(d.getDate() + 7 * by)
  if (period === 'MONTH') { d.setDate(1); d.setMonth(d.getMonth() + by) }
  if (period === 'YEAR') d.setFullYear(d.getFullYear() + by)
  return d.toLocaleDateString('en-CA')
}

export function periodLabel(p: Period, start: string, end: string): string {
  if (p === 'DAY') return fmtDate(start, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  if (p === 'MONTH') return fmtDate(start, { month: 'long', year: 'numeric' })
  if (p === 'YEAR') return start.slice(0, 4)
  return `${fmtDate(start, { day: 'numeric', month: 'short' })} – ${fmtDate(end)}`
}

export const FREQUENCIES = ['Once', 'Monthly', 'Quarterly', 'Annual'] as const
export interface Plan {
  id?: string
  description: string
  amount: number
  categoryId: string | null
  paymentMethodId: string | null
  firstDue: string // YYYY-MM-DD
  frequency: (typeof FREQUENCIES)[number]
  lastDue: string | null
  notes: string | null
}
/** One due date of a plan. Only paid ones count as spending, through the record they link to. */
export interface Occurrence {
  planId: string
  due: string
  description: string
  amount: number
  categoryId: string | null
  paymentMethodId: string | null
  frequency: Plan['frequency']
  status: 'paid' | 'skipped' | 'overdue' | 'upcoming'
  transactionId: string | null
  suggestion: { id: string; description: string; day: string; amount: number; paymentMethodId: string | null } | null
}
