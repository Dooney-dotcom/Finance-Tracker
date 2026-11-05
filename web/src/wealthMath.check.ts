// Run: node src/wealthMath.check.ts
import assert from 'node:assert/strict'
import { index, type Account, type Wealth } from './wealthMath.ts'

const acc = (id: string, assetClass: Account['assetClass'], opened = '2026-01-01', extra: Partial<Account> = {}): Account =>
  ({ id, name: id, institution: null, purpose: 'Savings', assetClass, color: '#000000', lockedUntil: null, opened, closed: null,
    contributedBefore: null, target: null, notes: null, sort: 0, ...extra })

const w: Wealth = {
  accounts: [acc('bank', 'Cash'), acc('etf', 'Equities', '2026-01-01', { contributedBefore: 900 }), acc('new', 'Cash', '2026-03-01')],
  balances: [
    { accountId: 'bank', month: '2026-01-01', value: 1000, contributed: null },
    { accountId: 'etf', month: '2026-01-01', value: 1000, contributed: null },
    { accountId: 'bank', month: '2026-02-01', value: 1100, contributed: null },
    { accountId: 'etf', month: '2026-02-01', value: 1250, contributed: 200 }, // +250: 200 put in, 50 market
    { accountId: 'bank', month: '2026-03-01', value: 1000, contributed: null },
    { accountId: 'etf', month: '2026-03-01', value: 1300, contributed: null }, // contribution unknown
  ],
}
const x = index(w)

assert.equal(x.total('2026-02-01'), 2350)
assert.deepEqual(x.change('2026-02-01'), { delta: 350, market: 50, saved: 300, incomplete: false })
assert.equal(x.change('2026-01-01'), null) // no December to compare with
const mar = x.change('2026-03-01')!
assert.equal(mar.market, null)
assert.equal(mar.incomplete, true) // "new" opened in March has no balance
assert.deepEqual(x.missing('2026-03-01').map((a) => a.id), ['new'])
assert.equal(x.putIn(w.accounts[1], '2026-02-01'), 1100)
assert.equal(x.putIn(w.accounts[1], '2026-03-01'), null)
assert.equal(x.putIn(w.accounts[0], '2026-02-01'), null) // nothing known about "before"

// A newly tracked account's first balance is money that arrived, not market growth.
const fresh = index({ accounts: [acc('bank', 'Cash'), acc('fund', 'Pension fund', '2026-02-01')], balances: [
  { accountId: 'bank', month: '2026-01-01', value: 1000, contributed: null },
  { accountId: 'bank', month: '2026-02-01', value: 800, contributed: null },
  { accountId: 'fund', month: '2026-02-01', value: 271, contributed: null },
] })
assert.deepEqual(fresh.change('2026-02-01'), { delta: 71, market: 0, saved: 71, incomplete: false })
console.log('wealth maths ok')
