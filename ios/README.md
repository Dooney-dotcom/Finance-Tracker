# Finance Tracker for iOS

A SwiftUI app (iOS 26) over the same Supabase Auth and Spring API as the web app. There is no backend change, and no new data path.

| Tab | Web counterpart | What it does now |
|---|---|---|
| Dashboard | `Dashboard.tsx` | Day/week/month/year with stepping, balance, trend, categories, payment methods (Swift Charts) |
| Records | `RecordsPage.tsx`, `Records.tsx` | Records by month, search, add / edit / delete |
| Calendar | `Calendar.tsx` | Month grid tinted by spend; tap a day for its records |
| Wealth | `Wealth.tsx` | Net worth by month, accounts by purpose (read-only) |
| Account | `Account.tsx` | Change password, sign out |

Sign-in uses email and password, with the TOTP check when 2FA is on. The idle timeout matches the web: more than 30 minutes in the background signs you out, and a `401` from the API signs you out too.

## Run

```bash
cp Config.example.xcconfig Config.xcconfig   # same public values as web/.env.local
open FinanceTracker.xcodeproj                # Swift packages resolve on first open
```

To run it on a phone, set your team under *Signing & Capabilities*. To use a local API instead, set `API_URL` to `http:/$()/<lan-ip>:8080`; you will also need an ATS exception for plain HTTP.

The project uses folder-synchronised groups, so a new `.swift` file in `FinanceTracker/` is picked up without editing the project file.
