// Wealth maths: pure, no imports, so `node src/wealthMath.check.ts` can run it.

export const PURPOSES = ['Everyday', 'Emergency fund', 'Savings', 'Long-term investing', 'Retirement'] as const
export const ASSET_CLASSES = ['Cash', 'Deposit', 'Bonds', 'Equities', 'Mixed', 'Insurance policy', 'Pension fund'] as const
export type Purpose = (typeof PURPOSES)[number]
export type AssetClass = (typeof ASSET_CLASSES)[number]

// Fixed colours per tag, so a chart split by purpose or asset class reads the same every month.
// Blue, red and ochre stay reserved for income, expense and attention.
export const PURPOSE_COLOR: Record<Purpose, string> = {
  Everyday: '#7a8a99', 'Emergency fund': '#0f8b8d', Savings: '#c0a062', 'Long-term investing': '#6250d6', Retirement: '#8b5a2b',
}
export const CLASS_COLOR: Record<AssetClass, string> = {
  Cash: '#7a8a99', Deposit: '#c0a062', Bonds: '#0f8b8d', Equities: '#6250d6', Mixed: '#3d6b6e', 'Insurance policy': '#e87ba4', 'Pension fund': '#8b5a2b',
}

export interface Account {
  id?: string
  name: string
  institution: string | null
  purpose: Purpose
  assetClass: AssetClass
  color: string
  lockedUntil: string | null // YYYY-MM-DD
  opened: string // YYYY-MM-01
  closed: string | null // YYYY-MM-01, first month no longer tracked
  contributedBefore: number | null
  target: number | null
  notes: string | null
  sort: number
}
export interface Balance { accountId: string; month: string; value: number; contributed: number | null }
export interface Wealth { accounts: Account[]; balances: Balance[] }

/** Cash moves with spending; everything else is money put somewhere to grow, so it tracks contributions. */
export const invested = (a: Account) => a.assetClass !== 'Cash'
export const liquid = (a: Account) => a.assetClass === 'Cash' || a.assetClass === 'Deposit'
export const isOpen = (a: Account, month: string) => a.opened <= month && (!a.closed || month < a.closed)
/** Pension funds are locked by nature; anything else only until its date. */
export const locked = (a: Account, month: string) => a.assetClass === 'Pension fund' || (a.lockedUntil != null && a.lockedUntil > month)

export const monthsOf = (year: number) => Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}-01`)
export function prevMonth(m: string) {
  const y = +m.slice(0, 4), mo = +m.slice(5, 7)
  return mo === 1 ? `${y - 1}-12-01` : `${y}-${String(mo - 1).padStart(2, '0')}-01`
}

const round = (n: number) => Math.round(n * 100) / 100

export function index(w: Wealth) {
  const map = new Map(w.balances.map((b) => [b.accountId + '|' + b.month, b]))
  const get = (a: Account, m: string) => map.get(a.id + '|' + m)
  const months = new Set(w.balances.map((b) => b.month))

  const total = (m: string, keep: (a: Account) => boolean = () => true) =>
    round(w.accounts.filter(keep).reduce((t, a) => t + (get(a, m)?.value ?? 0), 0))
  /** Accounts that should have a balance this month but don't. */
  const missing = (m: string) => w.accounts.filter((a) => isOpen(a, m) && !get(a, m))

  /** The month's change, split into money from the market (investment value change minus what went in) and money saved.
   *  "What went in" is what the provider credited, which for a pension fund can be months after the payslip.
   *  The split is null when an investment's contribution isn't recorded; a month with gaps is marked incomplete. */
  function change(m: string) {
    const p = prevMonth(m)
    if (!months.has(m) || !months.has(p)) return null
    const delta = round(total(m) - total(p))
    let market: number | null = 0
    for (const a of w.accounts.filter(invested)) {
      const now = get(a, m)
      if (!now) continue
      const before = get(a, p)
      if (before && now.value === before.value && !now.contributed) continue // nothing moved
      // An account's first balance is money that arrived, not growth, unless a contribution says otherwise.
      if (!before && now.contributed == null) continue
      if (now.contributed == null) { market = null; break }
      market += now.value - (before?.value ?? 0) - now.contributed
    }
    return {
      delta, market: market == null ? null : round(market), saved: market == null ? null : round(delta - market),
      incomplete: missing(m).length + missing(p).length > 0,
    }
  }

  /** Everything put into an account up to and including month m; null while any part of it is unknown. */
  function putIn(a: Account, m: string): number | null {
    if (a.contributedBefore == null) return null
    let sum = a.contributedBefore
    const own = w.balances.filter((b) => b.accountId === a.id && b.month <= m).sort((x, y) => x.month.localeCompare(y.month))
    for (const [i, b] of own.entries()) {
      // The first month's value is covered by "before" unless a contribution is noted; later months must say.
      if (b.contributed == null) { if (i === 0) continue; return null }
      sum += b.contributed
    }
    return round(sum)
  }

  return { get, total, missing, change, putIn, months }
}
