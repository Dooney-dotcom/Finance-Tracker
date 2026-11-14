// The iOS counterpart of web/src/Wealth.tsx: net worth by month and where it sits.
import Charts
import SwiftUI

struct WealthView: View {
  @State private var wealth: Wealth?
  @State private var error: String?

  var body: some View {
    NavigationStack {
      List {
        if let error { ErrorRow(error) { Task { await load() } } }
        if let w = wealth {
          let totals = Dictionary(grouping: w.balances, by: \.month).mapValues { $0.reduce(0) { $0 + $1.value } }
          let months = totals.keys.sorted()
          if let latest = months.last {
            Section {
              LabeledContent("Net worth · \(day(latest).formatted(.dateTime.month(.wide).year()))", value: totals[latest]!.eur).bold()
              if months.count > 1 {
                let change = totals[latest]! - totals[months[months.count - 2]]!
                LabeledContent("Since last month", value: (change > 0 ? "+" : "") + change.eur).foregroundStyle(.secondary)
                Chart(months.suffix(24), id: \.self) { m in
                  AreaMark(x: .value("Month", day(m), unit: .month), y: .value("Net worth", totals[m]!)).opacity(0.25)
                  LineMark(x: .value("Month", day(m), unit: .month), y: .value("Net worth", totals[m]!))
                }
                .frame(height: 180)
              }
            }
            let values = Dictionary(uniqueKeysWithValues: w.balances.filter { $0.month == latest }.map { ($0.accountId, $0.value) })
            ForEach(Dictionary(grouping: w.accounts.filter { values[$0.id] != nil }, by: \.purpose).sorted { $0.key < $1.key }, id: \.key) { purpose, accounts in
              Section(purpose) {
                ForEach(accounts) { a in
                  HStack {
                    Circle().fill(Color(hex: a.color)).frame(width: 10, height: 10)
                    VStack(alignment: .leading) {
                      Text(a.name)
                      Text([a.institution, a.assetClass].compactMap { $0 }.joined(separator: " · ")).font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Text(values[a.id]!.eur).monospacedDigit()
                  }
                }
              }
            }
          } else {
            Text("No balances yet. Add accounts and a monthly check-in on the web.").foregroundStyle(.secondary)
          }
        }
      }
      .navigationTitle("Wealth")
      .task { await load() }
      .refreshable { await load() }
    }
  }

  func load() async {
    do { (wealth, error) = (try await api("/api/wealth"), nil) }
    catch { if let m = message(error) { self.error = m } }
  }
}
