# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

- **Backend:** Spring (user decision), in `api/`: Spring Boot 4.1.2, Java 17, Maven, JdbcClient (no ORM).
  - It logs in through the Supabase pooler as `finance_api`, a role with no table privileges of its own.
  - `UserDb.run` is the only way it reaches the database: it sets the caller's verified token claims and switches to `authenticated`, so RLS applies to every query.
  - Endpoints:
    - `GET /api/dashboard?period=DAY|WEEK|MONTH|YEAR&date=`.
    - `GET|POST /api/records` and `PUT|DELETE /api/records/{id}`. Filters: `monthFrom/monthTo` match the record's `month`, `dateFrom/dateTo` match its real date; also `category`, `paymentMethod` (`none` = unset), `type`, `avoidable` and `recurrence` (`untagged` for both) and `q`.
    - `POST /api/records/import/revolut/preview` (writes nothing) and `POST /api/records/import/revolut` (inserts the confirmed rows; duplicates are skipped by the database).
    - `GET /api/lists`; `POST|PUT|DELETE /api/categories/{id}` and `/api/payment-methods/{id}`. `DELETE ?reassignTo=` moves records first; deleting while records still use the item is refused (409).
    - `GET|POST /api/plans`, `PUT|DELETE /api/plans/{id}`: planned expenses. `GET /api/plans/occurrences?from=&to=` expands them with a status (paid / skipped / overdue / upcoming) and a suggested matching record. `PUT|DELETE /api/plans/{id}/occurrences/{due}` links a record, skips, or resets; `POST …/pay` creates the record and links it.
  - 2FA is enforced in the database: a restrictive RLS policy calls `private.aal_satisfied()`.
  - Local secrets live in `api/.env` (gitignored); `api/.env.example` lists the variables.
- **Frontend:** in `web/` (delegated; chosen: React 19 + TypeScript + Vite, `@supabase/supabase-js` for auth, system font stack: SF Pro on Apple devices). It calls the Spring API. Charts are hand-written SVG, with no chart library. Hash routing (`#/dashboard`, `#/records`, `#/calendar`, `#/account`) so it works on any static host. Production builds carry a CSP `<meta>`, because its `connect-src` depends on build-time env. Public config lives in `web/.env.local` (gitignored); see `web/.env.example`. Why: the backend is Spring, not Next/SSR, so a plain client SPA is enough. There is no SEO need, and React has the most mature charting and calendar options for the dashboard and calendar views.
- **Auth:** Supabase Auth. The SPA uses `supabase-js` with the publishable key only, for sign-in and session handling. Spring receives the user's access token on every request.
- **Database:** Supabase Postgres, already existing. RLS is enabled on `public.transactions`; at init it had no policies, so the table was closed to every client role.
- **Hosting:** everything on Google Cloud (user decision, 2026-11-07, replacing the earlier GitHub Pages plan): the SPA on Firebase Hosting and Spring on Cloud Run (europe-west1, next to Supabase eu-west-1), both deployed by GitHub Actions on push to `main`. The code stays deployable without changes:
  - Spring is stateless, and all configuration comes from environment variables: database URL, Supabase JWKS URL, and allowed CORS origins.
  - It exposes a health endpoint and is containerised.
  - It connects through Supabase's connection pooler, never the IPv6-only direct host, so it works the same locally and on Cloud Run.
  - CORS is limited to the configured origins (the Firebase Hosting origin in production, localhost in dev).

## Users

The owner first: it's a personal tool for tracking their own expenses and income. It is also multi-tenant and invite-only. The owner can invite other people, and each person sees and edits only their own transactions. Nothing is shared between accounts, and there is no public sign-up.

## Product Purpose

Record every expense and income, and understand where money goes over time. Success means logging and correcting records takes almost no effort, and the dashboard answers "how am I doing this day / week / month / year, and on what am I spending?" at a glance.

## Positioning

A personal replacement for the Notion Finance Tracker it was migrated from. Besides what was spent, it records behavioural data that generic trackers lack: whether a purchase was avoidable and why it happened (impulse, boredom, stress…). The dashboard can use this to show avoidable spending, not just totals.

## Operating Context

The app has three tabs:

1. **Dashboard**: charts of daily, weekly, monthly and yearly trends, plus expenses by category and other breakdowns.
2. **Records**: a list or table of expenses and income where the user can view, add, edit and delete records, entered manually or imported from CSV.
3. **Calendar**: the same records shown in a calendar layout.

## Capabilities and Constraints

Data model, after migration `supabase/migrations/20261102120000_tenancy_and_user_lists.sql` (applied 2026-11-02): `public.transactions` holds about 600 rows, all owned by the owner. `public.categories` and `public.payment_methods` are per-user lists.

| Field | Notes |
|---|---|
| `description` | text |
| `amount` | numeric, always ≥ 0. The sign comes from `type` |
| `type` | `Expense` \| `Income` |
| `user_id` | owner (`auth.users`); defaults to `auth.uid()` |
| `category_id` | → `categories` (`kind` `expense`/`income`, `color` `#rrggbb` chosen by the user), which must belong to the same user. Nullable. The owner's expense categories are Home, Insurance, Subscriptions, Travel, Taxes / Bills, Transport, Shopping, Food / Groceries, Restaurants / Takeaway, Sports, University, Other, Health, Clothing, Leisure, Entertainment, Work; the income list is just Transport |
| `payment_method_id` | → `payment_methods`, which must belong to the same user. Nullable. The owner's list is their banks plus Cash |
| `date` | timestamptz in real UTC, displayed in Europe/Rome. Nullable |
| `month` | date, first day of the month the record belongs to (derived from `date` when present) |
| `avoidable` | Yes \| Partly \| No (nullable) |
| `recurrence` | Fixed \| Recurring \| One-off (nullable, expenses only; text + check constraint) |
| `reason` | Impulse, Boredom, Stress, Social / FOMO, Discount, Convenience, Habit (nullable) |
| `notes` | text, nullable |
| `notion_id` | unique per user; legacy link to the Notion source |

Planned expenses (added 2026-11-04, replacing the Notion "Expected Expenses" agenda): `public.plans` holds rules (`Once` / `Monthly` / `Quarterly` / `Annual`, from `first_due` to an optional `last_due`). `public.plan_occurrences` stores only the exceptions: a linked `transaction_id` (paid), `skipped`, or a changed `amount`. A plan is a promise, not spending: it never counts in totals or the dashboard until it is linked to a real transaction. They are shown in the Calendar.

Duplicates: the database itself rejects a second row with the same (`user_id`, `payment_method_id`, `type`, `date`, `amount`, `description`). The CSV import relies on this.

Constraints future work must respect:
- Records without a `date` still belong to a `month`. Daily and weekly views and the calendar must handle them explicitly, for example in a "no exact date" bucket for that month, and never drop them silently.
- Deleting a category or payment method that is still in use is refused by the database. The app must offer to reassign those records first.
- Many fields are nullable because of the legacy import, so forms and charts must tolerate missing data.

Locale: amounts are in EUR, formatted in English (`€1,257.00`, dates like `2 Nov 2026`). Weeks start on Monday.

Authentication and tenancy (user decisions, 2026-11-02):
- **Invite-only.** Public sign-up is disabled in Supabase Auth, and accounts come only from invitations. Google sign-in must not create accounts for people who weren't invited.
- **Sign-in methods:** email + password (minimum 12 characters with character-class requirements, set in Supabase Auth; leaked-password protection only if the Supabase plan offers it, which may need Pro) and Google OAuth. Users can turn on 2FA with an authenticator app (TOTP). Once a user has 2FA set up, the API requires the higher assurance level (`aal2`) from them.
- **The API trusts only the token.** Spring checks each Supabase access token's signature against Supabase's published signing keys (JWKS), and checks `aud` and `exp`. The user's identity comes only from the token's `sub` claim, never from request parameters or the body.
- **Isolation is enforced twice.** `transactions` gains `user_id uuid not null` referencing `auth.users`, with an index on (`user_id`, `month`). Spring scopes every query by `user_id`, and RLS policies on the `authenticated` role (`user_id = (select auth.uid())`) back that up in the database. Spring connects with a least-privilege database role, never `postgres` or the service-role key.
- **Secrets stay out of the client and the repo.** The service-role key and database credentials live only in server environment variables, never in git.
- **Existing data:** the existing rows will be assigned to the owner's account when the `user_id` column is added. `notion_id` becomes unique per user instead of across all users.

Per-user lists (user decision, 2026-11-02): categories and payment methods belong to each user, and users manage them in the app (add, rename, delete). They replace the global `expense_category` and `payment_method` enums with per-user tables under the same RLS isolation. Each category has a kind, `expense` or `income`, and income gets its own list. The owner's lists are seeded from the current enum values; their income list starts empty for them to fill. A rename must carry through to every record that uses it, and deleting a list entry that is in use must never silently orphan records.

CSV import (user decision, 2026-11-02): only Revolut's CSV export is accepted for now. The mapping below was verified against the owner's October 2026 export: every completed payment in the file matched exactly one existing row.
- The columns are `Tipo, Prodotto, Data di inizio, Data di completamento, Descrizione, Importo, Costo, Valuta, State, Saldo`. That is the Italian export; the English export uses the same columns with English headers, and both should be accepted.
- `date` = `Data di inizio`, the start date, not the completion date. `month` = the first day of that date's month.
- `description` = `Descrizione`, verbatim.
- `amount` = the absolute value of `Importo`. A negative amount is an Expense and a positive one is Income. `payment_method` = Revolut.
- Only rows whose `State` is `COMPLETATO` / `COMPLETED` are imported. Cancelled rows (`OPERAZIONE ANNULLATA`) and pending ones are skipped.
- `Ricarica` (top-up) rows are transfers between the owner's own accounts, not income, so they are skipped. The owner never recorded them by hand.
- `Pagamento` rows (direct debits and transfers to people) are imported as expenses, like card payments.
- Re-importing must not create duplicates. A row is the same transaction if it has the same user, payment method, start timestamp, amount and description. The import shows what will be added and what is skipped before saving anything.
- Rows not in `EUR` are flagged, never silently converted. `Costo` (fee) has been 0 so far; if a fee appears it is added to the expense. `Saldo` and `Prodotto` are ignored.
- Revolut doesn't export categories. Imported rows get a suggested category from the last category the user picked for the same description (e.g. a supermarket → Groceries); otherwise they stay uncategorised.

Data fixes applied 2026-11-02: stored times were converted from Italian wall-clock time to real UTC, and one cancelled payment was deleted. Imported CSV times are Europe/Rome local time and are converted the same way.

Known data gap (deferred by the owner, 2026-11-02): most records from Jan–May 2026 carry a placeholder `date` of midnight on the 1st of their month, left by the Notion import. Month and year totals are right, but the dashboard's "average month" pace is inflated until this is fixed. Planned fix: restore real timestamps for the 176 Revolut ones by matching a Jan–May Revolut CSV (same month + amount + description); clear `date` on the rest; back up the original values in `private` first.

Verified 2026-11-02:
- The owner sees all their rows; a different user sees 0 transactions and 0 categories.
- Anonymous access has no table privileges.
- A user can't insert a row owned by someone else, and their updates don't reach anyone else's rows.
- Records can't point at an unknown category, including another user's.

## Evidence on Hand

- Real data: about 600 transactions in Supabase, all belonging to the owner. Use this data for the dashboard and records views instead of invented sample data.
- The previous Notion Finance Tracker, which is the source of the data and its field vocabulary.
- No brand, logo or visual assets exist yet.

## Product Principles

1. **Entry is the bottleneck.** Adding or fixing a record should take seconds. If logging is tedious, the data and the dashboard rot.
2. **One dataset, three lenses.** The dashboard, records and calendar views are views of the same transactions, so an edit made anywhere shows up everywhere.
3. **Honest about gaps.** Missing dates, categories or reasons are shown as missing, never hidden or guessed.
4. **Behaviour, not just totals.** The `avoidable` field is what makes this tracker the owner's own; the owner has committed to tagging expenses with it going forward, so the dashboard surfaces it. `recurrence` (fixed / recurring / one-off) gets its own dashboard panel the same way. `reason` stays in the data and the record form but is not shown on the dashboard.
