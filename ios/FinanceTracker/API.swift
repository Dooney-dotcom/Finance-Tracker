// The iOS counterpart of web/src/lib.ts: Supabase client, the API call, models and formatting.
import Foundation
import Supabase
import SwiftUI

private func config(_ key: String) -> String { Bundle.main.object(forInfoDictionaryKey: key) as? String ?? "" }

let supabase = SupabaseClient(
  supabaseURL: URL(string: config("SupabaseURL"))!,
  supabaseKey: config("SupabaseKey"),
  options: .init(auth: .init(emitLocalSessionAsInitialSession: true))
)

struct ApiError: LocalizedError {
  let status: Int
  var detail: String?
  var errorDescription: String? {
    status == 401 ? "Your session has expired."
      : detail ?? (status == 0 ? "The server can’t be reached." : "Something went wrong on the server.")
  }
}

private struct Problem: Decodable { let detail: String? }

/// Calls the Spring API with the current session's token. A 401 signs the app out, like the web's SESSION_EXPIRED.
@discardableResult
func call(_ path: String, method: String = "GET", json: (any Encodable)? = nil) async throws -> Data {
  guard let token = try? await supabase.auth.session.accessToken else { throw ApiError(status: 401) }
  var req = URLRequest(url: URL(string: config("ApiURL") + path)!)
  req.httpMethod = method
  req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
  if let json {
    req.httpBody = try JSONEncoder().encode(json)
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
  }
  let data: Data, res: URLResponse
  do { (data, res) = try await URLSession.shared.data(for: req) } catch {
    if Task.isCancelled { throw CancellationError() }
    throw ApiError(status: 0)
  }
  let status = (res as? HTTPURLResponse)?.statusCode ?? 0
  guard (200..<300).contains(status) else {
    if status == 401 { AppSession.shared.expire() }
    throw ApiError(status: status, detail: (try? JSONDecoder().decode(Problem.self, from: data))?.detail)
  }
  return data
}

func api<T: Decodable>(_ path: String) async throws -> T {
  try JSONDecoder().decode(T.self, from: await call(path))
}

/// Error text for a banner; nil for cancellations (a newer load replaced this one).
func message(_ error: Error) -> String? {
  if error is CancellationError || (error as? URLError)?.code == .cancelled { return nil }
  return error.localizedDescription
}

// MARK: - Models (same shapes as the web's lib.ts)

enum Period: String, CaseIterable { case DAY, WEEK, MONTH, YEAR }

struct Slice: Decodable, Identifiable {
  var id: String?
  var name: String?
  var color: String?
  var amount: Double
  var records: Int
}

struct Point: Decodable, Identifiable {
  var key: String
  var income: Double
  var expense: Double
  var id: String { key }
}

struct DashboardData: Decodable {
  struct Totals: Decodable { var income: Double; var expense: Double; var net: Double; var records: Int }
  var period: String
  var start: String
  var end: String
  var totals: Totals
  var netYearToDate: Double
  var trend: [Point]
  var categories: [Slice]
  var paymentMethods: [Slice]
}

struct Rec: Codable, Identifiable, Hashable {
  var id: String?
  var description = ""
  var amount = 0.0
  var type = "Expense"  // or "Income"
  var dateTime: String?  // Europe/Rome wall time, "YYYY-MM-DDTHH:mm[:ss]"
  var month = ""  // YYYY-MM-01
  var categoryId: String?
  var paymentMethodId: String?
  var avoidable: String?
  var recurrence: String?
  var reason: String?
  var notes: String?
}

// Not "Category"/"Method": those names are taken by the ObjectiveC module.
struct RecordCategory: Decodable, Identifiable { var id: String; var name: String; var kind: String; var color: String? }
struct PayMethod: Decodable, Identifiable { var id: String; var name: String }
struct Lists: Decodable {
  var categories: [RecordCategory] = []
  var paymentMethods: [PayMethod] = []
  func category(_ id: String?) -> RecordCategory? { categories.first { $0.id == id } }
  func method(_ id: String?) -> PayMethod? { paymentMethods.first { $0.id == id } }
}

let AVOIDABLE = ["Yes", "Partly", "No"]
let RECURRENCE = ["Fixed", "Recurring", "One-off"]
let REASONS = ["Impulse", "Boredom", "Stress", "Social / FOMO", "Discount", "Convenience", "Habit"]

struct WealthAccount: Decodable, Identifiable {
  var id: String
  var name: String
  var institution: String?
  var purpose: String
  var assetClass: String
  var color: String
  var opened: String
  var closed: String?
}
struct Balance: Decodable { var accountId: String; var month: String; var value: Double }
struct Wealth: Decodable { var accounts: [WealthAccount]; var balances: [Balance] }

// MARK: - Formatting: EUR in English style (€1,257.00), dates in Europe/Rome

extension Double {
  var eur: String { formatted(.currency(code: "EUR").locale(Locale(identifier: "en_IE"))) }
}

let rome = TimeZone(identifier: "Europe/Rome")!
let romeCalendar: Calendar = {
  var c = Calendar(identifier: .gregorian)
  c.timeZone = rome
  c.firstWeekday = 2
  return c
}()

private func formatter(_ format: String) -> DateFormatter {
  let f = DateFormatter()
  f.locale = Locale(identifier: "en_US_POSIX")
  f.timeZone = rome
  f.dateFormat = format
  return f
}
private let dayFormat = formatter("yyyy-MM-dd")
private let minuteFormat = formatter("yyyy-MM-dd'T'HH:mm")

/// "2026-11-02" for a Date, in Rome.
func iso(_ d: Date) -> String { dayFormat.string(from: d) }
/// Noon in Rome on that ISO day, so it shows as the same day in any time zone.
func day(_ s: String) -> Date { dayFormat.date(from: String(s.prefix(10)))?.addingTimeInterval(12 * 3600) ?? .now }
func isoMinute(_ d: Date) -> String { minuteFormat.string(from: d) }
func minute(_ s: String) -> Date { minuteFormat.date(from: String(s.prefix(16))) ?? .now }
func monthStart(_ d: Date) -> String { String(iso(d).prefix(8)) + "01" }

func shift(_ d: Date, _ p: Period, by n: Int) -> Date {
  let (unit, step): (Calendar.Component, Int) = switch p {
  case .DAY: (.day, 1)
  case .WEEK: (.day, 7)
  case .MONTH: (.month, 1)
  case .YEAR: (.year, 1)
  }
  return romeCalendar.date(byAdding: unit, value: n * step, to: d) ?? d
}

func periodLabel(_ p: Period, _ start: String, _ end: String) -> String {
  let s = day(start)
  return switch p {
  case .DAY: s.formatted(.dateTime.weekday().day().month().year())
  case .WEEK: "\(s.formatted(.dateTime.day().month())) – \(day(end).formatted(.dateTime.day().month().year()))"
  case .MONTH: s.formatted(.dateTime.month(.wide).year())
  case .YEAR: String(start.prefix(4))
  }
}

extension Color {
  /// "#rrggbb" from the API; ochre when a category has no colour, as on the web.
  init(hex: String?) {
    let v = UInt64((hex ?? "#c0a062").dropFirst(), radix: 16) ?? 0xc0a062
    self.init(red: Double(v >> 16 & 0xff) / 255, green: Double(v >> 8 & 0xff) / 255, blue: Double(v & 0xff) / 255)
  }
}
