// The iOS counterpart of web/src/Calendar.tsx: a month of records, each day tinted by what was spent.
import SwiftUI

struct CalendarView: View {
  @State private var month = Date.now
  @State private var selected = iso(.now)
  @State private var rows: [Rec] = []
  @State private var lists = Lists()
  @State private var error: String?
  @State private var editing: Rec?
  @State private var reload = 0

  /// Monday-first: blank leading cells, then each day of the month.
  var days: [String?] {
    let first = romeCalendar.date(from: romeCalendar.dateComponents([.year, .month], from: month))!
    let lead = (romeCalendar.component(.weekday, from: first) + 5) % 7
    let count = romeCalendar.range(of: .day, in: .month, for: first)!.count
    return Array(repeating: nil, count: lead) + (0..<count).map { iso(romeCalendar.date(byAdding: .day, value: $0, to: first)!) }
  }

  var spentByDay: [String: Double] {
    rows.filter { $0.type == "Expense" }.reduce(into: [:]) { $0[String($1.dateTime!.prefix(10)), default: 0] += $1.amount }
  }

  var body: some View {
    NavigationStack {
      List {
        Section {
          Stepper(month.formatted(.dateTime.month(.wide).year())) { step(1) } onDecrement: { step(-1) }
          grid
        }
        if let error { ErrorRow(error) { reload += 1 } }
        Section(day(selected).formatted(.dateTime.weekday(.wide).day().month())) {
          let recs = rows.filter { $0.dateTime?.hasPrefix(selected) == true }
          if recs.isEmpty { Text("Nothing recorded.").foregroundStyle(.secondary) }
          ForEach(recs) { r in Button { editing = r } label: { RecordRow(rec: r, lists: lists) } }
        }
      }
      .navigationTitle("Calendar")
      .toolbar { Button("Add", systemImage: "plus") { editing = .new(on: minute(selected + "T12:00")) } }
      .sheet(item: $editing) { RecordForm(rec: $0, lists: lists) { reload += 1 } }
      .task(id: "\(monthStart(month))|\(reload)") { await load() }
      .refreshable { await load() }
    }
  }

  var grid: some View {
    let spent = spentByDay
    let top = spent.values.max() ?? 0
    return LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 7), spacing: 4) {
      ForEach(["M", "T", "W", "T", "F", "S", "S"].indices, id: \.self) {
        Text(["M", "T", "W", "T", "F", "S", "S"][$0]).font(.caption2).foregroundStyle(.secondary)
      }
      ForEach(Array(days.enumerated()), id: \.offset) { _, d in
        if let d {
          let s = spent[d] ?? 0
          VStack(spacing: 2) {
            Text(String(Int(d.suffix(2))!)).font(.callout.weight(d == selected ? .bold : .regular))
            Text(s > 0 ? s.formatted(.number.precision(.fractionLength(0))) : " ").font(.caption2).foregroundStyle(.secondary)
          }
          .frame(maxWidth: .infinity, minHeight: 44)
          .background(.red.opacity(top > 0 ? 0.35 * s / top : 0), in: .rect(cornerRadius: 8))
          .overlay { if d == selected { RoundedRectangle(cornerRadius: 8).stroke(.tint) } }
          .contentShape(.rect)
          .onTapGesture { selected = d }
          .accessibilityLabel("\(day(d).formatted(.dateTime.day().month())), spent \(s.eur)")
        } else {
          Color.clear.frame(height: 44)
        }
      }
    }
    .buttonStyle(.plain)
  }

  func step(_ n: Int) {
    month = shift(month, .MONTH, by: n)
    selected = monthStart(month)
  }

  func load() async {
    let first = monthStart(month)
    let last = iso(romeCalendar.date(byAdding: DateComponents(month: 1, day: -1), to: day(first))!)
    do {
      async let l: Lists = api("/api/lists")
      async let r: Records = api("/api/records?" + query(["dateFrom": first, "dateTo": last]))
      (lists, rows, error) = (try await l, try await r.records, nil)
    } catch { if let m = message(error) { self.error = m } }
  }
}
